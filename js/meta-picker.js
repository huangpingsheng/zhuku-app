/* ============================================================
   meta-picker.js · 分类 / 子类 / 标签 / 状态 联动选择器
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, D = window.LibData;
  const TYPES = ['小说', '资料', '素材', '毕设'];
  const STATUS_DEFAULT = ['草稿', '待定', '定稿'];

  function parseTags(value) {
    if (Array.isArray(value)) return value.map((x) => String(x || '').trim()).filter(Boolean);
    return String(value || '').split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
  }

  function tagIndex() {
    const map = new Map();
    (D.files || []).forEach((f) => (f.tags || []).forEach((t) => {
      const name = String(t || '').trim();
      if (name) map.set(name, (map.get(name) || 0) + 1);
    }));
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
  }

  function catsFor(dbId, extra) {
    const list = (D.cats || []).filter((c) => !dbId || !c.dbId || c.dbId === dbId);
    return list.concat(extra || []);
  }

  function findCat(dbId, group, type, extra) {
    return catsFor(dbId, extra).find((c) => c.name === group && (!type || c.type === type)) || null;
  }

  function open(options) {
    const opts = options || {};
    D.init();
    const databases = (D.databases || []).slice();
    if (!databases.length) { U.toast('没有可用的数据库', 'alert'); return Promise.resolve(null); }

    let dbId = opts.dbId && D.db(opts.dbId) ? opts.dbId : '';
    if (!dbId) dbId = D.dbFilter !== 'all' && D.db(D.dbFilter) ? D.dbFilter : databases[0].id;

    const extra = [];
    const extraSubs = {};
    const subsNow = (c) => ((c && c.subs) || []).concat(extraSubs[c && c.id] || []);
    let cat = findCat(dbId, opts.group, opts.type, extra);
    let type = (cat && cat.type) || (TYPES.includes(opts.type) ? opts.type : '资料');
    if (!cat) cat = catsFor(dbId, extra).find((c) => c.type === type) || catsFor(dbId, extra)[0] || null;
    if (cat) type = cat.type;
    let sub = opts.sub != null ? String(opts.sub) : '';
    if (cat) {
      if (sub && !subsNow(cat).some((s) => s.name === sub)) sub = '';
      if (sub === '' && opts.sub == null && subsNow(cat).length) sub = subsNow(cat)[0].name;
    }
    const statuses = Array.isArray(opts.statuses) && opts.statuses.length ? opts.statuses : STATUS_DEFAULT;

    const state = {
      dbId, type, catId: cat ? cat.id : '', sub,
      tags: parseTags(opts.tags),
      status: statuses.includes(opts.status) ? opts.status : statuses[0],
      title: String(opts.title || '')
    };

    const db = D.db(state.dbId) || databases[0];
    const tagPool = tagIndex();
    const showDb = databases.length > 1 && opts.allowDbChange !== false;
    const canCreate = opts.allowCreate !== false;

    function catsNow() { return catsFor(state.dbId, extra); }
    function catNow() { return catsNow().find((c) => c.id === state.catId) || null; }
    function isNewCat(c) { return !!(c && /^__new__/.test(String(c.id))); }

    function dbButtons() {
      if (!showDb) {
        return '<div class="mp-db-static"><span class="mp-db-dot" style="background:' + U.esc(db.color || '#8A9099') + '"></span>' +
          U.esc(db.short || db.name) + '<span class="mp-db-note">' +
          (opts.allowDbChange === false ? '要换库请用「更多 · 移动 / 复制」' : '文章会存进这个库') + '</span></div>';
      }
      return '<div class="mp-db-choice">' + databases.map((d) =>
        '<button type="button" data-mp-db="' + U.esc(d.id) + '" class="' + (d.id === state.dbId ? 'on' : '') + '" style="--db:' + U.esc(d.color || '#8A9099') + '">' +
        '<span class="mp-db-dot" style="background:' + U.esc(d.color || '#8A9099') + '"></span>' +
        '<span class="mp-db-name">' + U.esc(d.short || d.name) + '</span>' +
        '<span class="mp-db-n">' + U.fmt(d.stats ? d.stats.files : 0) + ' 篇</span></button>').join('') + '</div>';
    }

    function catOptions() {
      let h = '';
      TYPES.forEach((t) => {
        const list = catsNow().filter((c) => c.type === t);
        if (!list.length) return;
        h += '<optgroup label="' + t + '">' + list.map((c) =>
          '<option value="' + U.esc(c.id) + '"' + (c.id === state.catId ? ' selected' : '') + '>' +
          U.esc(c.name) + (isNewCat(c) ? '（新建）' : '') + '</option>').join('') + '</optgroup>';
      });
      if (canCreate) h += '<option value="__newcat__">＋ 新建分类…</option>';
      return h;
    }

    function subOptions() {
      const c = catNow();
      if (!c) return '<option value="">（还没有分类）</option>';
      const blank = c.type === '小说' ? '（未分卷）' : '（不分子类）';
      let h = '<option value=""' + (state.sub ? '' : ' selected') + '>' + blank + '</option>';
      h += subsNow(c).map((s) =>
        '<option value="' + U.esc(s.name) + '"' + (s.name === state.sub ? ' selected' : '') + '>' + U.esc(s.name) + '</option>').join('');
      if (canCreate) h += '<option value="__newsub__">＋ 新建' + (c.type === '小说' ? '卷' : '子类') + '…</option>';
      return h;
    }

    function chipHtml() {
      return state.tags.map((t) =>
        '<span class="mp-chip" data-mp-tag="' + U.esc(t) + '">' + U.esc(t) +
        '<button type="button" data-mp-tag-del="' + U.esc(t) + '" aria-label="移除">×</button></span>').join('');
    }

    function confirmLine() {
      const c = catNow();
      const dbNow = D.db(state.dbId) || db;
      const parts = [dbNow ? (dbNow.short || dbNow.name) : '默认库'];
      parts.push(state.type || '资料');
      if (c) parts.push(c.name + (isNewCat(c) ? '（新建）' : ''));
      if (state.sub) parts.push(state.sub);
      return '将写入：<b>' + U.esc(parts.join(' / ')) + '</b>';
    }

    const titleField = opts.showTitle
      ? '<div class="field"><label>标题</label><input class="input" id="mpTitle" maxlength="120" autocomplete="off" value="' + U.esc(state.title) + '"></div>'
      : '';

    const m = U.openModal(
      '<div class="modal-head"><div><h3>' + U.esc(opts.heading || '存到哪里') + '</h3>' +
      (opts.desc ? '<p>' + U.esc(opts.desc) + '</p>' : '') + '</div></div>' +
      '<div class="modal-body mp-body">' +
      titleField +
      '<div class="mp-db-block"><label class="mp-label">存到哪个库</label>' + dbButtons() + '</div>' +
      '<div class="mp-grid">' +
      '<div class="field"><label id="mpCatLabel">分类<span class="mp-req">决定文章类型</span></label>' +
      '<select class="input" id="mpCat">' + catOptions() + '</select>' +
      '<div class="mp-inline" id="mpNewCatRow" hidden>' +
      '<select class="input mp-new-type" id="mpNewCatType">' + TYPES.map((t) => '<option' + (t === state.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<input class="input" id="mpNewCatName" placeholder="新分类名" autocomplete="off">' +
      '<button type="button" class="btn sm" data-mp-add-cat>建立</button>' +
      '<button type="button" class="btn sm ghost" data-mp-cancel-cat>取消</button></div>' +
      '</div>' +
      '<div class="field"><label id="mpSubLabel">子类 / 卷</label>' +
      '<select class="input" id="mpSub">' + subOptions() + '</select>' +
      '<div class="mp-inline" id="mpNewSubRow" hidden>' +
      '<input class="input" id="mpNewSubName" placeholder="新子类名" autocomplete="off">' +
      '<button type="button" class="btn sm" data-mp-add-sub>建立</button>' +
      '<button type="button" class="btn sm ghost" data-mp-cancel-sub>取消</button></div>' +
      '</div>' +
      '</div>' +
      '<div class="mp-hint" id="mpTypeHint"></div>' +
      '<div class="field"><label>标签<span class="mp-req">可选择已有，也能新建</span></label>' +
      '<div class="mp-tagwrap"><div class="mp-tagbox" id="mpTagBox">' +
      '<span class="mp-chips" id="mpChips"></span>' +
      '<input id="mpTagInput" autocomplete="off" placeholder="搜索标签，或输入后回车新建">' +
      '</div><div class="mp-tagpop" id="mpTagPop" hidden></div></div></div>' +
      (opts.statuses === false ? '' :
        '<div class="field"><label>状态</label><div class="mp-status" id="mpStatus">' +
        statuses.map((s) => '<button type="button" data-mp-status="' + U.esc(s) + '" class="' + (s === state.status ? 'on' : '') + '">' + U.esc(s) + '</button>').join('') +
        '</div></div>') +
      '<div class="mp-confirm" id="mpConfirm">' + confirmLine() + '</div>' +
      '</div>' +
      '<div class="modal-foot"><span class="hint">' + (opts.note ? U.esc(opts.note) : '') + '</span>' +
      '<div class="foot-actions"><button class="btn ghost" data-mp-cancel>取消</button>' +
      '<button class="btn primary" data-mp-ok>' + U.esc(opts.okText || '确定') + '</button></div></div>',
      'wide'
    );
    const box = m.box;
    const el = (id) => box.querySelector('#' + id);
    const catEl = el('mpCat'), subEl = el('mpSub');
    const tagInput = el('mpTagInput'), tagPop = el('mpTagPop'), chips = el('mpChips');
    const okBtn = box.querySelector('[data-mp-ok]');

    function syncLabels() {
      const c = catNow();
      const novel = (c ? c.type : state.type) === '小说';
      el('mpCatLabel').firstChild.nodeValue = '分类';
      el('mpSubLabel').textContent = novel ? '卷' : '子类';
      el('mpTypeHint').textContent = '文章类型：' + (c ? c.type : state.type) + ' · 由分类自动决定，不需要单独选';
    }

    function syncConfirm() { el('mpConfirm').innerHTML = confirmLine(); }

    function renderChips() { chips.innerHTML = chipHtml(); }

    function rebuildCat(keepCat) {
      catEl.innerHTML = catOptions();
      if (keepCat && catsNow().some((c) => c.id === state.catId)) catEl.value = state.catId;
      else {
        const list = catsNow().filter((c) => c.type === state.type);
        const next = list[0] || catsNow()[0];
        state.catId = next ? next.id : '';
        catEl.value = state.catId;
      }
      const c = catNow();
      if (c) {
        state.type = c.type;
        const list = subsNow(c);
        if (!list.some((s) => s.name === state.sub)) state.sub = list[0] ? list[0].name : '';
      }
      subEl.innerHTML = subOptions();
      syncLabels();
      syncConfirm();
    }

    function rebuildSub(keep) {
      subEl.innerHTML = subOptions();
      const c = catNow();
      if (!keep) state.sub = '';
      if (state.sub && c && !subsNow(c).some((s) => s.name === state.sub)) state.sub = '';
      subEl.value = state.sub;
      syncConfirm();
    }

    function renderTagPop() {
      const q = String(tagInput.value || '').trim().toLowerCase();
      const selected = new Set(state.tags);
      const matches = tagPool.filter((t) => !selected.has(t.name) && (!q || t.name.toLowerCase().indexOf(q) > -1)).slice(0, 12);
      let h = matches.map((t) =>
        '<button type="button" class="mp-tagrow" data-mp-pick="' + U.esc(t.name) + '">' +
        '<span>' + U.highlight(t.name, q) + '</span><small>' + t.count + '</small></button>').join('');
      const typed = tagInput.value.trim();
      if (typed && !selected.has(typed) && !tagPool.some((t) => t.name === typed)) {
        h = '<button type="button" class="mp-tagrow new" data-mp-pick="' + U.esc(typed) + '">＋ 新建标签「' + U.esc(typed) + '」</button>' + h;
      }
      tagPop.innerHTML = h || '<div class="mp-tagempty">没有匹配的标签，输入后回车即可新建</div>';
      tagPop.hidden = false;
    }

    function addTags(list) {
      let changed = false;
      parseTags(list).forEach((t) => {
        if (!state.tags.includes(t)) { state.tags.push(t); changed = true; }
      });
      if (changed) renderChips();
    }

    /* ---- events ---- */
    box.querySelectorAll('[data-mp-db]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-mp-db');
        if (!D.db(id) || id === state.dbId) return;
        state.dbId = id;
        box.querySelectorAll('[data-mp-db]').forEach((b) => b.classList.toggle('on', b === btn));
        state.catId = '';
        rebuildCat(false);
      };
    });

    catEl.onchange = () => {
      if (catEl.value === '__newcat__') {
        catEl.value = state.catId;
        el('mpNewCatRow').hidden = false;
        el('mpNewCatName').focus();
        return;
      }
      state.catId = catEl.value;
      const c = catNow();
      if (c) state.type = c.type;
      const subs = subsNow(c);
      state.sub = subs[0] ? subs[0].name : '';
      subEl.innerHTML = subOptions();
      subEl.value = state.sub;
      syncLabels();
      syncConfirm();
    };

    box.querySelector('[data-mp-add-cat]').onclick = () => {
      const name = el('mpNewCatName').value.trim();
      if (!name) { U.toast('新分类名不能为空', 'alert'); el('mpNewCatName').focus(); return; }
      let c = catsNow().find((x) => x.name === name && x.type === el('mpNewCatType').value);
      if (!c) {
        c = { id: '__new__' + extra.length + '_' + name, name, type: el('mpNewCatType').value, dbId: state.dbId, subs: [], pending: true };
        extra.push(c);
      }
      state.catId = c.id;
      state.type = c.type;
      state.sub = '';
      el('mpNewCatRow').hidden = true;
      el('mpNewCatName').value = '';
      rebuildCat(true);
      U.toast('已加入待新建分类「' + name + '」，保存文章时会自动建好', 'folder');
    };
    box.querySelector('[data-mp-cancel-cat]').onclick = () => {
      el('mpNewCatRow').hidden = true;
      catEl.value = state.catId;
    };
    el('mpNewCatName').onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); box.querySelector('[data-mp-add-cat]').click(); }
      if (e.key === 'Escape') { e.stopPropagation(); box.querySelector('[data-mp-cancel-cat]').click(); }
    };

    subEl.onchange = () => {
      if (subEl.value === '__newsub__') {
        subEl.value = state.sub;
        el('mpNewSubRow').hidden = false;
        el('mpNewSubName').focus();
        return;
      }
      state.sub = subEl.value;
      syncConfirm();
    };
    box.querySelector('[data-mp-add-sub]').onclick = () => {
      const name = el('mpNewSubName').value.trim();
      const c = catNow();
      if (!c) return;
      if (!name) { U.toast('新子类名不能为空', 'alert'); el('mpNewSubName').focus(); return; }
      const list = extraSubs[state.catId] || (extraSubs[state.catId] = []);
      if (!subsNow(c).some((s) => s.name === name)) list.push({ name, pending: true });
      state.sub = name;
      el('mpNewSubRow').hidden = true;
      el('mpNewSubName').value = '';
      subEl.innerHTML = subOptions();
      subEl.value = state.sub;
      syncConfirm();
      U.toast('已加入待新建' + (c.type === '小说' ? '卷' : '子类') + '「' + name + '」', 'folder');
    };
    box.querySelector('[data-mp-cancel-sub]').onclick = () => {
      el('mpNewSubRow').hidden = true;
      subEl.value = state.sub;
    };
    el('mpNewSubName').onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); box.querySelector('[data-mp-add-sub]').click(); }
      if (e.key === 'Escape') { e.stopPropagation(); box.querySelector('[data-mp-cancel-sub]').click(); }
    };

    tagInput.addEventListener('focus', renderTagPop);
    tagInput.addEventListener('input', renderTagPop);
    tagInput.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、') {
        e.preventDefault();
        const raw = tagInput.value.trim();
        if (raw) { addTags(raw); tagInput.value = ''; renderTagPop(); }
        return;
      }
      if (e.key === 'Backspace' && !tagInput.value && state.tags.length) {
        state.tags.pop();
        renderChips();
        renderTagPop();
      }
      if (e.key === 'Escape') {
        if (!tagPop.hidden) { e.stopPropagation(); tagPop.hidden = true; }
      }
    });
    tagInput.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!text) return;
      e.preventDefault();
      addTags(text);
      tagInput.value = '';
      renderTagPop();
    });
    tagInput.addEventListener('blur', () => { setTimeout(() => { tagPop.hidden = true; }, 160); });
    tagPop.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('[data-mp-pick]');
      if (btn) e.preventDefault();
    });
    tagPop.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mp-pick]');
      if (!btn) return;
      addTags(btn.getAttribute('data-mp-pick'));
      tagInput.value = '';
      tagInput.focus();
      renderTagPop();
    });
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mp-tag-del]');
      if (!btn) return;
      const name = btn.getAttribute('data-mp-tag-del');
      state.tags = state.tags.filter((t) => t !== name);
      renderChips();
      renderTagPop();
    });

    box.querySelectorAll('[data-mp-status]').forEach((btn) => {
      btn.onclick = () => {
        state.status = btn.getAttribute('data-mp-status');
        box.querySelectorAll('[data-mp-status]').forEach((b) => b.classList.toggle('on', b === btn));
      };
    });

    const titleEl = el('mpTitle');
    if (titleEl) titleEl.addEventListener('input', () => { state.title = titleEl.value; });

    let resolveOpen;
    const promise = new Promise((resolve) => { resolveOpen = resolve; });
    function finish(value) {
      document.removeEventListener('keydown', onKey);
      m.close();
      resolveOpen(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        if (el('mpNewCatRow') && !el('mpNewCatRow').hidden) { box.querySelector('[data-mp-cancel-cat]').click(); return; }
        if (el('mpNewSubRow') && !el('mpNewSubRow').hidden) { box.querySelector('[data-mp-cancel-sub]').click(); return; }
        if (tagPop && !tagPop.hidden) { tagPop.hidden = true; return; }
        finish(null);
      }
    }
    document.addEventListener('keydown', onKey);

    box.querySelector('[data-mp-cancel]').onclick = () => finish(null);
    m.ov.onclick = (e) => { if (e.target === m.ov) finish(null); };

    okBtn.onclick = async () => {
      if (titleEl && !titleEl.value.trim()) { U.toast('标题不能为空', 'alert'); titleEl.focus(); return; }
      if (!state.catId) { U.toast('先选一个分类', 'alert'); catEl.focus(); return; }
      if (tagInput.value.trim()) { addTags(tagInput.value); tagInput.value = ''; }
      const values = {
        title: titleEl ? titleEl.value.trim() : state.title,
        dbId: state.dbId,
        type: state.type,
        group: (catNow() || {}).name || '',
        sub: state.sub,
        tags: state.tags.slice(),
        status: state.status,
        newCat: isNewCat(catNow())
      };
      const oldText = okBtn.textContent;
      okBtn.disabled = true;
      okBtn.textContent = '处理中…';
      try {
        const result = opts.onConfirm ? await opts.onConfirm(values) : true;
        if (result === false) return;
        finish(values);
      } catch (error) {
        U.toast(error.message || '操作失败', 'alert');
      } finally {
        okBtn.disabled = false;
        okBtn.textContent = oldText;
      }
    };

    renderChips();
    syncLabels();
    syncConfirm();
    setTimeout(() => { if (titleEl) titleEl.focus(); else catEl.focus(); }, 50);
    return promise;
  }

  window.MetaPicker = { open };
})();
