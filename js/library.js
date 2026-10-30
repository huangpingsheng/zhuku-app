/* ============================================================
   library.js · 首页 / 目录树 / 列表 / 我的写作
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const D = window.LibData, C = window.Curation, S = window.Store, P = window.Prefs;

  let treeState = window.lsGet('tree', { cats: {}, subs: {} });
  const saveTree = U.debounce(() => window.lsSet('tree', treeState), 300);

  function fileId(f) { return encodeURIComponent(f.id); }

  function route() { return (location.hash || '#/').replace(/^#/, '') || '/'; }
  function nav(path) { location.hash = '#' + path; }

  function catCurrent(catId) {
    const r = route();
    return r.indexOf('/c/' + catId) === 0 || r.indexOf('/s/' + catId) === 0;
  }
  function subCurrent(catId, subId) {
    return route() === '/s/' + catId + '/' + subId;
  }
  function fileCurrent(f) {
    return route().replace(/^\/a\/?/, '') === fileId(f);
  }

  /* ---------------- sidebar ---------------- */
  function renderSide() {
    D.init();
    const box = $('#sideScroll');
    if (!box) return;
    const sideOpen = document.body.classList.contains('mode-write');
    if (sideOpen) return;
    const recent = C.recent.map((id) => D.get(id)).filter((f) => f && D.inDb(f)).slice(0, 6);
    const allCount = D.stats.files;
    let h = '';

    h += '<div class="side-block">';
    h += '<a class="side-row hero" href="#/mine">' +
      '<span class="ico">' + U.icon('feather') + '</span>' +
      '<span class="txt">我的写作</span>' +
      '<span class="meta">' + S.projects.length + ' 部</span></a>';
    h += '</div>';

    h += '<div class="side-block db-side">' +
      '<div class="side-head"><span>数据库</span><span class="grow"></span>' +
      '<button data-db-manage title="管理数据库">' + U.icon('settings') + '</button></div>' +
      '<button class="db-chip all' + (D.dbFilter === 'all' ? ' active' : '') + '" data-db-filter="all">' +
      '<span class="db-ico">' + U.icon('grid') + '</span><span class="db-name">全部</span>' +
      '<span class="db-n">' + allCount + '</span></button>';
    D.databases.forEach((db) => {
      h += '<button class="db-chip' + (D.dbFilter === db.id ? ' active' : '') + '" data-db-filter="' + db.id + '" style="--db:' + db.color + '">' +
        '<span class="db-ico">' + U.icon(db.icon || 'book') + '</span>' +
        '<span class="db-name">' + U.esc(db.short || db.name) + '</span>' +
        '<span class="db-n">' + db.stats.files + '</span></button>';
    });
    h += '<button class="db-manage" data-db-manage>' + U.icon('plus') + ' 管理数据库</button>';
    h += '</div>';

    if (recent.length) {
      h += '<div class="side-block"><div class="side-head"><span>最近打开</span><span class="grow"></span>' +
        '<button data-side="clear-recent" title="清空">' + U.icon('x') + '</button></div>';
      recent.forEach((f) => {
        h += '<div class="side-row' + (fileCurrent(f) ? ' active' : '') + '" data-file="' + f.id + '">' +
          '<span class="ico">' + U.icon('history') + '</span>' +
          '<span class="txt">' + U.esc(f.title) + '</span></div>';
      });
      h += '</div>';
    }

    h += '<div class="side-block"><div class="side-head"><span>分类目录</span><span class="grow"></span>' +
      '<button data-side="new" title="新建文章">' + U.icon('plus') + '</button>' +
      '<button data-side="collapse-all" title="全部收起">' + U.icon('list') + '</button></div>';
    const r = route();
    D.visibleCats().forEach((cat) => {
      const open = !!treeState.cats[cat.id];
      const total = cat.subs.reduce((s, x) => s + x.files.length, 0);
      h += '<div class="tree-cat' + (open ? ' open' : '') + (catCurrent(cat.id) ? ' current' : '') + '" data-cat="' + cat.id + '">' +
        '<button class="tree-toggle" data-toggle-cat="' + cat.id + '" aria-label="展开">' + U.icon('chevronRight') + '</button>' +
        '<div class="cat-main" data-open-cat="' + cat.id + '">' +
        '<span class="dot" style="background:' + cat.color + '"></span>' +
        '<span class="cat-name' + ((r === '/c/' + cat.id) ? ' active' : '') + '">' + U.esc(cat.name) + '</span>' +
        '<span class="cat-count">' + total + '</span></div></div>';
      if (open) {
        h += '<div class="sub-tree">';
        cat.subs.forEach((sub, si) => {
          const sopen = !!treeState.subs[cat.id + '/' + sub.id];
          const files = sub.files;
          h += '<div class="sub-row' + (subCurrent(cat.id, sub.id) ? ' active' : '') + '">' +
            '<button class="ot-caret' + (sopen ? ' open' : '') + (files.length ? '' : ' leaf') + '" data-toggle-sub="' + cat.id + '/' + sub.id + '">' + U.icon('chevronRight') + '</button>' +
            '<div class="sub-main" data-open-sub="' + cat.id + '/' + sub.id + '"><span class="sub-name">' + U.esc(sub.name) + '</span><span class="sub-count">' + files.length + '</span></div></div>';
          if (sopen) {
            h += '<div class="file-tree">';
            files.forEach((f) => {
              const rec = D.get(cat.id + '/' + sub.id + '/' + f.file);
              if (!rec) return;
              const read = C.isRead(rec.id), star = C.isStarred(rec.id);
              const empty = !rec.words;
              h += '<div class="file-row' + (fileCurrent(rec) ? ' active' : '') + (read ? ' read' : '') + (empty ? ' empty' : '') + '" data-file="' + rec.id + '" data-preview="' + rec.id + '" data-rectx="' + rec.id + '">' +
                '<span class="fr-name">' + U.esc(rec.title) + '</span>' +
                '<span class="fr-count">' + (empty ? '空' : U.fmt(rec.words)) + '</span>' +
                '<button class="fr-star ' + (star ? 'on' : 'off') + '" data-star="' + rec.id + '" title="收藏">' + U.icon(star ? 'starFill' : 'star') + '</button></div>';
            });
            h += '</div>';
          }
        });
        h += '</div>';
      }
    });
    const readCount = D.visibleFiles().filter((f) => C.isRead(f.id)).length;
    const vs = D.dbStats();
    h += '</div>';
    h += '<div class="side-foot"><span>' + vs.files + ' 篇</span><span>已读 ' + readCount + '</span></div>';
    box.innerHTML = h;
  }

  /* ---------------- article rows ---------------- */
  function artRow(rec, opts) {
    opts = opts || {};
    const read = C.isRead(rec.id), star = C.isStarred(rec.id);
    const edited = C.hasEdit(rec.id);
    const q = opts.q || '';
    const toneColor = D.toneColor(rec.tone);
    const summary = U.highlight(rec.summary || '', q);
    return '<div class="art-row' + (read ? ' read' : '') + (rec.words ? '' : ' empty-file') + '" data-file="' + rec.id + '">' +
      '<div class="ar-main">' +
      '<div class="ar-title">' + U.highlight(rec.title, q) + (edited ? '<span class="ed">已编辑</span>' : '') + '</div>' +
      '<div class="ar-meta">' +
      (D.databases.length > 1 ? '<span class="db-tag" style="--db:' + (rec.dbColor || '#8A9099') + '"><i></i>' + U.esc(rec.dbName || '') + '</span>' : '') +
      '<span>' + U.esc(rec.catName) + '</span><span>' + (rec.words ? U.fmt(rec.words) + ' 字' : '空文件') + '</span>' +
      '<span class="tone" style="--tone:' + toneColor + '"><i></i>' + U.esc(rec.tone) + '</span>' +
      (rec.type ? '<span>' + U.esc(rec.type) + '</span>' : '') +
      (rec.updated ? '<span>更新 ' + U.esc(rec.updated) + '</span>' : '') +
      (read ? '<span style="color:var(--ok)">已读</span>' : '') + '</div>' +
      (rec.summary ? '<div class="ar-summary">' + summary + '</div>' : '') +
      ((rec.tags && rec.tags.length) ? '<div class="ar-tags">' + rec.tags.slice(0, 4).map((t) => '<span>' + U.esc(t) + '</span>').join('') + '</div>' : '') +
      '</div>' +
      '<div class="ar-side">' +
      '<button class="star-btn ' + (star ? 'on' : '') + '" data-star="' + rec.id + '" title="收藏">' + U.icon(star ? 'starFill' : 'star') + '</button>' +
      (read ? '<span class="ar-check">' + U.icon('check') + '</span>' : '') +
      '</div></div>';
  }

  function emptyBox(title, desc, iconName, actionHtml) {
    return '<div class="empty"><div class="e-ico">' + U.icon(iconName || 'book') + '</div><b>' + U.esc(title) + '</b><p>' + U.esc(desc || '') + '</p>' + (actionHtml || '') + '</div>';
  }

  function pageHead(crumb, title, sub, actions) {
    return '<div class="page-head"><div class="crumb">' + crumb + '</div>' +
      '<h1 class="page-title">' + title + '</h1>' +
      (sub ? '<div class="page-sub">' + sub + '</div>' : '') +
      (actions ? '<div class="page-actions">' + actions + '</div>' : '') + '</div>';
  }

  /* ---------------- home ---------------- */
  function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function kindLabel(kind) {
    return ({ builtin: '内置数据库', folder: '文件夹数据库', imported: '导入数据库' }[kind] || '数据库');
  }

  function dbScopeBar() {
    let h = '<div class="db-scope"><span class="scope-label">' + U.icon('database') + ' 当前视图</span>';
    h += '<button class="scope-chip' + (D.dbFilter === 'all' ? ' on' : '') + '" data-db-filter="all">全部 <b>' + D.stats.files + '</b></button>';
    D.databases.forEach((db) => {
      h += '<button class="scope-chip' + (D.dbFilter === db.id ? ' on' : '') + '" data-db-filter="' + db.id + '" style="--db:' + db.color + '">' +
        '<i></i>' + U.esc(db.short || db.name) + ' <b>' + db.stats.files + '</b></button>';
    });
    h += '<span class="scope-gap"></span><a class="scope-manage" href="#/databases">' + U.icon('settings') + ' 管理数据库</a></div>';
    return h;
  }

  function dbHomeCard(db) {
    return '<div class="db-card" style="--db:' + db.color + '">' +
      '<div class="dbc-head"><span class="dbc-ico">' + U.icon(db.icon || 'database') + '</span>' +
      '<div class="dbc-title"><b>' + U.esc(db.name) + '</b><span>' + U.esc(db.short || '') + ' · ' + kindLabel(db.kind) + '</span></div>' +
      '<span class="dbc-state' + (db.enabled === false ? ' off' : '') + '">' + (db.enabled === false ? '已停用' : '已启用') + '</span></div>' +
      '<p class="dbc-desc">' + U.esc(db.description || '') + '</p>' +
      '<div class="dbc-stats">' +
      '<div><b>' + U.fmt(db.stats.files) + '</b><span>篇</span></div>' +
      '<div><b>' + U.fmt(db.stats.words) + '</b><span>字</span></div>' +
      '<div><b>' + U.fmt(db.stats.links) + '</b><span>关联</span></div>' +
      '<div><b>' + U.fmt(db.stats.tags) + '</b><span>标签</span></div></div>' +
      '<div class="dbc-roots">' + (db.roots || []).map((r) => '<span>' + U.esc(r) + '</span>').join('') + '</div>' +
      '<div class="dbc-foot"><button class="btn sm" data-db-open="' + db.id + '">只看这个库</button>' +
      '<a class="dbc-manage" href="#/databases">' + U.icon('arrowRight') + '</a></div></div>';
  }

  function crossBoxHtml() {
    return '<div class="cross-box">' +
      '<div class="cross-bar"><span class="cross-ico">' + U.icon('search') + '</span>' +
      '<input id="crossInput" placeholder="输入一个字或词，例如「我」" autocomplete="off" spellcheck="false">' +
      '<button class="btn dark" id="crossGo">统计</button></div>' +
      '<div class="cross-quick"><span>试试</span>' +
      ['我', '雨', '时间', '城市', '记忆'].map((q) => '<button data-cross-q="' + q + '">' + q + '</button>').join('') +
      '<span class="cross-hint">同时统计命中文章、出现次数、覆盖字数与关联</span></div>' +
      '<div class="cross-out" id="crossOut"><div class="cross-placeholder">' + U.icon('sparkles') +
      '<p>输入一个字，看看它在两个数据库里出现了多少次。</p></div></div></div>';
  }

  function home() {
    D.init();
    const s = D.stats;
    const vs = D.dbStats();
    const visible = D.visibleFiles();
    const vcats = D.visibleCats();
    const readCount = visible.filter((f) => C.isRead(f.id)).length;
    const starCount = visible.filter((f) => C.isStarred(f.id)).length;
    const recent = C.recent.map((id) => D.get(id)).filter((f) => f && D.inDb(f));
    const cont = recent[0] || visible.find((f) => !C.isRead(f.id) && f.words) || visible[0];
    const insight = D.insights(visible);
    const maxTone = Math.max.apply(null, insight.tones.map((t) => t.count).concat([1]));
    const maxCatWords = Math.max.apply(null, vcats.map((c) => c.subs.reduce((a, x) => a + x.files.reduce((b, f) => b + (f.words || 0), 0), 0)).concat([1]));
    const catWords = (c) => c.subs.reduce((a, x) => a + x.files.reduce((b, f) => b + (f.words || 0), 0), 0);
    const avgWords = vs.files ? Math.round(vs.words / vs.files) : 0;
    const dbLine = D.databases.map((db) => db.short + ' ' + U.fmt(db.stats.files) + ' 篇').join(' + ');

    let h = '<section class="home-hero">';
    h += '<div class="hero-eyebrow">Private Library · ' + D.databases.length + ' databases · ' + s.files + ' pieces</div>';
    h += '<div class="hero-line"><div><h1 class="hero-title">写作库<em>。</em></h1>';
    h += '<p class="hero-sub">' + dbLine + '，合起来 ' + U.fmt(s.words) + ' 字。两个数据库各自独立，首页一起统计；可以随时加入新的库，也可以整个移出。</p></div>';
    h += '<div class="hero-actions">' +
      '<button class="btn" data-act="random">' + U.icon('compass') + '随手一篇</button>' +
      '<button class="btn" data-act="dashboard"><span class="hero-live-dot"></span>' + U.icon('chart') + '数据看台</button>' +
      '<button class="btn dark" data-act="draft">' + U.icon('pen') + '开始速写</button></div></div>';
    h += dbScopeBar();
    h += '<div class="stat-strip">' +
      '<div class="stat"><div class="sv">' + U.fmt(vs.files) + '</div><div class="sl">篇文章</div></div>' +
      '<div class="stat"><div class="sv">' + U.fmt(vs.words) + '</div><div class="sl">总字数</div></div>' +
      '<div class="stat"><div class="sv">' + D.databases.length + '</div><div class="sl">数据库</div></div>' +
      '<div class="stat"><div class="sv">' + vs.cats + '</div><div class="sl">类目</div></div>' +
      '<div class="stat"><div class="sv">' + vs.subs + '</div><div class="sl">子类</div></div>' +
      '<div class="stat"><div class="sv">' + U.fmt(vs.links) + '</div><div class="sl">关联</div></div>' +
      '</div></section>';

    h += '<section class="home-section"><div class="sec-head"><div><h2>数据库 <span class="n">' + D.databases.length + '</span></h2>' +
      '<p>各自成库、互不污染；写作台、草稿与插件都能同时读写。</p></div>' +
      '<a class="sec-link" href="#/databases">加入 / 移出 / 导出 ' + U.icon('arrowRight') + '</a></div>' +
      '<div class="db-grid">' + D.databases.map(dbHomeCard).join('') + '</div></section>';

    h += '<section class="home-section"><div class="sec-head"><div><h2>全库统计 <span class="n">' + (D.dbFilter === 'all' ? '两个数据库' : '当前库') + '</span></h2>' +
      '<p>数字来自正在查看的范围，切回「全部」即合并统计。</p></div>' +
      '<a class="sec-link" href="#/dashboard">打开数据看台 ' + U.icon('arrowRight') + '</a></div>' +
      '<div class="stat-grid">' +
      '<div class="sgrid-card"><b>' + U.fmt(vs.tags) + '</b><span>标签</span><p>两个数据库里出现过的标签总数</p></div>' +
      '<div class="sgrid-card"><b>' + U.fmt(vs.linked) + '</b><span>有链接的文章</span><p>至少有一条双向关联的文章</p></div>' +
      '<div class="sgrid-card"><b>' + U.fmt(vs.empty) + '</b><span>空文件</span><p>还没有正文，可以留着当占位</p></div>' +
      '<div class="sgrid-card"><b>' + U.fmt(avgWords) + '</b><span>篇均字数</span><p>当前范围内每篇的平均长度</p></div>' +
      '<div class="sgrid-card link" data-act="star"><b>' + U.fmt(starCount) + '</b><span>收藏</span><p>点一下查看收藏清单</p></div>' +
      '<div class="sgrid-card link" data-act="unread"><b>' + U.fmt(readCount) + '<em>/' + U.fmt(vs.files) + '</em></b><span>已读</span><p>在阅读页会自动留下足迹</p></div>' +
      '</div></section>';

    if (cont) {
      h += '<section class="home-section"><div class="sec-head"><div><h2>继续阅读</h2><p>从上次停下的地方接着读</p></div>' +
        '<a class="sec-link" href="#/unread">未读清单 ' + U.icon('arrowRight') + '</a></div>' +
        '<div class="continue-card" data-file="' + cont.id + '">' +
        '<span class="cc-ico">' + U.icon('bookOpen') + '</span>' +
        '<div class="cc-main"><div class="cc-label">' + (recent[0] ? '上次读到' : '为你推荐') + '</div>' +
        '<div class="cc-title">' + U.esc(cont.title) + '</div>' +
        '<div class="cc-sub">' + U.esc(cont.dbName || '') + ' · ' + U.esc(cont.catName) + ' · ' + U.esc(cont.subName) + ' · ' + U.fmt(cont.words) + ' 字</div></div>' +
        '<span class="cc-go">' + U.icon('arrowRight') + '</span></div></section>';
    }

    h += '<section class="home-section"><div class="sec-head"><div><h2>全库检索 <span class="n">' + (D.dbFilter === 'all' ? '跨库' : '单库') + '</span></h2>' +
      '<p>一次输入，同时统计命中、出现次数、覆盖字数与关联。</p></div></div>' + crossBoxHtml() + '</section>';

    h += '<section class="home-section"><div class="sec-head"><div><h2>分类 <span class="n">' + vcats.length + '</span></h2><p>按写作时间的自然聚类</p></div></div><div class="cat-grid">';
    vcats.forEach((cat) => {
      const files = cat.subs.reduce((a, x) => a + x.files.length, 0);
      const words = catWords(cat);
      const pct = Math.round(words / maxCatWords * 100);
      h += '<div class="cat-card" data-cat-open="' + cat.id + '" style="--cat:' + cat.color + '">' +
        '<div class="cc-top"><span class="cat-dot"></span><span class="cat-name">' + U.esc(cat.name) + '</span><span class="cat-arrow">' + U.icon('arrowUpRight') + '</span></div>' +
        '<div class="cat-desc">' + U.esc(cat.desc) + '</div>' +
        '<div class="cat-foot"><b>' + files + '</b> 篇 · ' + U.fmt(words) + ' 字 · ' + cat.subs.length + ' 子类 · ' + U.esc(cat.dbName || '') + '</div>' +
        '<div class="cat-bar"><i style="width:' + Math.max(pct, 4) + '%"></i></div></div>';
    });
    h += '</div></section>';

    h += '<section class="home-section"><div class="sec-head"><div><h2>库里的回声</h2><p>来自当前范围 ' + vs.files + ' 篇的高频意象与情绪</p></div></div>' +
      '<div class="insight-grid"><div class="insight-card"><h3>情绪分布 <span>' + insight.tones.length + ' 种</span></h3>' +
      '<div class="tone-stack">' + insight.tones.map((t) => '<i style="width:' + (t.count / (vs.files || 1) * 100) + '%;background:' + t.color + '" title="' + U.esc(t.name) + ' ' + t.count + '"></i>').join('') + '</div>';
    insight.tones.slice(0, 6).forEach((t) => {
      h += '<div class="tone-row" data-tone="' + U.esc(t.name) + '" style="--tone:' + t.color + '">' +
        '<span class="tone-name"><i></i>' + U.esc(t.name) + '</span>' +
        '<span class="tone-track"><i style="width:' + (t.count / maxTone * 100) + '%"></i></span>' +
        '<span class="tone-n">' + t.count + '</span></div>';
    });
    h += '</div><div class="insight-card"><h3>反复出现的世界元素 <span>≥ 4 次</span></h3><div class="entity-cloud">';
    insight.entities.slice(0, 18).forEach((e) => {
      h += '<span class="entity-chip" data-entity="' + U.esc(e.name) + '">' + U.esc(e.name) + '<span class="n">' + e.count + '</span></span>';
    });
    h += '</div></div></div></section>';

    if (S.projects.length) {
      h += '<section class="home-section"><div class="sec-head"><div><h2>我的写作 <span class="n">' + S.projects.length + '</span></h2><p>写作台的作品，实时出现在这里</p></div>' +
        '<a class="sec-link" href="#/mine">全部作品 ' + U.icon('arrowRight') + '</a></div><div class="project-strip">';
      S.projects.slice(0, 3).forEach((p) => {
        const chapters = S.sortedChapters(p);
        h += '<div class="project-card" data-project="' + p.id + '">' +
          '<div class="pc-top"><span class="pc-badge">' + U.icon('feather') + '</span><span class="pc-name">' + U.esc(p.name) + '</span></div>' +
          '<div class="pc-meta"><span>' + chapters.length + ' 章</span><span>' + U.fmt(S.countWords(p)) + ' 字</span><span>' + U.relTime(p.updatedAt) + '</span></div>' +
          '<div class="pc-go">进入阅读 ' + U.icon('arrowRight') + '</div></div>';
      });
      h += '</div></section>';
    }

    render(htmlWrap(h));
  }

  function htmlWrap(inner) {
    return '<div class="home">' + inner + '</div>';
  }

  function render(html) {
    const v = $('#libView');
    v.innerHTML = html;
    v.scrollTop = 0;
    $('#libMain').scrollTop = 0;
    bindCommon(v);
  }

  /* ---------------- database management ---------------- */
  let dbPageToken = 0;

  function manageDbCard(db) {
    const st = db.stats || {};
    const enabled = db.enabled !== false;
    return '<div class="mdb-card' + (enabled ? '' : ' off') + '" style="--db:' + db.color + '">' +
      '<div class="mdb-head"><span class="mdb-ico">' + U.icon(db.icon || 'database') + '</span>' +
      '<div class="mdb-title"><b>' + U.esc(db.name) + '</b><span>' + U.esc(db.short || '') + ' · ' + kindLabel(db.kind) + '</span></div>' +
      '<span class="mdb-state' + (enabled ? ' on' : '') + '">' + (enabled ? '首页可见' : '已移出视图') + '</span></div>' +
      '<p class="mdb-desc">' + U.esc(db.description || '') + '</p>' +
      '<div class="mdb-stats">' +
      '<div><b>' + U.fmt(st.files || 0) + '</b><span>篇</span></div>' +
      '<div><b>' + U.fmt(st.words || 0) + '</b><span>字</span></div>' +
      '<div><b>' + U.fmt(st.cats || 0) + '</b><span>类目</span></div>' +
      '<div><b>' + U.fmt(st.links || 0) + '</b><span>关联</span></div>' +
      '<div><b>' + U.fmt(st.tags || 0) + '</b><span>标签</span></div></div>' +
      '<div class="mdb-meta">' +
      '<div><span>目录</span><code>' + (db.roots || []).map((r) => U.esc(r)).join(' · ') + '</code></div>' +
      '<div><span>体积</span><code>' + fmtBytes(db.bytes) + '</code></div>' +
      (db.importedAt ? '<div><span>导入</span><code>' + U.esc(String(db.importedAt).slice(0, 10)) + '</code></div>' : '') +
      '</div>' +
      '<div class="mdb-actions">' +
      '<button class="btn sm' + (enabled ? '' : ' dark') + '" data-db-toggle="' + db.id + '" data-next="' + (enabled ? 'off' : 'on') + '">' + (enabled ? '停用' : '启用') + '</button>' +
      '<button class="btn sm" data-db-enter="' + db.id + '">' + U.icon('eye') + '只看这个库</button>' +
      '<button class="btn sm" data-db-refresh="' + db.id + '">' + U.icon('refresh') + '重建索引</button>' +
      '<button class="btn sm" data-db-export="' + db.id + '">' + U.icon('download') + '导出 ZIP</button>' +
      (db.removable ? '<button class="btn sm danger" data-db-remove="' + db.id + '">' + U.icon('trash') + '移出</button>' : '') +
      '</div></div>';
  }

  function databasesView() {
    D.init();
    const token = ++dbPageToken;
    let h = pageHead(
      '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span>数据库</span>',
      '数据库',
      '<span class="pill">' + D.databases.length + ' 个启用 · 合计 ' + U.fmt(D.stats.files) + ' 篇</span><span class="pill">md 仍是正本</span>',
      '<button class="btn sm" id="dbPageRefresh">' + U.icon('refresh') + '刷新</button>' +
      '<button class="btn sm dark" id="dbScanBtn">' + U.icon('search') + '扫描可加入的文件夹</button>'
    );
    h += '<div class="db-intro">' +
      '<div class="dbi-item"><b>彼此隔开</b><p>每个数据库有自己的目录、分类与索引。停用或移出一个库，另一个库不受影响。</p></div>' +
      '<div class="dbi-item"><b>首页合并统计</b><p>启用中的数据库会一起出现在首页；关掉一个，首页数字立刻只算剩下的。</p></div>' +
      '<div class="dbi-item"><b>放进来就能读</b><p>把 md 文件夹放到 04-资料与收件箱/数据库/ 下，扫描并登记后即可读写。</p></div>' +
      '<div class="dbi-item"><b>移出不删除</b><p>移出时整个目录会移到 07-备份/数据库/日期/，随时可以再放回来。</p></div>' +
      '</div>';
    h += '<div class="db-page-grid" id="dbPageGrid"><div class="db-loading"><i></i><span>正在读取数据库列表…</span></div></div>';
    h += '<section class="db-add-panel"><div class="dba-head"><div><h3>' + U.icon('plus') + ' 加入一个数据库</h3>' +
      '<p>只接受工作区「04-资料与收件箱/数据库」下的文件夹；加入只登记与建索引，不改动里面的 md。</p></div>' +
      '<button class="btn sm" id="dbScanBtn2">' + U.icon('search') + '扫描文件夹</button></div>' +
      '<div id="dbCandidates" class="db-candidates"><p class="hint">点「扫描文件夹」看看有哪些目录可以加入。</p></div></section>';
    render(h);
    const refreshBtn = $('#dbPageRefresh');
    if (refreshBtn) refreshBtn.onclick = databasesView;
    const scan1 = $('#dbScanBtn'), scan2 = $('#dbScanBtn2');
    if (scan1) scan1.onclick = scanDbFolders;
    if (scan2) scan2.onclick = scanDbFolders;
    loadDbPage(token);
  }

  async function loadDbPage(token) {
    try {
      const data = await window.Gen6Api.databases();
      if (token !== dbPageToken) return;
      const grid = $('#dbPageGrid');
      if (!grid) return;
      grid.innerHTML = (data.databases || []).map(manageDbCard).join('') ||
        '<div class="db-loading"><span>还没有启用任何数据库。</span></div>';
      bindDbPageActions(data);
    } catch (error) {
      const grid = $('#dbPageGrid');
      if (grid) grid.innerHTML = '<div class="db-loading error">' + U.icon('alert') + '<span>' + U.esc(error.message || '读取失败') + '</span></div>';
    }
  }

  function bindDbPageActions(data) {
    $$('[data-db-toggle]', $('#dbPageGrid')).forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-db-toggle');
        const next = btn.getAttribute('data-next') === 'on';
        btn.disabled = true;
        try {
          await window.Gen6Api.toggleDatabase(id, next);
          if (!next && D.dbFilter === id) D.setDbFilter('all');
          await window.Gen6Bridge.refreshLibrary({ silent: true, delay: 60 });
          renderSide();
          databasesView();
          U.toast(next ? '数据库已启用，首页已合并统计' : '数据库已停用，首页不再显示它', 'database');
        } catch (error) {
          btn.disabled = false;
          U.toast(error.message || '操作失败', 'alert');
        }
      };
    });
    $$('[data-db-enter]', $('#dbPageGrid')).forEach((btn) => {
      btn.onclick = () => {
        applyDbFilter(btn.getAttribute('data-db-enter'));
        nav('/');
      };
    });
    $$('[data-db-refresh]', $('#dbPageGrid')).forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-db-refresh');
        btn.disabled = true;
        btn.innerHTML = U.icon('refresh') + '重建中…';
        try {
          const result = await window.Gen6Api.refreshDatabase(id);
          await window.Gen6Bridge.refreshLibrary({ silent: true, delay: 60 });
          U.toast('索引已重建：' + U.fmt((result && result.index && result.index.count) || 0) + ' 篇', 'refresh');
          databasesView();
        } catch (error) {
          btn.disabled = false;
          btn.innerHTML = U.icon('refresh') + '重建索引';
          U.toast(error.message || '重建失败', 'alert');
        }
      };
    });
    $$('[data-db-export]', $('#dbPageGrid')).forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-db-export');
        const db = (data.databases || []).find((x) => x.id === id);
        btn.disabled = true;
        try {
          const blob = await window.Gen6Api.exportDatabase(id);
          U.download('数据库-' + safeName(db ? db.name : id) + '-' + U.todayKey() + '.zip', blob, 'application/zip');
          U.toast('已导出 ZIP', 'download');
        } catch (error) {
          U.toast(error.message || '导出失败', 'alert');
        }
        btn.disabled = false;
      };
    });
    $$('[data-db-remove]', $('#dbPageGrid')).forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-db-remove');
        const db = (data.databases || []).find((x) => x.id === id);
        if (!db) return;
        U.promptModal({
          title: '移出数据库「' + db.name + '」？',
          desc: '这个库会从首页和目录里消失，整个文件夹会移动到 07-备份/数据库/日期/，不会直接删除。需要确认请输入数据库名。',
          label: '输入数据库名',
          placeholder: db.name,
          okText: '移出数据库'
        }).then(async (typed) => {
          if (typed == null) return;
          if (typed.trim() !== db.name) { U.toast('名称不一致，已取消', 'alert'); return; }
          try {
            await window.Gen6Api.removeDatabase(id, typed.trim());
            if (D.dbFilter === id) D.setDbFilter('all');
            await window.Gen6Bridge.refreshLibrary({ silent: true, delay: 60 });
            renderSide();
            databasesView();
            U.toast('已移出「' + db.name + '」，可在 07-备份/数据库 找回', 'trash');
          } catch (error) {
            U.toast(error.message || '移出失败', 'alert');
          }
        });
      };
    });
  }

  function safeName(name) {
    return String(name || '数据库').replace(/[\\/:*?"<>|]/g, '·').slice(0, 60) || '数据库';
  }

  async function scanDbFolders() {
    const box = $('#dbCandidates');
    if (!box) return;
    box.innerHTML = '<div class="db-loading"><i></i><span>正在扫描 04-资料与收件箱/数据库…</span></div>';
    try {
      const data = await window.Gen6Api.scanDatabases();
      const list = data.candidates || [];
      if (!list.length) {
        box.innerHTML = '<p class="hint">没有发现新的文件夹。把 md 目录放到 <code>' + U.esc(data.dropRoot || '04-资料与收件箱/数据库') + '</code> 下，再扫描一次。</p>';
        return;
      }
      box.innerHTML = '<div class="dc-head"><span>发现 ' + list.length + ' 个可加入的文件夹</span><code>' + U.esc(data.dropRoot || '') + '</code></div>' +
        list.map((item) => '<div class="dc-row"><span class="dc-ico">' + U.icon('folder') + '</span>' +
          '<div class="dc-main"><b>' + U.esc(item.name) + '</b><span>' + U.esc(item.folder) + ' · ' + item.files + ' 篇 md</span></div>' +
          '<button class="btn sm dark" data-db-add="' + U.esc(item.folder) + '" data-name="' + U.esc(item.name) + '">加入</button></div>').join('');
      box.querySelectorAll('[data-db-add]').forEach((btn) => {
        btn.onclick = async () => {
          const folder = btn.getAttribute('data-db-add');
          const name = btn.getAttribute('data-name');
          const input = await U.promptModal({
            title: '加入数据库',
            desc: '登记后会为这个文件夹建立独立索引，里面的 md 不动。',
            label: '数据库名称',
            value: name,
            okText: '加入'
          });
          if (input == null || !input.trim()) return;
          btn.disabled = true;
          btn.innerHTML = U.icon('refresh') + '加入中…';
          try {
            await window.Gen6Api.addDatabase({ folder, name: input.trim() });
            await window.Gen6Bridge.refreshLibrary({ silent: true, delay: 60 });
            renderSide();
            U.toast('已加入「' + input.trim() + '」', 'database');
            databasesView();
          } catch (error) {
            btn.disabled = false;
            btn.innerHTML = '加入';
            U.toast(error.message || '加入失败', 'alert');
          }
        };
      });
    } catch (error) {
      box.innerHTML = '<p class="hint">扫描失败：' + U.esc(error.message || '本地服务没有响应') + '</p>';
    }
  }

  /* ---------------- lists ---------------- */
  function listPage(opts) {
    const rows = opts.files;
    let h = pageHead(opts.crumb, opts.title, opts.sub, opts.actions);
    if (!rows.length) {
      h += emptyBox(opts.emptyTitle || '这里还没有内容', opts.emptyDesc || '', opts.emptyIcon || 'book');
    } else {
      if (opts.group) {
        let last = null;
        rows.forEach((f) => {
          if (f.catId !== last) {
            last = f.catId;
            h += '<div class="group-head"><span class="cat-dot" style="background:' + f.catColor + '"></span><h3>' + U.esc(f.catName) + '</h3><span class="n">' + rows.filter((x) => x.catId === f.catId).length + '</span></div>';
          }
          h += artRow(f, { q: opts.q });
        });
      } else {
        rows.forEach((f) => { h += artRow(f, { q: opts.q }); });
      }
    }
    render(h);
  }

  function catView(catId) {
    D.init();
    const cat = D.cat(catId);
    if (!cat) return nav('/');
    if (D.dbFilter !== 'all' && cat.dbId && cat.dbId !== D.dbFilter) {
      D.setDbFilter(cat.dbId);
      renderSide();
    }
    treeState.cats[catId] = true; saveTree();
    const files = [];
    cat.subs.forEach((s) => s.files.forEach((f) => { const r = D.get(catId + '/' + s.id + '/' + f.file); if (r) files.push(r); }));
    const words = files.reduce((a, f) => a + f.words, 0);
    listPage({
      crumb: '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span class="crumb-db" style="--db:' + (cat.dbColor || '#8A9099') + '">' + U.esc(cat.dbName || '') + '</span>' + U.icon('chevronRight') + '<span>' + U.esc(cat.name) + '</span>',
      title: U.esc(cat.name),
      sub: '<span class="pill">' + files.length + ' 篇</span><span class="pill">' + U.fmt(words) + ' 字</span><span class="pill">' + cat.subs.length + ' 个子类</span>',
      actions: '<button class="btn sm dark" data-act="new-here" data-cat="' + catId + '">' + U.icon('plus') + '新建文章</button>' +
        '<button class="btn sm" data-act="random-cat">' + U.icon('compass') + '本类随机</button>' +
        '<button class="btn sm" data-act="export-dir" data-cat="' + catId + '">' + U.icon('download') + '导出 ZIP</button>' +
        '<button class="btn sm danger" data-act="delete-dir" data-cat="' + catId + '">' + U.icon('trash') + '删除目录</button>',
      files: files,
      group: true
    });
  }

  function subView(catId, subId) {
    D.init();
    const cat = D.cat(catId);
    const sub = D.sub(catId, subId);
    if (!cat || !sub) return nav('/');
    if (D.dbFilter !== 'all' && cat.dbId && cat.dbId !== D.dbFilter) {
      D.setDbFilter(cat.dbId);
      renderSide();
    }
    treeState.cats[catId] = true; treeState.subs[catId + '/' + subId] = true; saveTree();
    const files = sub.files.map((f) => D.get(catId + '/' + subId + '/' + f.file)).filter(Boolean);
    const words = files.reduce((a, f) => a + f.words, 0);
    listPage({
      crumb: '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span class="crumb-db" style="--db:' + (cat.dbColor || '#8A9099') + '">' + U.esc(cat.dbName || '') + '</span>' + U.icon('chevronRight') + '<a href="#/c/' + catId + '">' + U.esc(cat.name) + '</a>' + U.icon('chevronRight') + '<span>' + U.esc(sub.name) + '</span>',
      title: U.esc(sub.name),
      sub: '<span class="pill">' + files.length + ' 篇</span><span class="pill">' + U.fmt(words) + ' 字</span>',
      actions: '<button class="btn sm dark" data-act="new-here" data-cat="' + catId + '" data-sub="' + subId + '">' + U.icon('plus') + '新建文章</button>' +
        '<button class="btn sm" data-act="random-cat">' + U.icon('compass') + '本类随机</button>' +
        '<button class="btn sm" data-act="export-dir" data-cat="' + catId + '" data-sub="' + subId + '">' + U.icon('download') + '导出 ZIP</button>' +
        '<button class="btn sm danger" data-act="delete-dir" data-cat="' + catId + '" data-sub="' + subId + '">' + U.icon('trash') + '删除子目录</button>',
      files: files
    });
  }

  function starView() {
    D.init();
    const files = D.visibleFiles().filter((f) => C.isStarred(f.id));
    listPage({
      crumb: '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span>收藏</span>',
      title: '收藏',
      sub: '<span class="pill">' + files.length + ' 篇</span>' + scopePill(),
      files: files,
      emptyTitle: '还没有收藏',
      emptyDesc: '在文章页、列表或目录里点一下星标，喜欢的内容就会留在这里。',
      emptyIcon: 'star'
    });
  }

  function unreadView() {
    D.init();
    const pool = D.visibleFiles();
    const files = pool.filter((f) => !C.isRead(f.id));
    const read = pool.length - files.length;
    listPage({
      crumb: '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span>未读</span>',
      title: '未读',
      sub: '<span class="pill">已读 ' + read + ' / ' + pool.length + '</span><span class="pill">剩余 ' + files.length + ' 篇</span>' + scopePill(),
      files: files,
      emptyTitle: '全部读完了',
      emptyDesc: '当前范围内的文字都已留下足迹。可以回到首页，随便重读一篇。',
      emptyIcon: 'check'
    });
  }

  function toneView(name) {
    D.init();
    const files = D.visibleFiles().filter((f) => f.tone === name);
    const color = D.toneColor(name);
    listPage({
      crumb: '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span>情绪</span>',
      title: '<span style="display:inline-flex;align-items:center;gap:10px"><i style="width:10px;height:10px;border-radius:50%;background:' + color + '"></i>' + U.esc(name) + '</span>',
      sub: '<span class="pill">' + files.length + ' 篇</span><span class="pill">' + U.fmt(files.reduce((a, f) => a + f.words, 0)) + ' 字</span>' + scopePill(),
      files: files
    });
  }

  function scopePill() {
    const db = D.activeDb();
    return '<span class="pill db-pill" style="--db:' + (db ? db.color : '#8A9099') + '">' + U.esc(db ? db.name : '全部数据库') + '</span>';
  }

  function searchPage(q) {
    D.init();
    q = q || '';
    let files = [];
    if (q) {
      const scored = D.visibleFiles().map((f) => {
        const s = U.fuzzyScore(q, f.title) * 10 + U.fuzzyScore(q, f.summary) * 3 + U.fuzzyScore(q, (f.tags || []).join(' ')) * 2 + (f.text.indexOf(q) >= 0 ? 30 : 0);
        return { f, s };
      }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
      files = scored.map((x) => x.f);
    }
    listPage({
      crumb: '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span>搜索</span>',
      title: q ? '“' + U.esc(q) + '”' : '搜索',
      sub: '<span class="pill">' + files.length + ' 个结果</span>' + scopePill(),
      files: files,
      q: q,
      group: false,
      emptyTitle: '没有找到相关内容',
      emptyDesc: '换个关键词试试，或者按 ⌘K 打开快速切换器。',
      emptyIcon: 'search'
    });
  }

  function entitySearch(name) { searchPage(name); }

  /* ---------------- my writing mirror ---------------- */
  function mineView() {
    let h = pageHead(
      '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<span>我的写作</span>',
      '我的写作',
      '<span class="pill">' + S.projects.length + ' 部作品</span><span class="pill">与写作台实时同步</span>',
      '<button class="btn" data-act="open-writer">' + U.icon('feather') + '打开写作台</button>'
    );
    if (!S.projects.length) {
      h += emptyBox('写作台还是空的', '去写作台新建一部作品，或用顶栏「速写」随手记下第一段。', 'feather',
        '<button class="btn primary" data-act="open-writer">进入写作台</button>');
    } else {
      S.projects.forEach((p) => {
        const chapters = S.sortedChapters(p);
        h += '<div class="group-head"><span class="pc-badge" style="width:22px;height:22px">' + U.icon('feather') + '</span>' +
          '<h3>' + U.esc(p.name) + '</h3><span class="n">' + chapters.length + ' 章 · ' + U.fmt(S.countWords(p)) + ' 字</span>' +
          '<button class="btn sm" style="margin-left:auto" data-project-open="' + p.id + '">打开</button></div>';
        if (!chapters.length) {
          h += '<div class="hint" style="padding:8px 12px 12px">这部作品还没有章节。去大纲里添加第一章。</div>';
        } else {
          chapters.forEach((n) => {
            h += '<div class="art-row" data-project-chapter="' + p.id + '|' + n.id + '">' +
              '<div class="ar-main"><div class="ar-title">' + U.esc(n.title) + '</div>' +
              '<div class="ar-meta"><span>' + NODE_LABEL(n.type) + '</span><span>' + U.fmt(S.nodeWords(n)) + ' 字</span>' +
              (n.time ? '<span>' + U.esc(n.time) + '</span>' : '') + '</div>' +
              '<div class="ar-summary">' + U.esc(U.htmlToText(n.body).slice(0, 120) || '（还没有内容）') + '</div></div>' +
              '<div class="ar-side"><span class="cc-go">' + U.icon('chevronRight') + '</span></div></div>';
          });
        }
      });
    }
    render(h);
  }

  function NODE_LABEL(t) { return ({ vol: '卷', ch: '章', scene: '场景', note: '备注' }[t] || '章'); }

  function projectView(pid) {
    const p = S.get(pid);
    if (!p) return nav('/mine');
    const chapters = S.sortedChapters(p);
    let h = pageHead(
      '<a href="#/">写作库</a>' + U.icon('chevronRight') + '<a href="#/mine">我的写作</a>' + U.icon('chevronRight') + '<span>' + U.esc(p.name) + '</span>',
      U.esc(p.name),
      '<span class="pill">' + chapters.length + ' 章</span><span class="pill">' + U.fmt(S.countWords(p)) + ' 字</span><span class="pill">' + U.relTime(p.updatedAt) + '更新</span>',
      '<button class="btn dark" data-act="open-writer-current" data-pid="' + p.id + '">' + U.icon('pen') + '去写作台</button>' +
      '<button class="btn" data-act="export-project" data-pid="' + p.id + '">' + U.icon('download') + '导出</button>'
    );
    if (!chapters.length) h += emptyBox('还没有章节', '去写作台的大纲里添加第一章。', 'feather');
    chapters.forEach((n) => {
      h += '<div class="art-row" data-project-chapter="' + p.id + '|' + n.id + '">' +
        '<div class="ar-main"><div class="ar-title">' + U.esc(n.title) + '</div>' +
        '<div class="ar-meta"><span>' + NODE_LABEL(n.type) + '</span><span>' + U.fmt(S.nodeWords(n)) + ' 字</span>' +
        (n.time ? '<span>' + U.esc(n.time) + '</span>' : '') + '</div>' +
        '<div class="ar-summary">' + U.esc(U.htmlToText(n.body).slice(0, 130) || '（还没有内容）') + '</div></div>' +
        '<div class="ar-side"><span class="cc-go">' + U.icon('chevronRight') + '</span></div></div>';
    });
    render(h);
  }

  /* ---------------- cross database search ---------------- */
  let crossSeq = 0;

  function crossResultHtml(data) {
    const t = data.total || {};
    if (!t.docs) {
      return '<div class="cross-empty">' + U.icon('search') + '<b>没有找到「' + U.esc(data.query) + '」</b>' +
        '<p>换一个字试试，或者把视图切回「全部数据库」。</p></div>';
    }
    const maxOcc = Math.max.apply(null, (data.databases || []).map((d) => d.occurrences).concat([1]));
    let h = '<div class="cross-metrics">' +
      '<div><b>' + U.fmt(t.docs) + '</b><span>篇命中</span></div>' +
      '<div><b>' + U.fmt(t.occurrences) + '</b><span>出现次数</span></div>' +
      '<div><b>' + U.fmt(t.words) + '</b><span>覆盖字数</span></div>' +
      '<div><b>' + U.fmt(t.links) + '</b><span>关联</span></div>' +
      '<div><b>' + U.fmt(t.tags) + '</b><span>相关标签</span></div>' +
      '</div><div class="cross-dbs">';
    (data.databases || []).forEach((db) => {
      if (!db.docs && !db.occurrences) {
        h += '<div class="cross-db off" style="--db:' + db.color + '"><div class="cbd-head"><b>' + U.esc(db.name) + '</b><span>没有命中</span></div></div>';
        return;
      }
      h += '<div class="cross-db" style="--db:' + db.color + '">' +
        '<div class="cbd-head"><b>' + U.esc(db.name) + '</b><span>' + U.fmt(db.docs) + ' 篇 · ' + U.fmt(db.occurrences) + ' 次</span></div>' +
        '<div class="cbd-track"><i style="width:' + Math.max(3, Math.round(db.occurrences / maxOcc * 100)) + '%"></i></div>' +
        '<div class="cbd-foot"><span>' + U.fmt(db.words) + ' 字</span><span>' + U.fmt(db.links) + ' 条关联</span><span>' + U.fmt((db.topTags || []).length) + ' 个相关标签</span></div>' +
        ((db.topTags || []).length ? '<div class="cbd-tags">' + db.topTags.slice(0, 6).map((tag) =>
          '<button data-cross-q="' + U.esc(tag.name) + '">' + U.esc(tag.name) + '<b>' + tag.count + '</b></button>').join('') + '</div>' : '') +
        '</div>';
    });
    h += '</div><div class="cross-doc-list">';
    (data.topDocs || []).forEach((doc) => {
      h += '<button class="cross-doc" data-cross-doc="' + U.esc(doc.id) + '">' +
        '<span class="cdb" style="--db:' + (doc.dbColor || '#8A9099') + '">' + U.esc(doc.dbName) + '</span>' +
        '<span class="cd-main"><b>' + U.esc(doc.title) + '</b><span>' + U.esc(doc.catName) + ' / ' + U.esc(doc.subName) + ' · ' + U.fmt(doc.words) + ' 字 · ' + U.fmt(doc.relationCount || 0) + ' 关联</span></span>' +
        '<span class="cd-hits">' + U.fmt(doc.hits) + ' 次</span></button>';
    });
    h += '</div><div class="cross-foot"><span>用时 ' + U.fmt(data.elapsedMs || 0) + ' 毫秒 · 统计的是正文、标题与标签里的出现次数</span>' +
      '<a href="#/q/' + encodeURIComponent(data.query) + '">在文库中查看列表 ' + U.icon('arrowRight') + '</a></div>';
    return h;
  }

  async function runCrossSearch(q, input, out) {
    const query = String(q || '').trim();
    if (!query) {
      out.innerHTML = '<div class="cross-placeholder">' + U.icon('sparkles') + '<p>输入一个字，看看它在两个数据库里出现了多少次。</p></div>';
      return;
    }
    const seq = ++crossSeq;
    out.innerHTML = '<div class="cross-loading"><i></i><span>正在同时检索 ' + (D.dbFilter === 'all' ? '两个数据库' : '当前数据库') + '…</span></div>';
    try {
      const data = await window.Gen6Api.crossSearch(query, D.dbFilter);
      if (seq !== crossSeq) return;
      out.innerHTML = crossResultHtml(data);
    } catch (error) {
      if (seq !== crossSeq) return;
      out.innerHTML = '<div class="cross-empty">' + U.icon('alert') + '<b>检索失败</b><p>' + U.esc(error.message || '本地服务没有响应') + '</p></div>';
    }
  }

  function bindCross(root) {
    const input = root.querySelector('#crossInput');
    if (!input || input.__crossBound) return;
    input.__crossBound = true;
    const out = root.querySelector('#crossOut');
    let timer = null;
    const run = () => { clearTimeout(timer); runCrossSearch(input.value, input, out); };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 520); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    const go = root.querySelector('#crossGo');
    if (go) go.onclick = run;
    root.querySelectorAll('[data-cross-q]').forEach((b) => {
      b.onclick = () => { input.value = b.getAttribute('data-cross-q'); run(); };
    });
    out.addEventListener('click', (e) => {
      const doc = e.target.closest('[data-cross-doc]');
      if (doc) { nav('/a/' + encodeURIComponent(doc.getAttribute('data-cross-doc'))); return; }
      const tag = e.target.closest('[data-cross-q]');
      if (tag) { input.value = tag.getAttribute('data-cross-q'); run(); }
    });
  }

  /* ---------------- common bindings ---------------- */
  function bindCommon(root) {
    bindCross(root);
    root.querySelectorAll('[data-db-filter]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        applyDbFilter(el.getAttribute('data-db-filter'));
      });
    });
    root.querySelectorAll('[data-db-open]').forEach((el) => {
      el.addEventListener('click', () => {
        applyDbFilter(el.getAttribute('data-db-open'));
        nav('/');
        U.toast('当前只看「' + (D.activeDb() ? D.activeDb().name : '全部数据库') + '」', 'database');
      });
    });
    if (!root.__fileMenuBound) {
      root.__fileMenuBound = true;
      let pressTimer = null, pressStart = null, pressId = null, suppress = false;
      const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; pressStart = null; pressId = null; };
      root.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('[data-file]');
        if (!row) return;
        e.preventDefault();
        fileMenu(e.clientX, e.clientY, D.get(row.getAttribute('data-file')));
      });
      root.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        const row = e.target.closest('[data-file]');
        if (!row) return;
        pressId = row.getAttribute('data-file');
        pressStart = { x: e.clientX, y: e.clientY };
        pressTimer = setTimeout(() => {
          suppress = true;
          if (navigator.vibrate) { try { navigator.vibrate(16); } catch (err) {} }
          fileMenu(pressStart.x, pressStart.y, D.get(pressId));
          pressId = null;
        }, 520);
      });
      root.addEventListener('pointermove', (e) => {
        if (!pressStart) return;
        if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 9) cancelPress();
      });
      root.addEventListener('pointerup', cancelPress);
      root.addEventListener('pointercancel', cancelPress);
      root.addEventListener('click', (e) => {
        if (!suppress) return;
        suppress = false;
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }
    root.querySelectorAll('[data-file]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-star]')) return;
        const id = el.getAttribute('data-file');
        if (!id) return;
        if (el.classList.contains('side-row')) closeDrawer();
        nav('/a/' + encodeURIComponent(id));
      });
    });
    root.querySelectorAll('[data-star]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        const id = el.getAttribute('data-star');
        const on = C.toggleStar(id);
        el.classList.toggle('on', on);
        el.innerHTML = U.icon(on ? 'starFill' : 'star');
        U.toast(on ? '已加入收藏' : '已取消收藏', 'star');
        renderSide();
        if (route() === '/star') starView();
      });
    });
    root.querySelectorAll('[data-cat-open]').forEach((el) => {
      el.addEventListener('click', () => nav('/c/' + el.getAttribute('data-cat-open')));
    });
    root.querySelectorAll('[data-tone]').forEach((el) => {
      el.addEventListener('click', () => nav('/tone/' + encodeURIComponent(el.getAttribute('data-tone'))));
    });
    root.querySelectorAll('[data-entity]').forEach((el) => {
      el.addEventListener('click', () => entitySearch(el.getAttribute('data-entity')));
    });
    root.querySelectorAll('[data-project]').forEach((el) => {
      el.addEventListener('click', () => nav('/p/' + el.getAttribute('data-project')));
    });
    root.querySelectorAll('[data-project-open]').forEach((el) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); window.App.openWriter(el.getAttribute('data-project-open')); });
    });
    root.querySelectorAll('[data-project-chapter]').forEach((el) => {
      el.addEventListener('click', () => {
        const v = el.getAttribute('data-project-chapter').split('|');
        nav('/p/' + v[0] + '/' + v[1]);
      });
    });
    root.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', () => {
        const act = el.getAttribute('data-act');
        if (act === 'random' || act === 'random-cat') randomFile(act === 'random-cat' ? currentCatId() : null);
        else if (act === 'dashboard') nav('/dashboard');
        else if (act === 'draft') window.App.openDraft();
        else if (act === 'new-here') newArticleIn(el.getAttribute('data-cat'), el.getAttribute('data-sub') || null);
        else if (act === 'star') nav('/star');
        else if (act === 'unread') nav('/unread');
        else if (act === 'open-writer') window.App.openWriter();
        else if (act === 'open-writer-current') window.App.openWriter(el.getAttribute('data-pid'));
        else if (act === 'export-project') window.LibExport.exportProject(S.get(el.getAttribute('data-pid')));
        else if (act === 'export-dir') window.DocActions.exportDirectory(el.getAttribute('data-cat'), el.getAttribute('data-sub') || null);
        else if (act === 'delete-dir') window.DocActions.deleteDirectory(el.getAttribute('data-cat'), el.getAttribute('data-sub') || null);
      });
    });
  }

  function currentCatId() {
    const r = route();
    const m = r.match(/^\/[cs]\/([^/]+)/);
    return m ? m[1] : null;
  }

  function applyDbFilter(id) {
    D.setDbFilter(id);
    renderSide();
    const db = D.activeDb();
    U.toast('当前视图：' + (db ? db.name : '全部数据库'), 'database');
    if (window.App && window.App.route) window.App.route();
    else home();
  }

  function randomFile(catId) {
    const pool = catId ? D.files.filter((f) => f.catId === catId) : D.visibleFiles();
    const f = pool[Math.floor(Math.random() * pool.length)];
    if (f) {
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
      nav('/a/' + encodeURIComponent(f.id));
    }
  }

  /* ---------------- new / context menus ---------------- */
  function rowMenu(x, y, items) {
    const el = $('#ctxMenu');
    if (!el) return;
    el.innerHTML = items.map((it, i) =>
      it.sep ? '<div class="mi-sep"></div>' :
      '<button class="mi' + (it.danger ? ' danger' : '') + '" data-ci="' + i + '">' +
      '<span class="mi-ico">' + U.icon(it.icon || 'circle') + '</span><span class="grow">' + U.esc(it.label) + '</span></button>'
    ).join('');
    el.hidden = false;
    el.style.left = Math.max(8, Math.min(x, window.innerWidth - 228)) + 'px';
    el.style.top = Math.max(8, Math.min(y, window.innerHeight - (items.length * 38 + 18))) + 'px';
    el.querySelectorAll('[data-ci]').forEach((b) => {
      b.onclick = () => {
        el.hidden = true;
        const it = items[+b.getAttribute('data-ci')];
        if (it && it.fn) it.fn();
      };
    });
  }

  function newArticleIn(catId, subId) {
    const cat = D.cat(catId);
    if (!cat) { window.App.openDraft(); return; }
    const sub = subId ? D.sub(catId, subId) : null;
    window.Gen6Bridge.newArticle({
      type: cat.type,
      group: cat.name,
      sub: sub ? sub.name : '',
      dbId: cat.dbId || ''
    });
  }

  function catMenu(x, y, catId) {
    const cat = D.cat(catId);
    if (!cat) return;
    rowMenu(x, y, [
      { label: '在「' + cat.name + '」新建文章', icon: 'plus', fn: () => newArticleIn(catId, null) },
      { label: '打开目录', icon: 'folder', fn: () => nav('/c/' + catId) },
      { label: '本类随机一篇', icon: 'compass', fn: () => randomFile(catId) },
      { sep: true },
      { label: '导出这个目录（ZIP）', icon: 'download', fn: () => window.DocActions.exportDirectory(catId, null) },
      { label: '删除这个目录', icon: 'trash', danger: true, fn: () => window.DocActions.deleteDirectory(catId, null) }
    ]);
  }

  function subMenu(x, y, catId, subId) {
    const cat = D.cat(catId);
    const sub = D.sub(catId, subId);
    if (!cat || !sub) return;
    rowMenu(x, y, [
      { label: '在「' + sub.name + '」新建文章', icon: 'plus', fn: () => newArticleIn(catId, subId) },
      { label: '打开子类', icon: 'folder', fn: () => nav('/s/' + catId + '/' + subId) },
      { label: '本类随机一篇', icon: 'compass', fn: () => randomFile(catId) },
      { sep: true },
      { label: '导出这个子目录（ZIP）', icon: 'download', fn: () => window.DocActions.exportDirectory(catId, subId) },
      { label: '删除这个子目录', icon: 'trash', danger: true, fn: () => window.DocActions.deleteDirectory(catId, subId) }
    ]);
  }

  function fileMenu(x, y, rec) {
    if (!rec) return;
    const star = C.isStarred(rec.id);
    rowMenu(x, y, [
      { label: '阅读', icon: 'bookOpen', fn: () => nav('/a/' + encodeURIComponent(rec.id)) },
      { label: '沉浸写作', icon: 'pen', fn: () => window.Immersive.openDoc(rec.id) },
      { label: '在写作台导图打开', icon: 'tree', fn: () => window.Gen6Bridge.openInMap(rec.id) },
      { label: star ? '取消收藏' : '收藏', icon: star ? 'starFill' : 'star', fn: () => {
        C.toggleStar(rec.id);
        renderSide();
        U.toast(star ? '已取消收藏' : '已加入收藏', 'star');
      } },
      { label: '重命名', icon: 'doc', danger: false, fn: () => renameArticle(rec) },
      { sep: true },
      { label: '版本历史', icon: 'history', fn: () => window.DocActions.history(rec) },
      { label: '一键上传到 Git', icon: 'upload', fn: () => window.DocActions.gitUpload(rec) },
      { label: '移动到其他目录', icon: 'folder', fn: () => window.DocActions.transfer(rec, 'move') },
      { label: '复制到其他目录', icon: 'file', fn: () => window.DocActions.transfer(rec, 'copy') },
      { label: '存入草稿箱', icon: 'note', fn: () => window.DocActions.toDraft(rec) }
    ]);
  }

  function renameArticle(rec) {
    U.promptModal({ title: '重命名文章', label: '标题会写回 md 文件名与正文标题', value: rec.title, okText: '保存' }).then(async (v) => {
      if (v == null || !v.trim() || v.trim() === rec.title) return;
      try {
        const result = await window.Gen6Bridge.saveDoc({
          id: rec.id,
          title: v.trim(),
          html: rec.html || '',
          cats: rec.cats,
          tags: rec.tags || [],
          status: rec.status,
          baseHash: rec.bodyHash
        });
        if (!result || !result.ok) { U.toast('没有改名', 'info'); return; }
        await window.Gen6Bridge.refreshLibrary({ silent: true, delay: 60 });
        renderSide();
        U.toast('已改名并写回 md', 'check');
        if (/^\/a\//.test(route())) window.Reader.open(rec.id);
      } catch (error) {
        U.toast(error.message || '改名失败', 'alert');
      }
    });
  }

  /* ---------------- sidebar bindings ---------------- */
  function bindSide() {
    const box = $('#sideScroll');
    if (!box) return;
    let suppressClick = false;
    box.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      const dbFilter = e.target.closest('[data-db-filter]');
      if (dbFilter) { e.preventDefault(); applyDbFilter(dbFilter.getAttribute('data-db-filter')); return; }
      const dbManage = e.target.closest('[data-db-manage]');
      if (dbManage) { e.preventDefault(); nav('/databases'); return; }
      const star = e.target.closest('[data-star]');
      if (star) {
        e.stopPropagation();
        const id = star.getAttribute('data-star');
        const on = C.toggleStar(id);
        U.toast(on ? '已加入收藏' : '已取消收藏', 'star');
        renderSide();
        return;
      }
      const toggleCat = e.target.closest('[data-toggle-cat]');
      if (toggleCat) {
        const id = toggleCat.getAttribute('data-toggle-cat');
        treeState.cats[id] = !treeState.cats[id];
        saveTree(); renderSide(); return;
      }
      const toggleSub = e.target.closest('[data-toggle-sub]');
      if (toggleSub) {
        const key = toggleSub.getAttribute('data-toggle-sub');
        treeState.subs[key] = !treeState.subs[key];
        saveTree(); renderSide(); return;
      }
      const openCat = e.target.closest('[data-open-cat]');
      if (openCat) { nav('/c/' + openCat.getAttribute('data-open-cat')); return; }
      const openSub = e.target.closest('[data-open-sub]');
      if (openSub) {
        const v = openSub.getAttribute('data-open-sub').split('/');
        nav('/s/' + v[0] + '/' + v[1]); return;
      }
      const file = e.target.closest('[data-file]');
      if (file) { nav('/a/' + encodeURIComponent(file.getAttribute('data-file'))); closeDrawer(); return; }
      const act = e.target.closest('[data-side]');
      if (act) {
        const a = act.getAttribute('data-side');
        if (a === 'new') { newArticleIn(currentCatId(), null); return; }
        if (a === 'clear-recent') { C.recent = []; C.saveRecent(); renderSide(); U.toast('最近打开已清空'); }
        if (a === 'collapse-all') { treeState = { cats: {}, subs: {} }; saveTree(); renderSide(); }
      }
    });

    box.addEventListener('contextmenu', (e) => {
      const file = e.target.closest('[data-file]');
      const cat = e.target.closest('[data-cat]');
      const sub = e.target.closest('[data-open-sub]');
      if (!file && !cat && !sub) return;
      e.preventDefault();
      if (file) { fileMenu(e.clientX, e.clientY, D.get(file.getAttribute('data-file'))); return; }
      if (sub) {
        const v = sub.getAttribute('data-open-sub').split('/');
        subMenu(e.clientX, e.clientY, v[0], v[1]);
        return;
      }
      catMenu(e.clientX, e.clientY, cat.getAttribute('data-cat'));
    });

    let pressTimer = null, pressStart = null, pressRow = null;
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; pressRow = null; };
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const file = e.target.closest('[data-file]');
      const cat = e.target.closest('[data-cat]');
      const sub = e.target.closest('[data-open-sub]');
      if (!file && !cat && !sub) return;
      pressStart = { x: e.clientX, y: e.clientY };
      pressRow = file ? { kind: 'file', id: file.getAttribute('data-file') }
        : sub ? { kind: 'sub', ids: sub.getAttribute('data-open-sub').split('/') }
        : { kind: 'cat', id: cat.getAttribute('data-cat') };
      pressTimer = setTimeout(() => {
        const row = pressRow;
        if (!row) return;
        suppressClick = true;
        if (navigator.vibrate) { try { navigator.vibrate(16); } catch (err) {} }
        if (row.kind === 'file') fileMenu(pressStart.x, pressStart.y, D.get(row.id));
        else if (row.kind === 'sub') subMenu(pressStart.x, pressStart.y, row.ids[0], row.ids[1]);
        else catMenu(pressStart.x, pressStart.y, row.id);
        pressRow = null;
      }, 520);
    });
    box.addEventListener('pointermove', (e) => {
      if (!pressStart) return;
      if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 9) cancelPress();
    });
    box.addEventListener('pointerup', cancelPress);
    box.addEventListener('pointercancel', cancelPress);

    /* hover preview */
    let tip = null, timer = null;
    box.addEventListener('mouseenter', (e) => {
      const row = e.target.closest('[data-preview]');
      if (!row || U.isTouch()) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const rec = D.get(row.getAttribute('data-preview'));
        if (!rec) return;
        if (!tip) {
          tip = document.createElement('div');
          tip.className = 'hover-tip';
          document.body.appendChild(tip);
        }
        tip.innerHTML = '<b>' + U.esc(rec.title) + '</b><div class="ht-meta">' + U.esc(rec.catName) + ' · ' + U.esc(rec.subName) + ' · ' + U.fmt(rec.words) + ' 字</div>' +
          '<p>' + U.esc((rec.summary || rec.text || '').slice(0, 120)) + '…</p>';
        const r = row.getBoundingClientRect();
        tip.style.left = Math.min(r.right + 12, window.innerWidth - 300) + 'px';
        tip.style.top = Math.min(r.top, window.innerHeight - 170) + 'px';
        tip.classList.add('on');
      }, 350);
    }, true);
    box.addEventListener('mouseleave', () => { clearTimeout(timer); if (tip) tip.classList.remove('on'); }, true);
    box.addEventListener('scroll', () => { if (tip) tip.classList.remove('on'); }, true);
  }

  function openDrawer() {
    $('#sidebar').classList.add('open');
    $('#drawerMask').classList.add('on');
  }
  function closeDrawer() {
    $('#sidebar').classList.remove('open');
    $('#drawerMask').classList.remove('on');
  }

  /* watch route for active tree state */
  function syncTreeForRoute(r) {
    let changed = false;
    const mSub = r.match(/^\/s\/([^/]+)\/([^/]+)/);
    const mCat = r.match(/^\/c\/([^/]+)/);
    const mFile = r.match(/^\/a\/(.+)$/);
    if (mSub) {
      if (!treeState.cats[mSub[1]]) { treeState.cats[mSub[1]] = true; changed = true; }
      if (!treeState.subs[mSub[1] + '/' + mSub[2]]) { treeState.subs[mSub[1] + '/' + mSub[2]] = true; changed = true; }
    } else if (mCat) {
      if (!treeState.cats[mCat[1]]) { treeState.cats[mCat[1]] = true; changed = true; }
    } else if (mFile) {
      const f = D.get(decodeURIComponent(mFile[1]));
      if (f) {
        if (!treeState.cats[f.catId]) { treeState.cats[f.catId] = true; changed = true; }
        const key = f.catId + '/' + f.subId;
        if (!treeState.subs[key]) { treeState.subs[key] = true; changed = true; }
      }
    }
    if (changed) saveTree();
  }

  window.Lib = {
    home, catView, subView, starView, unreadView, toneView, searchPage, mineView, projectView, databasesView,
    renderSide, bindSide, bindCommon, nav, route, closeDrawer, openDrawer, randomFile,
    syncTreeForRoute, NODE_LABEL, artRow, emptyBox, pageHead, fileId, render, rowMenu
  };
  window.NODE_LABEL = NODE_LABEL;
})();
