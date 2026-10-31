/* ============================================================
   immersive.js · 像 Obsidian 一样，进来就是一张空白页
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const D = window.LibData, S = window.Store;
  const TYPES = ['小说', '资料', '素材', '毕设'];
  const STATUSES = ['草稿', '待定', '定稿', '已发布', '已归档', '废弃'];

  const I = {
    open: false,
    docId: null,
    bodyHash: '',
    meta: null,
    article: null,
    dirty: false,
    saving: false,
    pending: false,
    saveTimer: null,
    retryTimer: null,
    typeTimer: null,
    returnHash: '',
    focus: false,
    typewriter: false,
    pendingNew: false,
    lastSavedAt: 0,
    busy: false,
    mode: 'article',
    draftId: null,
    draft: null,
    nodeId: null,
    projectId: null,
    readOnly: false
  };

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  function splitHash() {
    const raw = (location.hash || '').replace(/^#/, '') || '/';
    const at = raw.indexOf('?');
    return {
      path: at >= 0 ? raw.slice(0, at) : raw,
      query: new URLSearchParams(at >= 0 ? raw.slice(at + 1) : '')
    };
  }

  function writePath(id) { return '#/write' + (id ? '/' + encodeURIComponent(id) : ''); }
  function draftPath(id) { return '#/draft/' + encodeURIComponent(id); }
  function nodePath(nodeId, projectId) {
    const query = new URLSearchParams();
    query.set('node', nodeId);
    if (projectId) query.set('project', projectId);
    return '#/write?' + query.toString();
  }

  function nowLabel() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function setState(text, cls) {
    const el = $('#immState');
    if (!el) return;
    el.textContent = text;
    el.className = cls || '';
  }

  function wordCount() {
    return U.countWords($('#immBody').innerHTML || '');
  }

  function updateCount() {
    const el = $('#immCount');
    if (el) el.textContent = U.fmt(wordCount()) + ' 字';
  }

  function autosizeTitle() {
    const el = $('#immTitle');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(46, el.scrollHeight + 2) + 'px';
  }

  /* ---------------- meta helpers ---------------- */
  function currentDbId() {
    if (I.meta && I.meta.dbId && D.db(I.meta.dbId)) return I.meta.dbId;
    if (D.dbFilter !== 'all' && D.db(D.dbFilter)) return D.dbFilter;
    return D.databases[0] ? D.databases[0].id : '';
  }
  function catsOfType(type, dbId) {
    const wanted = dbId != null ? dbId : currentDbId();
    return D.cats.filter((cat) => cat.type === type && (!wanted || cat.dbId === wanted));
  }
  function groupNames(type) {
    return catsOfType(type).map((cat) => cat.name);
  }
  function subNames(type, group, dbId) {
    const cat = catsOfType(type, dbId).find((c) => c.name === group);
    return cat ? cat.subs.map((sub) => sub.name) : [];
  }
  function fillList(id, values) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = values.map((v) => '<option value="' + U.esc(v) + '"></option>').join('');
  }

  function firstMeta(type, dbId) {
    const list = D.cats.filter((cat) => cat.type === type && (!dbId || cat.dbId === dbId));
    const cat = list[0];
    if (!cat) return null;
    return { dbId: dbId || cat.dbId || '', type, group: cat.name, sub: cat.subs[0] ? cat.subs[0].name : '', tags: '' };
  }

  function defaultMeta() {
    const last = window.lsGet('6.lastMeta', null);
    const lastDb = last && last.dbId && D.db(last.dbId) ? last.dbId : '';
    const dbId = lastDb || (D.dbFilter !== 'all' && D.db(D.dbFilter) ? D.dbFilter : (D.databases[0] ? D.databases[0].id : ''));
    const fallback = firstMeta('资料', dbId) || firstMeta('资料') || { type: '资料', group: '未分类', sub: '', tags: '', dbId };
    if (!last || !last.type || !TYPES.includes(last.type)) return Object.assign({}, fallback, { dbId });
    const cat = D.cats.find((c) => c.type === last.type && c.name === last.group && (!dbId || c.dbId === dbId));
    if (!cat) return Object.assign({}, fallback, { dbId });
    let sub = last.sub || '';
    if (cat.subs.length && !cat.subs.some((s) => s.name === sub)) sub = cat.subs[0].name;
    return { dbId, type: last.type, group: cat.name, sub, tags: last.tags || '' };
  }

  function metaFromQuery(query) {
    const meta = defaultMeta();
    const fresh = query.get('fresh') === '1';
    const dbq = query.get('dbId');
    if (dbq && D.db(dbq) && dbq !== meta.dbId) {
      meta.dbId = dbq;
      const first = firstMeta(meta.type, dbq);
      if (first) { meta.group = first.group; meta.sub = first.sub; }
      else { meta.group = '未分类'; meta.sub = meta.type === '小说' ? '未分卷' : ''; }
    }
    const type = query.get('type');
    if (type && TYPES.includes(type)) meta.type = type;
    const group = query.get('group') || query.get('work') || query.get('cat');
    if (group) {
      if (group !== meta.group) meta.sub = '';
      meta.group = group;
    }
    if (!fresh && !catsOfType(meta.type, meta.dbId).some((c) => c.name === meta.group)) {
      const first = firstMeta(meta.type, meta.dbId);
      meta.group = first ? first.group : '未分类';
      meta.sub = '';
    }
    const sub = query.get('sub') || query.get('volume');
    if (sub) meta.sub = sub;
    if (query.get('nosub') === '1') meta.sub = '';
    else if (!meta.sub) meta.sub = meta.type === '小说' ? '未分卷' : ((subNames(meta.type, meta.group, meta.dbId)[0]) || '');
    if (query.get('tags')) meta.tags = query.get('tags');
    return meta;
  }

  function metaFromArticle(article) {
    const cats = article.cats || [];
    const novel = article.type === '小说';
    const rec = D.get(article.id);
    return {
      dbId: article.dbId || (rec && rec.dbId) || '',
      type: article.type || '资料',
      group: novel ? (cats[1] || '未分类') : (cats[1] || '未分类'),
      sub: novel ? (cats[2] || '未分卷') : (cats[2] || ''),
      tags: (article.tags || []).join('、'),
      status: article.status || '草稿'
    };
  }

  function catsOf(meta) {
    if (meta.type === '小说') return ['正文', meta.group || '未分类', meta.sub || '未分卷'];
    return [meta.type, meta.group || '未分类', meta.sub || ''];
  }

  function parseTags(value) {
    return String(value || '').split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
  }

  function saveLastMeta() {
    window.lsSet('6.lastMeta', {
      dbId: I.meta.dbId, type: I.meta.type, group: I.meta.group, sub: I.meta.sub, tags: I.meta.tags
    });
  }

  /* ---------------- new bar ---------------- */
  function buildDbSelect() {
    const sel = $('#immDb');
    if (!sel) return;
    sel.innerHTML = D.databases.map((db) =>
      '<option value="' + U.esc(db.id) + '">' + U.esc(db.short || db.name) + '</option>').join('');
  }

  function buildTypeSelect() {
    const sel = $('#immType');
    if (!sel) return;
    sel.innerHTML = TYPES.map((t) => '<option value="' + t + '">' + t + '</option>').join('');
  }

  function syncMetaInputs() {
    const dbEl = $('#immDb'), typeEl = $('#immType'), groupEl = $('#immGroup'), subEl = $('#immSub');
    if (!typeEl || !I.meta) return;
    if (dbEl) dbEl.value = I.meta.dbId || currentDbId();
    typeEl.value = I.meta.type;
    groupEl.value = I.meta.group;
    subEl.value = I.meta.sub;
    fillList('#immGroupList', groupNames(I.meta.type));
    fillList('#immSubList', subNames(I.meta.type, I.meta.group));
  }

  function readNewbar() {
    if (!I.meta) I.meta = defaultMeta();
    const dbEl = $('#immDb');
    if (dbEl && dbEl.value && D.db(dbEl.value)) I.meta.dbId = dbEl.value;
    const type = $('#immType').value || I.meta.type;
    const group = ($('#immGroup').value || '').trim() || '未分类';
    const sub = ($('#immSub').value || '').trim() || (type === '小说' ? '未分卷' : '');
    I.meta.type = type;
    I.meta.group = group;
    I.meta.sub = sub;
    return I.meta;
  }

  function bindNewbar() {
    const dbEl = $('#immDb');
    if (dbEl) {
      dbEl.onchange = () => {
        I.meta.dbId = dbEl.value;
        const groups = groupNames(I.meta.type);
        I.meta.group = groups[0] || '未分类';
        const subs = subNames(I.meta.type, I.meta.group);
        I.meta.sub = subs[0] || (I.meta.type === '小说' ? '未分卷' : '');
        fillList('#immGroupList', groups);
        fillList('#immSubList', subs);
        $('#immGroup').value = I.meta.group;
        $('#immSub').value = I.meta.sub;
        renderMetaLine();
        renderCrumb();
      };
    }
    $('#immType').onchange = () => {
      const type = $('#immType').value;
      const groups = groupNames(type);
      const current = ($('#immGroup').value || '').trim();
      I.meta.type = type;
      if (!groups.includes(current)) I.meta.group = groups[0] || '未分类';
      const subs = subNames(type, I.meta.group);
      I.meta.sub = subs[0] || (type === '小说' ? '未分卷' : '');
      fillList('#immGroupList', groups);
      fillList('#immSubList', subs);
      $('#immGroup').value = I.meta.group;
      $('#immSub').value = I.meta.sub;
    };
    $('#immGroup').addEventListener('input', () => {
      const type = $('#immType').value;
      fillList('#immSubList', subNames(type, $('#immGroup').value.trim()));
    });
  }

  /* ---------------- meta line / drawer ---------------- */
  function renderMetaLine() {
    const el = $('#immMeta');
    if (!el || !I.meta) return;
    if (I.mode === 'draft') {
      const published = !!(I.draft && I.draft.publishedId);
      el.innerHTML = '<span class="imm-pill">草稿箱</span>' +
        '<span>' + (published ? '已收入文库 · 只读快照' : '本机草稿 · 自动保存') + '</span>' +
        '<span class="imm-status">' + (published ? '已收入' : '草稿') + '</span>' +
        (published ? '<span class="imm-filepath">' + U.esc(I.draft.publishedId) + '</span>' : '');
      return;
    }
    if (I.mode === 'node' && !I.docId) {
      const p = S.get(I.projectId);
      el.innerHTML = '<span class="imm-pill">写作台</span>' +
        '<span class="imm-pill">' + U.esc(I.meta.type) + '</span>' +
        '<span>' + U.esc(p ? p.name : '作品') + (I.meta.sub ? ' / ' + U.esc(I.meta.sub) : '') + '</span>' +
        '<span class="imm-status">首次保存进入文库</span>';
      return;
    }
    const status = I.meta.status || '草稿';
    const path = I.article ? I.article.path : '';
    const db = D.db(I.meta.dbId);
    el.innerHTML =
      (db ? '<span class="imm-pill db" style="--db:' + db.color + '"><i></i>' + U.esc(db.short || db.name) + '</span>' : '') +
      '<span class="imm-pill">' + U.esc(I.meta.type) + '</span>' +
      '<span>' + U.esc(I.meta.group || '未分类') + (I.meta.sub ? ' / ' + U.esc(I.meta.sub) : '') + '</span>' +
      '<span class="imm-status">' + U.esc(status) + '</span>' +
      (path ? '<span class="imm-filepath" title="' + U.esc(path) + '">' + U.esc(path) + '</span>' : '') +
      '<button class="imm-link" data-imm="meta">编辑设定</button>';
  }

  function renderCrumb() {
    const el = $('#immCrumb');
    if (!el) return;
    if (I.mode === 'draft') {
      el.textContent = '草稿箱 / ' + ((I.draft && I.draft.title) || '草稿');
      return;
    }
    if (I.mode === 'node' && !I.docId) {
      const p = S.get(I.projectId);
      el.textContent = '写作台 / ' + (p ? p.name : '作品') + ' / ' + (I.meta ? I.meta.group : '');
      return;
    }
    if (I.docId || I.article) {
      el.textContent = I.article ? I.article.path : '';
    } else {
      const db = D.db(I.meta && I.meta.dbId);
      el.textContent = '新文章 · ' + (db ? db.short + ' / ' : '') + (I.meta ? I.meta.type + ' / ' + I.meta.group : '');
    }
  }

  function renderLoc() {
    const el = $('#immLoc');
    if (!el) return;
    if (I.mode === 'draft') {
      el.textContent = (I.draft && I.draft.title) || '草稿';
    } else if (I.mode === 'node' && !I.docId) {
      el.textContent = $('#immTitle').value.trim() || '写作台章节';
    } else if (I.docId) {
      el.textContent = (I.article && I.article.title) || $('#immTitle').value.trim() || '无题';
    } else {
      el.textContent = '新文章';
    }
  }

  function currentCategoryId() {
    if (!I.meta) return '';
    const cat = catsOfType(I.meta.type).find((c) => c.name === I.meta.group);
    return cat ? cat.id : '';
  }

  function renderDrawer(query) {
    const box = $('#immDrawerList');
    if (!box) return;
    const q = String(query || '').trim().toLowerCase();
    const currentCat = currentCategoryId();
    const dbId = I.article ? (I.article.dbId || '') : currentDbId();
    const db = D.db(dbId);
    let h = '<div class="imm-drawer-db"><span class="dot" style="background:' + (db ? db.color : '#8A9099') + '"></span>' +
      U.esc(db ? db.name : '全部数据库') + '</div>';
    D.cats.forEach((cat) => {
      if (dbId && cat.dbId !== dbId) return;
      const files = [];
      cat.subs.forEach((sub) => sub.files.forEach((f) => {
        const rec = D.get(cat.id + '/' + sub.id + '/' + f.file);
        if (!rec) return;
        if (q && rec.title.toLowerCase().indexOf(q) < 0 && (rec.subName || '').toLowerCase().indexOf(q) < 0) return;
        files.push(rec);
      }));
      if (!files.length) return;
      const open = q || cat.id === currentCat || (I.article && I.article.catId === cat.id);
      h += '<details class="imm-cat"' + (open ? ' open' : '') + '>' +
        '<summary><span class="dot" style="background:' + cat.color + '"></span>' +
        U.esc(cat.name) + '<span class="n">' + files.length + '</span></summary>';
      files.forEach((rec) => {
        h += '<button class="imm-doc' + (rec.id === I.docId ? ' active' : '') + '" data-imfile="' + rec.id + '">' +
          '<span class="id-title">' + U.highlight(rec.title, q) + '</span>' +
          '<span class="id-sub">' + U.esc(rec.subName) + ' · ' + (rec.words ? U.fmt(rec.words) + ' 字' : '空') + '</span></button>';
      });
      h += '</details>';
    });
    box.innerHTML = h + (h.indexOf('imm-doc') >= 0 ? '' : '<div class="imm-empty">没有找到相关文章</div>');
  }

  function toggleDrawer(force) {
    const drawer = $('#immDrawer');
    if (!drawer) return;
    const show = force == null ? drawer.hidden : force;
    drawer.hidden = !show;
    document.body.classList.toggle('imm-drawer-open', show);
    if (show) {
      renderDrawer('');
      $('#immFind').value = '';
      setTimeout(() => $('#immFind').focus(), 60);
    }
  }

  /* ---------------- mount ---------------- */
  async function mount(docId, options) {
    const opts = options || {};
    const wasOpen = I.open;
    I.open = true;
    I.mode = 'article';
    I.draftId = null;
    I.draft = null;
    I.nodeId = null;
    I.projectId = null;
    I.readOnly = false;
    I.docId = docId || null;
    I.bodyHash = '';
    I.article = null;
    I.dirty = false;
    I.pending = false;
    I.busy = false;
    clearTimeout(I.saveTimer);
    clearTimeout(I.retryTimer);
    window.__gen6Editing = docId || '';

    $('#immApp').hidden = false;
    document.body.classList.add('mode-imm');
    $('#immDrawer').hidden = true;
    document.body.classList.remove('imm-drawer-open');
    $('#immDraftbar').hidden = true;
    $('#immNodebar').hidden = true;
    $('#immTitle').readOnly = false;
    $('#immBody').contentEditable = 'true';
    document.body.classList.toggle('imm-focus', !!I.focus);
    document.body.classList.toggle('imm-type', !!I.typewriter);
    $('#immFocusState') && $('#immFocusState').remove();

    if (docId) {
      $('#immNewbar').hidden = true;
      setState('正在读取…');
      $('#immTitle').value = '';
      $('#immBody').innerHTML = '';
      $('#immPath').textContent = docId;
      let article = null;
      try {
        const res = await window.Gen6Api.article(docId);
        article = res.article;
      } catch (error) {
        const rec = D.get(docId);
        if (rec) {
          article = Object.assign({}, rec, { html: rec.html || U.textToHtml(rec.text || ''), cats: rec.cats, tags: rec.tags });
        } else {
          U.toast(error.message || '这篇读不出来', 'alert');
          setState('读取失败');
          return;
        }
      }
      I.article = article;
      I.bodyHash = article.bodyHash || '';
      I.meta = metaFromArticle(article);
      I.meta.status = article.status || '草稿';
      const titleEl = $('#immTitle');
      const bodyEl = $('#immBody');
      titleEl.value = article.title || '';
      bodyEl.innerHTML = article.html || '';
      autosizeTitle();
      updateCount();
      renderMetaLine();
      renderCrumb();
      renderLoc();
      $('#immPath').textContent = article.path || docId;
      setState('已载入', 'ok');
      $('#immTitle').readOnly = false;
      requestAnimationFrame(() => {
        bodyEl.focus();
        const range = document.createRange();
        range.selectNodeContents(bodyEl);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        bodyEl.scrollTop = 0;
        $('#immStage').scrollTop = 0;
      });
    } else {
      I.meta = metaFromQuery(opts.query || new URLSearchParams());
      I.meta.tags = I.meta.tags || '';
      $('#immNewbar').hidden = false;
      buildDbSelect();
      syncMetaInputs();
      $('#immTitle').value = '';
      $('#immBody').innerHTML = '';
      autosizeTitle();
      updateCount();
      renderMetaLine();
      renderCrumb();
      renderLoc();
      $('#immPath').textContent = '尚未保存 · 输入后自动建立文件';
      setState('未保存');
      setTimeout(() => $('#immTitle').focus(), 60);
    }
    if (!wasOpen) {
      $('#immStage').scrollTop = 0;
    }
    if (!opts.keepDrawer) renderDrawer('');
  }

  /* ---------------- draft mode ---------------- */
  async function fetchDrafts() {
    const res = await window.Gen6Api.drafts();
    return Array.isArray(res) ? res : ((res && res.drafts) || []);
  }

  function updateDraftBar() {
    const bar = $('#immDraftbar');
    if (!bar) return;
    const published = !!(I.draft && I.draft.publishedId);
    bar.hidden = false;
    const state = $('#immDraftState');
    const hint = $('#immDraftHint');
    const publish = $('#immDraftPublish');
    const cont = $('#immDraftContinue');
    if (state) {
      state.textContent = published ? '已收入文库 · 只读快照' : '自动保存 · 仅本机';
      state.title = published ? '要继续改，请打开文库里的文章；这份草稿保留原样' : '自动保存 · 收入文库前只在本机草稿箱';
    }
    if (hint) hint.textContent = published ? '要继续改，请打开文库里的文章；这份草稿保留原样' : '收入文库前只在本机草稿箱；收入后这份草稿会变成只读快照';
    if (publish) publish.hidden = published;
    if (cont) cont.hidden = !published;
  }

  function applyBarState(key, collapsed) {
    const bar = $('.imm-bar[data-bar="' + key + '"]');
    if (!bar) return;
    bar.classList.toggle('collapsed', collapsed);
    const btn = bar.querySelector('[data-bar-toggle]');
    if (!btn) return;
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? '展开说明' : '收起说明';
  }

  function bindBars() {
    $$('.imm-bar[data-bar]').forEach((bar) => {
      const key = bar.getAttribute('data-bar');
      const stored = window.lsGet('6.immbar.' + key, null);
      const collapsed = stored == null ? true : stored === 'collapsed';
      applyBarState(key, collapsed);
      const btn = bar.querySelector('[data-bar-toggle]');
      if (!btn) return;
      btn.onclick = () => {
        const next = !bar.classList.contains('collapsed');
        applyBarState(key, next);
        window.lsSet('6.immbar.' + key, next ? 'collapsed' : 'expanded');
      };
    });
  }

  async function mountDraft(draftId, options) {
    const opts = options || {};
    const wasOpen = I.open;
    I.open = true;
    I.mode = 'draft';
    I.draftId = draftId;
    I.draft = null;
    I.docId = null;
    I.bodyHash = '';
    I.article = null;
    I.nodeId = null;
    I.projectId = null;
    I.readOnly = false;
    I.dirty = false;
    I.pending = false;
    I.busy = false;
    clearTimeout(I.saveTimer);
    clearTimeout(I.retryTimer);
    window.__gen6Editing = '';

    $('#immApp').hidden = false;
    document.body.classList.add('mode-imm');
    $('#immDrawer').hidden = true;
    document.body.classList.remove('imm-drawer-open');
    document.body.classList.toggle('imm-focus', !!I.focus);
    document.body.classList.toggle('imm-type', !!I.typewriter);
    $('#immFocusState') && $('#immFocusState').remove();
    $('#immNewbar').hidden = true;
    $('#immNodebar').hidden = true;
    $('#immDraftbar').hidden = false;

    setState('正在读取草稿…');
    $('#immTitle').value = '';
    $('#immBody').innerHTML = '';
    $('#immPath').textContent = '草稿箱';
    $('#immTitle').readOnly = false;
    $('#immBody').contentEditable = 'true';

    let draft = null;
    try {
      const list = await fetchDrafts();
      draft = list.find((d) => d.id === draftId) || null;
    } catch (error) {
      U.toast(error.message || '草稿读不出来', 'alert');
      setState('读取失败', 'warn');
      return;
    }
    if (!draft) {
      U.toast('这份草稿可能已经被删除', 'alert');
      if (location.hash === draftPath(draftId)) location.hash = '#/drafts';
      return;
    }
    I.draft = draft;
    I.readOnly = !!draft.publishedId;
    I.meta = { dbId: currentDbId(), type: '资料', group: '草稿箱', sub: '', tags: '', status: '草稿' };
    $('#immTitle').value = draft.title || '';
    $('#immBody').innerHTML = draft.html || U.textToHtml(draft.markdown || draft.text || '');
    $('#immTitle').readOnly = I.readOnly;
    $('#immBody').contentEditable = I.readOnly ? 'false' : 'true';
    autosizeTitle();
    updateCount();
    renderMetaLine();
    renderCrumb();
    renderLoc();
    updateDraftBar();
    $('#immPath').textContent = I.readOnly ? '已收入文库 · 这份草稿只读' : '草稿 · 自动保存在本机草稿箱';
    setState(I.readOnly ? '只读快照' : '已载入草稿', 'ok');
    if (!wasOpen) $('#immStage').scrollTop = 0;
    if (!I.readOnly) {
      requestAnimationFrame(() => {
        $('#immBody').focus();
        const range = document.createRange();
        range.selectNodeContents($('#immBody'));
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        $('#immBody').scrollTop = 0;
        $('#immStage').scrollTop = 0;
      });
    }
  }

  /* ---------------- 写作台章节模式 ---------------- */
  function nearestAncestors(p, n) {
    const out = [];
    const seen = new Set([n.id]);
    let cur = n;
    for (let i = 0; i < 8; i += 1) {
      const pid = (cur.parents || [])[0];
      if (!pid || seen.has(pid)) break;
      const parent = (p.nodes || []).find((x) => x.id === pid);
      if (!parent) break;
      out.push(parent);
      seen.add(pid);
      cur = parent;
    }
    return out;
  }

  function nodeMeta(p, n) {
    const type = p.libType || (p.libKey && p.libKey.indexOf('novel:') === 0 ? '小说'
      : (p.kind === 'note' || p.name === '随笔' ? '资料' : '小说'));
    const dbId = p.dbId && D.db(p.dbId) ? p.dbId : currentDbId();
    const ancestors = nearestAncestors(p, n);
    const vol = ancestors.find((x) => x.type === 'vol');
    let group = '';
    let sub = '';
    if (type === '小说') {
      group = p.name || '未分类';
      sub = (vol && vol.title) || '未分卷';
    } else {
      const catVol = ancestors.find((x) => /^nv-c-/.test(x.id));
      const subVol = ancestors.find((x) => /^nv-s-/.test(x.id));
      group = (catVol && catVol.title) || (p.libKey ? '未分类' : (p.name || '未分类'));
      sub = (subVol && subVol.title) || (p.libKey ? '未分类' : '');
    }
    return { dbId, type, group, sub, tags: [group, sub].filter(Boolean).join('，'), status: '草稿' };
  }

  function linkNodeArticle(article) {
    const p = I.projectId ? S.get(I.projectId) : null;
    const n = p && (p.nodes || []).find((x) => x.id === I.nodeId);
    if (!n) return;
    n.docId = article.id;
    n.docHash = article.bodyHash || '';
    n.title = article.title;
    n.body = article.html || $('#immBody').innerHTML;
    n.words = article.words;
    n.updatedAt = Date.now();
    p.updatedAt = Date.now();
    S.save();
  }

  async function mountNode(nodeId, projectId, options) {
    const opts = options || {};
    let p = projectId ? S.get(projectId) : null;
    if (!p) p = S.projects.find((x) => (x.nodes || []).some((n) => n.id === nodeId)) || null;
    let n = p && (p.nodes || []).find((x) => x.id === nodeId);
    if (!p || !n) {
      U.toast('找不到这个写作台章节', 'alert');
      return;
    }
    if (n.type === 'vol') {
      const child = (p.nodes || []).find((x) => x.type === 'ch' && (x.parents || []).includes(n.id));
      if (!child) { U.toast('这一卷下面还没有章节', 'info'); return; }
      n = child;
      nodeId = n.id;
    }
    if (n.docId) {
      if (opts.returnTo != null) I.returnHash = opts.returnTo;
      await mount(n.docId);
      I.nodeId = nodeId;
      I.projectId = p.id;
      history.replaceState(history.state, '', writePath(n.docId));
      return;
    }

    const wasOpen = I.open;
    I.open = true;
    I.mode = 'node';
    I.nodeId = nodeId;
    I.projectId = p.id;
    I.draftId = null;
    I.draft = null;
    I.docId = null;
    I.bodyHash = '';
    I.article = null;
    I.readOnly = false;
    I.dirty = false;
    I.pending = false;
    I.busy = false;
    clearTimeout(I.saveTimer);
    clearTimeout(I.retryTimer);
    window.__gen6Editing = 'node:' + nodeId;
    I.meta = nodeMeta(p, n);

    $('#immApp').hidden = false;
    document.body.classList.add('mode-imm');
    $('#immDrawer').hidden = true;
    document.body.classList.remove('imm-drawer-open');
    document.body.classList.toggle('imm-focus', !!I.focus);
    document.body.classList.toggle('imm-type', !!I.typewriter);
    $('#immFocusState') && $('#immFocusState').remove();
    $('#immNewbar').hidden = true;
    $('#immDraftbar').hidden = true;
    $('#immNodebar').hidden = false;
    $('#immTitle').readOnly = false;
    $('#immBody').contentEditable = 'true';
    $('#immTitle').value = n.title || '新章节';
    $('#immBody').innerHTML = n.body || '';
    const nodeState = $('#immNodeState');
    if (nodeState) {
      nodeState.textContent = '第一次保存时自动进文库';
      nodeState.title = '将存入：' + I.meta.type + ' / ' + I.meta.group + (I.meta.sub ? ' / ' + I.meta.sub : '');
    }
    const nodeHint = $('#immNodeHint');
    if (nodeHint) nodeHint.textContent = '将存入：' + I.meta.type + ' / ' + I.meta.group + (I.meta.sub ? ' / ' + I.meta.sub : '') + '；写下的正文会同时出现在这一章和文库文章里';
    autosizeTitle();
    updateCount();
    renderMetaLine();
    renderCrumb();
    renderLoc();
    $('#immPath').textContent = '写作台章节 · 还没进文库';
    setState('未保存');
    if (!wasOpen) $('#immStage').scrollTop = 0;
    requestAnimationFrame(() => {
      $('#immBody').focus();
      const range = document.createRange();
      range.selectNodeContents($('#immBody'));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      $('#immBody').scrollTop = 0;
      $('#immStage').scrollTop = 0;
    });
  }

  /* ---------------- saving ---------------- */
  function defaultTitle() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return '无题 · ' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function updateNodeCache(article) {
    if (!article || !window.Gen6Projects) return;
    const hit = window.Gen6Projects.findNode(article.id);
    if (!hit) return;
    hit.node.title = article.title;
    hit.node.body = article.html || '';
    hit.node.docHash = article.bodyHash || '';
    hit.node.words = article.words;
    hit.project.updatedAt = Date.now();
    S.save();
  }

  async function saveNow(options) {
    const opts = options || {};
    if (!I.open) return false;
    if (I.mode === 'draft') return saveDraftNow(opts);
    if (I.readOnly) return false;
    if (I.saving) { I.pending = true; return false; }
    const titleEl = $('#immTitle'), bodyEl = $('#immBody');
    const html = bodyEl.innerHTML || '';
    const text = U.htmlToText(html);
    let title = titleEl.value.replace(/\r?\n/g, ' ').trim();
    if (!I.docId && !title && !text) return false;
    if (!I.docId && !title) {
      title = defaultTitle();
      titleEl.value = title;
      autosizeTitle();
    }
    I.saving = true;
    setState('正在保存…');
    try {
      if (!I.docId) {
        const fromNode = I.mode === 'node';
        const meta = fromNode ? I.meta : readNewbar();
        const tags = parseTags(meta.tags);
        if (!tags.length) {
          tags.push(meta.group || meta.type);
          if (meta.sub) tags.push(meta.sub);
        }
        const result = await window.Gen6Api.create({
          dbId: meta.dbId || '',
          type: meta.type,
          title,
          cats: catsOf(meta),
          tags,
          status: '草稿',
          body: window.Gen6Bridge.markdownOf(title, html)
        });
        const article = result.article;
        if (fromNode) linkNodeArticle(article);
        I.docId = article.id;
        I.article = article;
        I.bodyHash = article.bodyHash;
        I.meta = metaFromArticle(article);
        I.meta.status = article.status;
        I.dirty = false;
        I.mode = 'article';
        I.nodeId = null;
        I.projectId = null;
        I.readOnly = false;
        window.__gen6Editing = article.id;
        history.replaceState(history.state, '', writePath(article.id));
        $('#immNewbar').hidden = true;
        $('#immNodebar').hidden = true;
        $('#immDraftbar').hidden = true;
        titleEl.value = article.title;
        titleEl.readOnly = false;
        bodyEl.contentEditable = 'true';
        autosizeTitle();
        $('#immPath').textContent = article.path;
        renderMetaLine();
        renderCrumb();
        renderLoc();
        if (!fromNode) saveLastMeta();
        updateNodeCache(article);
        setState('已保存 ' + nowLabel(), 'ok');
        U.toast((fromNode ? '章节已进入文库：' : '已新建：') + article.path, 'check');
        window.Gen6Bridge.refreshLibrary({ silent: true, delay: 120 });
        return true;
      }

      if (!I.dirty && !opts.force) { setState('已保存', 'ok'); return true; }
      const meta = I.meta || metaFromArticle(I.article);
      const tags = parseTags(meta.tags);
      if (!tags.length) tags.push(meta.group || meta.type);
      const result = await window.Gen6Bridge.saveDoc({
        id: I.docId,
        title,
        html,
        cats: catsOf(meta),
        tags,
        status: meta.status || '草稿',
        baseHash: I.bodyHash
      }, { force: !!opts.force });
      if (result && result.ok) {
        const article = result.article;
        I.article = article;
        I.bodyHash = article.bodyHash;
        I.meta = metaFromArticle(article);
        I.meta.status = article.status;
        I.dirty = false;
        if (titleEl.value.trim() !== article.title) titleEl.value = article.title;
        autosizeTitle();
        $('#immPath').textContent = article.path;
        renderMetaLine();
        renderCrumb();
        renderLoc();
        saveLastMeta();
        updateNodeCache(article);
        setState('已保存 ' + nowLabel(), 'ok');
        window.Gen6Bridge.refreshLibrary({ silent: true, delay: 300 });
        return true;
      }
      if (result && result.reloaded) {
        I.article = result.current;
        I.bodyHash = result.current.bodyHash;
        titleEl.value = result.current.title;
        bodyEl.innerHTML = result.current.html || '';
        I.meta = metaFromArticle(result.current);
        I.dirty = false;
        autosizeTitle();
        updateCount();
        renderMetaLine();
        renderCrumb();
        setState('已载入磁盘版本', 'ok');
        U.toast('已载入磁盘上的版本', 'refresh');
        return true;
      }
      if (result && (result.cancelled || result.frozen)) {
        setState(result.frozen ? '已冻结，未保存' : '有冲突，未保存', 'warn');
        return false;
      }
      setState('未保存', 'warn');
      return false;
    } catch (error) {
      console.warn(error);
      setState('保存失败，稍后重试', 'warn');
      if (!I.retryTimer) {
        I.retryTimer = setTimeout(() => {
          I.retryTimer = null;
          if (I.open && I.dirty) saveNow({ force: false });
        }, 6000);
      }
      return false;
    } finally {
      I.saving = false;
      if (I.pending) {
        I.pending = false;
        if (I.dirty) setTimeout(() => saveNow({ force: false }), 120);
      }
    }
  }

  function pushDraftHistory(draft) {
    if (!draft || !draft.id) return;
    const key = 'draftHistory.' + draft.id;
    const list = window.lsGet(key, []);
    const arr = Array.isArray(list) ? list : [];
    const markdown = String(draft.markdown || '');
    const last = arr[0];
    if (last && last.markdown === markdown && last.title === draft.title) return;
    arr.unshift({ time: new Date().toISOString(), title: draft.title || '无题速写', markdown });
    window.lsSet(key, arr.slice(0, 40));
  }

  async function saveDraftNow(options) {
    const opts = options || {};
    if (!I.draftId || !I.draft) return false;
    if (I.readOnly) return false;
    if (I.saving) { I.pending = true; return false; }
    clearTimeout(I.saveTimer);
    I.saveTimer = null;
    const titleEl = $('#immTitle');
    const title = String(titleEl.value || '').replace(/\r?\n/g, ' ').trim() || '无题速写';
    const markdown = U.htmlToMarkdown($('#immBody').innerHTML || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
    if (!I.dirty && !opts.force) return true;
    if (title === String(I.draft.title || '').trim() && markdown === String(I.draft.markdown || '')) {
      I.dirty = false;
      setState('已保存', 'ok');
      return true;
    }
    I.saving = true;
    setState('正在保存草稿…');
    try {
      const res = await window.Gen6Api.updateDraft(I.draftId, { title, markdown });
      const draft = (res && res.draft) || res;
      I.draft = draft;
      I.dirty = false;
      if (draft && draft.title && titleEl.value.trim() !== draft.title) titleEl.value = draft.title;
      pushDraftHistory(draft);
      setState('已保存 ' + nowLabel(), 'ok');
      updateDraftBar();
      renderLoc();
      return true;
    } catch (error) {
      I.dirty = true;
      setState('草稿保存失败，稍后重试', 'warn');
      U.toast(error.message || '草稿保存失败', 'alert');
      return false;
    } finally {
      I.saving = false;
      if (I.pending) {
        I.pending = false;
        if (I.dirty) setTimeout(() => saveNow({ force: false }), 120);
      }
    }
  }

  async function publishCurrentDraft() {
    if (!I.draftId || !I.draft) return;
    if (I.readOnly) {
      U.toast('这份草稿已经是只读快照，继续写请打开文章', 'info');
      return;
    }
    const saved = await saveDraftNow({ force: true });
    if (!saved) {
      U.toast('草稿还没保存成功，先别收入文库', 'alert');
      return;
    }
    const opener = window.Hub && window.Hub.openPublishDraft;
    if (!opener) {
      U.toast('收入文库面板没有载入', 'alert');
      return;
    }
    opener(I.draft, (article) => {
      I.readOnly = true;
      I.draft.publishedId = article.id;
      I.draft.updatedAt = new Date().toISOString();
      $('#immTitle').readOnly = true;
      $('#immBody').contentEditable = 'false';
      $('#immPath').textContent = '已收入文库 · 这份草稿只读';
      setState('已收入文库', 'ok');
      updateDraftBar();
      renderMetaLine();
      renderCrumb();
      renderLoc();
      window.Gen6Bridge.refreshLibrary({ silent: true, delay: 120 });
      if (window.Gen6Projects) window.Gen6Projects.syncAll({ quiet: true }).catch(() => {});
    });
  }

  function openDraftVersions() {
    if (!I.draft) return;
    const list = window.lsGet('draftHistory.' + I.draftId, []);
    const arr = Array.isArray(list) ? list : [];
    const rows = arr.length ? arr.map((item, i) => {
      const time = item.time ? new Date(item.time).toLocaleString('zh-CN', { hour12: false }) : '—';
      const words = U.countWords(item.markdown || '');
      return '<div class="hist-row">' +
        '<div class="hist-time">' + U.esc(time) + '</div>' +
        '<div class="hist-main"><b>' + U.esc(item.title || '无题') + '</b><p>' + U.esc(String(item.markdown || '').replace(/\s+/g, ' ').slice(0, 90) || '空白') + '</p></div>' +
        '<div class="hist-meta">' + U.fmt(words) + ' 字</div>' +
        '<button class="btn sm" data-dv="' + i + '">恢复</button></div>';
    }).join('') : '<div class="hub-empty">' + U.icon('history') + '<p>这份草稿还没有本机版本。每次保存都会留下一条记录。</p></div>';
    const m = U.openModal(
      '<div class="modal-head"><div><h3>本机版本 · ' + U.esc(I.draft.title || '草稿') + '</h3>' +
      '<p>按时间倒序排列，最多保留 40 个版本。恢复只改这份草稿，不会动文库。</p></div></div>' +
      '<div class="modal-body"><div class="hist-list">' + rows + '</div></div>' +
      '<div class="modal-foot"><span class="hint">草稿历史保存在这台设备</span><div class="foot-actions">' +
      '<button class="btn ghost" data-dv-clear>清空历史</button><button class="btn" data-dv-close>关闭</button></div></div>',
      'wide'
    );
    m.box.querySelector('[data-dv-close]').onclick = m.close;
    m.ov.onclick = (e) => { if (e.target === m.ov) m.close(); };
    m.box.querySelectorAll('[data-dv]').forEach((b) => {
      b.onclick = () => {
        const item = arr[+b.getAttribute('data-dv')];
        if (!item) return;
        m.close();
        $('#immTitle').value = item.title || '';
        $('#immBody').innerHTML = U.textToHtml(item.markdown || '');
        autosizeTitle();
        updateCount();
        I.dirty = true;
        setState('未保存 · 已恢复本机版本', 'warn');
        scheduleSave(600);
        U.toast('已恢复本机版本，正在保存', 'history');
      };
    });
    m.box.querySelector('[data-dv-clear]').onclick = () => {
      try { localStorage.removeItem('ws.draftHistory.' + I.draftId); } catch (e) { /* 忽略 */ }
      m.close();
      U.toast('本机草稿历史已清空', 'trash');
    };
  }

  async function deleteCurrentDraft() {
    if (!I.draft || !I.draftId) return;
    const ok = await U.confirmModal({
      title: '删除草稿「' + (I.draft.title || '无题') + '」？',
      desc: '只删除这份草稿，不影响已经收入文库的文章。',
      okText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      await window.Gen6Api.deleteDraft(I.draftId);
      try { localStorage.removeItem('ws.draftHistory.' + I.draftId); } catch (e) { /* 忽略 */ }
      I.dirty = false;
      closeUI();
      if (window.Hub && window.Hub.refreshDrafts && location.hash === '#/drafts') window.Hub.refreshDrafts();
      if (location.hash !== '#/drafts') location.hash = '#/drafts';
      else window.App.route();
      U.toast('草稿已删除', 'trash');
    } catch (error) {
      U.toast(error.message || '删除失败', 'alert');
    }
  }

  function scheduleSave(delay) {
    I.dirty = true;
    setState('未保存', 'warn');
    updateCount();
    clearTimeout(I.saveTimer);
    I.saveTimer = setTimeout(() => saveNow({ force: false }), delay == null ? 900 : delay);
  }

  async function flush() {
    clearTimeout(I.saveTimer);
    if (I.dirty) return saveNow({ force: false });
    return true;
  }

  /* ---------------- metadata modal ---------------- */
  function openMetaModal() {
    if (!I.meta) return;
    if (!window.MetaPicker) { U.toast('「存到哪里」选择器没有载入', 'alert'); return; }
    const meta = I.meta;
    window.MetaPicker.open({
      heading: '文章设定',
      desc: '改分类会让 md 文件移动到对应目录，目录和文库同时更新。',
      showTitle: true,
      title: $('#immTitle').value,
      dbId: meta.dbId || currentDbId(),
      allowDbChange: false,
      type: meta.type,
      group: meta.group,
      sub: meta.sub,
      tags: parseTags(meta.tags),
      status: meta.status || '草稿',
      statuses: STATUSES,
      okText: '保存设定',
      onConfirm: async (v) => {
        $('#immTitle').value = v.title;
        autosizeTitle();
        I.meta = Object.assign({}, meta, {
          type: v.type,
          group: v.group,
          sub: v.sub || (v.type === '小说' ? '未分卷' : ''),
          tags: v.tags.join('、'),
          status: v.status
        });
        if (!I.docId) {
          syncMetaInputs();
          saveLastMeta();
          renderMetaLine();
          renderCrumb();
          U.toast('设定已更新，第一次保存时会按这个位置建档', 'check');
          return true;
        }
        I.dirty = true;
        const saved = await saveNow({ force: true });
        renderMetaLine();
        renderCrumb();
        return saved;
      }
    });
  }

  /* ---------------- navigation ---------------- */
  function closeUI() {
    $('#immApp').hidden = true;
    document.body.classList.remove('mode-imm', 'imm-focus', 'imm-type', 'imm-drawer-open');
    I.open = false;
    I.focus = false;
    I.mode = 'article';
    I.draftId = null;
    I.draft = null;
    I.nodeId = null;
    I.projectId = null;
    I.readOnly = false;
    $('#immDraftbar').hidden = true;
    $('#immNodebar').hidden = true;
    $('#immTitle').readOnly = false;
    $('#immBody').contentEditable = 'true';
    toggleDrawer(false);
    window.__gen6Editing = '';
  }

  async function leave() {
    if (!I.open) return;
    clearTimeout(I.saveTimer);
    if (I.dirty) {
      const ok = await saveNow({ force: false });
      if (!ok) {
        U.toast(I.mode === 'draft' ? '草稿还有内容没保存成功' : '还有内容没有存进文件，已保留在页面上', 'alert');
      }
    }
    closeUI();
    I.returnHash = '';
  }

  function goBack() {
    let back = I.returnHash;
    if (!back) back = I.mode === 'draft' ? '#/drafts' : (I.projectId ? '#/w/' + encodeURIComponent(I.projectId) : '#/');
    if (location.hash === back) {
      leave().then(() => window.App.route());
    } else {
      location.hash = back;
    }
  }

  function openDoc(id, options) {
    const opts = options || {};
    I.returnHash = opts.returnTo != null ? opts.returnTo : (location.hash || '#/');
    const target = writePath(id);
    if (location.hash === target && I.open) {
      mount(id);
      return;
    }
    if (location.hash === target) window.App.route();
    else location.hash = target;
  }

  function openNew(options) {
    const opts = options || {};
    I.returnHash = opts.returnTo != null ? opts.returnTo : (location.hash || '#/');
    I.pendingNew = true;
    const query = new URLSearchParams();
    Object.keys(opts.params || {}).forEach((key) => {
      if (opts.params[key] != null && opts.params[key] !== '') query.set(key, opts.params[key]);
    });
    const target = '#/write' + (query.toString() ? '?' + query.toString() : '');
    if (location.hash === target) mount(null, { query });
    else location.hash = target;
  }

  function openDraft(id, options) {
    const opts = options || {};
    const fromHash = location.hash && !/^#\/draft(?:s|\/)/.test(location.hash) ? location.hash : '';
    I.returnHash = opts.returnTo != null ? opts.returnTo : (fromHash || sessionStorage.getItem('ws.draftReturn') || '#/drafts');
    const target = draftPath(id);
    if (location.hash === target && I.open) { mountDraft(id); return; }
    if (location.hash === target) window.App.route();
    else location.hash = target;
  }

  function openNode(nodeId, projectId, options) {
    const opts = options || {};
    I.returnHash = opts.returnTo != null ? opts.returnTo : (location.hash || '#/');
    const target = nodePath(nodeId, projectId);
    if (location.hash === target && I.open) { mountNode(nodeId, projectId, opts); return; }
    if (location.hash === target) window.App.route();
    else location.hash = target;
  }

  function enterFromRoute() {
    const { path, query } = splitHash();
    const nodeId = query.get('node');
    if (nodeId) {
      if (!I.returnHash) I.returnHash = '#/';
      const projectId = query.get('project') || '';
      if (I.open && I.mode === 'node' && I.nodeId === nodeId && (!projectId || I.projectId === projectId)) return;
      if (I.open && I.mode === 'article' && I.nodeId === nodeId) return;
      mountNode(nodeId, projectId);
      return;
    }
    const draftMatch = path.match(/^\/draft\/([^/]+)$/);
    if (draftMatch && draftMatch[1] !== 'new') {
      if (!I.returnHash) I.returnHash = sessionStorage.getItem('ws.draftReturn') || '#/drafts';
      const draftId = safeDecode(draftMatch[1]);
      if (I.open && I.mode === 'draft' && I.draftId === draftId) return;
      mountDraft(draftId);
      return;
    }
    const match = path.match(/^\/write(?:\/(.+))?$/);
    if (!match) return;
    if (!I.returnHash) I.returnHash = '#/';
    const id = match[1] ? safeDecode(match[1]) : '';
    if (I.open && I.mode === 'article' && ((id && id === I.docId) || (!id && !I.docId))) return;
    mount(id || null, { query });
  }

  async function switchDoc(id) {
    if (id === I.docId) { toggleDrawer(false); return; }
    if (I.dirty) await saveNow({ force: false });
    toggleDrawer(false);
    await mount(id);
    history.replaceState(history.state, '', writePath(id));
  }

  function newFromDrawer() {
    const meta = I.meta ? Object.assign({}, I.meta) : defaultMeta();
    if (I.dirty) saveNow({ force: false });
    toggleDrawer(false);
    mount(null, { query: new URLSearchParams() });
    I.meta = meta;
    syncMetaInputs();
    renderMetaLine();
    renderCrumb();
    history.replaceState(history.state, '', '#/write');
  }

  /* ---------------- shortcuts ---------------- */
  function currentBlock() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node = sel.getRangeAt(0).startContainer;
    const root = $('#immBody');
    while (node && node !== root) {
      if (node.nodeType === 1 && node.parentNode === root) return node;
      node = node.parentNode;
    }
    return node === root ? null : null;
  }

  function caretToEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertPlainText(text) {
    const bodyEl = $('#immBody');
    if (!bodyEl || !I.open || !text) return false;
    let sel = window.getSelection();
    const inBody = sel && sel.rangeCount && bodyEl.contains(sel.getRangeAt(0).startContainer);
    if (!inBody) {
      bodyEl.focus();
      caretToEnd(bodyEl);
      sel = window.getSelection();
    }
    if (!sel || !sel.rangeCount) return false;
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      String(text).replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
        if (i) frag.appendChild(document.createElement('br'));
        frag.appendChild(document.createTextNode(line));
      });
      const last = frag.lastChild;
      range.insertNode(frag);
      if (last) {
        const after = document.createRange();
        after.setStartAfter(last);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      }
      bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
      ok = true;
    }
    return ok;
  }

  async function pasteFromClipboard() {
    if (!I.open) return;
    if (I.readOnly) {
      U.toast('这是只读快照，继续写请先打开文章', 'lock');
      return;
    }
    const bodyEl = $('#immBody');
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      U.toast('这个浏览器要长按正文或按 Ctrl+V 粘贴', 'info');
      if (bodyEl) bodyEl.focus();
      return;
    }
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch (error) {
      U.toast('浏览器没有允许读取剪贴板，请长按正文或按 Ctrl+V', 'alert');
      if (bodyEl) bodyEl.focus();
      return;
    }
    if (!text) {
      U.toast('剪贴板里没有可粘贴的文字', 'info');
      return;
    }
    if (insertPlainText(text)) U.toast('已粘贴到光标处', 'check');
  }

  function typewriterFollow() {
    if (!I.typewriter || !I.open) return;
    const stage = $('#immStage');
    const sel = window.getSelection();
    if (!stage || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.height && !rect.width)) return;
    const box = stage.getBoundingClientRect();
    const target = box.top + box.height * 0.42;
    const delta = rect.top - target;
    if (delta > box.height * 0.12 || delta < -box.height * 0.3) {
      stage.scrollTop += delta;
    }
  }

  function toggleFocus(force) {
    I.focus = typeof force === 'boolean' ? force : !I.focus;
    document.body.classList.toggle('imm-focus', I.focus);
    U.toast(I.focus ? '专注模式 · 右上角可退出' : '已退出专注', I.focus ? 'eye' : 'layout');
  }

  function toggleTypewriter(force) {
    I.typewriter = typeof force === 'boolean' ? force : !I.typewriter;
    window.lsSet('6.typewriter', I.typewriter);
    document.body.classList.toggle('imm-type', I.typewriter);
    U.toast(I.typewriter ? '打字机模式：光标保持居中' : '已关闭打字机模式', 'type');
    if (I.typewriter) typewriterFollow();
  }

  function mobileViewItems() {
    if (!U.isMobile()) return [];
    return [
      { label: '专注模式：' + (I.focus ? '开' : '关'), icon: 'eye', fn: () => toggleFocus() },
      { label: '打字机模式：' + (I.typewriter ? '开' : '关'), icon: 'type', fn: () => toggleTypewriter() }
    ];
  }

  function markdownShortcut(e) {
    if (e.key !== ' ' || e.ctrlKey || e.metaKey) return false;
    const block = currentBlock();
    if (!block) return false;
    const text = block.textContent;
    let tag = '';
    if (/^#{1,3}$/.test(text)) tag = 'h' + text.length;
    else if (text === '>') tag = 'blockquote';
    else if (text === '-' || text === '*') tag = 'ul';
    else if (/^1\.$/.test(text)) tag = 'ol';
    if (!tag) return false;
    e.preventDefault();
    block.textContent = '';
    if (tag === 'ul' || tag === 'ol') {
      document.execCommand(tag === 'ul' ? 'insertUnorderedList' : 'insertOrderedList', false, null);
    } else {
      document.execCommand('formatBlock', false, '<' + tag + '>');
    }
    const next = currentBlock();
    if (next) caretToEnd(next);
    I.dirty = true;
    scheduleSave(1000);
    return true;
  }

  function bindEditor() {
    const titleEl = $('#immTitle'), bodyEl = $('#immBody');

    titleEl.addEventListener('input', () => {
      autosizeTitle();
      renderLoc();
      if (!I.docId) renderCrumb();
      scheduleSave(1000);
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        bodyEl.focus();
        const range = document.createRange();
        range.selectNodeContents(bodyEl);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    bodyEl.addEventListener('input', () => {
      updateCount();
      scheduleSave(900);
    });
    bodyEl.addEventListener('paste', (e) => {
      const cd = e.clipboardData || window.clipboardData;
      let text = cd ? cd.getData('text/plain') : '';
      const html = cd ? cd.getData('text/html') : '';
      if (!text && html) text = U.htmlToText(html);
      if (!text) return;
      e.preventDefault();
      insertPlainText(text);
    });
    bodyEl.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        clearTimeout(I.saveTimer);
        saveNow({ force: true });
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        return;
      }
      if (markdownShortcut(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        const block = currentBlock();
        if (block && /^(h[1-3]|blockquote)$/i.test(block.tagName)) {
          if (!block.nextSibling) {
            e.preventDefault();
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            block.parentNode.insertBefore(p, block.nextSibling);
            caretToEnd(p);
          }
        }
      }
    });
    bodyEl.addEventListener('keyup', typewriterFollow);
    bodyEl.addEventListener('mouseup', typewriterFollow);

    document.addEventListener('selectionchange', () => {
      if (!I.open || !I.typewriter) return;
      if (document.activeElement === bodyEl) requestAnimationFrame(typewriterFollow);
    });

    $('#immBack').onclick = goBack;
    const focusExit = $('#immFocusExit');
    if (focusExit) focusExit.onclick = () => toggleFocus(false);

    $$('#immApp [data-imm]').forEach((btn) => {
      btn.onclick = async () => {
        const act = btn.getAttribute('data-imm');
        if (act === 'files') toggleDrawer();
        else if (act === 'meta') openMetaModal();
        else if (act === 'focus') toggleFocus();
        else if (act === 'type') toggleTypewriter();
        else if (act === 'map') {
          if (I.dirty) await saveNow({ force: false });
          if (!I.docId) { U.toast('先写一点内容，保存后再进导图', 'info'); return; }
          window.Gen6Bridge.openInMap(I.docId);
        } else if (act === 'read') {
          if (I.dirty) await saveNow({ force: false });
          if (!I.docId) { U.toast('先写一点内容，保存后再阅读', 'info'); return; }
          location.hash = '#/a/' + encodeURIComponent(I.docId);
        }
      };
    });

    const draftPublish = $('#immDraftPublish');
    if (draftPublish) draftPublish.onclick = () => publishCurrentDraft();
    const draftContinue = $('#immDraftContinue');
    if (draftContinue) {
      draftContinue.onclick = () => {
        if (!I.draft || !I.draft.publishedId) return;
        openDoc(I.draft.publishedId, { returnTo: '#/drafts' });
      };
    }

    $('#immMore').onclick = (e) => {
      const fcOn = !!(window.FocusCursor && window.FocusCursor.state.enabled);
      if (I.mode === 'draft') {
        const draftItems = [
          { head: '草稿 · ' + ((I.draft && I.draft.title) || '无题') },
          I.readOnly
            ? { label: '继续写这篇文章', icon: 'feather', fn: () => openDoc(I.draft.publishedId, { returnTo: '#/drafts' }) }
            : { label: '收入文库', icon: 'book', fn: publishCurrentDraft },
          { label: '本机版本', icon: 'history', fn: openDraftVersions },
          { label: '下载 Markdown', icon: 'download', fn: async () => {
            if (!I.readOnly) await saveDraftNow({ force: true });
            const draft = I.draft || {};
            const title = titleEl.value.trim() || draft.title || '无题';
            U.download(title.replace(/[\\/:*?"<>|]/g, '_') + '.md', '# ' + title + '\n\n' + (draft.markdown || ''), 'text/markdown');
            U.toast('Markdown 已开始下载', 'download');
          } },
          { label: '复制正文', icon: 'note', fn: () => { U.copyText(U.htmlToText(bodyEl.innerHTML)); U.toast('正文已复制'); } },
          { sep: true },
          { label: '写作光标：' + (fcOn ? '开' : '关'), icon: 'quill', fn: () => {
            if (!window.FocusCursor) return;
            const next = !window.FocusCursor.state.enabled;
            window.FocusCursor.toggle(next);
            U.toast(next ? '写作光标已启用：只有当前段落保持清晰' : '已关闭写作光标', next ? 'eye' : 'x');
          } },
          ...mobileViewItems(),
          { sep: true },
          { label: '删除草稿', icon: 'trash', danger: true, fn: deleteCurrentDraft }
        ];
        if (!I.readOnly) draftItems.splice(5, 0, { label: '粘贴正文', icon: 'paste', fn: pasteFromClipboard });
        window.Writer.popMenu(e.currentTarget, draftItems, 230);
        return;
      }
      if (I.mode === 'node') {
        const nodeItems = [
          { head: '写作台章节' },
          { label: '下载 Markdown', icon: 'download', fn: () => {
            const title = titleEl.value.trim() || '无题';
            U.download(title.replace(/[\\/:*?"<>|]/g, '_') + '.md', '# ' + title + '\n\n' + U.htmlToMarkdown(bodyEl.innerHTML), 'text/markdown');
            U.toast('Markdown 已开始下载', 'download');
          } },
          { label: '复制正文', icon: 'note', fn: () => { U.copyText(U.htmlToText(bodyEl.innerHTML)); U.toast('正文已复制'); } },
          { label: '粘贴正文', icon: 'paste', fn: pasteFromClipboard },
          { label: '写作光标：' + (fcOn ? '开' : '关'), icon: 'quill', fn: () => {
            if (!window.FocusCursor) return;
            const next = !window.FocusCursor.state.enabled;
            window.FocusCursor.toggle(next);
            U.toast(next ? '写作光标已启用：只有当前段落保持清晰' : '已关闭写作光标', next ? 'eye' : 'x');
          } },
          ...mobileViewItems(),
          { sep: true },
          { label: '回到写作台', icon: 'tree', fn: () => { location.hash = '#/w/' + encodeURIComponent(I.projectId || ''); } }
        ];
        window.Writer.popMenu(e.currentTarget, nodeItems, 230);
        return;
      }
      const items = [
        { head: '当前文章' },
        { label: '导出 Markdown', icon: 'download', fn: () => {
          const title = titleEl.value.trim() || '无题';
          U.download(title.replace(/[\\/:*?"<>|]/g, '_') + '.md', window.Gen6Bridge.markdownOf(title, bodyEl.innerHTML), 'text/markdown');
          U.toast('Markdown 已开始下载', 'download');
        } },
        { label: '复制正文', icon: 'note', fn: () => { U.copyText(U.htmlToText(bodyEl.innerHTML)); U.toast('正文已复制'); } },
        { label: '粘贴正文', icon: 'paste', fn: pasteFromClipboard },
        { label: '写作光标：' + (fcOn ? '开' : '关'), icon: 'quill', fn: () => {
          if (!window.FocusCursor) return;
          const next = !window.FocusCursor.state.enabled;
          window.FocusCursor.toggle(next);
          U.toast(next ? '写作光标已启用：只有当前段落保持清晰' : '已关闭写作光标', next ? 'eye' : 'x');
        } },
        ...mobileViewItems(),
        { sep: true },
        { label: '新建一篇（同位置）', icon: 'plus', fn: newFromDrawer },
        { label: '文章目录', icon: 'folder', fn: () => toggleDrawer(true) },
        { label: '在写作台打开', icon: 'tree', fn: () => {
          if (I.docId) window.Gen6Bridge.openInMap(I.docId);
          else U.toast('这篇还没有保存', 'info');
        } }
      ];
      window.Writer.popMenu(e.currentTarget, items, 230);
    };

    $('#immNewDoc').onclick = newFromDrawer;
    $('#immDrawerClose').onclick = () => toggleDrawer(false);
    $('#immFind').addEventListener('input', (e) => renderDrawer(e.target.value));
    $('#immDrawerList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-imfile]');
      if (btn) switchDoc(btn.getAttribute('data-imfile'));
    });

    bindNewbar();
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!I.open) return;
      if (e.key === 'Escape') {
        if (!$('#immDrawer').hidden) { toggleDrawer(false); e.preventDefault(); return; }
        if (I.focus) {
          I.focus = false;
          document.body.classList.remove('imm-focus');
          e.preventDefault();
          return;
        }
        if (!$('#modalOverlay').hidden) return;
        e.preventDefault();
        goBack();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (I.open && I.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function init() {
    if (!$('#immApp')) return;
    I.typewriter = !!window.lsGet('6.typewriter', false);
    buildTypeSelect();
    bindEditor();
    bindBars();
    bindKeys();
    updateCount();
    window.Immersive = {
      enterFromRoute, openDoc, openNew, openDraft, openNode, leave, flush, isOpen: () => I.open, closeUI,
      get docId() { return I.docId; },
      get mode() { return I.mode; },
      get dirty() { return I.dirty; }
    };
  }

  window.ImmersiveInit = init;
})();
