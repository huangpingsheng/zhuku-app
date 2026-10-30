/* ============================================================
   settings.js · 设定（人物/地点/物品）· 目标 · 同步 · 备份
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const S = window.Store, P = window.Prefs;

  const TABS = [
    { id: 'chars', label: '人物', icon: 'user' },
    { id: 'places', label: '地点', icon: 'mapPin' },
    { id: 'items', label: '物品', icon: 'gem' },
    { id: 'goal', label: '目标', icon: 'target' },
    { id: 'sync', label: 'Git 同步', icon: 'cloud' },
    { id: 'data', label: '备份与数据', icon: 'save' }
  ];
  const KINDS = {
    chars: { label: '人物', one: '人物', icon: 'user', role: '身份', rolePh: '主角 / 配角 / 反派…', av: '他' },
    places: { label: '地点', one: '地点', icon: 'mapPin', role: '作用', rolePh: '起点 / 据点 / 回忆之地…', av: '地' },
    items: { label: '物品', one: '物品', icon: 'gem', role: '类型', rolePh: '线索 / 信物 / 武器…', av: '物' }
  };

  let hostEl = null, project = null, shared = null, active = 'chars';

  function render(host, p, st) {
    hostEl = host; project = p; shared = st;
    window.Outline.live = false;
    if (window.Timeline) window.Timeline.live = false;
    if (!TABS.some((t) => t.id === active)) active = 'chars';
    let h = '<div class="set-wrap"><div class="set-inner">';
    h += '<div class="set-head"><div><h2>设定与数据</h2><p>人物、地点、物品与写作目标，都在这里安放。</p></div>' +
      '<span class="set-safe">' + U.icon('lock') + '只保存在本机，除非你主动同步</span></div>';
    h += '<div class="set-tabs">' + TABS.map((t) =>
      '<button class="set-tab' + (t.id === active ? ' active' : '') + '" data-stab="' + t.id + '">' +
      U.icon(t.icon) + t.label + '</button>').join('') + '</div>';
    h += '<div class="set-body" id="setBody">' + bodyHtml(p) + '</div>';
    h += '</div></div>';
    host.innerHTML = h;
    host.scrollTop = 0;
    $$('#wView [data-stab]').forEach((b) => {
      b.onclick = () => {
        active = b.getAttribute('data-stab');
        render(hostEl, project, shared);
      };
    });
    bindBody();
    if (active === 'sync') loadGitPanel();
  }

  function bodyHtml(p) {
    if (active === 'chars' || active === 'places' || active === 'items') return entityHtml(p, active);
    if (active === 'goal') return goalHtml(p);
    if (active === 'sync') return syncHtml(p);
    return dataHtml(p);
  }

  /* ---------------- entities ---------------- */
  function entityHtml(p, key) {
    const list = p[key] || [];
    const k = KINDS[key];
    let h = '<div class="set-bar"><span class="hint">' + list.length + ' 个' + k.label + ' · 与大纲、正文一起保存</span>' +
      '<button class="btn sm primary" data-ent-add>' + U.icon('plus') + '新增' + k.one + '</button></div>';
    if (!list.length) {
      h += '<div class="set-box"><h3>' + U.icon(k.icon) + '还没有' + k.label + '</h3>' +
        '<div class="sub">把重要的人、地点和物件记在这里，写作时随手可查。</div>' +
        '<button class="btn" data-ent-add>' + U.icon('plus') + '添加第一个' + k.one + '</button></div>';
      return h;
    }
    h += '<div class="card-grid">';
    list.forEach((it) => {
      const av = it.emoji || (it.name || k.av).slice(0, 1);
      h += '<div class="ent-card" data-ent-card="' + it.id + '" role="button" tabindex="0">' +
        '<button class="ent-edit" data-ent-edit="' + it.id + '" title="编辑">' + U.icon('pen') + '</button>' +
        '<div class="ent-top"><span class="ent-avatar">' + U.esc(av) + '</span>' +
        '<div><div class="ent-name">' + U.esc(it.name) + '</div>' +
        '<div class="ent-role">' + U.esc(it.role || k.role) + '</div></div></div>' +
        (it.desc ? '<div class="ent-desc">' + U.esc(it.desc) + '</div>' : '') +
        ((it.tags && it.tags.length) ? '<div class="ent-tags">' + it.tags.map((t) => '<span>' + U.esc(t) + '</span>').join('') + '</div>' : '') +
        '</div>';
    });
    h += '<button class="ent-add" data-ent-add>' + U.icon('plus') + '新增' + k.one + '</button>';
    h += '</div>';
    return h;
  }

  function entityModal(key, item) {
    const p = project, k = KINDS[key];
    const it = item || null;
    const val = (f) => it ? U.esc(it[f] == null ? '' : it[f]) : '';
    const tags = it && it.tags ? it.tags.join('、') : '';
    const m = U.openModal(
      '<div class="modal-head"><div><h3>' + (it ? '编辑' : '新增') + k.one + '</h3>' +
      '<p>昵称、身份、几笔描述，够写作时想起来就好。</p></div></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label>名字</label><input class="input" data-f="name" value="' + val('name') + '" placeholder="' + k.one + '的名字"></div>' +
      '<div class="field"><label>' + k.role + '</label><input class="input" data-f="role" value="' + val('role') + '" placeholder="' + k.rolePh + '"></div>' +
      '<div class="field"><label>描述</label><textarea class="input" data-f="desc" rows="4" placeholder="外貌、性格、秘密，或一句能记住的话…">' + val('desc') + '</textarea></div>' +
      '<div class="field"><label>标签</label><input class="input" data-f="tags" value="' + U.esc(tags) + '" placeholder="用、或逗号分隔"></div>' +
      '<div class="field"><label>头像字</label><input class="input" data-f="emoji" maxlength="2" value="' + val('emoji') + '" placeholder="一个字，例如：' + k.av + '"></div>' +
      '</div>' +
      '<div class="modal-foot">' + (it ? '<button class="btn danger" data-del>' + U.icon('trash') + '删除</button>' : '') +
      '<div class="foot-actions"><button class="btn ghost" data-cancel>取消</button>' +
      '<button class="btn primary" data-save>保存</button></div></div>',
      'wide'
    );
    const q = (f) => m.box.querySelector('[data-f="' + f + '"]');
    setTimeout(() => q('name').focus(), 40);
    const close = () => { $('#modalOverlay').hidden = true; m.box.innerHTML = ''; };
    m.box.querySelector('[data-cancel]').onclick = close;
    m.ov.onclick = (e) => { if (e.target === m.ov) close(); };
    m.box.querySelector('[data-save]').onclick = () => {
      const name = q('name').value.trim();
      if (!name) { q('name').focus(); U.toast('先给 ' + k.one + ' 起个名字', 'info'); return; }
      const data = {
        name,
        role: q('role').value.trim(),
        desc: q('desc').value.trim(),
        tags: q('tags').value.split(/[,，、\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 8),
        emoji: q('emoji').value.trim() || name.slice(0, 1)
      };
      if (it) Object.assign(it, data);
      else p[key].push(Object.assign({ id: U.uid(key.slice(0, 2)) }, data));
      p.updatedAt = Date.now();
      S.save();
      close();
      window.Writer.updateStats();
      refresh();
      U.toast(it ? '已更新' : '已添加', 'check');
    };
    const del = m.box.querySelector('[data-del]');
    if (del) del.onclick = () => {
      close();
      U.confirmModal({ title: '删除「' + it.name + '」？', desc: '只删除设定卡，不影响正文内容。', okText: '删除', danger: true }).then((ok) => {
        if (!ok) return;
        p[key] = p[key].filter((x) => x.id !== it.id);
        p.updatedAt = Date.now(); S.save();
        window.Writer.updateStats(); refresh();
        U.toast('已删除', 'trash');
      });
    };
  }

  function refresh() {
    if (!hostEl || !project) return;
    render(hostEl, project, shared);
  }

  /* ---------------- goal ---------------- */
  function lastDays(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push(d);
    }
    return out;
  }

  function goalHtml(p) {
    const today = p.daily[U.todayKey()] || 0;
    const goal = p.goal.daily || 1500;
    const pct = goal > 0 ? Math.min(100, Math.round(today / goal * 100)) : 0;
    const total = S.countWords(p);
    const days = lastDays(7);
    const values = days.map((d) => p.daily[U.todayKey(d)] || 0);
    const weekTotal = values.reduce((a, b) => a + b, 0);
    const max = Math.max.apply(null, values.concat([goal, 1]));
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if ((p.daily[U.todayKey(d)] || 0) > 0) streak++;
      else if (i > 0) break;
    }

    let h = '<div class="goal-card">' +
      '<div class="goal-top"><span class="big">' + U.fmt(today) + '</span>' +
      '<span class="of">/ ' + U.fmt(goal) + ' 字 · 今日</span><span class="goal-pct">' + pct + '%</span></div>' +
      '<div class="goal-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="goal-stats">' +
      '<div><b>' + U.fmt(total) + '</b><span>作品总字数</span></div>' +
      '<div><b>' + U.fmt(weekTotal) + '</b><span>近 7 天</span></div>' +
      '<div><b>' + streak + '</b><span>连续写作天数</span></div>' +
      '</div></div>';

    h += '<div class="set-box"><h3>' + U.icon('target') + '每日目标</h3>' +
      '<div class="sub">每天写到这里，进度条会满。目标只影响统计，不限制写作。</div>' +
      '<div class="goal-form"><input class="input" id="goalDaily" type="number" min="0" max="50000" step="100" value="' + goal + '">' +
      '<button class="btn primary" data-goal-save>保存目标</button></div>' +
      '<div class="chips-row">' + [500, 1000, 1500, 2000, 3000].map((n) =>
        '<button class="chip' + (n === goal ? ' on' : '') + '" data-goal="' + n + '">' + U.fmt(n) + '</button>').join('') +
      '</div></div>';

    h += '<div class="set-box"><h3>' + U.icon('calendar') + '近 7 天</h3>' +
      '<div class="sub">每天的落笔都会记在这里。</div><div class="goal-chart">';
    days.forEach((d, i) => {
      const v = values[i];
      const hgt = Math.round(v / max * 100);
      const isToday = i === days.length - 1;
      h += '<div class="gc-col' + (isToday ? ' today' : '') + '">' +
        '<span class="gc-val">' + (v ? U.fmt(v) : '') + '</span>' +
        '<div class="gc-track"><i style="height:' + Math.max(v ? 4 : 1, hgt) + '%"></i></div>' +
        '<span class="gc-day">' + (isToday ? '今天' : '周' + weekNames[d.getDay()]) + '</span></div>';
    });
    h += '</div></div>';

    h += '<div class="set-box"><h3>' + U.icon('info') + '小提示</h3>' +
      '<div class="sub" style="margin-bottom:0">在「写作」视图里编辑正文，或在大纲节点的快速编辑框里写字，都会计入今天的字数。</div></div>';
    return h;
  }

  /* ---------------- git sync ---------------- */
  function syncHtml() {
    let h = '<div class="set-box"><h3>' + U.icon('history') + '工作区 Git</h3>' +
      '<div class="sub">直接读写「写作与毕设」工作区。提交只落在本机，推送前会再问你一次。</div>' +
      '<div id="gitLocal" class="git-panel"><div class="git-sub">正在读取仓库…</div></div></div>';

    h += '<div class="set-box"><h3>' + U.icon('lock') + '关于 Token</h3>' +
      '<div class="sub" style="margin-bottom:0">6.3 起网页不再保存 GitHub Token，也不提供直传表单。推送凭据请在 GitHub Desktop 或系统凭据管理器里配置；' +
      '文库、Obsidian、导出与 AI 的入口都集中在写作库底部「设置」里。</div></div>';
    return h;
  }

  /* ---------------- local workspace git ---------------- */
  async function loadGitPanel() {
    const box = $('#gitLocal');
    if (!box) return;
    if (!window.Gen6Api) {
      box.innerHTML = '<div class="git-sub">本地服务没有连上，Git 面板暂时不可用。</div>';
      return;
    }
    try {
      const status = await window.Gen6Api.gitStatus();
      renderGitPanel(status);
    } catch (error) {
      box.innerHTML = '<div class="git-status err">' + U.icon('alert') + '<span>' + U.esc(error.message || '读取仓库失败') + '</span></div>';
    }
  }

  function renderGitPanel(s) {
    const box = $('#gitLocal');
    if (!box) return;
    const files = s.files || [];
    let h = '<div class="git-grid">' +
      '<div class="git-stat"><b>' + U.esc(s.branch || '—') + '</b><span>分支</span></div>' +
      '<div class="git-stat"><b>' + U.esc(s.commit || '—') + '</b><span>最近提交</span></div>' +
      '<div class="git-stat"><b>' + files.length + '</b><span>未提交文件</span></div></div>';
    h += '<div class="git-sub">' + U.esc(s.subject || '还没有提交记录') + (s.date ? ' · ' + U.esc(s.date) : '') + '</div>';
    h += '<div class="git-files">' + (files.length
      ? files.map((f) => '<div><span class="code">' + U.esc(f.code) + '</span>' + U.esc(f.file) + '</div>').join('')
      : '<div class="git-sub" style="padding:6px 10px">工作区是干净的，没有待提交的改动。</div>') + '</div>';
    h += '<input class="git-msg" id="gitMsg" placeholder="提交说明（留空自动写日期）" maxlength="200">';
    h += '<div class="git-actions">' +
      '<button class="btn primary" data-lg="commit"' + (files.length ? '' : ' disabled') + '>' + U.icon('save') + '提交到本机 Git</button>' +
      '<button class="btn" data-lg="refresh">' + U.icon('refresh') + '刷新</button>' +
      '<button class="btn" data-lg="push"' + (s.remote ? '' : ' disabled') + '>' + U.icon('upload') + '推送</button>' +
      '</div>';
    h += '<div class="git-note">远程：' + (s.remote
      ? U.esc(s.remote)
      : '未配置。第六代不保存 Token；推送前请先在 GitHub Desktop 或 TRAE 里给这个仓库设一次远程地址。') + '</div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-lg]').forEach((b) => {
      b.onclick = () => localGitAction(b.getAttribute('data-lg'), b);
    });
  }

  async function localGitAction(act, btn) {
    if (!window.Gen6Api) return;
    if (act === 'refresh') { loadGitPanel(); return; }
    if (act === 'commit') {
      const msg = ($('#gitMsg') && $('#gitMsg').value.trim()) || '';
      busy(btn, true, '提交中…');
      try {
        const result = await window.Gen6Api.gitCommit(msg);
        if (result.status) renderGitPanel(result.status); else await loadGitPanel();
        U.toast(result.empty ? '没有需要提交的改动' : '已提交到本机 Git', result.empty ? 'info' : 'check');
      } catch (error) {
        U.toast(error.message || '提交失败', 'alert');
      } finally {
        busy(btn, false);
      }
      return;
    }
    if (act === 'push') {
      const status = await window.Gen6Api.gitStatus().catch(() => null);
      const remote = status && status.remote ? status.remote : '';
      const ok = await U.confirmModal({
        title: '推送到远程仓库？',
        desc: remote ? '会把本机提交推送到：' + remote : '这个仓库还没有远程地址，请先配置。',
        okText: '推送'
      });
      if (!ok) return;
      busy(btn, true, '推送中…');
      try {
        const result = await window.Gen6Api.gitPush();
        U.toast(result.message || '已推送', 'cloud');
        await loadGitPanel();
      } catch (error) {
        U.toast(error.message || '推送失败', 'alert');
      } finally {
        busy(btn, false);
      }
    }
  }

  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = on;
    if (on) { btn.dataset.old = btn.innerHTML; btn.innerHTML = U.icon('refresh') + (label || '处理中…'); }
    else if (btn.dataset.old) { btn.innerHTML = btn.dataset.old; delete btn.dataset.old; }
  }

  /* ---------------- data / backup ---------------- */
  function dataHtml(p) {
    const totalWords = S.countWords(p);
    const chapters = S.sortedChapters(p).length;
    const read = Object.keys(window.Curation.reads).length;
    const stars = Object.keys(window.Curation.stars).length;
    const notes = Object.keys(window.Curation.notes).length;
    const edits = Object.keys(window.Curation.edits).length;

    let h = '<div class="set-box"><h3>' + U.icon('save') + '工程备份 .nb</h3>' +
      '<div class="sub">导出全部作品、大纲、正文、人物、目标，以及文库里的编辑、笔记、收藏和已读状态。可在另一台设备导入。</div>' +
      '<div class="row wrap"><button class="btn dark" data-data="export">' + U.icon('download') + '导出 .nb 备份</button>' +
      '<button class="btn" data-data="import">' + U.icon('upload') + '导入 .nb 备份</button></div></div>';

    h += '<div class="set-box"><h3>' + U.icon('file') + '导出当前成稿</h3>' +
      '<div class="sub">《' + U.esc(p.name) + '》· ' + chapters + ' 章 · ' + U.fmt(totalWords) + ' 字</div>' +
      '<div class="row wrap"><button class="btn" data-data="md">Markdown</button>' +
      '<button class="btn" data-data="txt">TXT</button>' +
      '<button class="btn" data-data="html">HTML</button></div></div>';

    h += '<div class="set-box"><h3>' + U.icon('cube') + '本机数据</h3>' +
      '<div class="sub">这些数字只统计这台设备上的内容。</div><div class="stat-mini">' +
      '<div><b>' + S.projects.length + '</b><span>部作品</span></div>' +
      '<div><b>' + chapters + '</b><span>本章节</span></div>' +
      '<div><b>' + U.fmt(totalWords) + '</b><span>本作字数</span></div>' +
      '<div><b>' + read + '</b><span>文库已读</span></div>' +
      '<div><b>' + stars + '</b><span>收藏</span></div>' +
      '<div><b>' + notes + ' / ' + edits + '</b><span>笔记 / 编辑</span></div>' +
      '</div></div>';

    h += '<div class="set-box"><h3>' + U.icon('trash') + '清空数据</h3>' +
      '<div class="sub">清空前一定先导出备份。清空后无法从云端以外的地方找回。</div>' +
      '<div class="row wrap"><button class="btn" data-data="clear-curation">清空文库整理</button>' +
      '<button class="btn danger" data-data="clear-all">清空全部写作数据</button></div></div>';

    h += '<div class="about-card"><span class="logo">写</span><div><b>写作库 · 6.4 同步版</b>' +
      '<p>v' + U.esc((window.WB64 && window.WB64.BUILD) || '6.4.1') + ' · 离线可编辑 · 1,448 篇文稿与写作台工程随页面加载，编辑保存在浏览器，不依赖本地 Node 服务</p></div></div>';
    return h;
  }

  function clearCuration() {
    U.confirmModal({ title: '清空文库整理？', desc: '会清除所有编辑、笔记、收藏与已读状态，原始文章不受影响。', okText: '清空', danger: true }).then((ok) => {
      if (!ok) return;
      window.Curation.clear();
      window.Lib.renderSide();
      refresh();
      U.toast('文库整理已清空', 'trash');
    });
  }

  function clearAll() {
    U.confirmModal({ title: '清空全部写作数据？', desc: '所有作品、章节、正文、人物设定与目标都会从本机删除，文库整理也会一并清空。', okText: '全部清空', danger: true }).then((ok) => {
      if (!ok) return;
      S.projects = [];
      S.save();
      S.flush();
      window.Curation.clear();
      window.Writer.state.pid = null;
      window.Writer.state.selNode = null;
      window.Writer.state.view = 'outline';
      window.Lib.renderSide();
      window.Writer.renderAll();
      refresh();
      U.toast('已清空，一切重新开始', 'feather');
    });
  }

  /* ---------------- bindings ---------------- */
  function bindBody() {
    const body = $('#setBody');
    if (!body) return;

    body.querySelectorAll('[data-ent-add]').forEach((b) => {
      b.onclick = () => entityModal(active, null);
    });
    const openEnt = (id) => {
      const it = (project[active] || []).find((x) => x.id === id);
      if (it) entityModal(active, it);
    };
    body.querySelectorAll('[data-ent-edit]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); openEnt(b.getAttribute('data-ent-edit')); };
    });
    body.querySelectorAll('[data-ent-card]').forEach((c) => {
      c.onclick = () => openEnt(c.getAttribute('data-ent-card'));
      c.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEnt(c.getAttribute('data-ent-card')); }
      };
    });

    body.querySelectorAll('[data-goal]').forEach((b) => {
      b.onclick = () => {
        project.goal.daily = +b.getAttribute('data-goal');
        project.updatedAt = Date.now(); S.save();
        window.Writer.updateStats(); refresh();
        U.toast('每日目标已更新', 'target');
      };
    });
    const saveGoal = body.querySelector('[data-goal-save]');
    if (saveGoal) saveGoal.onclick = () => {
      const v = Math.max(0, Math.min(50000, Math.round(+$('#goalDaily').value || 0)));
      project.goal.daily = v;
      project.updatedAt = Date.now(); S.save();
      window.Writer.updateStats(); refresh();
      U.toast('每日目标已设为 ' + U.fmt(v) + ' 字', 'target');
    };
    const goalInput = body.querySelector('#goalDaily');
    if (goalInput) goalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveGoal.click(); });

    body.querySelectorAll('[data-data]').forEach((b) => {
      b.onclick = () => {
        const act = b.getAttribute('data-data');
        if (act === 'export') window.Writer.exportBackup();
        else if (act === 'import') window.Writer.importBackup();
        else if (act === 'clear-curation') clearCuration();
        else if (act === 'clear-all') clearAll();
        else window.LibExport.exportProject(project, act);
      };
    });
  }

  window.Settings = {
    render,
    tab(name) {
      if (TABS.some((t) => t.id === name)) {
        active = name;
        if (hostEl) render(hostEl, project, shared);
      }
    },
    get active() { return active; }
  };
})();
