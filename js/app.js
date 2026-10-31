/* ============================================================
   app.js · 启动 / 路由 / 快速切换器 / 速写 / 快捷键 / PWA
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const D = window.LibData, C = window.Curation, S = window.Store, P = window.Prefs;

  let palItems = [], palIdx = 0, writerReturn = null, writerOpts = null;
  let installTimer = null;

  /* ---------------- theme ---------------- */
  function effectiveTheme() {
    const t = P.get('theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncNativeTheme(theme) {
    const SB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
    if (!SB) return;
    const dark = theme === 'dark';
    Promise.resolve(SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' })).catch(() => {});
    Promise.resolve(SB.setBackgroundColor({ color: dark ? '#0C0D0F' : '#F6F6F3' })).catch(() => {});
  }
  function applyTheme() {
    const theme = effectiveTheme();
    U.applyTheme(theme);
    syncNativeTheme(theme);
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    P.set('theme', next);
    U.applyTheme(next);
    syncNativeTheme(next);
    U.toast(next === 'dark' ? '已切换到深色' : '已切换到浅色', next === 'dark' ? 'moon' : 'sun');
  }

  /* ---------------- writer ---------------- */
  function openWriter(pid, opts) {
    opts = opts || {};
    let p = pid ? S.get(pid) : null;
    if (!p) p = S.get(window.Writer.state.pid) || S.projects[0];
    if (!p) { window.Writer.enter(null); return; }
    const inWriter = document.body.classList.contains('mode-write');
    if (!inWriter && !/^#\/w\//.test(location.hash)) writerReturn = location.hash || '#/';
    const target = '#/w/' + encodeURIComponent(p.id);
    if (location.hash === target) {
      enterWriter(p.id, opts);
    } else {
      writerOpts = opts;
      location.hash = target;
    }
  }

  function enterWriter(pid, opts) {
    document.body.classList.remove('reading');
    document.body.classList.remove('drafting');
    window.Writer.enter(pid, opts || {});
    if (opts && opts.nodeId) {
      setTimeout(() => {
        if (window.Writer) window.Writer.selectNode(opts.nodeId);
        if (opts.view === 'editor' && window.Immersive) {
          window.Immersive.openNode(opts.nodeId, pid, { returnTo: '#/w/' + encodeURIComponent(pid) });
        } else if (window.Outline && opts.view === 'outline') {
          window.Outline.centerOn(opts.nodeId);
        }
      }, 60);
    }
  }

  function leaveWriter() {
    const back = writerReturn && !/^#\/w\//.test(writerReturn) ? writerReturn : '#/';
    writerReturn = null;
    if (location.hash === back) route();
    else location.hash = back;
  }

  /* ---------------- routing ---------------- */
  function showLib() {
    if (document.body.classList.contains('mode-write')) {
      document.body.classList.remove('mode-write');
      $('#writerApp').hidden = true;
      $('#libApp').hidden = false;
      P.patch({ lastMode: 'lib' });
    }
  }

  function safeDecode(v) {
    try { return decodeURIComponent(v); } catch (e) { return v; }
  }

  function route() {
    const r = window.Lib.route();
    if (window.Dashboard && r !== '/dashboard') window.Dashboard.stop();
    const immersiveRoute = /^\/write(?:\/|\?|$)/.test(r) || (/^\/draft\/[^/]+$/.test(r) && r !== '/draft/new');
    if (immersiveRoute) {
      if (document.body.classList.contains('mode-write')) {
        document.body.classList.remove('mode-write');
        $('#writerApp').hidden = true;
        $('#libApp').hidden = false;
      }
      if (window.Immersive) window.Immersive.enterFromRoute();
      return;
    }
    if (window.Immersive && window.Immersive.isOpen()) window.Immersive.leave();
    const mw = r.match(/^\/w\/([^/]+)/);
    if (mw) {
      const pid = safeDecode(mw[1]);
      const opts = writerOpts || {};
      writerOpts = null;
      if (!/^#\/w\//.test(location.hash)) writerOpts = null;
      enterWriter(pid, opts);
      return;
    }
    showLib();
    window.Lib.syncTreeForRoute(r);

    if (r === '/' || r === '') window.Lib.home();
    else if (/^\/c\/([^/]+)$/.test(r)) window.Lib.catView(safeDecode(r.match(/^\/c\/([^/]+)$/)[1]));
    else if (/^\/s\/([^/]+)\/([^/]+)$/.test(r)) {
      const m = r.match(/^\/s\/([^/]+)\/([^/]+)$/);
      window.Lib.subView(safeDecode(m[1]), safeDecode(m[2]));
    } else if (/^\/a\/(.+)$/.test(r)) window.Reader.open(safeDecode(r.match(/^\/a\/(.+)$/)[1]));
    else if (r === '/star') window.Lib.starView();
    else if (r === '/unread') window.Lib.unreadView();
    else if (/^\/tone\/(.+)$/.test(r)) window.Lib.toneView(safeDecode(r.match(/^\/tone\/(.+)$/)[1]));
    else if (/^\/q\/(.+)$/.test(r)) window.Lib.searchPage(safeDecode(r.match(/^\/q\/(.+)$/)[1]));
    else if (r === '/mine') window.Lib.mineView();
    else if (r === '/drafts') window.Hub.drafts();
    else if (r === '/draft/new') window.Hub.newDraft();
    else if (/^\/draft\/(.+)$/.test(r)) window.Hub.draftEditor(safeDecode(r.match(/^\/draft\/(.+)$/)[1]));
    else if (r === '/plugins') window.Hub.plugins();
    else if (r === '/databases') window.Lib.databasesView();
    else if (r === '/dashboard') window.Dashboard.open();
    else if (r === '/settings') window.Hub.settings();
    else if (/^\/p\/([^/]+)\/([^/]+)$/.test(r)) {
      const m = r.match(/^\/p\/([^/]+)\/([^/]+)$/);
      window.Reader.openChapter(safeDecode(m[1]), safeDecode(m[2]));
    } else if (/^\/p\/([^/]+)$/.test(r)) window.Lib.projectView(safeDecode(r.match(/^\/p\/([^/]+)$/)[1]));
    else window.Lib.home();

    window.Lib.renderSide();
    window.Reader.updateProgress();
    updateNav(r);
  }

  function updateNav(r) {
    let key = 'home';
    if (r === '/drafts' || /^\/draft\//.test(r)) key = 'drafts';
    else if (r === '/plugins') key = 'plugins';
    else if (r === '/settings') key = 'settings';
    $$('#libNav [data-nav]').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-nav') === key);
    });
    document.body.classList.toggle('reading', /^\/a\//.test(r));
    document.body.classList.toggle('drafting', /^\/draft\//.test(r));
  }

  /* ---------------- icons ---------------- */
  function bindIcons() {
    const libIcons = { home: 'book', drafts: 'note', plugins: 'sparkles', settings: 'settings' };
    $$('#libNav [data-nav]').forEach((a) => {
      const box = a.querySelector('.mn-ico');
      if (box) box.innerHTML = U.icon(libIcons[a.getAttribute('data-nav')] || 'circle');
    });
    const wIcons = { outline: 'tree', timeline: 'clock', editor: 'pen', assembly: 'layout', settings: 'settings' };
    $$('#wNav [data-wview]').forEach((a) => {
      const box = a.querySelector('.mn-ico');
      if (box) box.innerHTML = U.icon(wIcons[a.getAttribute('data-wview')] || 'circle');
    });
    applyTheme();
  }

  /* ---------------- topbar / drawer ---------------- */
  function bindTop() {
    $('#btnSearch').onclick = () => openPalette();
    $('#btnWrite').onclick = () => openWriter();
    $('#btnDraft').onclick = () => openDraft();
    $('#btnDraftMobile').onclick = () => openDraft();
    $('#btnDraftW').onclick = () => openDraft();
    $('#btnTheme').onclick = toggleTheme;
    $('#btnThemeW').onclick = toggleTheme;

    $$('#libNav [data-nav]').forEach((a) => {
      a.onclick = (e) => {
        e.preventDefault();
        const key = a.getAttribute('data-nav');
        window.Lib.nav(key === 'home' ? '/' : '/' + key);
      };
    });

    $('#btnDrawer').onclick = () => {
      if ($('#sidebar').classList.contains('open')) window.Lib.closeDrawer();
      else window.Lib.openDrawer();
    };
    $('#drawerMask').onclick = () => window.Lib.closeDrawer();

    $('#btnLibMore').onclick = (e) => {
      const dark = effectiveTheme() === 'dark';
      window.Writer.popMenu(e.currentTarget, [
        { head: '写作库' },
        { label: '随手一篇', icon: 'compass', fn: () => window.Lib.randomFile() },
        { label: '数据看台', icon: 'chart', fn: () => window.Lib.nav('/dashboard') },
        { label: '导出全部工程备份', icon: 'save', fn: () => window.Writer.exportBackup() },
        { label: '设定与 Git 同步', icon: 'settings', fn: openSettings },
        { label: dark ? '切换到浅色' : '切换到深色', icon: dark ? 'sun' : 'moon', fn: toggleTheme },
        { sep: true },
        { label: '关于写作库 Studio', icon: 'info', fn: about }
      ], 220);
    };

    document.addEventListener('click', (e) => {
      const menu = $('#dropMenu'), ctx = $('#ctxMenu');
      if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('#btnLibMore,#btnBookSwitch,#btnWMore,#immMore,[data-node-menu]')) menu.hidden = true;
      if (!ctx.hidden && !ctx.contains(e.target) && !e.target.closest('[data-node-menu],.canvas-toolbar')) ctx.hidden = true;
    });
  }

  function openSettings() {
    window.Lib.nav('/settings');
  }

  function about() {
    const m = U.openModal(
      '<div class="modal-head"><div><h3>写作库 · 6.4 同步版</h3><p>离线可用：1,448 篇文稿装进浏览器，编辑保存与双库启停已接通，下一步接 GitHub 同步</p></div></div>' +
      '<div class="modal-body"><p>' + U.fmt(D.files.length) + ' 篇文章、' + U.fmt(D.stats.words) + ' 字，分属 ' + D.databases.length + ' 个数据库；' +
      '写作台里另有 ' + S.projects.length + ' 部作品，大纲、思维导图、拼装与文库保持同步。</p>' +
      '<p style="margin-top:10px">阅读页编辑、沉浸写作新建、草稿收入文库、改名、双库启停和版本恢复都在浏览器内完成，改动写入本机 IndexedDB，刷新页面不会丢失。' +
      '当前版本不启动 Node 服务，也不扫描电脑目录；GitHub 上传与三端同步在 P2 接入。</p>' +
      '<p class="warn">浏览器数据只在本机，清除站点数据会丢失尚未同步的改动。快照功能已停用，改用修订历史；每篇保留最近 160 个版本。</p></div>' +
      '<div class="modal-foot"><div class="foot-actions"><button class="btn primary" data-close-about>知道了</button></div></div>'
    );
    m.box.querySelector('[data-close-about]').onclick = m.close;
    m.ov.onclick = (e) => { if (e.target === m.ov) m.close(); };
  }

  /* ---------------- drawer edge swipe ---------------- */
  function bindDrawer() {
    let sx = 0, sy = 0, tracking = false, fromEdge = false;
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || document.body.classList.contains('mode-write')) return;
      const t = e.touches[0];
      fromEdge = t.clientX < 26 || $('#sidebar').classList.contains('open');
      if (!fromEdge) return;
      sx = t.clientX; sy = t.clientY; tracking = true;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 55 || Math.abs(dy) > 60) return;
      if (dx > 0 && sx < 26) window.Lib.openDrawer();
      else if (dx < 0) window.Lib.closeDrawer();
    }, { passive: true });
  }

  /* ---------------- quick switcher ---------------- */
  function openPalette() {
    const el = $('#switcherOverlay');
    el.hidden = false;
    const input = $('#paletteInput');
    input.value = '';
    palIdx = 0;
    buildPalette('');
    setTimeout(() => input.focus(), 30);
  }
  function closePalette() {
    $('#switcherOverlay').hidden = true;
  }

  function buildPalette(q) {
    q = (q || '').trim();
    const out = [];
    const cmds = [
      { icon: 'feather', title: '新建文章', sub: '直接写进文库 md', fn: () => window.Lib.nav('/write') },
      { icon: 'pen', title: '新建草稿', sub: '随手写一段，稍后收入文库', fn: openDraft },
      { icon: 'note', title: '草稿箱', sub: '按更新时间查看所有草稿', fn: () => window.Lib.nav('/drafts') },
      { icon: 'tree', title: '打开写作台', sub: '大纲画布、思维导图与多面板写作', fn: () => openWriter() },
      { icon: 'star', title: '收藏', sub: '查看收藏的文字', fn: () => window.Lib.nav('/star') },
      { icon: 'eye', title: '未读清单', sub: '还没读过的文字', fn: () => window.Lib.nav('/unread') },
      { icon: 'chart', title: '数据看台', sub: '每日写作、图表、修订与 Git 记录', fn: () => window.Lib.nav('/dashboard') },
      { icon: 'sparkles', title: '插件与主题', sub: '主题工作室、写作光标与插件市场', fn: () => window.Lib.nav('/plugins') },
      { icon: 'database', title: '数据库管理', sub: '加入、停用、导出或移出一个数据库', fn: () => window.Lib.nav('/databases') },
      { icon: 'settings', title: '设置', sub: 'Git、Obsidian、导出与 AI', fn: () => window.Lib.nav('/settings') }
    ];
    cmds.forEach((c) => {
      const sc = q ? U.fuzzyScore(q, c.title) * 1.6 + U.fuzzyScore(q, c.sub) * 0.4 : 0;
      if (!q) out.push({ kind: 'cmd', icon: c.icon, title: c.title, sub: c.sub, fn: c.fn, group: '操作' });
      else if (sc > 0) out.push({ kind: 'cmd', icon: c.icon, title: c.title, sub: c.sub, fn: c.fn, group: '操作', score: sc + 400 });
    });

    const seen = new Set();
    if (!q) {
      C.recent.map((id) => D.get(id)).filter(Boolean).slice(0, 6).forEach((rec) => {
        seen.add(rec.id);
        out.push({ kind: 'file', rec, group: '最近打开', label: '最近' });
      });
      D.files.slice(0, 20).forEach((rec) => {
        if (seen.has(rec.id)) return;
        seen.add(rec.id);
        out.push({ kind: 'file', rec, group: '文章' });
      });
    } else {
      D.files.forEach((rec) => {
        const st = U.fuzzyScore(q, rec.title);
        const sc = U.fuzzyScore(q, rec.catName);
        const ss = U.fuzzyScore(q, rec.subName);
        const sm = U.fuzzyScore(q, rec.summary || '');
        const tg = (rec.tags || []).reduce((a, t) => Math.max(a, U.fuzzyScore(q, t)), 0);
        let score = st * 3 + sc * 0.6 + ss * 0.7 + sm * 0.5 + tg * 0.8;
        if (score <= 0) {
          const low = (rec.text || '').toLowerCase();
          if (low.indexOf(q.toLowerCase()) > -1) score = 20;
        }
        if (score > 0) out.push({ kind: 'file', rec, score });
      });
      out.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    palItems = out.slice(0, 40);
    palIdx = 0;
    renderPalette(q);
  }

  function renderPalette(q) {
    const list = $('#paletteList');
    const count = $('#paletteCount');
    if (count) count.textContent = palItems.length ? palItems.length + ' 项' : '';
    if (!palItems.length) {
      list.innerHTML = '<div class="pal-empty">没有找到「' + U.esc(q) + '」<br><span style="font-size:11.5px">试试只输入一两个字，或换个说法。</span></div>';
      return;
    }
    let lastGroup = null;
    let h = '';
    palItems.forEach((it, i) => {
      const group = it.group || (it.kind === 'cmd' ? '操作' : '文章');
      if (!q && group !== lastGroup) {
        h += '<div class="pal-group">' + U.esc(group) + '</div>';
        lastGroup = group;
      }
      if (it.kind === 'cmd') {
        h += '<div class="pal-item' + (i === palIdx ? ' sel' : '') + '" data-pi="' + i + '">' +
          '<span class="pal-ico">' + U.icon(it.icon) + '</span>' +
          '<div class="pal-main"><div class="pal-title">' + U.highlight(it.title, q) + '</div>' +
          '<div class="pal-sub">' + U.esc(it.sub) + '</div></div>' +
          '<span class="pal-meta">操作</span></div>';
        return;
      }
      const rec = it.rec;
      const star = C.isStarred(rec.id);
      h += '<div class="pal-item' + (i === palIdx ? ' sel' : '') + '" data-pi="' + i + '">' +
        '<span class="pal-ico">' + U.icon('file') + '</span>' +
        '<div class="pal-main"><div class="pal-title">' + U.highlight(rec.title, q) + '</div>' +
        '<div class="pal-sub">' + (rec.dbName ? U.esc(rec.dbName) + ' · ' : '') + U.esc(rec.catName) + ' · ' + U.esc(rec.subName) + '</div></div>' +
        '<span class="pal-meta">' + (star ? '<span class="star">' + U.icon('starFill') + '</span>' : '') +
        '<span>' + (rec.words ? U.fmt(rec.words) + ' 字' : '空') + '</span></span></div>';
    });
    list.innerHTML = h;
    $$('#paletteList .pal-item').forEach((el) => {
      el.onclick = () => openPalItem(+el.getAttribute('data-pi'));
    });
    const sel = list.querySelector('.pal-item.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function markPalette() {
    $$('#paletteList .pal-item').forEach((el, i) => el.classList.toggle('sel', i === palIdx));
    const sel = $('#paletteList .pal-item.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function openPalItem(i) {
    const it = palItems[i];
    if (!it) return;
    closePalette();
    if (it.kind === 'cmd') { if (it.fn) it.fn(); return; }
    window.Lib.nav('/a/' + encodeURIComponent(it.rec.id));
  }

  function bindPalette() {
    const input = $('#paletteInput');
    input.addEventListener('input', () => { palIdx = 0; buildPalette(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palIdx + 1, palItems.length - 1); markPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); markPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); openPalItem(palIdx); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
    $('#paletteClose').onclick = closePalette;
    $('#switcherOverlay').addEventListener('click', (e) => {
      if (e.target === $('#switcherOverlay')) closePalette();
    });
  }

  /* ---------------- draft ---------------- */
  function openDraft() {
    if (window.Hub && window.Hub.newDraft) {
      window.Hub.newDraft({ returnTo: location.hash || '#/' });
      return;
    }
    const ov = $('#draftOverlay');
    $('#draftTitle').innerHTML = '';
    $('#draftText').innerHTML = '';
    $('#draftWords').textContent = '0 字';
    ov.hidden = false;
    setTimeout(() => $('#draftTitle').focus(), 40);
  }
  function closeDraft() {
    $('#draftOverlay').hidden = true;
  }
  function draftWords() {
    const t = ($('#draftTitle').textContent || '') + '\n' + ($('#draftText').textContent || '');
    return U.countWords(t);
  }
  function saveDraft() {
    const title = ($('#draftTitle').textContent || '').trim();
    const plain = ($('#draftText').innerText || '').trim();
    if (!title && !plain) { U.toast('写点什么再保存吧', 'info'); $('#draftTitle').focus(); return; }
    let p = S.projects.find((x) => x.name === '随笔');
    if (!p) {
      p = window.blankProject('随笔');
      S.add(p);
    }
    const n = window.blankNode('ch', title || '无题 · ' + U.todayKey().slice(5), 420, 120 + p.nodes.length * 30);
    n.body = U.textToHtml(plain || title);
    n.order = p.nodes.reduce((a, x) => Math.max(a, x.order || 0), 0) + 1;
    p.nodes.push(n);
    p.updatedAt = Date.now();
    S.addWords(p, U.countWords(n.body));
    S.save();
    closeDraft();
    window.Lib.renderSide();
    const r = window.Lib.route();
    if (r === '/' || r === '') window.Lib.home();
    else if (r === '/mine') window.Lib.mineView();
    if (document.body.classList.contains('mode-write')) window.Writer.updateStats();
    U.toast('已保存到《随笔》', 'check');
  }
  function bindDraft() {
    $('#draftOverlay').addEventListener('click', (e) => {
      if (e.target === $('#draftOverlay')) closeDraft();
    });
    $$('[data-close-draft]').forEach((b) => { b.onclick = closeDraft; });
    $('#btnDraftSave').onclick = saveDraft;
    $('#draftTitle').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#draftText').focus(); }
    });
    const count = () => { $('#draftWords').textContent = U.fmt(draftWords()) + ' 字'; };
    $('#draftTitle').addEventListener('input', count);
    $('#draftText').addEventListener('input', count);
  }

  /* ---------------- shortcuts ---------------- */
  function isTyping(el) {
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if ($('#switcherOverlay').hidden) openPalette(); else closePalette();
        return;
      }
      if (meta && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (window.Immersive && window.Immersive.isOpen()) {
          window.Immersive.flush();
          return;
        }
        S.flush();
        C.saveEdits.flush(); C.saveNotes.flush(); C.saveStars.flush(); C.saveReads.flush();
        U.toast('已保存到本机', 'save');
        return;
      }
      if (meta && e.key === 'Enter') {
        if (!$('#draftOverlay').hidden) { e.preventDefault(); saveDraft(); }
        return;
      }
      if (!meta && e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('#switcherOverlay').hidden) { closePalette(); return; }
        if (!$('#draftOverlay').hidden) { closeDraft(); return; }
        if (!$('#modalOverlay').hidden) { $('#modalOverlay').hidden = true; return; }
        if (!$('#dropMenu').hidden) { $('#dropMenu').hidden = true; return; }
        if (!$('#ctxMenu').hidden) { $('#ctxMenu').hidden = true; return; }
        if ($('#sidebar').classList.contains('open')) { window.Lib.closeDrawer(); return; }
        return;
      }
      if (!isTyping(e.target) && !document.body.classList.contains('mode-write')) {
        const r = window.Lib.route();
        if (/^\/(a|p)\//.test(r)) {
          if (e.key === 'ArrowRight') {
            const next = $('.pager a.next');
            if (next && next.getAttribute('href')) { e.preventDefault(); location.hash = next.getAttribute('href'); }
          } else if (e.key === 'ArrowLeft') {
            const prev = $('.pager a:not(.next):not(.disabled)');
            if (prev && prev.getAttribute('href')) { e.preventDefault(); location.hash = prev.getAttribute('href'); }
          }
        }
      }
    });
  }

  /* ---------------- progress / install ---------------- */
  function bindScroll() {
    const main = $('#libMain');
    let ticking = false;
    main.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; window.Reader.updateProgress(); });
    }, { passive: true });
  }

  function bindInstall() {
    const tip = $('#installTip');
    if (!tip) return;
    $('#installTipClose').onclick = () => {
      tip.hidden = true;
      localStorage.setItem('ws.installTip', '1');
    };
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;
    if (!U.isMobile() || standalone || localStorage.getItem('ws.installTip')) return;
    clearTimeout(installTimer);
    installTimer = setTimeout(() => {
      if (localStorage.getItem('ws.installTip')) return;
      if (document.body.classList.contains('mode-write')) return;
      tip.hidden = false;
    }, 3200);
  }

  function bindSystemTheme() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (P.get('theme') === 'auto') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  function bindFlush() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        S.flush();
        C.saveEdits.flush(); C.saveNotes.flush(); C.saveStars.flush(); C.saveReads.flush(); C.saveRecent.flush();
      }
    });
    window.addEventListener('beforeunload', () => {
      S.flush();
      C.saveEdits.flush(); C.saveNotes.flush(); C.saveStars.flush(); C.saveReads.flush(); C.saveRecent.flush();
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.getRegistrations().then((list) => {
      list.forEach((r) => r.unregister());
    }).catch(() => {});
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    if (window.WB64 && window.WB64.ready) {
      try { await window.WB64.ready; } catch (e) { console.warn('本地数据读取失败', e); }
    }
    D.init();
    P.load();
    bindIcons();
    bindTop();
    bindPalette();
    bindDraft();
    bindKeys();
    bindDrawer();
    bindScroll();
    bindSystemTheme();
    bindFlush();
    bindInstall();

    try { await S.load(); } catch (e) { console.warn(e); }
    if (window.WorkspaceSync) {
      try { await window.WorkspaceSync.load(); } catch (e) { console.warn(e); }
    }
    if (window.ThemeEngine) window.ThemeEngine.boot();
    if (window.Gen6Projects) {
      try { await window.Gen6Projects.syncAll({ quiet: true }); } catch (e) { console.warn(e); }
    }
    window.Lib.renderSide();
    window.Lib.bindSide();
    window.Writer.boot();
    if (window.ImmersiveInit) window.ImmersiveInit();

    if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/');
    window.addEventListener('hashchange', route);
    route();
    registerSW();
  }

  window.App = {
    openWriter, openDraft, openPalette, toggleTheme, route, leaveWriter,
    get writerReturn() { return writerReturn; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
