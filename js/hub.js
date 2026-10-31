/* ============================================================
   hub.js · 草稿箱 / 插件与主题 / 设置中心
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const D = window.LibData, C = window.Curation, S = window.Store;

  let draftSort = 'updated';
  let draftQuery = '';
  let draftCache = [];
  let draftState = null;

  let pluginTab = 'themes';
  let marketCache = null;
  let marketUrl = '';
  let marketLoading = false;
  let marketError = '';
  let autoUpdating = false;
  let installing = false;

  let settingsTab = 'overview';
  let settingsCache = null;
  let scanCache = null;

  function api() { return window.Gen6Api; }

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDateTime(value) {
    if (!value) return '—';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtDate(value) {
    const full = fmtDateTime(value);
    return full === '—' ? full : full.slice(0, 10);
  }
  function timeOnly(value) {
    const full = fmtDateTime(value);
    return full === '—' ? full : full.slice(11);
  }
  function relOf(value) {
    const t = new Date(value).getTime();
    return isNaN(t) ? '' : U.relTime(t);
  }
  function wordsOf(text) { return U.countWords(text || ''); }
  function mdExcerpt(md, len) {
    return String(md || '')
      .replace(/^---[\s\S]*?---/, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`~\[\]()!-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, len || 140);
  }
  function safeColor(value, fallback) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
    if (/^rgba?\([\d\s.,%]+\)$/i.test(raw)) return raw;
    if (/^hsla?\([\d\s.,%]+\)$/i.test(raw)) return raw;
    return fallback || '#E9E9E4';
  }
  function hexColor(value, fallback) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/i.test(raw)) return '#' + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3];
    return fallback || '#F4EDDF';
  }
  function errText(error) {
    return (error && error.message) || '操作失败';
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = U.icon('refresh') + (label || '处理中…');
    } else {
      btn.disabled = false;
      if (btn.dataset.old) { btn.innerHTML = btn.dataset.old; delete btn.dataset.old; }
    }
  }
  function hubLoading(text) {
    return '<div class="hub-loading"><span class="hub-spin"></span><span>' + U.esc(text || '正在读取…') + '</span></div>';
  }
  function hubError(text, retryAct) {
    return '<div class="hub-error">' + U.icon('alert') + '<div><b>没有读出来</b><p>' + U.esc(text) + '</p>' +
      (retryAct ? '<button class="btn sm" data-hub-retry="' + U.esc(retryAct) + '">重试</button>' : '') + '</div></div>';
  }
  function crumb(label) {
    return '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span>' + U.esc(label) + '</span>';
  }
  function viewRoot() { return $('#libView'); }
  function on(sel, fn) {
    const el = viewRoot().querySelector(sel);
    if (el) fn(el);
    return el;
  }
  function onAll(sel, fn) {
    $$(sel, viewRoot()).forEach(fn);
  }

  /* ============================================================
     草稿箱
     ============================================================ */
  async function drafts() {
    flushDraftEditor();
    window.Lib.render('<div class="hub">' + window.Lib.pageHead(crumb('草稿'), '草稿箱', '正在读取…', '') + hubLoading('正在读取草稿…') + '</div>');
    try {
      const res = await api().drafts();
      draftCache = Array.isArray(res) ? res : ((res && res.drafts) || []);
    } catch (error) {
      window.Lib.render('<div class="hub">' + window.Lib.pageHead(crumb('草稿'), '草稿箱', '', '') + hubError(errText(error), 'drafts') + '</div>');
      bindRetry('drafts', drafts);
      return;
    }
    renderDrafts();
  }

  function draftFiltered() {
    const q = draftQuery.trim().toLowerCase();
    let list = draftCache.slice();
    if (q) {
      list = list.filter((d) =>
        String(d.title || '').toLowerCase().includes(q) ||
        String(d.markdown || d.text || '').toLowerCase().includes(q) ||
        (d.tags || []).some((t) => String(t).toLowerCase().includes(q))
      );
    }
    if (draftSort === 'created') list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    else if (draftSort === 'title') list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'));
    else if (draftSort === 'words') list.sort((a, b) => wordsOf(b.markdown || b.text) - wordsOf(a.markdown || a.text));
    else list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return list;
  }

  function draftRow(d) {
    const words = wordsOf(d.markdown || d.text);
    const published = d.publishedId;
    return '<div class="draft-row" data-draft-open="' + U.esc(d.id) + '" role="button" tabindex="0">' +
      '<div class="draft-row-main">' +
      '<div class="draft-row-title">' + U.esc(d.title || '无题速写') +
      (published ? '<span class="pill ok">已收入文库</span>' : '<span class="pill">草稿</span>') + '</div>' +
      '<div class="draft-row-excerpt">' + U.esc(mdExcerpt(d.markdown || d.text) || '空白草稿，点开继续写。') + '</div>' +
      '<div class="draft-row-meta">' +
      '<span>' + U.icon('clock') + '改于 ' + U.esc(fmtDateTime(d.updatedAt)) + (relOf(d.updatedAt) ? ' · ' + U.esc(relOf(d.updatedAt)) : '') + '</span>' +
      '<span>建于 ' + U.esc(fmtDateTime(d.createdAt)) + '</span>' +
      '<span>' + U.fmt(words) + ' 字</span>' +
      (d.sourceDocId ? '<span>来自 ' + U.esc(d.sourceTitle || d.sourceDocId) + '</span>' : '') +
      '</div>' +
      ((d.tags && d.tags.length) ? '<div class="draft-row-tags">' + d.tags.map((t) => '<span>' + U.esc(t) + '</span>').join('') + '</div>' : '') +
      '</div>' +
      '<div class="draft-row-side">' +
      (published
        ? '<button class="btn sm primary" data-da="continue" data-id="' + U.esc(d.id) + '">继续写文章</button>' +
          '<button class="btn sm" data-da="snapshot" data-id="' + U.esc(d.id) + '">看快照</button>'
        : '<button class="btn sm primary" data-da="open" data-id="' + U.esc(d.id) + '">继续写</button>' +
          '<button class="btn sm" data-da="publish" data-id="' + U.esc(d.id) + '">收入文库</button>') +
      '<button class="icon-btn sm" data-da="download" data-id="' + U.esc(d.id) + '" title="下载 Markdown">' + U.icon('download') + '</button>' +
      '<button class="icon-btn sm danger" data-da="delete" data-id="' + U.esc(d.id) + '" title="删除草稿">' + U.icon('trash') + '</button>' +
      '</div></div>';
  }

  function renderDrafts() {
    const list = draftFiltered();
    const totalWords = draftCache.reduce((a, d) => a + wordsOf(d.markdown || d.text), 0);
    const published = draftCache.filter((d) => d.publishedId).length;
    const actions = '<button class="btn sm primary" data-da="new">' + U.icon('plus') + '新建草稿</button>';
    let body = '<div class="draft-toolbar-line">' +
      '<div class="draft-search">' + U.icon('search') + '<input id="draftSearch" placeholder="搜索草稿标题、正文、标签…" value="' + U.esc(draftQuery) + '" autocomplete="off"></div>' +
      '<select class="input sm" id="draftSort">' +
      [['updated', '最近修改'], ['created', '最近创建'], ['title', '标题'], ['words', '字数最多']]
        .map(([v, l]) => '<option value="' + v + '"' + (draftSort === v ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></div>';
    body += '<div class="draft-stats">' +
      '<span><b>' + draftCache.length + '</b> 份草稿</span>' +
      '<span><b>' + U.fmt(totalWords) + '</b> 字</span>' +
      '<span><b>' + published + '</b> 已收入文库</span>' +
      '<span>按' + (draftSort === 'updated' ? '修改时间' : draftSort === 'created' ? '创建时间' : draftSort === 'words' ? '字数' : '标题') + '排序</span></div>';
    if (!draftCache.length) {
      body += window.Lib.emptyBox('草稿箱是空的', '点右上角「新建草稿」，先写下来，稍后再决定放进哪个分类。', 'note',
        '<button class="btn primary" data-da="new">' + U.icon('plus') + '新建第一份草稿</button>');
    } else if (!list.length) {
      body += window.Lib.emptyBox('没有匹配的草稿', '换个关键词，或清空搜索。', 'search');
    } else {
      body += '<div class="draft-list">' + list.map(draftRow).join('') + '</div>';
    }
    const html = '<div class="hub hub-drafts">' +
      window.Lib.pageHead(crumb('草稿'), '草稿箱',
        '<span class="pill">' + draftCache.length + ' 份</span><span class="pill">' + U.fmt(totalWords) + ' 字</span><span class="pill">自动保存 · 带日期</span>',
        actions) + body + '</div>';
    window.Lib.render(html);
    bindDrafts();
  }

  function findDraft(id) { return draftCache.find((d) => d.id === id) || null; }

  function bindDrafts() {
    on('#draftSearch', (el) => {
      el.oninput = U.debounce(() => { draftQuery = el.value; renderDrafts(); const input = $('#draftSearch'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }, 180);
    });
    on('#draftSort', (el) => { el.onchange = () => { draftSort = el.value; renderDrafts(); }; });
    onAll('[data-draft-open]', (row) => {
      row.onclick = (e) => {
        if (e.target.closest('[data-da]')) return;
        openDraft(row.getAttribute('data-draft-open'));
      };
      row.onkeydown = (e) => { if (e.key === 'Enter') openDraft(row.getAttribute('data-draft-open')); };
    });
    onAll('[data-da]', (btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const act = btn.getAttribute('data-da');
        const id = btn.getAttribute('data-id');
        const draft = findDraft(id);
        if (act === 'new') { newDraft(); return; }
        if (!draft) return;
        if (act === 'open') { openDraft(id); return; }
        if (act === 'continue') { openDraft(id); return; }
        if (act === 'snapshot') {
          if (window.Immersive) window.Immersive.openDraft(id, { returnTo: '#/drafts' });
          return;
        }
        if (act === 'publish') { openPublishDraft(draft, () => { renderDrafts(); }); return; }
        if (act === 'download') {
          U.download(safeFileName(draft.title || '草稿') + '.md', '# ' + (draft.title || '无题') + '\n\n' + (draft.markdown || ''), 'text/markdown');
          return;
        }
        if (act === 'delete') {
          const ok = await U.confirmModal({ title: '删除草稿「' + (draft.title || '无题') + '」？', desc: '只删除草稿，不影响已经收入文库的文章。', okText: '删除', danger: true });
          if (!ok) return;
          try {
            await api().deleteDraft(draft.id);
            try { localStorage.removeItem('ws.draftHistory.' + draft.id); } catch (err) { /* 忽略 */ }
            draftCache = draftCache.filter((x) => x.id !== draft.id);
            U.toast('草稿已删除', 'trash');
            renderDrafts();
          } catch (error) { U.toast(errText(error), 'alert'); }
        }
      };
    });
  }

  function safeFileName(name) {
    return String(name || '未命名').replace(/[\\/:*?"<>|]/g, '·').slice(0, 80) || '未命名';
  }

  async function newDraft(options) {
    const opts = options || {};
    if (installing) return;
    installing = true;
    try {
      const res = await api().createDraft({ title: '无题速写', markdown: '' });
      const draft = (res && res.draft) || res;
      draftCache.unshift(draft);
      const target = '#/draft/' + encodeURIComponent(draft.id);
      if (location.hash === target) openDraft(draft.id);
      else {
        if (opts.returnTo) sessionStorage.setItem('ws.draftReturn', opts.returnTo);
        location.hash = target;
      }
    } catch (error) {
      U.toast(errText(error), 'alert');
      if (location.hash === '#/draft/new') location.hash = '#/drafts';
    } finally {
      installing = false;
    }
  }

  async function openDraft(id) {
    if (window.Immersive) {
      const known = findDraft(id);
      if (known && known.publishedId) window.Immersive.openDoc(known.publishedId, { returnTo: '#/drafts' });
      else window.Immersive.openDraft(id, { returnTo: '#/drafts' });
      return;
    }
    flushDraftEditor();
    window.Lib.render('<div class="hub hub-draft">' + hubLoading('正在打开草稿…') + '</div>');
    let draft = findDraft(id);
    if (!draft) {
      try {
        const res = await api().drafts();
        draftCache = Array.isArray(res) ? res : ((res && res.drafts) || []);
        draft = findDraft(id);
      } catch (error) {
        window.Lib.render('<div class="hub">' + window.Lib.pageHead(crumb('草稿'), '草稿箱', '', '') + hubError(errText(error), 'draft:' + id) + '</div>');
        bindRetry('draft:' + id, () => openDraft(id));
        return;
      }
    }
    if (!draft) {
      window.Lib.render('<div class="hub">' + window.Lib.pageHead(crumb('草稿'), '找不到这份草稿', '', '') +
        '<div class="hub-empty">' + U.icon('alert') + '<p>它可能已经被删除。</p><button class="btn" data-draft-back>回到草稿箱</button></div></div>');
      on('[data-draft-back]', (b) => { b.onclick = () => window.Lib.nav('/drafts'); });
      return;
    }
    renderDraftEditor(draft);
  }

  function renderDraftEditor(draft) {
    const back = sessionStorage.getItem('ws.draftReturn') || '#/drafts';
    const words = wordsOf(draft.markdown);
    const html = '<div class="hub hub-draft">' +
      '<div class="draft-topbar">' +
      '<button class="btn ghost sm" data-draft-back>' + U.icon('arrowLeft') + '草稿箱</button>' +
      '<span class="draft-save-state" id="draftSaveState">已保存 · ' + U.esc(timeOnly(draft.updatedAt)) + '</span>' +
      '<div class="draft-top-actions">' +
      ((draft.publishedId) ? '<button class="btn sm" data-draft-opendoc>' + U.icon('bookOpen') + '查看已收入的文章</button>' : '') +
      '<button class="btn sm" data-draft-act="history">' + U.icon('history') + '本机版本</button>' +
      '<button class="btn sm" data-draft-act="download">' + U.icon('download') + '下载 md</button>' +
      '<button class="icon-btn sm danger" data-draft-act="delete" title="删除草稿">' + U.icon('trash') + '</button>' +
      '<button class="btn primary sm" data-draft-act="publish">' + U.icon('upload') + '收入文库</button>' +
      '</div></div>' +
      '<div class="draft-paper">' +
      '<input class="draft-title-input" id="draftTitleInput" value="' + U.esc(draft.title || '') + '" placeholder="无题速写" maxlength="120" spellcheck="false">' +
      '<div class="draft-info" id="draftInfo"></div>' +
      '<textarea class="draft-body-input" id="draftBodyInput" spellcheck="false" placeholder="从这里开始写。支持 Markdown，写下的每一段都会自动保存在本机服务里。">' + U.esc(draft.markdown || '') + '</textarea>' +
      '</div></div>';
    window.Lib.render(html);
    const titleEl = $('#draftTitleInput');
    const bodyEl = $('#draftBodyInput');
    const stateEl = $('#draftSaveState');
    const infoEl = $('#draftInfo');
    const st = {
      id: draft.id,
      draft,
      values: { title: titleEl.value, markdown: bodyEl.value },
      dirty: false,
      timer: null,
      saving: false,
      again: false,
      elState: stateEl,
      elInfo: infoEl
    };
    draftState = st;
    if (!window.lsGet('draftHistory.' + draft.id, null)) pushDraftHistory(st, draft.title, draft.markdown || '');
    const updateInfo = () => {
      if (!infoEl) return;
      infoEl.innerHTML = '<span>建于 ' + U.esc(fmtDateTime(st.draft.createdAt)) + '</span>' +
        '<span>最近保存 ' + U.esc(fmtDateTime(st.draft.updatedAt)) + (relOf(st.draft.updatedAt) ? ' · ' + U.esc(relOf(st.draft.updatedAt)) : '') + '</span>' +
        '<span id="draftWords">' + U.fmt(wordsOf(st.values.markdown)) + ' 字</span>' +
        (st.draft.publishedId ? '<span class="pill ok">已收入 ' + U.esc(st.draft.publishedId) + '</span>' : '<span class="pill">草稿</span>');
    };
    const grow = () => {
      bodyEl.style.height = 'auto';
      bodyEl.style.height = Math.max(bodyEl.scrollHeight, Math.round(window.innerHeight * 0.52)) + 'px';
    };
    const schedule = () => {
      st.dirty = true;
      if (stateEl) { stateEl.textContent = '未保存…'; stateEl.classList.add('dirty'); }
      clearTimeout(st.timer);
      st.timer = setTimeout(() => saveDraftFor(st), 900);
      const wordEl = $('#draftWords');
      if (wordEl) wordEl.textContent = U.fmt(wordsOf(st.values.markdown)) + ' 字';
    };
    titleEl.oninput = () => { st.values.title = titleEl.value; schedule(); };
    bodyEl.oninput = () => { st.values.markdown = bodyEl.value; grow(); schedule(); };
    titleEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); bodyEl.focus(); } };
    bodyEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveDraftFor(st);
      }
    });
    updateInfo();
    grow();
    on('[data-draft-back]', (b) => { b.onclick = () => window.Lib.nav(back.indexOf('#/draft/') === 0 || back === '#/draft/new' ? '/drafts' : back.replace(/^#/, '') || '/drafts'); });
    on('[data-draft-opendoc]', (b) => {
      b.onclick = () => { if (st.draft.publishedId) window.Lib.nav('/a/' + encodeURIComponent(st.draft.publishedId)); };
    });
    onAll('[data-draft-act]', (b) => {
      b.onclick = async () => {
        const act = b.getAttribute('data-draft-act');
        if (act === 'history') { openDraftHistory(st); return; }
        if (act === 'download') {
          U.download(safeFileName(st.values.title || st.draft.title || '草稿') + '.md', '# ' + (st.values.title || '无题') + '\n\n' + st.values.markdown, 'text/markdown');
          return;
        }
        if (act === 'delete') {
          const ok = await U.confirmModal({ title: '删除草稿「' + (st.values.title || '无题') + '」？', desc: '已收入文库的文章不会被删除。', okText: '删除', danger: true });
          if (!ok) return;
          try {
            await api().deleteDraft(st.id);
            try { localStorage.removeItem('ws.draftHistory.' + st.id); } catch (err) { /* 忽略 */ }
            draftState = null;
            draftCache = draftCache.filter((x) => x.id !== st.id);
            U.toast('草稿已删除', 'trash');
            window.Lib.nav('/drafts');
          } catch (error) { U.toast(errText(error), 'alert'); }
          return;
        }
        if (act === 'publish') {
          if (st.dirty || st.timer) await saveDraftFor(st);
          openPublishDraft(st.draft, (article) => {
            st.draft.publishedId = article.id;
            updateInfo();
            U.toast('已收入文库：' + article.path, 'check');
            renderDraftEditor(st.draft);
          });
        }
      };
    });
  }

  function pushDraftHistory(st, title, markdown) {
    if (!st || !st.id) return;
    const key = 'draftHistory.' + st.id;
    const list = window.lsGet(key, []);
    const arr = Array.isArray(list) ? list : [];
    const last = arr[0];
    const text = String(markdown || '');
    if (last && last.markdown === text && last.title === title) return;
    arr.unshift({ time: new Date().toISOString(), title: title || '无题速写', markdown: text });
    window.lsSet(key, arr.slice(0, 40));
  }

  async function saveDraftFor(st) {
    if (!st) return;
    clearTimeout(st.timer);
    st.timer = null;
    if (st.saving) { st.again = true; return; }
    st.saving = true;
    const title = String(st.values.title || '').trim() || '无题速写';
    const markdown = String(st.values.markdown || '');
    if (st.elState) { st.elState.textContent = '保存中…'; st.elState.classList.add('dirty'); }
    try {
      const res = await api().updateDraft(st.id, { title, markdown });
      const updated = (res && res.draft) || res;
      st.draft = updated;
      st.dirty = false;
      pushDraftHistory(st, title, markdown);
      if (st.elState) {
        st.elState.textContent = '已保存 · ' + timeOnly(updated.updatedAt);
        st.elState.classList.remove('dirty');
      }
      const idx = draftCache.findIndex((x) => x.id === st.id);
      if (idx > -1) draftCache[idx] = updated;
      if (st.elInfo) {
        st.elInfo.innerHTML = '<span>建于 ' + U.esc(fmtDateTime(updated.createdAt)) + '</span>' +
          '<span>最近保存 ' + U.esc(fmtDateTime(updated.updatedAt)) + ' · ' + U.esc(relOf(updated.updatedAt)) + '</span>' +
          '<span id="draftWords">' + U.fmt(wordsOf(markdown)) + ' 字</span>' +
          (updated.publishedId ? '<span class="pill ok">已收入 ' + U.esc(updated.publishedId) + '</span>' : '<span class="pill">草稿</span>');
      }
    } catch (error) {
      st.dirty = true;
      if (st.elState) { st.elState.textContent = '保存失败，稍后重试'; st.elState.classList.add('dirty'); }
      U.toast(errText(error), 'alert');
    } finally {
      st.saving = false;
      if (st.again) {
        st.again = false;
        st.dirty = true;
        st.timer = setTimeout(() => saveDraftFor(st), 600);
      }
    }
  }

  function flushDraftEditor() {
    const st = draftState;
    if (!st) return;
    draftState = null;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    if (st.dirty) saveDraftFor(st);
  }
  window.addEventListener('hashchange', flushDraftEditor);
  window.addEventListener('pagehide', flushDraftEditor);

  function openDraftHistory(st) {
    const list = window.lsGet('draftHistory.' + st.id, []);
    const arr = Array.isArray(list) ? list : [];
    const rows = arr.length ? arr.map((item, i) =>
      '<div class="hist-row">' +
      '<div class="hist-time">' + U.esc(fmtDateTime(item.time)) + '<span>' + U.esc(relOf(item.time)) + '</span></div>' +
      '<div class="hist-main"><b>' + U.esc(item.title || '无题') + '</b><p>' + U.esc(mdExcerpt(item.markdown, 90) || '空白') + '</p></div>' +
      '<div class="hist-meta">' + U.fmt(wordsOf(item.markdown)) + ' 字</div>' +
      '<button class="btn sm" data-hist="' + i + '">恢复</button></div>').join('')
      : '<div class="hub-empty">' + U.icon('history') + '<p>这份草稿还没有本机版本。每次自动保存都会留下一条记录。</p></div>';
    const m = U.openModal(
      '<div class="modal-head"><div><h3>本机版本 · ' + U.esc(st.draft.title || '草稿') + '</h3>' +
      '<p>按时间倒序排列，最多保留 40 个版本。恢复只改当前草稿，不会动文库。</p></div></div>' +
      '<div class="modal-body"><div class="hist-list">' + rows + '</div></div>' +
      '<div class="modal-foot"><span class="hint">草稿历史保存在这台设备</span><div class="foot-actions">' +
      '<button class="btn ghost" data-hist-clear>清空历史</button><button class="btn" data-hist-close>关闭</button></div></div>',
      'wide'
    );
    m.box.querySelector('[data-hist-close]').onclick = m.close;
    m.ov.onclick = (e) => { if (e.target === m.ov) m.close(); };
    m.box.querySelectorAll('[data-hist]').forEach((b) => {
      b.onclick = () => {
        const item = arr[+b.getAttribute('data-hist')];
        if (!item) return;
        m.close();
        st.values = { title: item.title, markdown: item.markdown };
        const titleEl = $('#draftTitleInput'), bodyEl = $('#draftBodyInput');
        if (titleEl) titleEl.value = item.title;
        if (bodyEl) { bodyEl.value = item.markdown; bodyEl.dispatchEvent(new Event('input')); }
        st.dirty = true;
        saveDraftFor(st);
        U.toast('已恢复到 ' + fmtDateTime(item.time) + ' 的版本', 'history');
      };
    });
    m.box.querySelector('[data-hist-clear]').onclick = () => {
      try { localStorage.removeItem('ws.draftHistory.' + st.id); } catch (e) { /* 忽略 */ }
      m.close();
      U.toast('本机草稿历史已清空', 'trash');
    };
  }

  function openPublishDraft(draft, after) {
    if (!window.MetaPicker) { U.toast('「存到哪里」选择器没有载入', 'alert'); return; }
    const title = String(draft.title || '').trim() || '无题';
    window.MetaPicker.open({
      heading: '收入文库',
      desc: '草稿会变成一篇文库文章，写作台也会看到。收入后这份草稿变成只读快照，继续写请打开文章。',
      showTitle: true,
      title,
      type: '资料',
      group: '随笔',
      tags: draft.tags || [],
      status: '草稿',
      statuses: ['草稿', '待定', '定稿'],
      okText: '收入文库',
      note: U.fmt(wordsOf(draft.markdown)) + ' 字 · 创建于 ' + fmtDate(draft.createdAt),
      onConfirm: async (v) => {
        const cats = v.type === '小说'
          ? ['正文', v.group, v.sub || '未分卷']
          : [v.type, v.group, v.sub || ''];
        const result = await api().publishDraft(draft.id, {
          dbId: v.dbId, title: v.title, type: v.type, cats, tags: v.tags, status: v.status
        });
        draft.publishedId = result.article.id;
        const idx = draftCache.findIndex((x) => x.id === draft.id);
        if (idx > -1) draftCache[idx] = result.draft;
        U.toast('已收入文库：' + result.article.path, 'check');
        if (window.Gen6Bridge) window.Gen6Bridge.refreshLibrary({ silent: true, delay: 120 });
        if (window.Gen6Projects) window.Gen6Projects.syncAll({ quiet: true }).catch(() => {});
        if (after) after(result.article);
        return true;
      }
    });
  }

  /* ============================================================
     插件与主题
     ============================================================ */
  async function plugins() {
    flushDraftEditor();
    window.Lib.render('<div class="hub">' + window.Lib.pageHead(crumb('插件'), '插件与主题', '正在读取插件…', '') + hubLoading('正在读取插件…') + '</div>');
    try {
      if (window.ThemeEngine) {
        await window.ThemeEngine.refreshPlugins();
        if (!window.ThemeEngine.plugins.some((p) => p.type === 'theme')) {
          await window.ThemeEngine.boot();
        }
      }
      try {
        const settings = await api().settings();
        marketUrl = (settings && settings.plugins && settings.plugins.marketUrl) || marketUrl;
      } catch (e) { /* 忽略 */ }
      if (!marketUrl) marketUrl = (window.WB64 && window.WB64.remote && window.WB64.remote.marketUrl) || '';
      loadMarketCache();
    } catch (error) {
      window.Lib.render('<div class="hub">' + window.Lib.pageHead(crumb('插件'), '插件与主题', '', '') + hubError(errText(error), 'plugins') + '</div>');
      bindRetry('plugins', plugins);
      return;
    }
    renderPlugins();
  }

  async function loadMarketCache(force) {
    if (!marketUrl || marketLoading) return;
    marketLoading = true;
    marketError = '';
    if (pluginTab === 'market') renderPlugins();
    try {
      marketCache = await api().market(marketUrl, force);
      autoUpdatePlugins();
    } catch (error) {
      marketError = errText(error) || '读取失败';
    } finally {
      marketLoading = false;
      if (pluginTab === 'market') renderPlugins();
    }
  }

  async function autoUpdatePlugins() {
    if (autoUpdating || !marketCache) return;
    const list = marketUpdates();
    if (!list.length) return;
    autoUpdating = true;
    let done = 0;
    try {
      for (const item of list) {
        try {
          await api().installPlugin({ id: item.id, source: marketUrl });
          done += 1;
        } catch (e) { /* 单个失败不影响其它 */ }
      }
      if (!done) return;
      await window.ThemeEngine.refreshPlugins();
      U.toast('插件已自动更新 ' + done + ' 个', 'refresh');
      if (pluginTab === 'market') {
        await loadMarketAfterInstall();
        renderPlugins();
      }
    } finally {
      autoUpdating = false;
    }
  }

  async function loadMarketAfterInstall() {
    if (!marketUrl) return;
    try {
      marketCache = await api().market(marketUrl, true);
      marketError = '';
    } catch (error) {
      marketError = errText(error) || '';
    }
  }

  function versionParts(value) {
    return (String(value || '').match(/\d+/g) || []).map(Number);
  }

  function versionNewer(remote, local) {
    const a = versionParts(remote);
    const b = versionParts(local);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  function marketInstalled() {
    const map = new Map();
    (window.ThemeEngine ? window.ThemeEngine.plugins : []).forEach((p) => map.set(p.id, p));
    return map;
  }

  function marketUpdates() {
    if (!marketCache) return [];
    const installed = marketInstalled();
    return marketCache.plugins.filter((p) => {
      const cur = installed.get(p.id);
      return !!(cur && versionNewer(p.version, cur.version));
    });
  }

  function shortSource(url) {
    return String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  function pluginTypeLabel(type) {
    return { theme: '主题', font: '字体', writing: '写作模式', tool: '工具', ai: 'AI' }[type] || '插件';
  }

  function themePreviewStyle(skin) {
    const p = skin.defaults || {};
    const tint = safeColor(p.tint, '#EFEFEA');
    const ink = safeColor(p.ink, '#222');
    if (skin.id === 'paper-texture') {
      return 'background:' + tint + ';color:' + ink;
    }
    if (skin.id === 'glass-clear') {
      return 'background:linear-gradient(135deg,' + tint + ',rgba(168,196,255,.55) 48%,rgba(255,201,168,.5));color:' + ink;
    }
    if (skin.id === 'frosted-soft') {
      return 'background:linear-gradient(145deg,' + tint + ',rgba(221,228,238,.72));color:' + ink;
    }
    if (skin.id === 'liquid-glass') {
      return 'background:linear-gradient(135deg,rgba(141,183,255,.62),' + tint + ' 42%,rgba(155,231,210,.6) 78%,rgba(215,185,255,.6));color:' + ink;
    }
    return 'background:linear-gradient(135deg,' + tint + ',rgba(46,75,255,.28));color:' + ink;
  }

  function themeCard(skin, active) {
    const installed = skin.plugin;
    const enabled = skin.enabled !== false;
    return '<div class="theme-card' + (active ? ' active' : '') + '">' +
      '<div class="theme-preview" style="' + themePreviewStyle(skin) + '">' +
      '<span class="tp-a">Aa</span><span class="tp-l"></span><span class="tp-l short"></span>' +
      '</div>' +
      '<div class="theme-card-body">' +
      '<div class="theme-card-title">' + U.esc(skin.name) +
      (active ? '<span class="pill ok">使用中</span>' : '') +
      (installed ? '' : '<span class="pill">内置</span>') +
      (!enabled && installed ? '<span class="pill">已禁用</span>' : '') + '</div>' +
      '<div class="theme-card-desc">' + U.esc(skin.description || '没有说明') + '</div>' +
      '<div class="theme-card-meta">v' + U.esc(skin.version) + (skin.author ? ' · ' + U.esc(skin.author) : '') + '</div>' +
      '<div class="theme-card-actions">' +
      '<button class="btn sm ' + (active ? '' : 'primary') + '" data-theme-apply="' + U.esc(skin.id) + '">' + (active ? '使用中' : '使用') + '</button>' +
      (active ? '<button class="btn sm" data-theme-params="' + U.esc(skin.id) + '">调参</button>' : '') +
      '<button class="btn sm" data-theme-export="' + U.esc(skin.id) + '">下载</button>' +
      (installed ? '<button class="icon-btn sm" data-theme-toggle="' + U.esc(skin.id) + '" title="' + (enabled ? '禁用' : '启用') + '">' + U.icon(enabled ? 'eye' : 'eye') + '</button>' : '') +
      (installed ? '<button class="icon-btn sm danger" data-theme-del="' + U.esc(skin.id) + '" title="删除主题插件">' + U.icon('trash') + '</button>' : '') +
      '</div></div></div>';
  }

  function activeThemePanel() {
    const id = window.ThemeEngine ? window.ThemeEngine.active() : '';
    if (!id) {
      return '<div class="theme-active-empty">' + U.icon('palette') +
        '<div><b>当前使用 Sixth Gen 基础主题</b><p>选一个主题卡片即可实时切换；所有参数都能调，调坏了能恢复默认。</p></div></div>';
    }
    const skin = window.ThemeEngine.find(id);
    if (!skin) return '';
    const params = window.ThemeEngine.paramsOf(id);
    const fields = Object.keys(skin.params || {}).map((key) => {
      const meta = skin.params[key] || {};
      const value = params[key];
      const label = meta.label || key;
      if (meta.type === 'color') {
        return '<div class="theme-field"><label>' + U.esc(label) + '</label>' +
          '<input type="color" data-param="' + U.esc(key) + '" value="' + hexColor(value, '#F4EDDF') + '">' +
          '<span class="theme-val">' + U.esc(String(value || '')) + '</span></div>';
      }
      if (meta.type === 'range') {
        return '<div class="theme-field"><label>' + U.esc(label) + '</label>' +
          '<input type="range" data-param="' + U.esc(key) + '" min="' + Number(meta.min || 0) + '" max="' + Number(meta.max || 100) + '" step="' + Number(meta.step || 1) + '" value="' + Number(value || 0) + '">' +
          '<span class="theme-val">' + U.esc(String(value)) + U.esc(meta.unit || '') + '</span></div>';
      }
      return '<div class="theme-field"><label>' + U.esc(label) + '</label>' +
        '<input class="input sm" data-param="' + U.esc(key) + '" value="' + U.esc(value == null ? '' : value) + '">' +
        '<span class="theme-val"></span></div>';
    }).join('');
    return '<div class="theme-panel" id="themePanel">' +
      '<div class="theme-panel-head">' +
      '<div><b>' + U.icon('settings') + '调参 · ' + U.esc(skin.name) + '</b><p>每个参数实时生效，只保存在这台设备。深色模式下玻璃会自动改用深色底。</p></div>' +
      '<div class="theme-panel-actions">' +
      '<button class="btn sm" data-theme-reset="' + U.esc(id) + '">' + U.icon('refresh') + '恢复默认</button>' +
      '<button class="btn sm" data-theme-off>' + U.icon('x') + '关闭主题</button>' +
      '</div></div>' +
      '<div class="theme-params">' + (fields || '<p class="hint">这个主题没有可调参数。</p>') + '</div></div>';
  }

  function writingTab() {
    const dashboardCard = '<div class="fc-card on">' +
      '<span class="fc-ico">' + U.icon('chart') + '</span>' +
      '<div class="fc-main"><div class="fc-title">数据看台 <span class="pill">内置数据插件</span><span class="pill">v1.0.0</span><span class="pill ok">已启用</span></div>' +
      '<div class="fc-desc">逐日记录正文净增、速写、修订与 Git 提交。扇形图、每日柱状图、写作时段、分类 Top 和最近写作记录都在一个页面里，每 20 秒自动刷新。</div>' +
      '<div class="fc-meta">统计保存在本机浏览器（IndexedDB）· 不写入思源 · Git 提交记录待 P2 接通 GitHub 后显示</div></div>' +
      '<a class="btn sm dark" href="#/dashboard">' + U.icon('arrowRight') + '打开看台</a>' +
      '</div>';
    const fc = window.FocusCursor;
    const st = fc ? fc.state : { enabled: false, mode: 'line', lines: 1, dim: 22, blur: 2.2, duration: 220 };
    const scope = st.mode === 'para' ? '当前段落' : '当前行' + (st.lines > 1 ? '起 ' + st.lines + ' 行' : '');
    const card = '<div class="fc-card' + (st.enabled ? ' on' : '') + '">' +
      '<span class="fc-ico">' + U.icon('quill') + '</span>' +
      '<div class="fc-main"><div class="fc-title">写作光标 <span class="pill">内置写作插件</span><span class="pill">v1.1.0</span>' +
      (st.enabled ? '<span class="pill ok">已启用</span>' : '<span class="pill">未启用</span>') + '</div>' +
      '<div class="fc-desc">写作和编辑时，光标所在的一行保持清晰，上下内容用磨砂遮罩退到背景；也可以切回整段聚焦。遮罩只在屏幕上出现，正文不会被拆分或写入任何标记。</div>' +
      '<div class="fc-meta">聚焦范围：' + scope + ' · 参数只保存在这台设备 · 不会写入 md</div></div>' +
      '<button class="fc-switch' + (st.enabled ? ' on' : '') + '" data-fc-toggle>' + (st.enabled ? '已启用' : '启用') + '<i></i></button>' +
      '</div>';
    const modes = '<div class="fc-modes">' +
      '<button class="fc-mode-btn' + (st.mode === 'line' ? ' on' : '') + '" data-fc-mode="line">' + U.icon('list') + '按行</button>' +
      '<button class="fc-mode-btn' + (st.mode === 'para' ? ' on' : '') + '" data-fc-mode="para">' + U.icon('quote') + '整段</button>' +
      '</div>';
    const rows = [
      { key: 'lines', label: '聚焦行数', min: 1, max: 5, step: 1, value: st.lines, unit: ' 行', hint: '按行模式：1 是当前行，2 会连下一行一起保持清晰。', off: st.mode === 'para' },
      { key: 'dim', label: '其它段落透明度', min: 4, max: 80, step: 1, value: st.dim, unit: '%', hint: '整段模式下控制背景段落；按行模式由磨砂遮罩负责。' },
      { key: 'blur', label: '模糊程度', min: 0, max: 8, step: 0.2, value: st.blur, unit: 'px', hint: '0 表示只变淡、不模糊。' },
      { key: 'duration', label: '过渡时长', min: 60, max: 600, step: 10, value: st.duration, unit: 'ms', hint: '切换行或段落时淡入淡出的速度。' }
    ];
    const fields = rows.map((row) =>
      '<div class="fc-row' + (row.off ? ' off' : '') + '"><label>' + row.label + '<b data-fc-val="' + row.key + '">' + row.value + row.unit + '</b></label>' +
      '<input type="range" data-fc-param="' + row.key + '" min="' + row.min + '" max="' + row.max + '" step="' + row.step + '" value="' + row.value + '">' +
      '<div class="fc-hint">' + row.hint + '</div></div>').join('');
    return dashboardCard + card +
      '<div class="fc-workbench">' +
      '<div class="fc-panel"><h4>' + U.icon('settings') + '调试参数</h4>' +
      '<p>切换聚焦方式、拖动滑块，会立刻作用到右侧预览和真正的写作页面。</p>' +
      modes +
      fields +
      '<div class="fc-actions">' +
      '<button class="btn sm" data-fc-reset>' + U.icon('refresh') + '恢复默认</button>' +
      '<button class="btn sm dark" data-fc-try>' + U.icon('feather') + '去沉浸写作试用</button>' +
      '</div></div>' +
      '<div class="fc-preview-wrap"><div class="fc-preview-head"><b>' + (st.mode === 'para' ? '段落聚焦预览' : '行级聚焦预览') + '</b>' +
      '<span>' + (st.enabled ? '点一行，看上下退后' : '先启用，再点一行试试') + '</span></div>' +
      (fc ? fc.previewHtml() : '') +
      (st.enabled ? '' : '<div class="fc-off-note">' + U.icon('info') + '写作光标现在是关闭的。点右上角「启用」后，预览才有效果。</div>') +
      '</div></div>' +
      '<div class="theme-foot-note" style="margin-top:14px">' + U.icon('info') +
      '<p>这是 6.3 内置的写作插件，不依赖外部脚本。以后安装的 <code>writing</code> 类型插件也会出现在这个标签下。</p></div>';
  }

  function renderPlugins() {
    const tabs = [
      ['themes', '主题工作室', window.ThemeEngine ? window.ThemeEngine.list().length : 0],
      ['writing', '写作插件', 2],
      ['installed', '已安装', window.ThemeEngine ? window.ThemeEngine.plugins.length : 0],
      ['market', '插件市场', marketCache ? marketCache.plugins.length : 0]
    ];
    let body = '<div class="hub-tabs">' + tabs.map(([id, label, count]) =>
      '<button class="hub-tab' + (pluginTab === id ? ' active' : '') + '" data-plugin-tab="' + id + '">' + label + '<span>' + count + '</span></button>').join('') +
      '</div>';
    if (pluginTab === 'themes') body += themesTab();
    else if (pluginTab === 'writing') body += writingTab();
    else if (pluginTab === 'installed') body += installedTab();
    else body += marketTab();
    const actions = '<button class="btn sm" data-plugin-refresh>' + U.icon('refresh') + '刷新插件</button>' +
      '<label class="btn sm">' + U.icon('upload') + '安装文件<input type="file" id="pluginFile" accept=".json,application/json" hidden></label>';
    const html = '<div class="hub hub-plugins">' +
      window.Lib.pageHead(crumb('插件'), '插件与主题',
        '<span class="pill">' + (window.ThemeEngine ? window.ThemeEngine.plugins.length : 0) + ' 个插件</span><span class="pill">可删除 · 可下载 · 可调参</span>',
        actions) + body + '</div>';
    window.Lib.render(html);
    bindPlugins();
  }

  function themesTab() {
    const skins = window.ThemeEngine ? window.ThemeEngine.list() : [];
    const active = window.ThemeEngine ? window.ThemeEngine.active() : '';
    const cards = skins.map((s) => themeCard(s, s.id === active)).join('');
    return activeThemePanel() +
      '<div class="theme-section-head"><div><h3>主题插件</h3><p>' + skins.length + ' 个主题。内置主题会自动安装为插件，因此也能删除、下载；删掉后可在插件市场重新装回。</p></div></div>' +
      '<div class="theme-grid">' + cards + '</div>' +
      '<div class="theme-foot-note">' + U.icon('info') +
      '<p>主题本质上是 CSS 插件：清单里的 <code>cssText</code> 与 <code>params</code> 驱动外观。你在 Git 上迭代新版本后，在「插件市场」重新安装即可覆盖旧版。</p></div>';
  }

  function installedTab() {
    const list = window.ThemeEngine ? window.ThemeEngine.plugins : [];
    if (!list.length) return window.Lib.emptyBox('还没有安装插件', '安装一个主题文件，或去插件市场读取你的 Git 仓库清单。', 'sparkles');
    return '<div class="plugin-list">' + list.map((p) =>
      '<div class="plugin-row">' +
      '<span class="plugin-ico">' + U.icon(p.type === 'theme' ? 'palette' : p.type === 'font' ? 'type' : p.type === 'ai' ? 'sparkles' : 'cube') + '</span>' +
      '<div class="plugin-main"><div class="plugin-title">' + U.esc(p.name || p.id) +
      '<span class="pill">' + pluginTypeLabel(p.type) + '</span>' +
      (p.enabled === false ? '<span class="pill">已禁用</span>' : '') + '</div>' +
      '<div class="plugin-desc">' + U.esc(p.description || '没有说明') + '</div>' +
      '<div class="plugin-meta">v' + U.esc(p.version || '1.0.0') + (p.author ? ' · ' + U.esc(p.author) : '') + ' · ' + U.esc(p.source || '本机安装') + '</div></div>' +
      '<div class="plugin-actions">' +
      (p.type === 'theme' ? '<button class="btn sm" data-plugin-apply="' + U.esc(p.id) + '">使用</button>' : '') +
      '<button class="btn sm" data-plugin-toggle="' + U.esc(p.id) + '" data-on="' + (p.enabled !== false ? '1' : '0') + '">' + (p.enabled !== false ? '禁用' : '启用') + '</button>' +
      '<button class="icon-btn sm danger" data-plugin-delete="' + U.esc(p.id) + '" title="删除插件">' + U.icon('trash') + '</button>' +
      '</div></div>').join('') + '</div>' +
      '<div class="theme-foot-note">' + U.icon('lock') + '<p>插件脚本不会自动执行；主题只应用 CSS，写作类插件需在「写作插件」里显式启用。6.3 的写作光标是内置插件，不读取外部脚本。</p></div>';
  }

  function marketTab() {
    const updates = marketUpdates();
    const installed = marketInstalled();
    const fetched = marketCache && marketCache.fetchedAt;
    let body = '<div class="market-bar">' +
      '<input class="input" id="marketUrl" placeholder="插件清单地址（GitHub raw）" value="' + U.esc(marketUrl) + '">' +
      '<button class="btn primary" data-market-load>' + U.icon('refresh') + '读取市场</button>' +
      (updates.length ? '<button class="btn dark" data-market-update-all>全部更新 ' + updates.length + '</button>' : '') +
      '</div>' +
      '<div class="market-source">' +
      (marketUrl ? '来源 · ' + U.esc(shortSource(marketUrl)) : '还没有配置清单地址') +
      (fetched ? ' · ' + fmtDateTime(fetched) + ' 读取' : '') +
      (marketCache && marketCache.name ? ' · ' + U.esc(marketCache.name) : '') +
      '</div>';
    if (marketError) {
      body += '<div class="market-notice warn">' + U.icon('alert') + '<span>' + U.esc(marketError) + '。下面是上次成功读取的内容。</span></div>';
    } else if (marketCache && marketCache.stale) {
      body += '<div class="market-notice warn">' + U.icon('cloud') + '<span>现在连不上清单，显示的是上次缓存；恢复网络后点「读取市场」刷新。</span></div>';
    }
    if (marketLoading) {
      body += '<div class="market-empty">' + U.icon('refresh') + '<b>正在读取插件清单…</b><p>只下载清单；安装某个插件时才读取它的内容。</p></div>';
    } else if (!marketCache) {
      body += '<div class="market-empty">' + U.icon('cloud') + '<b>还没有读取市场</b><p>打开这个页面会自动读取一次；也可以填上你自己的 Git 清单地址，点「读取市场」。</p></div>';
    } else {
      body += '<div class="market-head"><b>' + U.esc(marketCache.name || '插件市场') + '</b><span>' + marketCache.plugins.length + ' 个插件' +
        (updates.length ? ' · ' + updates.length + ' 个可更新' : '') + '</span></div>';
      body += '<div class="market-grid">' + marketCache.plugins.map((p) => {
        const cur = installed.get(p.id);
        const newer = cur && versionNewer(p.version, cur.version);
        const mode = !cur ? 'install' : (newer ? 'update' : 'installed');
        return '<div class="market-card ' + mode + '">' +
          '<div class="plugin-title">' + U.esc(p.name) + '<span class="pill">' + pluginTypeLabel(p.type) + '</span>' +
          (p.hasScript ? '<span class="pill warn">含脚本·不执行</span>' : '') +
          (mode === 'installed' ? '<span class="pill ok">已安装</span>' : '') + '</div>' +
          '<div class="plugin-desc">' + U.esc(p.description || '') + '</div>' +
          '<div class="plugin-meta">v' + U.esc(p.version) + (p.author ? ' · ' + U.esc(p.author) : '') +
          (cur ? ' · 本机 v' + U.esc(cur.version || '1.0.0') : '') + '</div>' +
          '<div class="market-actions">' +
          (mode === 'installed'
            ? '<button class="btn sm" data-market-apply="' + U.esc(p.id) + '">使用</button>'
            : '<button class="btn sm primary" data-market-install="' + U.esc(p.id) + '"' + (p.hasInline || p.manifestUrl ? '' : ' disabled') + '>' + (mode === 'update' ? '更新' : '安装') + '</button>') +
          '</div></div>';
      }).join('') + '</div>';
    }
    body += '<details class="plugin-doc"><summary>插件清单写法（你以后开发插件用）</summary><pre>' +
      U.esc(JSON.stringify({
        name: '我的插件市场',
        updatedAt: '2026-10-31',
        plugins: [{
          id: 'paper-texture',
          name: '纸质纹理',
          version: '1.2.0',
          type: 'theme',
          author: '写作库',
          description: '低饱和纸面与细颗粒',
          params: { tint: { label: '纸色', type: 'color', def: '#F4EDDF' }, grain: { label: '颗粒', type: 'range', min: 0, max: 60, def: 38 } },
          defaults: { tint: '#F4EDDF', grain: 38 },
          cssText: 'html[data-skin="paper-texture"]{--bg:var(--skin-tint);}'
        }]
      }, null, 2)) + '</pre>' +
      '<p class="market-hint">整份清单放在 Git 上即可；插件内容也可以拆成单独文件，用 <code>manifestUrl</code> 指向它。版本号变大时，市场会显示「更新」。</p></details>';
    return body;
  }

  function bindPlugins() {
    onAll('[data-plugin-tab]', (b) => {
      b.onclick = () => {
        pluginTab = b.getAttribute('data-plugin-tab');
        renderPlugins();
        if (pluginTab === 'market') loadMarketCache();
      };
    });
    onAll('[data-fc-toggle]', (b) => {
      b.onclick = () => {
        if (!window.FocusCursor) return;
        const next = !window.FocusCursor.state.enabled;
        window.FocusCursor.toggle(next);
        const scope = window.FocusCursor.state.mode === 'para' ? '当前段落' : '当前行';
        U.toast(next ? '写作光标已启用：' + scope + '保持清晰' : '已关闭写作光标', next ? 'eye' : 'x');
        renderPlugins();
      };
    });
    onAll('[data-fc-mode]', (b) => {
      b.onclick = () => {
        if (!window.FocusCursor) return;
        const mode = b.getAttribute('data-fc-mode');
        window.FocusCursor.set({ mode });
        U.toast(mode === 'para' ? '已切换到整段聚焦' : '已切换到按行聚焦', 'eye');
        renderPlugins();
      };
    });
    onAll('[data-fc-param]', (input) => {
      input.oninput = () => {
        if (!window.FocusCursor) return;
        const key = input.getAttribute('data-fc-param');
        const value = Number(input.value);
        window.FocusCursor.set({ [key]: value });
        const unit = key === 'dim' ? '%' : key === 'blur' ? 'px' : key === 'lines' ? ' 行' : 'ms';
        const label = $('[data-fc-val="' + key + '"]');
        if (label) label.textContent = String(value) + unit;
      };
    });
    on('[data-fc-reset]', (b) => {
      b.onclick = () => {
        if (!window.FocusCursor) return;
        window.FocusCursor.reset();
        U.toast('写作光标已恢复默认参数', 'refresh');
        renderPlugins();
      };
    });
    on('[data-fc-try]', (b) => {
      b.onclick = () => {
        if (window.FocusCursor && !window.FocusCursor.state.enabled) window.FocusCursor.toggle(true);
        window.Lib.nav('/write');
      };
    });
    on('[data-plugin-refresh]', (b) => {
      b.onclick = async () => {
        busy(b, true, '刷新中…');
        try {
          await window.ThemeEngine.refreshPlugins();
          U.toast('插件列表已刷新', 'refresh');
          renderPlugins();
        } catch (error) {
          busy(b, false);
          U.toast(errText(error), 'alert');
        }
      };
    });
    on('#pluginFile', (input) => {
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const manifest = JSON.parse(text);
          const record = await api().installPlugin({ manifest });
          await window.ThemeEngine.refreshPlugins();
          U.toast('已安装插件：' + (record.name || record.id), 'check');
          renderPlugins();
        } catch (error) {
          U.toast(errText(error) || '插件文件不合法', 'alert');
        }
      };
    });
    onAll('[data-theme-apply]', (b) => {
      b.onclick = () => {
        const id = b.getAttribute('data-theme-apply');
        if (!window.ThemeEngine.apply(id)) U.toast('这个主题已不可用', 'alert');
        else { U.toast('已切换主题', 'palette'); renderPlugins(); }
      };
    });
    onAll('[data-theme-params]', (b) => {
      b.onclick = () => {
        const panel = $('#themePanel');
        if (panel) { panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); panel.classList.add('flash'); setTimeout(() => panel.classList.remove('flash'), 900); }
      };
    });
    on('[data-theme-reset]', (b) => {
      b.onclick = () => {
        window.ThemeEngine.reset(window.ThemeEngine.active());
        U.toast('已恢复默认参数', 'refresh');
        renderPlugins();
      };
    });
    on('[data-theme-off]', (b) => {
      b.onclick = () => {
        window.ThemeEngine.clear();
        U.toast('已关闭主题，回到基础外观', 'sun');
        renderPlugins();
      };
    });
    onAll('[data-theme-export]', (b) => {
      b.onclick = () => window.ThemeEngine.exportSkin(b.getAttribute('data-theme-export'));
    });
    onAll('[data-theme-del]', (b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-theme-del');
        const skin = window.ThemeEngine.find(id);
        const ok = await U.confirmModal({ title: '删除主题「' + (skin ? skin.name : id) + '」？', desc: '主题文件会移到 07-备份/插件 里，可以重新安装或从市场下载。', okText: '删除', danger: true });
        if (!ok) return;
        try {
          await window.ThemeEngine.removeSkin(id);
          U.toast('主题已删除', 'trash');
          renderPlugins();
        } catch (error) { U.toast(errText(error), 'alert'); }
      };
    });
    onAll('[data-theme-toggle]', (b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-theme-toggle');
        const skin = window.ThemeEngine.find(id);
        try {
          await window.ThemeEngine.toggleSkin(id, skin && skin.enabled === false);
          renderPlugins();
        } catch (error) { U.toast(errText(error), 'alert'); }
      };
    });
    onAll('[data-param]', (input) => {
      input.oninput = () => {
        const id = window.ThemeEngine.active();
        const key = input.getAttribute('data-param');
        let value = input.value;
        const skin = window.ThemeEngine.find(id);
        const meta = (skin && skin.params[key]) || {};
        if (meta.type === 'range') value = Number(value);
        window.ThemeEngine.setParam(id, key, value);
        const valEl = input.parentElement.querySelector('.theme-val');
        if (valEl) valEl.textContent = String(value) + (meta.unit || '');
      };
    });
    onAll('[data-plugin-apply]', (b) => {
      b.onclick = () => { window.ThemeEngine.apply(b.getAttribute('data-plugin-apply')); U.toast('已切换主题', 'palette'); renderPlugins(); };
    });
    onAll('[data-plugin-toggle]', (b) => {
      b.onclick = async () => {
        const on = b.getAttribute('data-on') === '1';
        try {
          await api().togglePlugin(b.getAttribute('data-plugin-toggle'), !on);
          await window.ThemeEngine.refreshPlugins();
          renderPlugins();
        } catch (error) { U.toast(errText(error), 'alert'); }
      };
    });
    onAll('[data-plugin-delete]', (b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-plugin-delete');
        const ok = await U.confirmModal({ title: '删除插件「' + id + '」？', desc: '插件目录会移到 07-备份/插件，可重新安装。', okText: '删除', danger: true });
        if (!ok) return;
        try {
          await api().deletePlugin(id);
          if (window.ThemeEngine.active() === id) window.ThemeEngine.clear();
          await window.ThemeEngine.refreshPlugins();
          U.toast('插件已删除', 'trash');
          renderPlugins();
        } catch (error) { U.toast(errText(error), 'alert'); }
      };
    });
    on('[data-market-load]', async (b) => {
      b.onclick = async () => {
        const input = $('#marketUrl');
        const url = (input && input.value.trim()) || '';
        if (!url) { U.toast('先填插件清单地址', 'info'); return; }
        busy(b, true, '读取中…');
        marketError = '';
        try {
          const result = await api().market(url, true);
          marketCache = result;
          marketUrl = url;
          try {
            const current = settingsCache || await api().settings();
            settingsCache = await api().saveSettings({ plugins: Object.assign({}, current.plugins || {}, { marketUrl: url }) });
          } catch (e) { /* 忽略保存失败 */ }
          busy(b, false);
          renderPlugins();
          autoUpdatePlugins();
          if (result.stale) U.toast('现在连不上清单，显示的是上次缓存', 'cloud');
          else U.toast('已读取 ' + result.plugins.length + ' 个插件', 'check');
        } catch (error) {
          busy(b, false);
          U.toast(errText(error), 'alert');
        }
      };
    });
    onAll('[data-market-install]', (b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-market-install');
        if (!id) return;
        busy(b, true, '安装中…');
        try {
          const record = await api().installPlugin({ id, source: marketUrl });
          await window.ThemeEngine.refreshPlugins();
          U.toast('已安装：' + (record.name || record.id), 'check');
          await loadMarketAfterInstall();
          renderPlugins();
        } catch (error) { busy(b, false); U.toast(errText(error), 'alert'); }
      };
    });
    onAll('[data-market-apply]', (b) => {
      b.onclick = () => {
        const id = b.getAttribute('data-market-apply');
        if (window.ThemeEngine.apply(id)) { U.toast('已切换主题', 'palette'); renderPlugins(); }
        else U.toast('这个插件不能直接作为主题使用', 'info');
      };
    });
    on('[data-market-update-all]', (b) => {
      b.onclick = async () => {
        const list = marketUpdates();
        if (!list.length) { U.toast('没有可更新的插件', 'check'); return; }
        busy(b, true, '更新 ' + list.length + ' 个…');
        let done = 0;
        for (const item of list) {
          try {
            await api().installPlugin({ id: item.id, source: marketUrl });
            done += 1;
          } catch (e) { /* 单个失败不影响其它 */ }
        }
        await window.ThemeEngine.refreshPlugins();
        busy(b, false);
        U.toast('已更新 ' + done + ' 个插件', 'check');
        await loadMarketAfterInstall();
        renderPlugins();
      };
    });
  }

  /* ============================================================
     设置中心
     ============================================================ */
  async function settings() {
    flushDraftEditor();
    window.Lib.render('<div class="hub">' + window.Lib.pageHead(crumb('设置'), '设置', '正在读取设置…', '') + hubLoading('正在读取设置…') + '</div>');
    try {
      settingsCache = await api().settings();
    } catch (error) {
      settingsCache = null;
    }
    renderSettings();
  }

  function settingsTabs() {
    const tabs = [['overview', '概览'], ['git', 'GitHub 同步'], ['obsidian', 'Obsidian 桥'], ['export', '导出与转换'], ['ai', 'AI 接入'], ['about', '关于 6.4']];
    return '<div class="hub-tabs">' + tabs.map(([id, label]) =>
      '<button class="hub-tab' + (settingsTab === id ? ' active' : '') + '" data-settings-tab="' + id + '">' + label + '</button>').join('') + '</div>';
  }

  function renderSettings() {
    const s = settingsCache && settingsCache.obsidian ? settingsCache.obsidian : {};
    const gh = {
      dir: s.vault || '', type: s.type || '资料', group: s.group || '', preserveFolders: s.preserveFolders !== false
    };
    const info = window.WorkspaceSync ? window.WorkspaceSync.info() : null;
    const projects = S.projects.filter((p) => p.libKey).length;
    const draftsCount = draftCache.length;
    const totalDocs = D.ready ? D.files.length : (window.LIB ? window.LIB.stats.files : 0);
    let body = '';
    if (settingsTab === 'overview') {
      body = '<div class="set-cards">' +
        '<div class="set-card span2"><div class="sc-head"><div><h3>写作库 6.4 · 同步版</h3><p>离线可编辑 · 编辑保存在浏览器，刷新不丢</p></div><span class="version-badge">' + U.esc((window.WB64 && window.WB64.BUILD) || '6.4.1') + '</span></div>' +
        '<div class="sc-stats"><div><b>' + U.fmt(totalDocs) + '</b><span>篇 md</span></div><div><b>' + (D.ready ? U.fmt(D.stats.words) : '—') + '</b><span>合计字数</span></div>' +
        '<div><b>' + (D.ready ? D.databases.length : '—') + '</b><span>数据库</span></div><div><b>' + projects + '</b><span>写作台作品</span></div><div><b>' + draftsCount + '</b><span>草稿</span></div></div>' +
        '<div class="sc-actions"><button class="btn primary sm" data-set-act="writer">' + U.icon('feather') + '打开写作台</button>' +
        '<button class="btn sm" data-set-act="drafts">' + U.icon('note') + '草稿箱</button>' +
        '<button class="btn sm" data-set-act="theme">' + U.icon('palette') + '主题工作室</button>' +
        '<button class="btn sm" data-set-act="databases">' + U.icon('database') + '数据库管理</button></div></div>' +
        '<div class="set-card"><h3>' + U.icon('folder') + '本机工程数据</h3>' +
        '<div class="kv"><span>状态</span><b class="sync-' + (info ? info.status : 'offline') + '">' + syncLabel(info) + '</b></div>' +
        '<div class="kv"><span>设备</span><b>' + U.esc(info && info.device ? info.device : '未登记') + '</b></div>' +
        '<div class="kv"><span>最近保存</span><b>' + U.esc(info && info.lastSavedAt ? fmtDateTime(info.lastSavedAt) : '—') + '</b></div>' +
        '<div class="kv"><span>数据库</span><b>' + (D.ready ? D.databases.map((db) => db.short + ' ' + U.fmt(db.stats.files) + ' 篇').join(' · ') : '—') + '</b></div>' +
        '<div class="kv"><span>保存位置</span><b>本机浏览器 · IndexedDB</b></div>' +
        '<div class="sc-actions"><button class="btn sm" data-set-act="sync">' + U.icon('refresh') + '立即保存工程</button>' +
        '<button class="btn sm" data-set-act="reload">' + U.icon('download') + '重新载入工程</button></div></div>' +
        '<div class="set-card"><h3>' + U.icon('history') + '6.4 P2 更新</h3><ul class="ver-list">' +
        '<li>应用内 GitHub 同步：连接私有仓库后，可手动提交与拉取文章、草稿、修订、写作台工程和数据库开关</li>' +
        '<li>同步只上传相对种子的改动，不上传 1,448 篇种子全文，也不上传 Token</li>' +
        '<li>两边都改过时会停下来，由你逐条选择「保留本机 / 采用云端 / 两边都留」</li>' +
        '<li>后台每 60 秒检查云端；可选用「本机无改动时自动拉取」</li>' +
        '<li>阅读页编辑、沉浸写作新建、改名、草稿收入文库都会保存到浏览器 IndexedDB，刷新不丢</li>' +
        '<li>修订历史与版本恢复已接通，每篇保留最近 160 个版本；恢复前自动留档</li>' +
        '<li>双库停用/启用即时生效，停用只影响合并视图，不删除任何文章</li>' +
        '<li>数据看台改由本机浏览器统计：今日净增、编辑、时段、最近记录与修订都会随保存即时更新</li>' +
        '<li>6.3.1 的导图全选修复、思源重复正文只读索引、按行光标与数据看台全部保留</li></ul>' +
        '<div class="sc-actions"><button class="btn sm" data-set-act="about">看完整版本说明</button></div></div>' +
        '</div>';
    } else if (settingsTab === 'git') {
      body = '<div class="set-card" id="gitPanel"><h3>' + U.icon('cloud') + 'GitHub 同步</h3>' +
        '<p class="set-sub">只同步你改过的文章、草稿、修订、写作台工程与数据库开关；1,448 篇种子全文不会上传。推荐用私有仓库，公开仓库会暴露改动正文。</p>' +
        '<div id="gitBody">' + hubLoading('正在读取 GitHub 配置…') + '</div></div>' +
        '<div class="set-card"><h3>' + U.icon('lock') + '凭据与安全</h3><ul class="ver-list">' +
        '<li>Token 只保存在这台设备的浏览器 IndexedDB；勾选「记住」才落盘，不勾只留在内存</li>' +
        '<li>Token 不会进入同步文件、导出、设置或日志；界面只显示是否已保存</li>' +
        '<li>建议新建 fine-grained Token，只授权目标仓库的 Contents 读写</li>' +
        '<li>冲突不会自动合并：每一条都由你选择「保留本机 / 采用云端 / 两边都留」</li>' +
        '<li>提交与拉取只动同步目录，不会修改仓库里的其它文件</li></ul></div>';
    } else if (settingsTab === 'obsidian') {
      body = '<div class="set-card"><h3>' + U.icon('cube') + 'Obsidian 库桥接</h3>' +
        '<p class="set-sub">读取某个目录里的 md（含 YAML frontmatter），导入本软件数据库；也可以把文库文章导出成 md 放进 Obsidian 库。只读写你填的目录。</p>' +
        '<div class="field"><label>Obsidian 库绝对路径</label><input class="input" id="obDir" value="' + U.esc(gh.dir) + '" placeholder="例如 D:\\我的Obsidian库"></div>' +
        '<div class="row"><div class="field grow"><label>导入类型</label><select class="input" id="obType">' +
        ['资料', '素材', '小说', '毕设'].map((t) => '<option' + (gh.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
        '<div class="field grow"><label>固定分类（留空则保留文件夹）</label><input class="input" id="obGroup" value="' + U.esc(gh.group) + '" placeholder="例如 Obsidian"></div></div>' +
        '<label class="check-line"><input type="checkbox" id="obPreserve"' + (gh.preserveFolders ? ' checked' : '') + '> 按 Obsidian 文件夹自动分到子类</label>' +
        '<div class="sc-actions"><button class="btn primary sm" data-ob="scan">' + U.icon('search') + '扫描库</button>' +
        '<button class="btn sm" data-ob="import">' + U.icon('download') + '导入选中</button>' +
        '<button class="btn sm" data-ob="export">' + U.icon('upload') + '导出全部文章</button>' +
        '<button class="btn ghost sm" data-ob="save">保存路径</button></div>' +
        '<div id="obResult" class="ob-result">' + (scanCache ? scanHtml() : '<div class="hint">先填路径，点「扫描库」看看有哪些 md。</div>') + '</div></div>';
    } else if (settingsTab === 'export') {
      body = '<div class="set-card"><h3>' + U.icon('download') + '导出与格式转换</h3>' +
        '<p class="set-sub">打包成 ZIP，内部按「分类/子类/编号 标题」排列，并附目录.md 与目录.json。可同时输出 Markdown、纯文本与 HTML。</p>' +
        '<div class="row"><div class="field grow"><label>范围</label><select class="input" id="exScope"><option value="all">全部文库</option><option value="cat">某个分类</option><option value="sub">某个子类</option></select></div>' +
        '<div class="field grow" id="exCatWrap" hidden><label>分类</label><select class="input" id="exCat">' + categoryOptions() + '</select></div>' +
        '<div class="field grow" id="exSubWrap" hidden><label>子类</label><select class="input" id="exSub"></select></div></div>' +
        '<label class="check-line"><input type="checkbox" id="exMd" checked> Markdown（.md，正本）</label>' +
        '<label class="check-line"><input type="checkbox" id="exTxt"> 纯文本（.txt）</label>' +
        '<label class="check-line"><input type="checkbox" id="exHtml" checked> HTML（.html，带排版）</label>' +
        '<div class="sc-actions"><button class="btn primary" data-set-act="export-zip">' + U.icon('download') + '导出 ZIP</button>' +
        '<span class="hint" id="exHint">已选全部文库</span></div></div>' +
        '<div class="set-card"><h3>' + U.icon('upload') + 'Obsidian 导出</h3><p class="set-sub">把文章复制进 Obsidian 库的「写作库导出/时间戳」文件夹，不覆盖你原有的笔记。</p>' +
        '<button class="btn sm" data-set-act="obsidian-tab">去 Obsidian 桥设置</button></div>';
    } else if (settingsTab === 'ai') {
      const ai = (settingsCache && settingsCache.ai) || {};
      body = '<div class="set-card"><h3>' + U.icon('sparkles') + 'AI 接入（6.4 预留）</h3>' +
        '<p class="set-sub">这里只保存接口地址与模型名，密钥不会进数据库、不会进备份、也不会上传 Git。以后接本地 AI 插件时，由插件自己读取系统环境变量。</p>' +
        '<div class="field"><label>接口地址</label><input class="input" id="aiBase" value="' + U.esc(ai.base || '') + '" placeholder="例如 http://127.0.0.1:11434/v1"></div>' +
        '<div class="field"><label>模型名</label><input class="input" id="aiModel" value="' + U.esc(ai.model || '') + '" placeholder="例如 qwen2.5:14b"></div>' +
        '<label class="check-line"><input type="checkbox" id="aiEnabled"' + (ai.enabled ? ' checked' : '') + '> 允许已安装的 AI 插件读取这些设置</label>' +
        '<div class="sc-actions"><button class="btn primary" data-set-act="ai-save">保存</button><span class="hint">6.4 不内置对话，也不会自动发送正文。</span></div></div>' +
        '<div class="set-card"><h3>' + U.icon('lock') + '安全边界</h3><ul class="ver-list"><li>密钥永远不写进 工程.json / 草稿.json / 设置.json</li>' +
        '<li>AI 插件必须由你手动安装并启用</li><li>正文只在你的本机服务与网络内流转</li></ul></div>';
    } else {
      body = '<div class="set-card"><div class="sc-head"><div><h3>写作库 · 6.4 同步版</h3><p>' + U.esc((window.WB64 && window.WB64.BUILD) || '6.4.1') + ' · 2026-10-31</p></div><span class="version-badge">Web</span></div>' +
        '<p class="set-sub">离线优先：1,448 篇文稿与写作台工程都装进浏览器，编辑即时保存；连接 GitHub 后可把改动同步到私有仓库。</p>' +
        '<ul class="ver-list">' +
        '<li>6.4 P2：应用内 GitHub 同步面板，连接、检查、拉取、提交、冲突选择与同步历史都在设置里</li>' +
        '<li>6.4 P2：只同步相对初始文库的改动；Token 存在本机 IndexedDB，不写进同步文件与设置</li>' +
        '<li>6.4 P1：阅读页编辑、沉浸写作新建、改名、草稿收入文库都会保存到浏览器 IndexedDB，刷新不丢</li>' +
        '<li>6.4 P1：修订历史与版本恢复、双库停用/启用已接通；每篇保留最近 160 个版本</li>' +
        '<li>6.4：数据看台接入本机统计，保存后立即更新今日净增、时段与最近记录，刷新不丢</li>' +
        '<li>6.4 P0：把 6.3.1 的界面与 1,448 篇文库装进纯静态站点，不需要启动 Node 服务</li>' +
        '<li>6.4 P0：文库、阅读、搜索、跨库检索、写作台大纲与草稿箱都已离线可用</li>' +
        '<li>6.3.1 修复导图全选与整支隐藏：全选 → 隐藏会把节点和连线一起收起，可一键显示全部</li>' +
        '<li>6.3.1 新增思源重复正文只读索引：163 组、385 篇，222 份副本只标记不删除</li>' +
        '<li>新增导图牵线控制：默认隐藏，点节点才显示，可多选、固定、聚合回默认位置并恢复</li>' +
        '<li>新增平面网格布局，长线不再强行绕远；连线控制点按间距自适应</li>' +
        '<li>写作光标改为按行聚焦，1–5 行可调，也可切回整段；光标离屏时自动隐藏遮罩</li>' +
        '<li>新增数据看台：每日写作字数、修订次数、云端提交、分类/标签分布（含环形图），20 秒刷新</li>' +
        '<li>OB 最新 39 篇入库，原稿库增至 397 篇，并同步进写作台导图</li>' +
        '<li>沿用 6.2：双库注册与筛选、首页合并统计、跨库检索与移动/复制、数据库管理</li>' +
        '<li>沿用 6.1：共用大纲、草稿箱、修订历史、主题引擎、插件市场、Obsidian 桥</li></ul>' +
        '<div class="sc-actions"><button class="btn sm" data-set-act="about-doc">看交接文档说明</button></div></div>' +
        '<div class="set-card"><h3>' + U.icon('user') + '登录</h3><p class="set-sub">6.4 不提供写作库账号。GitHub 连接凭据只用于同步仓库的提交与拉取，不写进文章或设置文件，也不会离开这台设备。</p></div>';
    }
    const html = '<div class="hub hub-settings">' +
      window.Lib.pageHead(crumb('设置'), '设置',
        '<span class="pill">v' + U.esc((window.WB64 && window.WB64.BUILD) || '6.4.1') + '</span><span class="pill">离线可编辑</span><span class="pill">' + (info ? syncLabel(info) : '离线') + '</span>', '') +
      settingsTabs() + '<div class="settings-body">' + body + '</div></div>';
    window.Lib.render(html);
    bindSettings();
  }

  function syncLabel(info) {
    if (!info) return '未连接';
    if (info.status === 'saved' || info.status === 'synced') return '已保存到本机';
    if (info.status === 'saving') return '正在保存';
    if (info.status === 'dirty') return '有改动待保存';
    if (info.status === 'error') return '保存失败';
    if (info.status === 'offline') return '本机保存不可用';
    return '读取中';
  }

  function categoryOptions() {
    D.init();
    return D.cats.map((c) => '<option value="' + U.esc(c.id) + '">' + U.esc(c.name) + '</option>').join('');
  }

  function fillSubOptions() {
    const catEl = $('#exCat'), subEl = $('#exSub');
    if (!catEl || !subEl) return;
    const cat = D.cat(catEl.value);
    subEl.innerHTML = cat ? cat.subs.map((s) => '<option value="' + U.esc(s.id) + '">' + U.esc(s.name) + '</option>').join('') : '';
  }

  function bindSettings() {
    onAll('[data-settings-tab]', (b) => {
      b.onclick = () => { settingsTab = b.getAttribute('data-settings-tab'); renderSettings(); };
    });
    onAll('[data-set-act]', (b) => {
      b.onclick = () => {
        const act = b.getAttribute('data-set-act');
        if (act === 'writer') { window.App.openWriter(); return; }
        if (act === 'drafts') { window.Lib.nav('/drafts'); return; }
        if (act === 'theme') { window.Lib.nav('/plugins'); return; }
        if (act === 'databases') { window.Lib.nav('/databases'); return; }
        if (act === 'about') { settingsTab = 'about'; renderSettings(); return; }
        if (act === 'obsidian-tab') { settingsTab = 'obsidian'; renderSettings(); return; }
        if (act === 'about-doc') {
          U.openModal('<div class="modal-head"><div><h3>交接文档在哪里</h3><p>工作区根目录</p></div></div><div class="modal-body">' +
            '<p><code>00-交接/十分钟接手.md</code> 是最短的接手路径；<code>00-交接/项目状态.md</code> 记录当前状态；' +
            '<code>06-日志/迭代史.md</code> 记录每一代的变化。</p><p style="margin-top:10px">6.3 的双数据库说明写在 <code>06-日志/2026-10/</code> 与 <code>05-元数据/数据库/</code> 里。</p></div>' +
            '<div class="modal-foot"><div class="foot-actions"><button class="btn primary" data-close>知道了</button></div></div>').box.querySelector('[data-close]').onclick = function () { $('#modalOverlay').hidden = true; };
          return;
        }
        if (act === 'sync') {
          if (!window.WorkspaceSync) return;
          window.WorkspaceSync.schedule(0);
          U.toast('正在把工程改动保存到本机浏览器…', 'cloud');
          setTimeout(() => renderSettings(), 900);
          return;
        }
        if (act === 'reload') {
          U.confirmModal({ title: '重新载入本机工程？', desc: '会用本机浏览器里已保存的工程数据覆盖当前尚未保存的工程改动。正文文章不受影响。', okText: '重新载入' }).then((ok) => {
            if (!ok || !window.WorkspaceSync) return;
            api().workspace().then((remote) => {
              if (Array.isArray(remote.projects)) {
                S.projects = remote.projects.map((p) => S.migrate(p));
                S.flush();
              }
              if (remote.curation) C.importAll(remote.curation, 'replace');
              U.toast('已从共用数据库重载', 'download');
              renderSettings();
            }).catch((e) => U.toast(errText(e), 'alert'));
          });
          return;
        }
        if (act === 'export-zip') { exportZipNow(b); return; }
        if (act === 'ai-save') {
          const ai = {
            base: ($('#aiBase') && $('#aiBase').value.trim()) || '',
            model: ($('#aiModel') && $('#aiModel').value.trim()) || '',
            enabled: !!($('#aiEnabled') && $('#aiEnabled').checked)
          };
          api().saveSettings({ ai }).then((next) => { settingsCache = next; U.toast('AI 设置已保存', 'save'); }).catch((e) => U.toast(errText(e), 'alert'));
        }
      };
    });
    if (settingsTab === 'git') loadGitBody();
    if (settingsTab === 'obsidian') {
      on('#obType', (el) => { el.onchange = () => { if (scanCache) { scanCache = null; const box = $('#obResult'); if (box) box.innerHTML = '<div class="hint">类型已改变，请重新扫描。</div>'; } }; });
      onAll('[data-ob]', (b) => { b.onclick = () => obsidianAction(b.getAttribute('data-ob'), b); });
      if (scanCache) bindScanList();
      on('#obDir', (el) => { el.onchange = () => { scanCache = null; const box = $('#obResult'); if (box) box.innerHTML = '<div class="hint">路径已改变，请重新扫描。</div>'; }; });
    }
    if (settingsTab === 'export') {
      on('#exScope', (el) => {
        el.onchange = () => {
          const scope = el.value;
          const catWrap = $('#exCatWrap'), subWrap = $('#exSubWrap');
          if (catWrap) catWrap.hidden = scope === 'all';
          if (subWrap) subWrap.hidden = scope !== 'sub';
          if (scope !== 'all') fillSubOptions();
          const hint = $('#exHint');
          if (hint) hint.textContent = scope === 'all' ? '已选全部文库' : '';
        };
      });
      on('#exCat', (el) => { el.onchange = () => fillSubOptions(); });
      fillSubOptions();
    }
  }

  function obsidianPayload() {
    return {
      dir: ($('#obDir') && $('#obDir').value.trim()) || '',
      type: ($('#obType') && $('#obType').value) || '资料',
      group: ($('#obGroup') && $('#obGroup').value.trim()) || '',
      preserveFolders: !!($('#obPreserve') && $('#obPreserve').checked)
    };
  }

  function scanHtml() {
    if (!scanCache) return '';
    const files = scanCache.files || [];
    const rows = files.slice(0, 400).map((f, i) =>
      '<label class="scan-row"><input type="checkbox" data-scan="' + i + '"' + (f.state === 'new' ? ' checked' : '') + '>' +
      '<span class="scan-main"><b>' + U.esc(f.title || f.name) + '</b><span>' + U.esc(f.folder || '根目录') + ' · ' + U.fmt(f.size) + ' B</span></span>' +
      '<span class="pill ' + (f.state === 'imported' ? 'ok' : '') + '">' + (f.state === 'imported' ? '已导入' : '新文件') + '</span>' +
      '<span class="scan-rel">' + U.esc(f.rel) + '</span></label>').join('');
    return '<div class="scan-head"><b>' + U.esc(scanCache.vault) + '</b><span>共 ' + scanCache.stats.total + ' 篇 · 新 ' + scanCache.stats.fresh + ' · 已导入 ' + scanCache.stats.imported + '</span></div>' +
      (files.length > 400 ? '<div class="hint">只显示前 400 篇，导入时会按勾选处理。</div>' : '') +
      '<div class="scan-list">' + rows + '</div>' +
      '<div class="scan-actions"><label class="check-line"><input type="checkbox" id="scanAll"> 全选 / 全不选</label><button class="btn sm" data-ob="import">导入选中</button></div>';
  }

  function bindScanList() {
    const all = $('#scanAll');
    if (all) {
      all.onchange = () => {
        $$('[data-scan]').forEach((c) => { c.checked = all.checked; });
      };
    }
  }

  async function obsidianAction(act, btn) {
    const payload = obsidianPayload();
    if (!payload.dir) { U.toast('先填 Obsidian 库路径', 'info'); return; }
    if (act === 'save') {
      try {
        settingsCache = await api().saveSettings({ obsidian: Object.assign({}, (settingsCache && settingsCache.obsidian) || {}, payload, { lastScanAt: new Date().toISOString() }) });
        U.toast('Obsidian 路径已保存', 'save');
      } catch (e) { U.toast(errText(e), 'alert'); }
      return;
    }
    if (act === 'scan') {
      busy(btn, true, '扫描中…');
      try {
        scanCache = await api().obsidianScan({ dir: payload.dir });
        busy(btn, false);
        const box = $('#obResult');
        if (box) box.innerHTML = scanHtml();
        bindScanList();
        U.toast('扫描完成：' + scanCache.stats.total + ' 篇', 'search');
      } catch (e) { busy(btn, false); U.toast(errText(e), 'alert'); }
      return;
    }
    if (act === 'import') {
      const checked = $$('[data-scan]').filter((c) => c.checked).map((c) => scanCache.files[+c.getAttribute('data-scan')].rel);
      if (!checked.length) { U.toast('先勾选要导入的文件', 'info'); return; }
      busy(btn, true, '导入中…');
      try {
        const result = await api().obsidianImport({ dir: payload.dir, type: payload.type, group: payload.group, preserveFolders: payload.preserveFolders, update: true, files: checked });
        busy(btn, false);
        U.toast('导入完成：新建 ' + result.created + ' · 更新 ' + result.updated + ' · 跳过 ' + result.skipped + ' · 失败 ' + result.failed, 'check');
        scanCache = await api().obsidianScan({ dir: payload.dir });
        const box = $('#obResult');
        if (box) box.innerHTML = scanHtml();
        bindScanList();
        if (window.Gen6Bridge) window.Gen6Bridge.refreshLibrary({ silent: true, delay: 120 });
      } catch (e) { busy(btn, false); U.toast(errText(e), 'alert'); }
      return;
    }
    if (act === 'export') {
      const ok = await U.confirmModal({ title: '把全部文章导出到 Obsidian 库？', desc: '会在库里新建「写作库导出/时间戳」文件夹，不覆盖你原来的笔记。文章多时可能需要一会儿。', okText: '开始导出' });
      if (!ok) return;
      busy(btn, true, '导出中…');
      try {
        const result = await api().obsidianExport({ dir: payload.dir });
        busy(btn, false);
        U.toast('已导出 ' + result.count + ' 篇到 ' + result.target, 'upload');
      } catch (e) { busy(btn, false); U.toast(errText(e), 'alert'); }
    }
  }

  async function exportZipNow(btn) {
    const scope = ($('#exScope') && $('#exScope').value) || 'all';
    const formats = [];
    if ($('#exMd') && $('#exMd').checked) formats.push('md');
    if ($('#exTxt') && $('#exTxt').checked) formats.push('txt');
    if ($('#exHtml') && $('#exHtml').checked) formats.push('html');
    if (!formats.length) { U.toast('至少选一种格式', 'info'); return; }
    const query = { formats: formats.join(',') };
    if (scope === 'cat') query.cat = ($('#exCat') && $('#exCat').value) || '';
    if (scope === 'sub') {
      query.cat = ($('#exCat') && $('#exCat').value) || '';
      query.sub = ($('#exSub') && $('#exSub').value) || '';
    }
    busy(btn, true, '打包中…');
    try {
      const blob = await api().exportZip(query);
      U.download('写作库导出-' + U.todayKey() + '.zip', blob, 'application/zip');
      busy(btn, false);
      U.toast('已生成 ZIP 下载', 'download');
    } catch (error) {
      busy(btn, false);
      U.toast(errText(error), 'alert');
    }
  }

  let ghCache = null;
  let ghReloadTimer = null;

  async function loadGitBody() {
    const box = $('#gitBody');
    if (!box) return;
    try {
      ghCache = await api().githubConfig();
      renderGitBody();
    } catch (error) {
      box.innerHTML = hubError(errText(error), 'github');
      bindRetry('github', loadGitBody);
    }
  }

  function scheduleGitReload() {
    clearTimeout(ghReloadTimer);
    ghReloadTimer = setTimeout(() => {
      if (settingsTab === 'git' && $('#gitBody')) loadGitBody();
    }, 500);
  }

  function renderGitBody() {
    const box = $('#gitBody');
    if (!box || !ghCache) return;
    box.innerHTML = ghCache.configured ? ghConnectedHtml(ghCache) : ghFormHtml(ghCache, {});
    bindGh();
  }

  function ghFormHtml(g, opts) {
    const c = (g && g.config) || {};
    const editing = !!(opts && opts.editing);
    const saved = !!(g && g.tokenSaved);
    return '<div class="gh-form">' +
      (editing ? '<div class="gh-edit-head"><b>连接设置</b><span class="hint">改仓库、分支或目录会清空同步基线与冲突记录，但不会动本机文章。</span></div>' :
        '<div class="gh-steps">' +
        '<div><b>1</b><span>在 GitHub 新建仓库，建议 Private；不需要初始化 README。</span></div>' +
        '<div><b>2</b><span>新建 fine-grained Token，只授权这个仓库的 Contents 读写。</span></div>' +
        '<div><b>3</b><span>填在下面并连接。连接只验证权限，不会上传内容。</span></div></div>') +
      '<div class="row"><div class="field grow"><label for="ghOwner">用户名 / 组织</label>' +
      '<input class="input" id="ghOwner" value="' + U.esc(c.owner || '') + '" placeholder="例如 octocat" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div class="field grow"><label for="ghRepo">仓库名</label>' +
      '<input class="input" id="ghRepo" value="' + U.esc(c.repo || '') + '" placeholder="例如 writing-library" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div>' +
      '<div class="row"><div class="field grow"><label for="ghBranch">分支</label>' +
      '<input class="input" id="ghBranch" value="' + U.esc(c.branch || 'main') + '" placeholder="main" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div class="field grow"><label for="ghDir">同步目录</label>' +
      '<input class="input" id="ghDir" value="' + U.esc(c.dir || '写作库同步') + '" placeholder="写作库同步" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div>' +
      '<div class="field"><label for="ghToken">Personal access token</label>' +
      '<input class="input" id="ghToken" type="password" placeholder="' +
      (g && g.tokenPresent ? '已保存，不显示；留空表示继续使用' : '粘贴 fine-grained Token，仅授权这个仓库的 Contents 读写') +
      '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<label class="check-line"><input type="checkbox" id="ghRemember"' + (c.remember !== false ? ' checked' : '') + '> 在这台设备记住 Token（不勾选则关闭页面后要重填）</label>' +
      '<details class="gh-advanced"' + (c.apiBase && c.apiBase !== 'https://api.github.com' ? ' open' : '') + '>' +
      '<summary>高级：API 地址</summary><div class="field">' +
      '<input class="input" id="ghApiBase" value="' + U.esc(c.apiBase || 'https://api.github.com') + '" placeholder="https://api.github.com" spellcheck="false"></div>' +
      '<p class="hint">只在自建 GitHub 兼容服务或本机测试时修改；必须是 https，或 http://127.0.0.1。</p></details>' +
      '<div class="sc-actions">' +
      '<button class="btn primary" data-gh="connect">' + U.icon('cloud') + (editing ? '保存并重新连接' : '连接 GitHub') + '</button>' +
      (editing ? '<button class="btn ghost" data-gh="cancel-edit">取消</button>' : '') +
      '<span class="hint">' + (g && g.tokenPresent ? (saved ? 'Token 已保存在这台设备' : 'Token 只在本次打开有效') : 'Token 只存在本机浏览器') + '</span>' +
      '</div></div>';
  }

  function ghConnectedHtml(g) {
    const st = g.status || {};
    const repo = g.repo || {};
    const c = g.config || {};
    const base = g.base || {};
    const pending = g.pending || { domains: [], changed: 0, first: true };
    const head = String(st.remoteHead || base.head || '');
    const last = (g.log || [])[0];
    const conflicts = g.conflicts || [];
    return '<div class="gh-repo">' +
      '<div class="gh-repo-main"><b>' + U.esc(repo.fullName || (c.owner + '/' + c.repo)) + '</b>' +
      '<div class="gh-tags"><span class="pill">' + U.esc(c.branch) + '</span>' +
      (repo.private ? '<span class="pill ok">私有仓库</span>' : '<span class="pill warn">公开仓库 · 改动正文会公开</span>') +
      (st.remoteChanged ? '<span class="pill warn">云端有更新</span>' : '') +
      (conflicts.length ? '<span class="pill danger">' + conflicts.length + ' 个冲突</span>' : '') + '</div></div>' +
      '<div class="gh-repo-side">' +
      (g.webUrl ? '<a class="btn sm ghost" href="' + U.esc(g.webUrl) + '" target="_blank" rel="noopener">在 GitHub 打开</a>' : '') +
      '<button class="btn sm ghost" data-gh="edit">连接设置</button></div></div>' +
      '<div class="git-grid">' +
      '<div class="git-stat"><b>' + U.esc(head ? head.slice(0, 7) : '—') + '</b><span>云端最新提交</span></div>' +
      '<div class="git-stat"><b>' + (pending.changed || 0) + '</b><span>项待提交</span></div>' +
      '<div class="git-stat"><b>' + conflicts.length + '</b><span>个冲突待处理</span></div></div>' +
      '<div class="git-subject">' + (st.error ? '<span class="warn">' + U.esc(st.error) + '</span>' :
        U.esc(last ? (last.message || (last.action === 'pull' ? '从云端拉取' : '提交到云端')) :
          (base.head ? '上次同步 ' + fmtDateTime(base.at) : '还没有同步记录'))) +
      (st.checkedAt ? ' · 检查于 ' + U.esc(fmtDateTime(st.checkedAt)) : '') + '</div>' +
      ghPendingHtml(pending) +
      '<div class="sc-actions gh-actions">' +
      '<button class="btn primary" data-gh="push">' + U.icon('upload') + '提交本机改动</button>' +
      '<button class="btn" data-gh="pull">' + U.icon('download') + '拉取云端</button>' +
      '<button class="btn" data-gh="check">' + U.icon('refresh') + '检查云端</button>' +
      '<button class="btn ghost danger" data-gh="disconnect">断开</button></div>' +
      (conflicts.length ? '<div class="gh-conflicts"><h4>冲突 · 需要你来选</h4>' + conflicts.map(ghConflictHtml).join('') + '</div>' : '') +
      '<div class="gh-auto">' +
      '<label class="check-line"><input type="checkbox" data-gh-auto="autoCheck"' + (c.autoCheck !== false ? ' checked' : '') + '> 每 60 秒检查云端（页面在前台时）</label>' +
      '<label class="check-line"><input type="checkbox" data-gh-auto="autoPull"' + (c.autoPull ? ' checked' : '') + '> 云端有更新且本机无改动时自动拉取</label></div>' +
      ((g.log && g.log.length) ? '<details class="gh-log"><summary>同步历史（最近 ' + Math.min(g.log.length, 20) + ' 条）</summary>' +
        g.log.slice(0, 20).map(ghLogHtml).join('') + '</details>' : '') +
      '<div class="git-note">同步目录：<span class="code">' + U.esc(c.dir) + '</span> · Token：' + (g.tokenSaved ? '已记住' : '仅本次打开有效') +
      '<br>删除与改写也会作为一次改动同步；拉取时如果两边都改过，会停下来等你选。</div>';
  }

  function ghPendingHtml(pending) {
    const domains = pending.domains || [];
    if (!domains.length) return '';
    return '<div class="gh-pending">' + domains.map((d) => {
      const unit = d.key === 'workspace' ? ' 个作品' : d.key === 'meta' ? ' 条开关' : ' 条';
      return '<div class="gh-pending-row' + (d.changed ? ' on' : '') + '">' +
        '<span>' + U.esc(d.label) + '</span><b>' + U.fmt(d.count || 0) + unit + '</b>' +
        '<span class="hint">' + U.esc(d.changed ? (d.first ? '首次同步' : '有改动') : '已同步') + '</span></div>';
    }).join('') + '</div>';
  }

  function ghConflictHtml(c) {
    const both = c.kind !== 'domain';
    const localText = c.kind === 'domain' ? (c.localSummary || '本机版本')
      : ((c.wordsLocal || 0) + ' 字 · ' + fmtDateTime(c.updatedLocal || ''));
    const remoteText = c.kind === 'domain' ? (c.remoteSummary || '云端版本')
      : ((c.wordsRemote || 0) + ' 字 · ' + fmtDateTime(c.updatedRemote || ''));
    return '<div class="gh-conflict">' +
      '<div class="gh-conflict-head"><b>' + U.esc(c.title || c.articleId || c.draftId || c.label) + '</b>' +
      '<span class="pill">' + (c.kind === 'article' ? '文章' : c.kind === 'draft' ? '草稿' : '整块数据') + '</span></div>' +
      '<div class="gh-conflict-cols">' +
      '<div><b>本机</b><span>' + U.esc(localText) + '</span>' + (c.excerptLocal ? '<p>' + U.esc(c.excerptLocal) + '</p>' : '') + '</div>' +
      '<div><b>云端</b><span>' + U.esc(remoteText) + '</span>' +
      (c.excerptRemote ? '<p>' + U.esc(c.excerptRemote) + '</p>' : (c.remoteMissing ? '<p class="hint">云端已删除这一条</p>' : '')) + '</div>' +
      '</div><div class="sc-actions">' +
      '<button class="btn sm" data-gh-resolve="local" data-key="' + U.esc(c.key) + '">保留本机</button>' +
      '<button class="btn sm primary" data-gh-resolve="remote" data-key="' + U.esc(c.key) + '">采用云端</button>' +
      (both ? '<button class="btn sm" data-gh-resolve="both" data-key="' + U.esc(c.key) + '">两边都留</button>' : '') +
      '</div></div>';
  }

  function ghLogHtml(e) {
    const label = e.action === 'push' ? '提交' : e.action === 'pull' ? '拉取' : e.action === 'resolve' ? '处理冲突' : (e.action || '同步');
    return '<div class="gh-log-row"><span class="pill">' + U.esc(label) + '</span><div>' +
      '<b>' + U.esc(e.message || (e.action === 'pull' ? '从云端拉取' : '提交到云端')) + '</b>' +
      '<span>' + U.esc(fmtDateTime(e.at)) + (e.device ? ' · ' + U.esc(e.device) : '') +
      (e.commit ? ' · ' + U.esc(String(e.commit).slice(0, 7)) : '') + '</span></div></div>';
  }

  function bindGh() {
    const box = $('#gitBody');
    if (!box) return;
    U.$$('[data-gh]', box).forEach((b) => {
      b.onclick = () => ghAction(b.getAttribute('data-gh'), b);
    });
    U.$$('[data-gh-resolve]', box).forEach((b) => {
      b.onclick = () => ghResolveAction(b);
    });
    U.$$('[data-gh-auto]', box).forEach((el) => {
      el.onchange = () => ghToggleAuto(el.getAttribute('data-gh-auto'), el.checked);
    });
  }

  function ghFormValues() {
    const val = (sel) => {
      const el = $(sel);
      return el ? el.value.trim() : '';
    };
    const payload = {
      owner: val('#ghOwner'),
      repo: val('#ghRepo'),
      branch: val('#ghBranch') || 'main',
      dir: val('#ghDir') || '写作库同步',
      apiBase: val('#ghApiBase') || 'https://api.github.com',
      remember: !!($('#ghRemember') && $('#ghRemember').checked)
    };
    const token = val('#ghToken');
    if (token) payload.token = token;
    return payload;
  }

  async function ghConnect(btn) {
    const payload = ghFormValues();
    if (!payload.owner || !payload.repo) { U.toast('先填写用户名和仓库名', 'alert'); return; }
    if (!payload.token && !(ghCache && ghCache.tokenPresent)) { U.toast('先填写 GitHub Token', 'alert'); return; }
    busy(btn, true, '正在验证…');
    try {
      const test = await api().testGithub(payload);
      if (!test.repo.private) {
        busy(btn, false);
        const ok = await U.confirmModal({
          title: '这个仓库是公开的',
          desc: '同步文件会包含你改过的正文与草稿，公开仓库任何人都能看到。建议改用私有仓库。仍然连接？',
          okText: '仍然连接',
          danger: true
        });
        if (!ok) return;
        busy(btn, true, '正在连接…');
      }
      ghCache = await api().saveGithubConfig(payload);
      U.toast('已连接 ' + (test.repo.fullName || payload.repo), 'check');
      try { await api().githubCheck(); } catch (e) { /* 云端可能还是空仓库 */ }
      await loadGitBody();
    } catch (error) {
      busy(btn, false);
      U.toast(errText(error), 'alert');
    }
  }

  async function ghCheck(btn) {
    busy(btn, true, '检查中…');
    try {
      const result = await api().githubCheck();
      U.toast(result.remoteChanged ? '云端有新的提交' : '云端没有新提交', result.remoteChanged ? 'cloud' : 'check');
      await loadGitBody();
    } catch (error) {
      busy(btn, false);
      U.toast(errText(error), 'alert');
    }
  }

  async function ghPull(btn) {
    busy(btn, true, '拉取中…');
    try {
      let result = await api().githubPull({});
      if (result.needsChoice) {
        busy(btn, false);
        const ok = await U.confirmModal({
          title: '云端已经有同步内容',
          desc: '本机还有 ' + (result.localArticles || 0) + ' 篇改动、' + (result.localDrafts || 0) + ' 份草稿。首次拉取会以云端为准，本机这些内容会被替换。如果本机也要保留，请取消，改用「提交本机改动」覆盖云端。',
          okText: '采用云端覆盖本机',
          danger: true
        });
        if (!ok) return;
        busy(btn, true, '拉取中…');
        result = await api().githubPull({ acceptRemote: true });
      }
      U.toast(result.message || (result.upToDate ? '云端没有新提交' : '已拉取云端改动'), 'download');
      if (result.conflicts) U.toast('有 ' + result.conflicts + ' 个冲突，需要你来选', 'alert');
      await loadGitBody();
    } catch (error) {
      busy(btn, false);
      U.toast(errText(error), 'alert');
    }
  }

  async function ghPush(btn, force) {
    busy(btn, true, force ? '覆盖云端中…' : '提交中…');
    try {
      const result = await api().githubPush({ force: !!force });
      if (result.empty) U.toast('本机没有新的同步改动', 'info');
      else U.toast('已提交到 GitHub', 'cloud');
      await loadGitBody();
    } catch (error) {
      busy(btn, false);
      const code = error && error.data && error.data.code;
      if (error && error.status === 409) {
        if (code === 'FIRST_PUSH') {
          const ok = await U.confirmModal({
            title: '云端已经有同步内容',
            desc: '首次提交会把云端现有的同步文件替换成本机内容。以前的提交仍留在 Git 历史里。确定以本机为准？',
            okText: '覆盖云端',
            danger: true
          });
          if (ok) return ghPush(btn, true);
          return;
        }
        if (code === 'REMOTE_AHEAD') {
          const ok = await U.confirmModal({
            title: '云端有新提交',
            desc: '先把云端改动拉下来，确认没有冲突后再提交本机改动。现在拉取？',
            okText: '立即拉取'
          });
          if (ok) return ghPull(btn);
          return;
        }
        if (code === 'CONFLICTS') {
          U.toast(error.message, 'alert');
          scheduleGitReload();
          return;
        }
      }
      U.toast(errText(error), 'alert');
    }
  }

  async function ghResolveAction(btn) {
    const key = btn.getAttribute('data-key');
    const choice = btn.getAttribute('data-gh-resolve');
    busy(btn, true, '处理中…');
    try {
      const result = await api().githubResolve([{ key, choice }]);
      U.toast(choice === 'remote' ? '已采用云端版本' : choice === 'both' ? '已保留两边，副本已生成' : '已保留本机版本', 'check');
      if (!result.remaining) U.toast('冲突已全部处理，可以提交了', 'check');
      await loadGitBody();
    } catch (error) {
      busy(btn, false);
      U.toast(errText(error), 'alert');
    }
  }

  async function ghToggleAuto(key, checked) {
    try {
      ghCache = await api().saveGithubConfig({ [key]: !!checked });
      renderGitBody();
      U.toast(checked ? '已开启' : '已关闭', 'check');
    } catch (error) {
      U.toast(errText(error), 'alert');
      await loadGitBody();
    }
  }

  async function ghDisconnect(btn) {
    const ok = await U.confirmModal({
      title: '断开 GitHub？',
      desc: '会清除这台设备保存的 Token、同步基线与冲突记录；本机文章不受影响，云端的同步文件也不会被删除。',
      okText: '断开连接',
      danger: true
    });
    if (!ok) return;
    busy(btn, true, '正在断开…');
    try {
      ghCache = await api().githubDisconnect('all');
      U.toast('已断开，本机内容仍在', 'check');
      renderGitBody();
    } catch (error) {
      busy(btn, false);
      U.toast(errText(error), 'alert');
    }
  }

  function ghEditMode() {
    const box = $('#gitBody');
    if (!box || !ghCache) return;
    box.innerHTML = ghFormHtml(ghCache, { editing: true });
    bindGh();
  }

  async function ghAction(act, btn) {
    if (act === 'connect') return ghConnect(btn);
    if (act === 'edit') { ghEditMode(); return; }
    if (act === 'cancel-edit') { renderGitBody(); return; }
    if (act === 'check') return ghCheck(btn);
    if (act === 'pull') return ghPull(btn);
    if (act === 'push') return ghPush(btn, false);
    if (act === 'disconnect') return ghDisconnect(btn);
  }

  window.addEventListener('wb64:remote-changed', () => {
    const autoPull = !!(ghCache && ghCache.config && ghCache.config.autoPull);
    if (!autoPull && settingsTab !== 'git') {
      U.toast('云端有新的同步内容，可在 设置 → GitHub 同步 里拉取', 'cloud');
    }
    if (settingsTab === 'git') scheduleGitReload();
  });
  window.addEventListener('wb64:sync-pulled', () => {
    if (settingsTab === 'git') scheduleGitReload();
  });
  window.addEventListener('wb64:library-changed', () => {
    if (window.Gen6Api && window.Gen6Api.refreshLibrary) {
      window.Gen6Api.refreshLibrary({ silent: true, delay: 0 }).catch(() => {});
    }
    if (settingsTab === 'git') scheduleGitReload();
  });

  function bindRetry(key, fn) {
    const b = viewRoot().querySelector('[data-hub-retry="' + key + '"]');
    if (b) b.onclick = fn;
  }

  window.Hub = {
    drafts, newDraft, draftEditor: openDraft, openPublishDraft, plugins, settings,
    refreshDrafts: drafts,
    get draftState() { return draftState; }
  };
})();
