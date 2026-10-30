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
    busy: false
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
    if (!catsOfType(meta.type, meta.dbId).some((c) => c.name === meta.group)) {
      const first = firstMeta(meta.type, meta.dbId);
      meta.group = first ? first.group : '未分类';
      meta.sub = '';
    }
    const sub = query.get('sub') || query.get('volume');
    if (sub) meta.sub = sub;
    if (!meta.sub) meta.sub = meta.type === '小说' ? '未分卷' : ((subNames(meta.type, meta.group, meta.dbId)[0]) || '');
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
    if (I.docId) {
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
        const meta = readNewbar();
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
        I.docId = article.id;
        I.article = article;
        I.bodyHash = article.bodyHash;
        I.meta = metaFromArticle(article);
        I.meta.status = article.status;
        I.dirty = false;
        window.__gen6Editing = article.id;
        history.replaceState(history.state, '', writePath(article.id));
        $('#immNewbar').hidden = true;
        titleEl.value = article.title;
        autosizeTitle();
        $('#immPath').textContent = article.path;
        renderMetaLine();
        renderCrumb();
        renderLoc();
        saveLastMeta();
        updateNodeCache(article);
        setState('已保存 ' + nowLabel(), 'ok');
        U.toast('已新建：' + article.path, 'check');
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
    const meta = I.meta;
    const db = D.db(meta.dbId);
    const m = U.openModal(
      '<div class="modal-head"><div><h3>文章设定</h3><p>改分类会让 md 文件移动到对应目录，目录和文库同时更新。</p></div></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label>标题</label><input class="input" id="mmTitle" value="' + U.esc($('#immTitle').value) + '"></div>' +
      '<div class="field"><label>所属数据库</label><div class="input-static db-static">' +
      '<span class="dot" style="background:' + (db ? db.color : '#8A9099') + '"></span>' + U.esc(db ? db.name : '未指定') +
      '<span class="hint">要换库请用「更多 · 移动 / 复制」</span></div></div>' +
      '<div class="field"><label>类型</label><select class="input" id="mmType">' +
      TYPES.map((t) => '<option' + (t === meta.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      '<div class="field-2col">' +
      '<div class="field"><label id="mmGroupLabel">分类 / 作品</label><input class="input" id="mmGroup" list="mmGroupList" value="' + U.esc(meta.group) + '"><datalist id="mmGroupList"></datalist></div>' +
      '<div class="field"><label id="mmSubLabel">子类 / 卷</label><input class="input" id="mmSub" list="mmSubList" value="' + U.esc(meta.sub) + '"><datalist id="mmSubList"></datalist></div>' +
      '</div>' +
      '<div class="field"><label>标签（逗号或顿号分隔）</label><input class="input" id="mmTags" value="' + U.esc(meta.tags || '') + '"></div>' +
      '<div class="field"><label>状态</label><select class="input" id="mmStatus">' +
      STATUSES.map((s) => '<option' + (s === (meta.status || '草稿') ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="modal-foot"><div class="foot-actions">' +
      '<button class="btn ghost" data-cancel>取消</button>' +
      '<button class="btn primary" data-ok>保存设定</button>' +
      '</div></div>'
    );
    const typeEl = m.box.querySelector('#mmType');
    const groupEl = m.box.querySelector('#mmGroup');
    const subEl = m.box.querySelector('#mmSub');
    const fill = () => {
      const type = typeEl.value;
      fillListIn(m.box.querySelector('#mmGroupList'), groupNames(type));
      fillListIn(m.box.querySelector('#mmSubList'), subNames(type, groupEl.value.trim()));
      const novel = type === '小说';
      m.box.querySelector('#mmGroupLabel').textContent = novel ? '作品' : '分类';
      m.box.querySelector('#mmSubLabel').textContent = novel ? '卷' : '子类';
    };
    function fillListIn(el, values) { el.innerHTML = values.map((v) => '<option value="' + U.esc(v) + '"></option>').join(''); }
    typeEl.onchange = () => {
      const groups = groupNames(typeEl.value);
      if (!groups.includes(groupEl.value.trim())) groupEl.value = groups[0] || '未分类';
      const subs = subNames(typeEl.value, groupEl.value.trim());
      subEl.value = subs[0] || (typeEl.value === '小说' ? '未分卷' : '');
      fill();
    };
    groupEl.addEventListener('input', fill);
    fill();
    m.box.querySelector('[data-cancel]').onclick = m.close;
    m.box.querySelector('[data-ok]').onclick = async () => {
      const next = {
        type: typeEl.value,
        group: groupEl.value.trim() || '未分类',
        sub: subEl.value.trim() || (typeEl.value === '小说' ? '未分卷' : ''),
        tags: m.box.querySelector('#mmTags').value.trim(),
        status: m.box.querySelector('#mmStatus').value
      };
      const title = m.box.querySelector('#mmTitle').value.trim();
      if (!title) { U.toast('标题不能为空', 'alert'); return; }
      m.close();
      $('#immTitle').value = title;
      autosizeTitle();
      I.meta = Object.assign({}, meta, next);
      if (!I.docId) {
        syncMetaInputs();
        saveLastMeta();
        renderMetaLine();
        renderCrumb();
        U.toast('设定已更新，第一次保存时会按这个位置建档', 'check');
        return;
      }
      I.dirty = true;
      await saveNow({ force: true });
      if (I.docId) {
        const rec = D.get(I.docId);
        if (rec) I.article = Object.assign({}, I.article, rec, { html: $('#immBody').innerHTML });
      }
      renderMetaLine();
      renderCrumb();
    };
  }

  /* ---------------- navigation ---------------- */
  function closeUI() {
    $('#immApp').hidden = true;
    document.body.classList.remove('mode-imm', 'imm-focus', 'imm-type', 'imm-drawer-open');
    I.open = false;
    I.focus = false;
    toggleDrawer(false);
    window.__gen6Editing = '';
  }

  async function leave() {
    if (!I.open) return;
    clearTimeout(I.saveTimer);
    if (I.dirty) {
      const ok = await saveNow({ force: false });
      if (!ok) {
        U.toast('还有内容没有存进文件，已保留在页面上', 'alert');
      }
    }
    closeUI();
    I.returnHash = '';
  }

  function goBack() {
    const back = I.returnHash || '#/';
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

  function enterFromRoute() {
    const { path, query } = splitHash();
    const match = path.match(/^\/write(?:\/(.+))?$/);
    if (!match) return;
    if (!I.returnHash) I.returnHash = '#/';
    const id = match[1] ? safeDecode(match[1]) : '';
    if (I.open && ((id && id === I.docId) || (!id && !I.docId))) return;
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
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
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

    $$('#immApp [data-imm]').forEach((btn) => {
      btn.onclick = async () => {
        const act = btn.getAttribute('data-imm');
        if (act === 'files') toggleDrawer();
        else if (act === 'meta') openMetaModal();
        else if (act === 'focus') {
          I.focus = !I.focus;
          document.body.classList.toggle('imm-focus', I.focus);
          U.toast(I.focus ? '专注模式 · Esc 退出' : '已退出专注', I.focus ? 'eye' : 'layout');
        } else if (act === 'type') {
          I.typewriter = !I.typewriter;
          window.lsSet('6.typewriter', I.typewriter);
          document.body.classList.toggle('imm-type', I.typewriter);
          U.toast(I.typewriter ? '打字机模式：光标保持居中' : '已关闭打字机模式', 'type');
          if (I.typewriter) typewriterFollow();
        } else if (act === 'map') {
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

    $('#immMore').onclick = (e) => {
      const fcOn = !!(window.FocusCursor && window.FocusCursor.state.enabled);
      const items = [
        { head: '当前文章' },
        { label: '导出 Markdown', icon: 'download', fn: () => {
          const title = titleEl.value.trim() || '无题';
          U.download(title.replace(/[\\/:*?"<>|]/g, '_') + '.md', window.Gen6Bridge.markdownOf(title, bodyEl.innerHTML), 'text/markdown');
          U.toast('Markdown 已开始下载', 'download');
        } },
        { label: '复制正文', icon: 'note', fn: () => { U.copyText(U.htmlToText(bodyEl.innerHTML)); U.toast('正文已复制'); } },
        { label: '写作光标：' + (fcOn ? '开' : '关'), icon: 'quill', fn: () => {
          if (!window.FocusCursor) return;
          const next = !window.FocusCursor.state.enabled;
          window.FocusCursor.toggle(next);
          U.toast(next ? '写作光标已启用：只有当前段落保持清晰' : '已关闭写作光标', next ? 'eye' : 'x');
        } },
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
    bindKeys();
    updateCount();
    window.Immersive = {
      enterFromRoute, openDoc, openNew, leave, flush, isOpen: () => I.open, closeUI,
      get docId() { return I.docId; },
      get dirty() { return I.dirty; }
    };
  }

  window.ImmersiveInit = init;
})();
