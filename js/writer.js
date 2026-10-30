/* ============================================================
   writer.js · 写作台外壳 / 作品 / 大纲树 / 属性面板
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const S = window.Store, P = window.Prefs, D = window.LibData;
  const NT = window.NODE_TYPES;

  const state = {
    pid: null,
    view: 'outline',
    selNode: null,
    panelTab: 'outline',
    libQ: '',
    leftOpen: true,
    rightOpen: true
  };
  let treeOpen = window.lsGet('otree', {});
  const saveTreeOpen = U.debounce(() => window.lsSet('otree', treeOpen), 300);

  function cur() { return S.get(state.pid); }
  function navLib() { location.hash = '#/mine'; }

  function enter(pid, opts) {
    opts = opts || {};
    S.projects.length || (state.pid = null);
    if (!pid) pid = (cur() && cur().id) || (S.projects[0] && S.projects[0].id);
    state.pid = pid || null;
    if (opts.pid) state.pid = opts.pid;
    if (!S.get(state.pid)) state.pid = S.projects[0] ? S.projects[0].id : null;
    if (!state.pid) { state.selNode = null; }
    if (opts.view) state.view = opts.view;
    if (opts.nodeId) state.selNode = opts.nodeId;
    document.body.classList.add('mode-write');
    $('#libApp').hidden = true;
    $('#writerApp').hidden = false;
    if (U.isMobile()) {
      state.leftOpen = false; state.rightOpen = false;
      $('#wLeft').classList.remove('open');
      $('#wRight').classList.remove('open');
    }
    applyPanels();
    renderAll();
    if (opts.view) setView(opts.view);
    P.patch({ lastMode: 'write' });
  }

  function exit() {
    if (window.App && window.App.leaveWriter) { window.App.leaveWriter(); return; }
    document.body.classList.remove('mode-write');
    $('#writerApp').hidden = true;
    $('#libApp').hidden = false;
    P.patch({ lastMode: 'lib' });
    window.Lib.renderSide();
    if (location.hash === '#/mine') window.Lib.mineView();
    else if (location.hash === '' || location.hash === '#/') window.Lib.home();
  }

  function renderAll() {
    if (!cur()) { renderEmptyBook(); return; }
    renderTop();
    renderLeft();
    renderRight();
    renderView();
  }

  function renderEmptyBook() {
    $('#bookName').textContent = '还没有作品';
    $('#wWords').textContent = '0 字';
    $('#wView').innerHTML = '<div class="ed-empty">' + U.icon('feather') +
      '<b>先创建一部作品</b><p>写作台里可以同时管理多部小说，每部都有自己的大纲、时间线和人物。</p>' +
      '<button class="btn primary" data-empty="new">' + U.icon('plus') + '新建作品</button></div>';
    const b = $('#wView [data-empty="new"]');
    if (b) b.onclick = newProject;
    $('#wLeftBody').innerHTML = '';
    $('#wRightBody').innerHTML = '';
  }

  function renderTop() {
    const p = cur();
    if (!p) return;
    $('#bookName').textContent = p.name;
    $('#wWords').textContent = U.fmt(S.countWords(p)) + ' 字';
    $$('#viewTabs button').forEach((b) => b.classList.toggle('active', b.getAttribute('data-view') === state.view));
    $$('#wNav [data-wview]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-wview') === state.view));
  }

  function setView(view) {
    if (!['outline', 'timeline', 'editor', 'assembly', 'settings'].includes(view)) view = 'outline';
    state.view = view;
    const p = cur();
    if (p) { p.view = view; S.save(); }
    P.patch({ wView: view });
    renderTop();
    renderView();
    if (view === 'settings') { state.rightOpen = false; applyPanels(); }
  }

  function renderView() {
    const p = cur();
    const host = $('#wView');
    if (!p) return;
    host.className = 'wview';
    if (state.view === 'outline') { host.innerHTML = ''; window.Outline.render(host, p, state); }
    else if (state.view === 'timeline') { host.classList.add('scroll'); host.innerHTML = ''; window.Timeline.render(host, p, state); }
    else if (state.view === 'editor') { host.innerHTML = ''; window.Editor.render(host, p, state); }
    else if (state.view === 'assembly') { host.classList.add('scroll'); host.innerHTML = ''; window.Assembly.render(host, p, state); }
    else if (state.view === 'settings') { host.classList.add('scroll'); host.innerHTML = ''; window.Settings.render(host, p, state); }
    renderLeft();
    renderRight();
  }

  function refreshAfterNodeChange(rebuildCanvas) {
    const p = cur();
    if (!p) return;
    p.updatedAt = Date.now();
    S.save();
    renderTop();
    renderLeft();
    renderRight();
    if (window.Outline && window.Outline.live && rebuildCanvas !== false) window.Outline.refresh(p, state);
    if (state.view === 'timeline' && window.Timeline.live) window.Timeline.render($('#wView'), p, state);
  }

  /* ---------------- left panel: outline tree & ideas ---------------- */
  function buildTree(p) {
    const byParent = new Map();
    const ids = new Set(p.nodes.map((n) => n.id));
    p.nodes.forEach((n) => {
      const ps = (n.parents || []).filter((id) => ids.has(id));
      if (!ps.length) {
        if (!byParent.has('__root')) byParent.set('__root', []);
        byParent.get('__root').push(n);
      } else {
        ps.forEach((pid) => {
          if (!byParent.has(pid)) byParent.set(pid, []);
          byParent.get(pid).push(n);
        });
      }
    });
    const sortNodes = (arr) => arr.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.order - b.order));
    byParent.forEach((arr, k) => byParent.set(k, sortNodes(arr)));
    return byParent;
  }

  function nodeRow(n, depth, byParent, seen) {
    if (seen.has(n.id)) return '';
    seen.add(n.id);
    const kids = (byParent.get(n.id) || []).filter((k) => !seen.has(k.id));
    const key = (cur() ? cur().id : '') + ':' + n.id;
    const open = treeOpen[key] !== false;
    const isSel = state.selNode === n.id;
    const type = NT[n.type] || NT.ch;
    let h = '<div class="otree-row' + (isSel ? ' sel' : '') + '" data-onode="' + n.id + '">' +
      '<button class="ot-caret' + (kids.length ? (open ? ' open' : '') : ' leaf') + '" data-otoggle="' + n.id + '">' + U.icon('chevronRight') + '</button>' +
      '<div class="ot-main" data-onode-main="' + n.id + '">' +
      '<span class="ot-badge ' + n.type + '" style="color:' + (n.color || type.color) + '">' + U.icon(type.icon) + '</span>' +
      '<span class="ot-name">' + U.esc(n.title) + (n.parents && n.parents.length > 1 ? ' · ⁺' : '') + '</span>' +
      '<span class="ot-words">' + (S.treeWords(cur(), n) ? U.fmt(S.treeWords(cur(), n)) : '—') + '</span></div>' +
      '<button class="ot-add" data-oadd="' + n.id + '" title="添加子节点">' + U.icon('plus') + '</button></div>';
    if (kids.length && open) {
      h += '<div class="ot-children">' + kids.map((k) => nodeRow(k, depth + 1, byParent, seen)).join('') + '</div>';
    }
    return h;
  }

  function renderLeft() {
    const foot = document.querySelector('.wp-foot');
    const body = $('#wLeftBody');
    if (state.panelTab === 'library') {
      if (foot) foot.hidden = true;
      renderLibTree();
      return;
    }
    body.classList.remove('wp-body-lib');
    if (foot) foot.hidden = false;
    const p = cur();
    if (!p) return;
    if (state.panelTab === 'ideas') {
      body.innerHTML = renderIdeas(p);
      bindIdeas(p);
      return;
    }
    const byParent = buildTree(p);
    const roots = byParent.get('__root') || [];
    let h = '<div class="otree">';
    if (!roots.length) {
      h += '<div class="ot-empty">画布还是空的。<br>双击画布，或点下方「新建卷」开始。</div>';
    } else {
      const seen = new Set();
      h += roots.map((n) => nodeRow(n, 0, byParent, seen)).join('');
    }
    h += '</div>';
    body.innerHTML = h;
    $$('#wpTabs button').forEach((b) => b.classList.toggle('active', b.getAttribute('data-panel') === 'outline'));
    $('#btnAddRoot').innerHTML = U.icon('plus') + '新建卷';
  }

  /* ---------------- left panel: library directory tree ---------------- */
  let libOpen = window.lsGet('wlibtree', {});
  const saveLibOpen = U.debounce(() => window.lsSet('wlibtree', libOpen), 300);

  function newArticleIn(catId, subId) {
    const cat = D.cat(catId);
    if (!cat || !window.Gen6Bridge) return;
    const sub = subId ? D.sub(catId, subId) : null;
    window.Gen6Bridge.newArticle({ type: cat.type, group: cat.name, sub: sub ? sub.name : '' });
  }

  function openLibMenu(anchor, items) {
    const r = anchor.getBoundingClientRect();
    window.Lib.rowMenu(r.right - 224, r.bottom + 4, items);
  }

  function renderLibTree() {
    const body = $('#wLeftBody');
    body.classList.add('wp-body-lib');
    $$('#wpTabs button').forEach((b) => b.classList.toggle('active', b.getAttribute('data-panel') === 'library'));
    D.init();
    const q = (state.libQ || '').trim().toLowerCase();
    const match = (f) => !q || String(f.title || '').toLowerCase().indexOf(q) > -1;
    const cats = D.cats || [];
    let h = '<div class="libtree-wrap">';
    h += '<div class="lt-search">' + U.icon('search') +
      '<input id="libTreeQ" placeholder="搜文库标题…" autocomplete="off" value="' + U.esc(state.libQ || '') + '">' +
      (state.libQ ? '<button class="lt-clear" id="libTreeClear" aria-label="清空">' + U.icon('x') + '</button>' : '') +
      '</div>';
    h += '<div class="libtree">';
    let shownCats = 0;
    cats.forEach((c) => {
      const subs = c.subs.map((s) => ({ sub: s, files: s.files.filter(match) })).filter((x) => x.files.length);
      const catFiles = subs.reduce((a, x) => a + x.files.length, 0);
      if (!catFiles) return;
      shownCats++;
      const catWords = subs.reduce((a, x) => a + x.files.reduce((w, f) => w + (Number(f.words) || 0), 0), 0);
      const catOpen = q ? true : !!libOpen['c:' + c.id];
      h += '<details class="lt-cat"' + (catOpen ? ' open' : '') + ' data-ltkey="c:' + U.esc(c.id) + '">';
      h += '<summary class="lt-head lt-cat-head">' +
        '<span class="lt-caret">' + U.icon('chevronRight') + '</span>' +
        '<span class="lt-dot" style="background:' + U.esc(c.color || '#8A9099') + '"></span>' +
        '<span class="lt-name">' + U.esc(c.name) + '</span>' +
        '<span class="lt-count">' + catFiles + '</span>' +
        '<button class="lt-more" data-lt-cat-menu="' + U.esc(c.id) + '" aria-label="目录操作">' + U.icon('more') + '</button>' +
        '</summary><div class="lt-body">';
      subs.forEach(({ sub, files }) => {
        const subKey = c.id + '/' + sub.id;
        const subOpen = q ? true : !!libOpen['s:' + subKey];
        const subWords = files.reduce((w, f) => w + (Number(f.words) || 0), 0);
        h += '<details class="lt-sub"' + (subOpen ? ' open' : '') + ' data-ltkey="s:' + U.esc(subKey) + '">';
        h += '<summary class="lt-head lt-sub-head">' +
          '<span class="lt-caret">' + U.icon('chevronRight') + '</span>' +
          '<span class="lt-name">' + U.esc(sub.name) + '</span>' +
          '<span class="lt-count">' + files.length + '</span>' +
          '<button class="lt-more" data-lt-sub-menu="' + U.esc(c.id) + '|' + U.esc(sub.id) + '" aria-label="子目录操作">' + U.icon('more') + '</button>' +
          '</summary><div class="lt-files">';
        files.forEach((f) => {
          const id = f.docId || f.file;
          h += '<div class="lt-file" data-lt-file="' + U.esc(id) + '" role="button" tabindex="0" title="' + U.esc(f.title) + ' · ' + U.fmt(f.words || 0) + ' 字">' +
            '<span class="lt-fico">' + U.icon('file') + '</span>' +
            '<span class="lt-fname">' + U.highlight(f.title, q) + '</span>' +
            '<span class="lt-fwords">' + (f.words ? U.fmt(f.words) : '空') + '</span>' +
            '<button class="lt-more" data-lt-file-menu="' + U.esc(id) + '" aria-label="文章操作">' + U.icon('more') + '</button>' +
            '</div>';
        });
        h += '</div></details>';
      });
      h += '</div></details>';
    });
    if (!shownCats) {
      h += '<div class="lt-none">' + (q ? '没有找到「' + U.esc(state.libQ) + '」' : '文库还没有文章') + '</div>';
    }
    h += '</div><div class="lt-foot">' + (D.stats ? U.fmt(D.stats.files) + ' 篇 · ' + U.fmt(D.stats.words) + ' 字' : '') + '</div></div>';
    body.innerHTML = h;

    const input = $('#libTreeQ');
    if (input) {
      const apply = U.debounce(() => {
        state.libQ = input.value;
        const pos = input.selectionStart == null ? input.value.length : input.selectionStart;
        renderLeft();
        const next = $('#libTreeQ');
        if (next) { next.focus(); try { next.setSelectionRange(pos, pos); } catch (e) { /* 忽略 */ } }
      }, 180);
      input.addEventListener('input', apply);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { state.libQ = ''; renderLeft(); }
      });
      const clear = $('#libTreeClear');
      if (clear) clear.onclick = () => { state.libQ = ''; renderLeft(); };
    }

    body.querySelectorAll('details.lt-cat, details.lt-sub').forEach((d) => {
      d.addEventListener('toggle', () => {
        libOpen[d.getAttribute('data-ltkey')] = d.open;
        saveLibOpen();
      });
    });

    body.querySelectorAll('[data-lt-file]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-lt-file-menu]')) return;
        const id = row.getAttribute('data-lt-file');
        if (window.Immersive && window.Immersive.openDoc) window.Immersive.openDoc(id);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
    });

    body.querySelectorAll('[data-lt-file-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const rec = D.get(btn.getAttribute('data-lt-file-menu'));
        if (rec && window.DocActions) window.DocActions.menu(btn, rec);
      });
    });

    body.querySelectorAll('[data-lt-cat-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const cat = D.cat(btn.getAttribute('data-lt-cat-menu'));
        if (!cat) return;
        openLibMenu(btn, [
          { label: '在「' + cat.name + '」新建文章', icon: 'plus', fn: () => newArticleIn(cat.id, null) },
          { label: '打开目录', icon: 'folder', fn: () => window.Lib.nav('/c/' + cat.id) },
          { sep: true },
          { label: '导出这个目录（ZIP）', icon: 'download', fn: () => window.DocActions.exportDirectory(cat.id, null) },
          { label: '删除这个目录', icon: 'trash', danger: true, fn: () => window.DocActions.deleteDirectory(cat.id, null, { stay: true }) }
        ]);
      });
    });

    body.querySelectorAll('[data-lt-sub-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const parts = btn.getAttribute('data-lt-sub-menu').split('|');
        const cat = D.cat(parts[0]);
        const sub = D.sub(parts[0], parts[1]);
        if (!cat || !sub) return;
        openLibMenu(btn, [
          { label: '在「' + sub.name + '」新建文章', icon: 'plus', fn: () => newArticleIn(cat.id, sub.id) },
          { label: '打开子目录', icon: 'folder', fn: () => window.Lib.nav('/s/' + cat.id + '/' + sub.id) },
          { sep: true },
          { label: '导出这个子目录（ZIP）', icon: 'download', fn: () => window.DocActions.exportDirectory(cat.id, sub.id) },
          { label: '删除这个子目录', icon: 'trash', danger: true, fn: () => window.DocActions.deleteDirectory(cat.id, sub.id, { stay: true }) }
        ]);
      });
    });
  }

  function renderIdeas(p) {
    let h = '<div class="idea-add"><input id="ideaInput" placeholder="记下一个灵感…" autocomplete="off">' +
      '<button data-idea-add title="添加">' + U.icon('plus') + '</button></div>';
    if (!p.ideas.length) {
      h += '<div class="idea-empty">灵感会先存放在这里。<br>拖到画布上，直接变成一个节点。</div>';
    } else {
      p.ideas.slice().reverse().forEach((it) => {
        h += '<div class="idea-item" draggable="true" data-idea="' + it.id + '" title="拖到画布，或双击转成节点">' +
          '<span class="ii-grip">' + U.icon('grip') + '</span><span class="ii-text">' + U.esc(it.text) + '</span>' +
          '<span class="ii-actions"><button data-idea-del="' + it.id + '" title="删除">' + U.icon('x') + '</button></span></div>';
      });
    }
    return h;
  }

  function bindIdeas(p) {
    $$('#wpTabs button').forEach((b) => b.classList.toggle('active', b.getAttribute('data-panel') === 'ideas'));
    $('#btnAddRoot').innerHTML = U.icon('plus') + '新建卷';
    const input = $('#ideaInput');
    const add = () => {
      const text = (input.value || '').trim();
      if (!text) { input.focus(); return; }
      p.ideas.push({ id: U.uid('i'), text, createdAt: Date.now() });
      p.updatedAt = Date.now(); S.save();
      renderLeft();
      const ni = $('#ideaInput'); if (ni) ni.focus();
    };
    $('#wLeftBody [data-idea-add]').onclick = add;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    $('#wLeftBody').querySelectorAll('[data-idea]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        const id = el.getAttribute('data-idea');
        window.__dragIdea = id;
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.addEventListener('dragend', () => { window.__dragIdea = null; document.querySelector('.canvas-wrap') && document.querySelector('.canvas-wrap').classList.remove('dropping'); });
      el.addEventListener('dblclick', () => ideaToNode(p, el.getAttribute('data-idea')));
    });
    $('#wLeftBody').querySelectorAll('[data-idea-del]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-idea-del');
        p.ideas = p.ideas.filter((x) => x.id !== id);
        S.save(); renderIdeasRefresh(p);
      });
    });
  }

  function renderIdeasRefresh(p) {
    if (state.panelTab !== 'ideas') return;
    $('#wLeftBody').innerHTML = renderIdeas(p);
    bindIdeas(p);
  }

  function ideaToNode(p, ideaId, x, y) {
    const it = p.ideas.find((i) => i.id === ideaId);
    if (!it) return;
    const n = window.blankNode('note', it.text.slice(0, 24), x || 120 + Math.random() * 220, y || 120 + Math.random() * 120);
    n.body = U.textToHtml(it.text);
    p.nodes.push(n);
    p.ideas = p.ideas.filter((i) => i.id !== ideaId);
    S.save();
    if (state.view !== 'outline') setView('outline');
    else { renderLeft(); if (window.Outline.live) window.Outline.refresh(p, state); }
    U.toast('灵感已变成节点', 'sparkles');
    setTimeout(() => Outline.focusNode(n.id), 60);
  }

  function addRootNode() {
    const p = cur();
    if (!p) return;
    const roots = p.nodes.filter((n) => !n.parents || !n.parents.length);
    const n = window.blankNode('vol', '第' + '一二三四五六七八九十'.charAt(Math.min(roots.length, 9)) + '卷', 120 + roots.length * 40, 120 + roots.length * 70);
    p.nodes.push(n);
    S.save();
    state.selNode = n.id;
    if (state.view !== 'outline') setView('outline');
    else { renderLeft(); if (window.Outline.live) window.Outline.refresh(p, state); }
    setTimeout(() => Outline.focusNode(n.id), 50);
    U.toast('已新建一卷');
  }

  /* ---------------- right panel: inspector ---------------- */
  function renderRight() {
    const p = cur();
    const body = $('#wRightBody');
    if (!p) { body.innerHTML = ''; return; }
    const n = p.nodes.find((x) => x.id === state.selNode);
    $('#wRightTitle').textContent = n ? '节点属性' : '作品概览';
    if (!n) {
      const total = S.countWords(p);
      const today = p.daily[U.todayKey()] || 0;
      const goal = p.goal.daily || 1500;
      const pct = Math.min(100, Math.round(today / goal * 100));
      const chapterCount = S.sortedChapters(p).length;
      body.innerHTML =
        '<div class="insp-sec"><div class="insp-label">作品</div>' +
        '<div class="insp-title">' + U.esc(p.name) + '</div>' +
        '<div class="insp-meta">' + U.fmt(total) + ' 字 · ' + chapterCount + ' 章 · ' + p.nodes.length + ' 个节点</div></div>' +
        '<div class="insp-sec"><div class="insp-label">今日进度</div>' +
        '<div style="display:flex;align-items:baseline;gap:6px"><b style="font-size:24px;font-weight:650;font-variant-numeric:tabular-nums">' + U.fmt(today) + '</b>' +
        '<span style="font-size:10.5px;color:var(--ink-3)">/ ' + U.fmt(goal) + ' 字 · ' + pct + '%</span></div>' +
        '<div class="goal-bar" style="margin:10px 0 0;height:6px"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="insp-sec"><div class="insp-label">快速操作</div><div class="insp-actions" style="flex-direction:column">' +
        '<button class="btn sm" data-insp="add-ch">' + U.icon('plus') + '新增一章</button>' +
        '<button class="btn sm" data-insp="editor">' + U.icon('pen') + '进入写作</button>' +
        '<button class="btn sm" data-insp="assembly">' + U.icon('layout') + '拼装导出</button>' +
        '<button class="btn sm" data-insp="rename">' + U.icon('file') + '重命名作品</button></div></div>' +
        '<div class="insp-sec"><div class="insp-label">设定</div><div class="stat-mini">' +
        '<div><b>' + p.chars.length + '</b><span>人物</span></div>' +
        '<div><b>' + p.places.length + '</b><span>地点</span></div>' +
        '<div><b>' + p.items.length + '</b><span>物品</span></div>' +
        '<div><b>' + p.ideas.length + '</b><span>灵感</span></div></div></div>';
      bindInspectorBase(p);
      return;
    }
    const type = NT[n.type] || NT.ch;
    body.innerHTML =
      '<div class="insp-sec"><div class="insp-label">标题</div>' +
      '<input class="insp-input" id="inspTitle" value="' + U.esc(n.title) + '"></div>' +
      '<div class="insp-sec"><div class="insp-label">类型</div><div class="type-pick">' +
      ['vol', 'ch', 'scene', 'note'].map((t) => '<button data-itype="' + t + '" class="' + (n.type === t ? 'on' : '') + '">' + U.icon(NT[t].icon) + NT[t].label + '</button>').join('') +
      '</div></div>' +
      '<div class="insp-sec"><div class="insp-label">属性</div>' +
      '<div class="insp-2col"><div class="insp-field"><span>主线 / 支线</span><select class="insp-select" id="inspLine">' +
      '<option value="main"' + (n.line === 'main' ? ' selected' : '') + '>主线</option><option value="sub"' + (n.line === 'sub' ? ' selected' : '') + '>支线</option></select></div>' +
      '<div class="insp-field"><span>字数</span><input class="insp-input" value="' + U.fmt(S.treeWords(cur(), n)) + '" disabled></div></div>' +
      '<div class="insp-field"><span>时间点</span><input class="insp-input" id="inspTime" value="' + U.esc(n.time || '') + '" placeholder="例如：故事第 3 天 · 清晨"></div>' +
      '<div class="insp-field"><span>颜色</span><div class="color-pick">' +
      window.NODE_COLORS.map((c) => '<button data-icolor="' + c + '" class="' + (n.color === c ? 'on' : '') + '" style="--c:' + c + '" title="' + c + '"></button>').join('') +
      '</div></div></div>' +
      '<div class="insp-sec"><div class="insp-label">操作</div><div class="insp-actions" style="flex-direction:column">' +
      '<button class="btn sm primary" data-insp="edit-node">' + U.icon('pen') + '进入写作</button>' +
      '<button class="btn sm" data-insp="add-child">' + U.icon('plus') + '添加子节点</button>' +
      '<button class="btn sm" data-insp="connect-tip">' + U.icon('link') + '如何连线</button>' +
      '<button class="btn sm danger" data-insp="del-node">' + U.icon('trash') + '删除节点</button></div></div>';

    const titleEl = $('#inspTitle');
    let pending = null;
    titleEl.addEventListener('input', () => {
      n.title = titleEl.value;
      clearTimeout(pending);
      pending = setTimeout(() => {
        refreshAfterNodeChange(false);
        if (window.Outline.live) window.Outline.refresh(cur(), state);
      }, 300);
    });
    $('#inspLine').addEventListener('change', (e) => { n.line = e.target.value; refreshAfterNodeChange(); });
    $('#inspTime').addEventListener('input', U.debounce((e) => { n.time = e.target.value.trim(); refreshAfterNodeChange(false); if (window.Outline.live) window.Outline.refresh(cur(), state); }, 400));
    body.querySelectorAll('[data-itype]').forEach((b) => b.addEventListener('click', () => {
      n.type = b.getAttribute('data-itype'); refreshAfterNodeChange(); renderRight();
    }));
    body.querySelectorAll('[data-icolor]').forEach((b) => b.addEventListener('click', () => {
      n.color = b.getAttribute('data-icolor'); refreshAfterNodeChange(); renderRight();
    }));
    bindInspectorBase(p);
  }

  function bindInspectorBase(p) {
    $$('#wRightBody [data-insp]').forEach((b) => {
      b.onclick = () => {
        const act = b.getAttribute('data-insp');
        const n = p.nodes.find((x) => x.id === state.selNode);
        if (act === 'add-ch') {
          const ch = window.blankNode('ch', '第' + (S.sortedChapters(p).length + 1) + '章', 420, 120 + p.nodes.length * 30);
          p.nodes.push(ch); state.selNode = ch.id;
          refreshAfterNodeChange(); U.toast('已新增一章');
        } else if (act === 'editor') {
          setView('editor');
        } else if (act === 'assembly') {
          setView('assembly');
        } else if (act === 'rename') {
          renameProject(p);
        } else if (act === 'edit-node' && n) {
          if (n.type === 'vol') { U.toast('卷是容器，请给卷下的章写正文', 'info'); return; }
          window.Editor.openNode(n.id);
        } else if (act === 'add-child' && n) {
          const child = window.blankNode(n.type === 'vol' ? 'ch' : 'scene', n.type === 'vol' ? '新章节' : '新场景', (n.x || 0) + 260, (n.y || 0) + 60);
          child.parents = [n.id];
          p.nodes.push(child);
          refreshAfterNodeChange();
          if (window.Outline.live) window.Outline.refresh(p, state);
          setTimeout(() => Outline.focusNode(child.id), 60);
        } else if (act === 'connect-tip' && n) {
          U.openModal('<div class="modal-head"><div><h3>怎样连线</h3><p>大纲画布上的节点可以有多个父节点。</p></div></div>' +
            '<div class="modal-body"><p>把鼠标移到节点右侧的小圆点 ＋ 上，按住拖动到目标节点并松开，就会建立一条连线。</p>' +
            '<p style="margin-top:10px">触屏设备上，节点右侧的 ＋ 始终显示，用一根手指长按拖动即可。一个孩子可以有多个父亲，连成多条线。</p></div>' +
            '<div class="modal-foot"><div class="foot-actions"><button class="btn primary" data-close-modal>知道了</button></div></div>').box.querySelector('[data-close-modal]').onclick = () => { $('#modalOverlay').hidden = true; };
        } else if (act === 'del-node' && n) {
          deleteNode(p, n);
        }
      };
    });
  }

  function deleteNode(p, n) {
    U.confirmModal({ title: '删除「' + n.title + '」？', desc: '节点和它的正文会一并删除，子节点会变成独立的根节点。此操作无法撤销。', okText: '删除', danger: true }).then((ok) => {
      if (!ok) return;
      p.nodes = p.nodes.filter((x) => x.id !== n.id);
      p.nodes.forEach((x) => { x.parents = (x.parents || []).filter((id) => id !== n.id); });
      p.panels = p.panels.filter((id) => id !== n.id);
      if (state.selNode === n.id) state.selNode = null;
      S.save();
      renderAll();
      U.toast('节点已删除', 'trash');
    });
  }

  function renameProject(p) {
    U.promptModal({ title: '重命名作品', label: '作品名', value: p.name, okText: '保存' }).then((name) => {
      if (name == null || !name) return;
      p.name = name; p.updatedAt = Date.now(); S.save();
      renderTop(); renderRight(); if (state.view === 'settings') renderView();
      U.toast('已重命名');
    });
  }

  /* ---------------- projects ---------------- */
  function newProject() {
    U.promptModal({ title: '新建作品', label: '作品名', placeholder: '例如：雾港来信', desc: '会先创建第一卷和第一章，之后可以随时改名。', okText: '创建' }).then((name) => {
      if (name == null) return;
      const p = window.blankProject(name || '未命名作品');
      const vol = window.blankNode('vol', '第一卷', 120, 120);
      const ch = window.blankNode('ch', '第一章', 420, 120);
      ch.parents = [vol.id];
      p.nodes = [vol, ch];
      S.add(p);
      state.pid = p.id; state.selNode = null; state.view = 'outline';
      if (U.isMobile()) { state.leftOpen = false; state.rightOpen = false; }
      applyPanels();
      renderAll();
      U.toast('作品已创建，双击画布可继续添加节点', 'feather');
    });
  }

  function deleteProject(p) {
    U.confirmModal({ title: '删除「' + p.name + '」？', desc: '这部作品的全部章节、人物、地点都会从本机删除。建议先导出备份。', okText: '删除作品', danger: true }).then((ok) => {
      if (!ok) return;
      S.remove(p.id);
      state.pid = S.projects[0] ? S.projects[0].id : null;
      state.selNode = null;
      renderAll();
      U.toast('作品已删除', 'trash');
    });
  }

  function bookMenu(anchor) {
    const items = [];
    items.push({ head: '我的作品' });
    S.projects.forEach((p) => {
      items.push({
        label: p.name, icon: 'feather', check: p.id === state.pid,
        fn: () => { state.pid = p.id; state.selNode = null; state.view = 'outline'; renderAll(); }
      });
    });
    items.push({ sep: true });
    items.push({ label: '新建作品', icon: 'plus', fn: newProject });
    if (cur()) {
      items.push({ label: '重命名当前作品', icon: 'pen', fn: () => renameProject(cur()) });
      items.push({ label: '删除当前作品', icon: 'trash', danger: true, fn: () => deleteProject(cur()) });
    }
    popMenu(anchor, items, 'min(300px, 86vw)');
  }

  function moreMenu(anchor) {
    const p = cur();
    popMenu(anchor, [
      { head: '数据' },
      { label: '导出整书 Markdown', icon: 'download', fn: () => window.LibExport.exportProject(p, 'md') },
      { label: '导出整书 TXT', icon: 'doc', fn: () => window.LibExport.exportProject(p, 'txt') },
      { label: '导出整书 HTML', icon: 'layout', fn: () => window.LibExport.exportProject(p, 'html') },
      { sep: true },
      { label: '导出 .nb 工程备份', icon: 'save', fn: exportBackup },
      { label: '导入 .nb 工程备份', icon: 'upload', fn: importBackup },
      { sep: true },
      { label: 'Git 同步…', icon: 'cloud', fn: () => { setView('settings'); setTimeout(() => window.Settings.tab('sync'), 30); } },
      { label: '返回文库', icon: 'book', fn: exit }
    ], 230);
  }

  function popMenu(anchor, items, width) {
    const el = $('#dropMenu');
    el.style.minWidth = (width || 210) + 'px';
    el.innerHTML = items.map((it, i) => {
      if (it.head) return '<div class="mi-head">' + U.esc(it.head) + '</div>';
      if (it.sep) return '<div class="mi-sep"></div>';
      return '<button class="mi' + (it.danger ? ' danger' : '') + '" data-i="' + i + '"><span class="mi-ico">' + U.icon(it.icon || 'circle') + '</span><span class="grow">' + U.esc(it.label) + '</span>' + (it.check ? '<span class="check">' + U.icon('check') + '</span>' : '') + '</button>';
    }).join('');
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + 'px';
    el.style.top = (r.bottom + 6) + 'px';
    el.querySelectorAll('.mi').forEach((b) => {
      b.onclick = () => { el.hidden = true; const it = items[+b.getAttribute('data-i')]; if (it && it.fn) it.fn(); };
    });
  }

  function exportBackup() {
    const data = S.exportAll();
    const d = new Date();
    const name = '写作库Studio-' + U.todayKey(d) + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '.nb.json';
    U.download(name, JSON.stringify(data, null, 2), 'application/json');
    U.toast('工程备份已导出', 'save');
  }

  function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.nb,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); } catch (e) { U.toast('文件不是有效的备份', 'alert'); return; }
        const count = (data.projects || []).length;
        U.openModal('<div class="modal-head"><div><h3>导入工程备份</h3><p>包含 ' + count + ' 部作品与文库整理数据</p></div></div>' +
          '<div class="modal-body"><p><b>合并</b>：按作品 ID 合并，保留本机其它作品（推荐）。</p>' +
          '<p style="margin-top:8px"><b>覆盖</b>：用备份完全替换本机全部写作数据。</p>' +
          '<p class="warn">导入前建议先导出一份当前备份。</p></div>' +
          '<div class="modal-foot"><div class="foot-actions"><button class="btn ghost" data-cancel>取消</button>' +
          '<button class="btn" data-replace>覆盖</button><button class="btn primary" data-merge>合并</button></div></div>').box.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-merge],[data-replace],[data-cancel]');
          if (!btn) return;
          if (btn.hasAttribute('data-cancel')) { $('#modalOverlay').hidden = true; return; }
          try {
            S.importAll(data, btn.hasAttribute('data-replace') ? 'replace' : 'merge');
            $('#modalOverlay').hidden = true;
            state.pid = S.projects[0] ? S.projects[0].id : null;
            state.selNode = null;
            renderAll();
            window.Lib.renderSide();
            U.toast('备份已导入', 'check');
          } catch (err) { U.toast(err.message || '导入失败', 'alert'); }
        });
      };
      reader.readAsText(f);
    };
    input.click();
  }

  /* ---------------- panels ---------------- */
  function applyPanels() {
    const left = $('#wLeft'), right = $('#wRight');
    const mobile = U.isMobile();
    if (mobile) {
      left.classList.remove('collapsed');
      right.classList.remove('collapsed');
      left.classList.toggle('open', state.leftOpen && !$('#wLeft').classList.contains('force-hidden'));
      right.classList.toggle('open', state.rightOpen);
      $('#handleLeft').classList.remove('show');
      $('#handleRight').classList.remove('show');
      return;
    }
    left.classList.toggle('collapsed', !state.leftOpen);
    right.classList.toggle('collapsed', !state.rightOpen);
    $('#handleLeft').classList.toggle('show', !state.leftOpen);
    $('#handleRight').classList.toggle('show', !state.rightOpen);
  }

  function togglePanels() {
    if (U.isMobile()) {
      const open = $('#wLeft').classList.contains('open');
      $('#wLeft').classList.toggle('open', !open);
      $('#wRight').classList.remove('open');
    } else {
      const any = state.leftOpen || state.rightOpen;
      state.leftOpen = !any; state.rightOpen = !any;
      P.set('panels', { left: state.leftOpen, right: state.rightOpen });
      applyPanels();
    }
  }

  function openRightPanel() {
    if (U.isMobile()) $('#wRight').classList.add('open');
  }

  function selectNode(id) {
    state.selNode = id;
    renderRight();
    renderLeft();
    if (window.Outline.live) window.Outline.markSelected(id);
    if (U.isMobile() && window.Outline.live) openRightPanel();
  }

  function updateStats() {
    const p = cur();
    if (!p) return;
    renderTop();
    renderRight();
    renderLeft();
  }

  /* ---------------- boot bindings ---------------- */
  function boot() {
    state.leftOpen = P.get('panels') ? P.get('panels').left !== false : true;
    state.rightOpen = P.get('panels') ? P.get('panels').right !== false : true;
    $('#btnBackLib').onclick = exit;
    $('#btnBookSwitch').onclick = (e) => bookMenu(e.currentTarget);
    $('#btnWMore').onclick = (e) => moreMenu(e.currentTarget);
    $('#btnPanels').onclick = togglePanels;
    $('#btnCollapseLeft').onclick = () => {
      if (U.isMobile()) { $('#wLeft').classList.remove('open'); return; }
      state.leftOpen = false; P.set('panels', { left: false, right: state.rightOpen }); applyPanels();
    };
    $('#btnCollapseRight').onclick = () => {
      if (U.isMobile()) { $('#wRight').classList.remove('open'); return; }
      state.rightOpen = false; P.set('panels', { left: state.leftOpen, right: false }); applyPanels();
    };
    $('#handleLeft').onclick = () => { state.leftOpen = true; P.set('panels', { left: true, right: state.rightOpen }); applyPanels(); };
    $('#handleRight').onclick = () => { state.rightOpen = true; P.set('panels', { left: state.leftOpen, right: true }); applyPanels(); };
    $('#btnAddRoot').onclick = addRootNode;
    $$('#viewTabs button').forEach((b) => { b.onclick = () => setView(b.getAttribute('data-view')); });
    $$('#wNav [data-wview]').forEach((b) => { b.onclick = () => { setView(b.getAttribute('data-wview')); $('#wLeft').classList.remove('open'); $('#wRight').classList.remove('open'); }; });
    $$('#wpTabs button').forEach((b) => {
      b.onclick = () => { state.panelTab = b.getAttribute('data-panel'); renderLeft(); };
    });
    $('#wStage').addEventListener('click', (e) => {
      if (!e.target.closest('.wpanel') && U.isMobile()) {
        if (!$('#wLeft').contains(e.target)) $('#wLeft').classList.remove('open');
        if (!$('#wRight').contains(e.target)) $('#wRight').classList.remove('open');
      }
    });
    $('#wLeftBody').addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-otoggle]');
      if (toggle) {
        const id = toggle.getAttribute('data-otoggle');
        const key = (cur() ? cur().id : '') + ':' + id;
        treeOpen[key] = treeOpen[key] === false ? true : false;
        saveTreeOpen(); renderLeft(); return;
      }
      const add = e.target.closest('[data-oadd]');
      if (add) {
        const p = cur(); const pidNode = add.getAttribute('data-oadd');
        const parent = p.nodes.find((n) => n.id === pidNode);
        if (!parent) return;
        const child = window.blankNode(parent.type === 'vol' ? 'ch' : 'scene', parent.type === 'vol' ? '新章节' : '新场景', (parent.x || 0) + 260, (parent.y || 0) + 60);
        child.parents = [parent.id];
        p.nodes.push(child);
        refreshAfterNodeChange();
        if (window.Outline.live) window.Outline.refresh(p, state);
        setTimeout(() => Outline.focusNode(child.id), 60);
        return;
      }
      const row = e.target.closest('[data-onode-main]');
      if (row) {
        const id = row.getAttribute('data-onode-main');
        selectNode(id);
        const p = cur(); const n = p.nodes.find((x) => x.id === id);
        if (n) { window.Outline && Outline.centerOn(n.id); }
        if (state.view !== 'outline') setView('outline');
        return;
      }
      const row2 = e.target.closest('[data-onode]');
      if (row2) selectNode(row2.getAttribute('data-onode'));
    });
    $('#wLeftBody').addEventListener('dblclick', (e) => {
      const row = e.target.closest('[data-onode-main]');
      if (!row) return;
      const p = cur(); const n = p.nodes.find((x) => x.id === row.getAttribute('data-onode-main'));
      if (n && n.type !== 'vol') { state.selNode = n.id; window.Editor.openNode(n.id); }
    });

    window.addEventListener('resize', U.debounce(() => { applyPanels(); }, 200));
  }

  window.Writer = {
    state, enter, exit, setView, renderAll, renderView, renderTop, renderLeft, renderRight,
    selectNode, updateStats, refreshAfterNodeChange, newProject, deleteProject, renameProject,
    ideaToNode, addRootNode, exportBackup, importBackup, applyPanels, popMenu, bindIdeas, boot,
    getProject: cur, openRightPanel
  };
})();
