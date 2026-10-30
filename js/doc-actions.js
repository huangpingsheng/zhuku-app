/* ============================================================
   doc-actions.js · 6.1 单篇动作（历史 / Git / 移动复制 / 草稿 / 导出）
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$;
  const D = window.LibData;

  function api() { return window.Gen6Api; }
  function nav(path) { location.hash = '#' + path; }

  function fmtTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function sourceLabel(item) {
    if (item.note) return item.note;
    return { before: '改动前留档', save: '保存', restore: '恢复' }[item.source] || '版本';
  }

  function busy(btn, on, text) {
    if (!btn) return;
    if (on) {
      btn.dataset.old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = U.icon('refresh') + (text || '处理中…');
    } else {
      btn.disabled = false;
      if (btn.dataset.old) btn.innerHTML = btn.dataset.old;
    }
  }

  async function refresh(id) {
    if (window.Gen6Bridge) {
      try { await window.Gen6Bridge.refreshLibrary({ silent: true, delay: 40 }); } catch (e) { /* 忽略 */ }
    }
    if (window.Writer && document.body.classList.contains('mode-write') && window.Writer.state.panelTab === 'library') {
      window.Writer.renderLeft();
    }
    if (id && window.Reader && /^\/a\//.test(window.Lib ? window.Lib.route() : '')) window.Reader.open(id);
  }

  /* ---------------- version history ---------------- */
  async function history(rec) {
    if (!api()) { U.toast('本地服务没有连接', 'alert'); return; }
    const m = U.openModal(
      '<div class="modal-head"><div><h3>版本历史</h3><p>' + U.esc(rec.title) + ' · 每次编辑、恢复都会留一条带日期和时间的版本记录</p></div>' +
      '<button class="icon-btn sm" data-close aria-label="关闭">✕</button></div>' +
      '<div class="modal-body"><div class="hist-list" id="revList"><div class="hub-loading"><span class="hub-spin"></span><span>正在读取版本…</span></div></div></div>' +
      '<div class="modal-foot"><span class="hint">只保留最近 160 个版本 · 正本 md 不受影响</span><div class="foot-actions">' +
      '<button class="btn" data-close>关闭</button></div></div>',
      'wide'
    );
    m.box.querySelectorAll('[data-close]').forEach((b) => { b.onclick = m.close; });
    m.ov.onclick = (e) => { if (e.target === m.ov) m.close(); };
    const box = m.box.querySelector('#revList');
    let list = [];
    try {
      const result = await api().revisions(rec.id);
      list = (result && result.revisions) || [];
    } catch (error) {
      box.innerHTML = '<div class="hub-error">' + U.icon('alert') + '<div><b>读不到版本</b><p>' + U.esc(error.message || '本地服务出错') + '</p></div></div>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="hub-empty">' + U.icon('history') + '<p>这篇还没有历史版本。下次在阅读页编辑并保存后，会自动留下「改动前」和保存后的版本。</p></div>';
      return;
    }
    box.innerHTML = list.map((item, i) =>
      '<div class="hist-row">' +
      '<div class="hist-time">' + U.esc(fmtTime(item.time)) + '<span>' + U.esc(sourceLabel(item)) + '</span></div>' +
      '<div class="hist-main"><b>' + U.esc(item.title || rec.title) + '</b><p>' +
      U.esc((item.tags || []).slice(0, 4).join(' · ') || '无标签') + ' · ' + U.esc(item.status || '未知状态') + '</p></div>' +
      '<div class="hist-meta">' + U.fmt(item.words || 0) + ' 字</div>' +
      '<div class="hist-actions"><button class="btn sm" data-rev-view="' + i + '">预览</button>' +
      '<button class="btn sm" data-rev-restore="' + i + '">恢复</button></div></div>'
    ).join('');
    box.querySelectorAll('[data-rev-view]').forEach((b) => {
      b.onclick = () => preview(rec, list[+b.getAttribute('data-rev-view')], m);
    });
    box.querySelectorAll('[data-rev-restore]').forEach((b) => {
      b.onclick = () => restore(rec, list[+b.getAttribute('data-rev-restore')], b, m);
    });
  }

  async function preview(rec, item, parent) {
    if (!item) return;
    let result;
    try {
      result = await api().revision(rec.id, item.rev);
    } catch (error) {
      U.toast(error.message || '读不到这个版本', 'alert');
      return;
    }
    const rev = (result && result.revision) || {};
    const m = U.openModal(
      '<div class="modal-head"><div><h3>' + U.esc(rev.title || rec.title) + '</h3>' +
      '<p>' + U.esc(fmtTime(rev.time || item.time)) + ' · ' + U.esc(sourceLabel(item)) + ' · ' + U.fmt(item.words || 0) + ' 字</p></div></div>' +
      '<div class="modal-body"><div class="rev-preview">' + (rev.html || '<p class="hint">这个版本没有正文。</p>') + '</div></div>' +
      '<div class="modal-foot"><span class="hint">恢复前，当前版本也会自动留档</span><div class="foot-actions">' +
      '<button class="btn ghost" data-close>返回</button>' +
      '<button class="btn primary" data-restore>恢复这个版本</button></div></div>',
      'wide'
    );
    m.box.querySelectorAll('[data-close]').forEach((b) => { b.onclick = m.close; });
    m.ov.onclick = (e) => { if (e.target === m.ov) m.close(); };
    m.box.querySelector('[data-restore]').onclick = (e) => restore(rec, item, e.currentTarget, m);
  }

  async function restore(rec, item, btn, modal) {
    if (!item) return;
    const ok = await U.confirmModal({
      title: '恢复到 ' + fmtTime(item.time) + ' 的版本？',
      desc: '当前正文会先自动留档，再写回这个旧版本。恢复后阅读页会刷新。',
      okText: '恢复'
    });
    if (!ok) return;
    busy(btn, true, '恢复中…');
    try {
      await api().restoreRevision(rec.id, item.rev);
      if (modal) modal.close();
      U.toast('已恢复到 ' + fmtTime(item.time), 'history');
      await refresh(rec.id);
    } catch (error) {
      busy(btn, false);
      U.toast(error.message || '恢复失败', 'alert');
    }
  }

  /* ---------------- git upload ---------------- */
  async function gitUpload(rec, btn) {
    if (!api()) { U.toast('本地服务没有连接', 'alert'); return; }
    busy(btn, true, '上传中…');
    try {
      const result = await api().gitUpload(rec.id);
      busy(btn, false);
      const ok = result && result.ok;
      const message = result && result.message ? result.message : '已处理';
      U.toast(message, ok ? 'check' : 'alert');
      if (result && result.pushDetail && !result.pushed && result.remote) {
        setTimeout(() => U.toast(result.pushDetail, 'alert'), 700);
      }
    } catch (error) {
      busy(btn, false);
      U.toast(error.message || 'Git 上传失败', 'alert');
    }
  }

  /* ---------------- move / copy ---------------- */
  function transfer(rec, mode) {
    if (!api()) { U.toast('本地服务没有连接', 'alert'); return; }
    D.init();
    const isMove = mode === 'move';
    const dbs = D.databases.slice();
    if (!dbs.length) { U.toast('还没有可用的数据库', 'info'); return; }
    let targetDbId = rec.dbId || dbs[0].id;
    let targetType = rec.type;
    const catsFor = (dbId) => {
      const inDb = D.cats.filter((c) => (c.dbId || dbs[0].id) === dbId);
      const list = dbId === rec.dbId ? inDb.filter((c) => c.type === rec.type) : inDb;
      if (list.length) return list;
      const fallbackSub = rec.type === '小说' ? '未分卷' : '未分类';
      return [{
        id: '__new__', name: '未分类', type: rec.type, dbId,
        subs: [{ id: '__new__', name: fallbackSub }]
      }];
    };
    const m = U.openModal(
      '<div class="modal-head"><div><h3>' + (isMove ? '移动到其他目录' : '复制到其他目录') + '</h3>' +
      '<p>' + (isMove ? 'md 文件会移到新的目录，标题与编号不变；可以跨数据库移动。' : '会新建一份独立 md，原文章保留；可以复制到另一个数据库。') + '</p></div></div>' +
      '<div class="modal-body">' +
      (isMove ? '' : '<div class="field"><label>新标题</label><input class="input" id="trTitle" value="' + U.esc(rec.title + ' · 副本') + '" maxlength="120"></div>') +
      '<div class="field"><label>目标数据库</label><select class="input" id="trDb">' +
      dbs.map((db) => '<option value="' + U.esc(db.id) + '"' + (db.id === targetDbId ? ' selected' : '') + '>' + U.esc(db.name) + '（' + db.stats.files + ' 篇）</option>').join('') +
      '</select></div>' +
      '<div class="row"><div class="field grow"><label>分类</label><select class="input" id="trCat"></select></div>' +
      '<div class="field grow"><label>' + (rec.type === '小说' ? '卷' : '子类') + '</label><select class="input" id="trSub"></select></div></div>' +
      '<p class="hint">当前在「' + U.esc(rec.dbName || '') + ' / ' + U.esc(rec.catName) + ' / ' + U.esc(rec.subName) + '」。</p>' +
      '</div>' +
      '<div class="modal-foot"><div class="foot-actions"><button class="btn ghost" data-cancel>取消</button>' +
      '<button class="btn primary" data-ok>' + (isMove ? '移动' : '复制') + '</button></div></div>',
      'wide'
    );
    const dbEl = m.box.querySelector('#trDb');
    const catEl = m.box.querySelector('#trCat');
    const subEl = m.box.querySelector('#trSub');
    const sameTarget = () => {
      const cat = catsFor(targetDbId).find((c) => c.id === catEl.value);
      const sub = cat && (cat.subs.find((s) => s.id === subEl.value) || cat.subs[0]);
      return !!(cat && sub && targetDbId === rec.dbId && cat.name === rec.catName && sub.name === rec.subName);
    };
    const fillCats = (keepSelection) => {
      const cats = catsFor(targetDbId);
      const preferred = keepSelection ? null : cats.find((c) => c.name === rec.catName);
      const selected = preferred || cats[0];
      targetType = selected.type || rec.type;
      catEl.innerHTML = cats.map((c) => '<option value="' + U.esc(c.id) + '"' + (c.id === selected.id ? ' selected' : '') + '>' + U.esc(c.name) + '</option>').join('');
      fillSubs();
    };
    const fillSubs = () => {
      const cats = catsFor(targetDbId);
      const cat = cats.find((c) => c.id === catEl.value) || cats[0];
      if (!cat) { subEl.innerHTML = ''; return; }
      const preferred = (targetDbId === rec.dbId && cat.name === rec.catName) ? rec.subName : '';
      const selected = cat.subs.find((s) => s.name === preferred) || cat.subs[0];
      subEl.innerHTML = cat.subs.map((s) => '<option value="' + U.esc(s.id) + '"' + (s.id === selected.id ? ' selected' : '') + '>' + U.esc(s.name) + '</option>').join('');
    };
    dbEl.onchange = () => {
      targetDbId = dbEl.value;
      fillCats(false);
      updateHint();
    };
    catEl.onchange = () => {
      const cat = catsFor(targetDbId).find((c) => c.id === catEl.value);
      if (cat && cat.type) targetType = cat.type;
      fillSubs();
      updateHint();
    };
    const updateHint = () => {
      const hint = m.box.querySelector('.hint');
      if (!hint) return;
      if (sameTarget()) hint.textContent = '目标与当前位置相同，换一个数据库或目录再试。';
      else if (targetDbId !== rec.dbId) hint.textContent = '当前在「' + (rec.dbName || '') + ' / ' + rec.catName + ' / ' + rec.subName + '」。跨库会按目标库的分类改写类型（' + targetType + '），正文与标签不变。';
      else hint.textContent = '当前在「' + (rec.dbName || '') + ' / ' + rec.catName + ' / ' + rec.subName + '」。只在同类型（' + rec.type + '）下移动，避免元数据错乱。';
    };
    fillCats(true);
    m.box.querySelector('[data-cancel]').onclick = m.close;
    m.ov.onclick = (e) => { if (e.target === m.ov) m.close(); };
    m.box.querySelector('[data-ok]').onclick = async (e) => {
      const btn = e.currentTarget;
      const cats = catsFor(targetDbId);
      const cat = cats.find((c) => c.id === catEl.value) || cats[0];
      const sub = cat && (cat.subs.find((s) => s.id === subEl.value) || cat.subs[0]);
      if (!cat || !sub) { U.toast('这个数据库还没有可用的分类', 'info'); return; }
      if (isMove && sameTarget()) {
        U.toast('已经在目标目录里了', 'info');
        return;
      }
      const payload = { cats: [targetType, cat.name, sub.name], dbId: targetDbId, type: targetType };
      if (!isMove) {
        payload.title = (m.box.querySelector('#trTitle').value || '').trim() || rec.title + ' · 副本';
        payload.tags = rec.tags || [];
        payload.status = '草稿';
      }
      busy(btn, true, isMove ? '移动中…' : '复制中…');
      try {
        const result = isMove ? await api().move(rec.id, payload) : await api().copy(rec.id, payload);
        const article = result && result.article;
        m.close();
        const targetDb = D.db(targetDbId);
        const where = (targetDb ? targetDb.short : '') + ' / ' + cat.name + ' / ' + sub.name;
        U.toast(isMove ? '已移动到 ' + where : '已复制到 ' + where, 'check');
        await refresh(isMove ? rec.id : (article && article.id));
      } catch (error) {
        busy(btn, false);
        U.toast(error.message || (isMove ? '移动失败' : '复制失败'), 'alert');
      }
    };
  }

  /* ---------------- to draft ---------------- */
  async function toDraft(rec) {
    if (!api()) { U.toast('本地服务没有连接', 'alert'); return; }
    const body = rec.text || window.Curation.textOf(rec) || '';
    const markdown = '# ' + rec.title + '\n\n' + body;
    try {
      const draft = await api().createDraft({
        title: rec.title + ' · 草稿',
        markdown,
        tags: rec.tags || [],
        sourceDocId: rec.id,
        sourceTitle: rec.title
      });
      U.toast('已存入草稿箱，可在底部「草稿」继续写', 'note');
    } catch (error) {
      U.toast(error.message || '存入草稿失败', 'alert');
    }
  }

  /* ---------------- single export ---------------- */
  function exportHtml(rec) {
    const html = rec.html || window.Curation.htmlOf(rec);
    const doc = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + U.esc(rec.title) + '</title><style>' +
      'body{margin:0;background:#F6F6F3;color:#141519;font-family:"Source Han Serif SC","Noto Serif CJK SC","Songti SC",Georgia,serif}' +
      'article{max-width:760px;margin:0 auto;padding:56px 24px 96px}' +
      'h1{font-size:32px;line-height:1.35;margin:0 0 14px}' +
      '.meta{font-size:12px;color:#7A7F86;border-bottom:1px solid #E5E5DF;padding-bottom:16px;margin-bottom:32px}' +
      'p{font-size:17px;line-height:1.95;margin:0 0 1.1em}blockquote{border-left:3px solid #D8D8D2;margin:1.4em 0;padding:2px 0 2px 18px;color:#5C6169}' +
      'h2,h3{line-height:1.45;margin:1.8em 0 .7em}img{max-width:100%}' +
      '</style></head><body><article><h1>' + U.esc(rec.title) + '</h1>' +
      '<div class="meta">' + U.esc(rec.catName) + ' / ' + U.esc(rec.subName) + ' · ' + U.fmt(rec.words || 0) + ' 字 · ' + U.esc(rec.status || '') + '</div>' +
      html + '</article></body></html>';
    U.download(safeName(rec.title) + '.html', doc, 'text/html');
    U.toast('HTML 已开始下载', 'download');
  }

  function exportJson(rec) {
    const data = {
      id: rec.id,
      title: rec.title,
      type: rec.type,
      cats: rec.cats || [],
      catName: rec.catName,
      subName: rec.subName,
      tags: rec.tags || [],
      status: rec.status,
      words: rec.words,
      tone: rec.tone,
      summary: rec.summary,
      updated: rec.updated,
      path: rec.path,
      markdown: '# ' + rec.title + '\n\n' + (rec.text || window.Curation.textOf(rec))
    };
    U.download(safeName(rec.title) + '.json', JSON.stringify(data, null, 2), 'application/json');
    U.toast('JSON 已开始下载', 'download');
  }

  function safeName(name) {
    return String(name || '未命名').replace(/[\\/:*?"<>|]/g, '·').slice(0, 80) || '未命名';
  }

  /* ---------------- directory export / delete ---------------- */
  async function exportDirectory(catId, subId) {
    if (!api()) { U.toast('本地服务没有连接', 'alert'); return; }
    D.init();
    const cat = D.cat(catId);
    if (!cat) { U.toast('找不到这个目录', 'alert'); return; }
    const sub = subId ? D.sub(catId, subId) : null;
    const name = sub ? sub.name : cat.name;
    U.toast('正在打包「' + name + '」…', 'download');
    try {
      const blob = await api().exportZip({ cat: catId, sub: subId || '', formats: 'md,html' });
      U.download('写作库-' + safeName(name) + '-' + U.todayKey() + '.zip', blob, 'application/zip');
      U.toast('已导出「' + name + '」ZIP', 'download');
    } catch (error) {
      U.toast(error.message || '导出失败', 'alert');
    }
  }

  async function deleteDirectory(catId, subId, opts) {
    if (!api()) { U.toast('本地服务没有连接', 'alert'); return; }
    const options = opts || {};
    D.init();
    const cat = D.cat(catId);
    if (!cat) { U.toast('找不到这个目录', 'alert'); return; }
    const sub = subId ? D.sub(catId, subId) : null;
    const name = sub ? sub.name : cat.name;
    const count = (sub ? sub.files : cat.subs.reduce((a, s) => a + s.files.length, 0));
    const typed = await U.promptModal({
      title: '删除目录「' + name + '」？',
      desc: '目录里的 ' + count + ' 篇 md 会移到 07-备份/网页编辑/删除，不会直接消失。为防误删，请输入目录名「' + name + '」确认。',
      label: '输入目录名',
      placeholder: name,
      okText: '移到备份并删除'
    });
    if (typed == null) return;
    if (typed.trim() !== name) { U.toast('目录名不一致，已取消', 'alert'); return; }
    try {
      const result = await api().deleteDirectory({ catId, subId: subId || '', confirmText: typed.trim() });
      U.toast(result.message || '目录已删除', 'trash');
      if (window.Gen6Bridge) await window.Gen6Bridge.refreshLibrary({ silent: true, delay: 60 });
      if (window.Writer && document.body.classList.contains('mode-write') && window.Writer.state.panelTab === 'library') {
        window.Writer.renderLeft();
      }
      if (!options.stay && window.Lib) window.Lib.nav('/c/' + catId);
    } catch (error) {
      U.toast(error.message || '删除失败', 'alert');
    }
  }

  /* ---------------- shared menu ---------------- */
  function menu(anchor, rec) {
    if (!rec) return;
    const items = [
      { label: '版本历史', icon: 'history', fn: () => history(rec) },
      { label: '一键上传到 Git', icon: 'upload', fn: () => gitUpload(rec) },
      { label: '移动到其他目录', icon: 'folder', fn: () => transfer(rec, 'move') },
      { label: '复制到其他目录', icon: 'file', fn: () => transfer(rec, 'copy') },
      { label: '存入草稿箱', icon: 'note', fn: () => toDraft(rec) },
      { sep: true },
      { label: '导出 HTML', icon: 'download', fn: () => exportHtml(rec) },
      { label: '导出 JSON', icon: 'doc', fn: () => exportJson(rec) }
    ];
    const el = $('#ctxMenu');
    if (!el) return;
    el.innerHTML = items.map((it, i) => it.sep
      ? '<div class="mi-sep"></div>'
      : '<button class="mi" data-di="' + i + '"><span class="mi-ico">' + U.icon(it.icon) + '</span><span class="grow">' + U.esc(it.label) + '</span></button>'
    ).join('');
    el.hidden = false;
    const r = anchor ? anchor.getBoundingClientRect() : { left: 20, bottom: 80, right: 60 };
    const width = 232;
    const height = items.length * 36 + 20;
    let left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 10));
    let top = r.bottom + 6;
    if (top + height > window.innerHeight - 10) top = Math.max(10, r.top - height - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.minWidth = width + 'px';
    el.querySelectorAll('[data-di]').forEach((b) => {
      b.onclick = () => {
        el.hidden = true;
        const item = items[+b.getAttribute('data-di')];
        if (item && item.fn) item.fn();
      };
    });
  }

  window.DocActions = { menu, history, gitUpload, transfer, toDraft, exportHtml, exportJson, exportDirectory, deleteDirectory };
})();
