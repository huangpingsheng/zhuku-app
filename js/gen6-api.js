/* ============================================================
   gen6-api.js · 本地服务读写 / 冲突处理 / 文库刷新 / 导图桥
   ============================================================ */
(function () {
  'use strict';
  const U = window.U;
  const D = window.LibData, S = window.Store, C = window.Curation;

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.status = status || 0;
      this.data = data || null;
    }
  }

  async function request(url, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (error) {
      throw new ApiError('连不上本地写作台服务，请确认启动窗口还开着。', 0, null);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { message: text }; }
    if (!res.ok) {
      throw new ApiError((data && data.message) || `请求失败（${res.status}）`, res.status, data);
    }
    return data;
  }

  const Api = {
    library: () => request('/api/library?compact=1'),
    article: (id) => request('/api/article?id=' + encodeURIComponent(id)),
    create: (payload) => request('/api/article', { method: 'POST', body: payload }),
    update: (id, payload) => request('/api/article?id=' + encodeURIComponent(id), { method: 'PUT', body: payload }),
    search: (q, db) => request('/api/search?q=' + encodeURIComponent(q) + (db && db !== 'all' ? '&db=' + encodeURIComponent(db) : '')),
    crossSearch: (q, db) => request('/api/cross-search?q=' + encodeURIComponent(q) + (db && db !== 'all' ? '&db=' + encodeURIComponent(db) : '')),
    system: () => request('/api/system'),
    dashboard: (days) => request('/api/dashboard?days=' + encodeURIComponent(days || 30)),

    databases: () => request('/api/databases'),
    scanDatabases: () => request('/api/databases/scan', { method: 'POST', body: {} }),
    addDatabase: (payload) => request('/api/databases/add', { method: 'POST', body: payload || {} }),
    toggleDatabase: (id, enabled) => request('/api/databases/toggle', { method: 'POST', body: { id, enabled } }),
    removeDatabase: (id, confirmText) => request('/api/databases/remove', { method: 'POST', body: { id, confirmText } }),
    refreshDatabase: (id) => request('/api/databases/refresh', { method: 'POST', body: { id } }),
    gitStatus: () => request('/api/git/status'),
    gitCommit: (message) => request('/api/git/commit', { method: 'POST', body: { message } }),
    gitPush: () => request('/api/git/push', { method: 'POST', body: {} }),
    gitUpload: (id, payload) => request('/api/git/upload', { method: 'POST', body: Object.assign({ id }, payload || {}) }),

    githubConfig: () => request('/api/github/config'),
    saveGithubConfig: (payload) => request('/api/github/config', { method: 'PUT', body: payload || {} }),
    testGithub: (payload) => request('/api/github/test', { method: 'POST', body: payload || {} }),
    githubCheck: () => request('/api/github/check', { method: 'POST', body: {} }),
    githubPull: (payload) => request('/api/github/pull', { method: 'POST', body: payload || {} }),
    githubPush: (payload) => request('/api/github/push', { method: 'POST', body: payload || {} }),
    githubResolve: (items) => request('/api/github/resolve', { method: 'POST', body: { items } }),
    githubDisconnect: (mode) => request('/api/github/disconnect', { method: 'POST', body: { mode } }),
    maintenance: (action) => request('/api/maintenance', { method: 'POST', body: { action } }),

    workspace: () => request('/api/workspace'),
    saveWorkspace: (payload) => request('/api/workspace', { method: 'PUT', body: payload }),
    settings: () => request('/api/settings'),
    saveSettings: (payload) => request('/api/settings', { method: 'PUT', body: payload }),

    drafts: () => request('/api/drafts'),
    createDraft: (payload) => request('/api/drafts', { method: 'POST', body: payload }),
    updateDraft: (id, payload) => request('/api/drafts?id=' + encodeURIComponent(id), { method: 'PUT', body: payload }),
    deleteDraft: (id) => request('/api/drafts?id=' + encodeURIComponent(id), { method: 'DELETE' }),
    publishDraft: (draftId, payload) => request('/api/drafts/publish', { method: 'POST', body: Object.assign({ draftId }, payload || {}) }),

    revisions: (id) => request('/api/revisions?id=' + encodeURIComponent(id)),
    revision: (id, rev) => request('/api/revision?id=' + encodeURIComponent(id) + '&rev=' + encodeURIComponent(rev)),
    restoreRevision: (id, rev) => request('/api/revision/restore', { method: 'POST', body: { id, rev } }),

    move: (id, payload) => request('/api/article/move', { method: 'POST', body: Object.assign({ id }, payload || {}) }),
    copy: (id, payload) => request('/api/article/copy', { method: 'POST', body: Object.assign({ id }, payload || {}) }),
    deleteDirectory: (payload) => request('/api/directory/delete', { method: 'POST', body: payload || {} }),
    renameDirectory: (payload) => request('/api/directory/rename', { method: 'POST', body: payload || {} }),

    obsidianScan: (payload) => request('/api/obsidian/scan', { method: 'POST', body: payload || {} }),
    obsidianImport: (payload) => request('/api/obsidian/import', { method: 'POST', body: payload || {} }),
    obsidianExport: (payload) => request('/api/obsidian/export', { method: 'POST', body: payload || {} }),

    plugins: () => request('/api/plugins'),
    installPlugin: (payload) => request('/api/plugins/install', { method: 'POST', body: payload || {} }),
    togglePlugin: (id, enabled) => request('/api/plugins/toggle', { method: 'POST', body: { id, enabled } }),
    deletePlugin: (id) => request('/api/plugins/delete', { method: 'POST', body: { id } }),
    market: (url, force) => request('/api/plugins/market', { method: 'POST', body: { url, force: !!force } }),
  };

  async function exportZip(query) {
    const qs = new URLSearchParams();
    Object.keys(query || {}).forEach((key) => {
      if (query[key] != null && query[key] !== '') qs.set(key, query[key]);
    });
    const res = await fetch('/api/export/zip?' + qs.toString());
    if (!res.ok) {
      let message = `导出失败（${res.status}）`;
      try {
        const data = await res.json();
        if (data && data.message) message = data.message;
      } catch (e) { /* 忽略 */ }
      throw new ApiError(message, res.status, null);
    }
    return res.blob();
  }

  async function exportDatabaseBlob(id) {
    const res = await fetch('/api/databases/export?id=' + encodeURIComponent(id));
    if (!res.ok) {
      let message = `导出失败（${res.status}）`;
      try {
        const data = await res.json();
        if (data && data.message) message = data.message;
      } catch (e) { /* 忽略 */ }
      throw new ApiError(message, res.status, null);
    }
    return res.blob();
  }

  function markdownOf(title, html) {
    const md = U.htmlToMarkdown(html || '').trim();
    return '# ' + (title || '无题') + (md ? '\n\n' + md : '') + '\n';
  }

  function plainOfTitle(title, html) {
    return U.htmlToText(html || '') || title || '';
  }

  function confirmConflict(current, localWords) {
    return new Promise((resolve) => {
      const currentWords = (current && current.words) || 0;
      const m = U.openModal(
        '<div class="modal-head"><div><h3>这篇文件在别处被改过</h3>' +
        '<p>磁盘上的版本与当前编辑不一致。请选择保留哪一个。</p></div></div>' +
        '<div class="modal-body">' +
        '<div class="conflict-grid">' +
        '<div><b>磁盘版本</b><span>' + U.fmt(currentWords) + ' 字 · ' + U.esc((current && current.updated) || '未知时间') + '</span></div>' +
        '<div><b>当前编辑</b><span>' + U.fmt(localWords || 0) + ' 字</span></div>' +
        '</div>' +
        '<p class="warn" style="margin-top:12px">覆盖会先自动备份磁盘文件，但仍建议先载入磁盘版本看一眼。</p></div>' +
        '<div class="modal-foot"><div class="foot-actions">' +
        '<button class="btn ghost" data-cancel>先不处理</button>' +
        '<button class="btn" data-reload>载入磁盘版本</button>' +
        '<button class="btn danger" data-force>用当前编辑覆盖</button>' +
        '</div></div>'
      );
      const done = (value) => { m.close(); resolve(value); };
      m.box.querySelector('[data-cancel]').onclick = () => done('cancel');
      m.box.querySelector('[data-reload]').onclick = () => done('reload');
      m.box.querySelector('[data-force]').onclick = () => done('force');
      m.ov.onclick = (e) => { if (e.target === m.ov) done('cancel'); };
    });
  }

  function confirmFrozen(current) {
    return new Promise((resolve) => {
      const m = U.openModal(
        '<div class="modal-head"><div><h3>这篇内容已冻结</h3>' +
        '<p>当前状态是「' + U.esc((current && current.status) || '已发布') + '」。已发布 / 已归档的内容不能直接改。</p></div></div>' +
        '<div class="modal-body"><p>把状态改成「定稿」后保存，会生成一个待发布的新版本；原版本仍会保留在 Git 备份里。</p></div>' +
        '<div class="modal-foot"><div class="foot-actions">' +
        '<button class="btn ghost" data-cancel>取消</button>' +
        '<button class="btn primary" data-ok>改为定稿并保存</button>' +
        '</div></div>'
      );
      const done = (value) => { m.close(); resolve(value); };
      m.box.querySelector('[data-cancel]').onclick = () => done(false);
      m.box.querySelector('[data-ok]').onclick = () => done(true);
      m.ov.onclick = (e) => { if (e.target === m.ov) done(false); };
    });
  }

  async function saveDoc(payload, options) {
    const opts = options || {};
    const body = {
      title: payload.title,
      body: markdownOf(payload.title, payload.html),
      cats: payload.cats,
      tags: payload.tags,
      status: payload.status,
      baseHash: payload.baseHash || '',
      force: !!opts.force,
    };
    if (payload.dir) body.dir = payload.dir;
    try {
      const result = await Api.update(payload.id, body);
      return { ok: true, article: result.article, backup: result.backup, moved: result.moved };
    } catch (error) {
      if (error.status === 409 && error.data) {
        if (error.data.code === 'CONFLICT') {
          const choice = await confirmConflict(error.data.current, U.countWords(payload.html));
          if (choice === 'force') {
            return saveDoc(payload, { force: true });
          }
          if (choice === 'reload') {
            return { ok: false, reloaded: true, current: error.data.current };
          }
          return { ok: false, cancelled: true };
        }
        if (error.data.code === 'FROZEN') {
          const ok = await confirmFrozen(error.data.current);
          if (ok) {
            const retry = Object.assign({}, payload, { status: '定稿' });
            return saveDoc(retry, opts);
          }
          return { ok: false, frozen: true };
        }
      }
      throw error;
    }
  }

  let refreshTimer = null;
  let refreshing = null;

  async function doRefresh(silent) {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const raw = await Api.library();
      window.LIB = {
        version: raw.version,
        cats: raw.cats,
        stats: raw.stats,
        databases: raw.databases,
        generatedAt: raw.generatedAt
      };
      D.rebuild(raw);
      if (window.Lib && window.Lib.renderSide) window.Lib.renderSide();
      if (window.Gen6Projects && window.Gen6Projects.syncAll) {
        try { await window.Gen6Projects.syncAll({ quiet: true }); } catch (e) { console.warn(e); }
      }
      if (!silent) U.toast('文库已同步', 'refresh');
      return raw;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }

  function refreshLibrary(options) {
    const opts = options || {};
    clearTimeout(refreshTimer);
    return new Promise((resolve) => {
      refreshTimer = setTimeout(() => {
        doRefresh(opts.silent).then(resolve).catch((error) => {
          console.warn(error);
          if (!opts.quiet) U.toast(error.message || '文库刷新失败', 'alert');
          resolve(null);
        });
      }, opts.delay == null ? 450 : opts.delay);
    });
  }

  async function reloadArticle(id) {
    const { article } = await Api.article(id);
    if (window.LibData) window.LibData.applyArticle(article);
    return article;
  }

  /* ---------------- 写作台节点 ↔ md ---------------- */
  const nodeTimers = new Map();

  function markNodeSync(nodeId, text, ok) {
    const el = document.getElementById('eds-' + nodeId);
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? 'var(--ok)' : 'var(--ink-3)';
    if (ok) setTimeout(() => { if (el.textContent === text) el.textContent = '已保存'; }, 2200);
  }

  async function writeNode(n) {
    if (!n || !n.docId) return;
    try {
      if (!n.docHash) {
        const { article } = await Api.article(n.docId);
        n.docHash = article.bodyHash;
      }
      const result = await Api.update(n.docId, {
        title: n.title,
        body: markdownOf(n.title, n.body || ''),
        baseHash: n.docHash,
      });
      n.docHash = result.article.bodyHash;
      n.updatedAt = Date.now();
      D.applyArticle(result.article);
      markNodeSync(n.id, '已同步文库', true);
      refreshLibrary({ silent: true, delay: 900 });
    } catch (error) {
      if (error.status === 409 && error.data && error.data.code === 'CONFLICT') {
        const choice = await confirmConflict(error.data.current, U.countWords(n.body || ''));
        if (choice === 'force') {
          const result = await Api.update(n.docId, {
            title: n.title,
            body: markdownOf(n.title, n.body || ''),
            baseHash: error.data.current.bodyHash,
            force: true,
          });
          n.docHash = result.article.bodyHash;
          D.applyArticle(result.article);
          markNodeSync(n.id, '已覆盖并同步', true);
          refreshLibrary({ silent: true, delay: 600 });
          return;
        }
        if (choice === 'reload') {
          const { article } = await Api.article(n.docId);
          n.body = article.html;
          n.title = article.title;
          n.docHash = article.bodyHash;
          n._conflict = false;
          if (window.Writer && window.Writer.getProject() === S.get(window.Writer.state.pid)) {
            window.Writer.refreshAfterNodeChange(false);
          }
          U.toast('已载入磁盘版本', 'refresh');
          return;
        }
        n._conflict = true;
        markNodeSync(n.id, '有冲突，待处理', false);
        U.toast('这篇在别处被改过，请回到写作台处理', 'alert');
        return;
      }
      markNodeSync(n.id, '同步失败', false);
      console.warn(error);
    }
  }

  function onNodeSaved(n) {
    if (!n || !n.docId) return;
    clearTimeout(nodeTimers.get(n.docId));
    nodeTimers.set(n.docId, setTimeout(() => {
      nodeTimers.delete(n.docId);
      writeNode(n);
    }, 2200));
  }

  function flushNode(n) {
    if (!n || !n.docId) return Promise.resolve();
    clearTimeout(nodeTimers.get(n.docId));
    nodeTimers.delete(n.docId);
    return writeNode(n);
  }

  /* ---------------- 收入文库 ---------------- */
  function defaultPublishMeta(n, p) {
    const projectName = String((p && p.name) || '').replace(/^《|》$/g, '');
    const isNovel = /日月循环|小说|雾港|故事/.test(projectName) || (p && p.libKind === 'novel');
    const type = isNovel ? '小说' : (/毕设|潮汐/.test(projectName) ? '毕设' : '资料');
    const parent = p ? (p.nodes || []).find((x) => x.id === (n.parents || [])[0]) : null;
    const volume = parent && parent.type === 'vol' ? parent.title : (type === '小说' ? '未分卷' : '未分类');
    const work = projectName || (type === '小说' ? '未分类' : '未分类');
    return {
      type,
      work,
      volume,
      group: /资料|素材|全景/.test(projectName) ? (parent ? parent.title : '未分类') : projectName,
      sub: volume,
      tags: [work, volume].filter(Boolean).join(','),
    };
  }

  function publishNodeModal(n, p) {
    const meta = defaultPublishMeta(n, p);
    const m = U.openModal(
      '<div class="modal-head"><div><h3>收入文库</h3><p>会把这一章的正文写成一篇 md，目录和写作库同时出现。</p></div></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label>标题</label><input class="input" id="pubTitle" value="' + U.esc(n.title) + '"></div>' +
      '<div class="field"><label>类型</label><select class="input" id="pubType">' +
      ['小说', '资料', '素材', '毕设'].map((t) => '<option' + (t === meta.type ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select></div>' +
      '<div class="field" id="pubNovel"><label>作品 / 卷</label><div class="field-2col"><input class="input" id="pubWork" value="' + U.esc(meta.work) + '" placeholder="作品"><input class="input" id="pubVolume" value="' + U.esc(meta.volume) + '" placeholder="卷"></div></div>' +
      '<div class="field" id="pubOther" hidden><label>分类 / 子类</label><div class="field-2col"><input class="input" id="pubGroup" value="' + U.esc(meta.group) + '" placeholder="分类"><input class="input" id="pubSub" value="' + U.esc(meta.sub) + '" placeholder="子类"></div></div>' +
      '<div class="field"><label>标签（逗号分隔）</label><input class="input" id="pubTags" value="' + U.esc(meta.tags) + '"></div>' +
      '</div>' +
      '<div class="modal-foot"><div class="foot-actions">' +
      '<button class="btn ghost" data-cancel>取消</button>' +
      '<button class="btn primary" data-ok>收入文库</button>' +
      '</div></div>'
    );
    const typeEl = m.box.querySelector('#pubType');
    const sync = () => {
      const novel = typeEl.value === '小说';
      m.box.querySelector('#pubNovel').hidden = !novel;
      m.box.querySelector('#pubOther').hidden = novel;
    };
    typeEl.onchange = sync;
    sync();
    m.box.querySelector('[data-cancel]').onclick = m.close;
    m.box.querySelector('[data-ok]').onclick = async () => {
      const type = typeEl.value;
      const title = m.box.querySelector('#pubTitle').value.trim();
      if (!title) { U.toast('标题不能为空', 'alert'); return; }
      const cats = type === '小说'
        ? ['正文', m.box.querySelector('#pubWork').value.trim() || '未分类', m.box.querySelector('#pubVolume').value.trim() || '未分卷']
        : [type, m.box.querySelector('#pubGroup').value.trim() || '未分类', m.box.querySelector('#pubSub').value.trim()];
      const tags = m.box.querySelector('#pubTags').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      m.close();
      try {
        const result = await Api.create({
          type,
          title,
          cats,
          tags,
          status: '草稿',
          body: markdownOf(title, n.body || ''),
        });
        n.docId = result.article.id;
        n.docHash = result.article.bodyHash;
        n.title = result.article.title;
        S.save();
        await refreshLibrary({ silent: true, delay: 60 });
        markNodeSync(n.id, '已收入文库', true);
        U.toast('已收入文库：' + result.article.path, 'check');
        if (window.Writer && window.Writer.getProject() === p) window.Writer.refreshAfterNodeChange(false);
      } catch (error) {
        U.toast(error.message || '收入文库失败', 'alert');
      }
    };
  }

  /* ---------------- 跳转与新建 ---------------- */
  function newArticle(params) {
    if (window.Immersive) {
      window.Immersive.openNew({ returnTo: location.hash || '#/', params });
      return;
    }
    const query = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      if (params[key] != null && params[key] !== '') query.set(key, params[key]);
    });
    const hash = '#/write' + (query.toString() ? '?' + query.toString() : '');
    if (location.hash === hash) window.App.route();
    else location.hash = hash;
  }

  function openInMap(docId) {
    const hit = window.Gen6Projects && window.Gen6Projects.findNode(docId);
    if (!hit) {
      U.toast('正在把这篇放进导图…', 'tree');
      window.Gen6Projects.ensureDoc(docId).then((found) => {
        if (!found) { U.toast('这篇暂时放不进导图', 'alert'); return; }
        openInMap(docId);
      });
      return;
    }
    window.App.openWriter(hit.project.id, { view: 'outline', nodeId: hit.node.id });
  }

  async function syncAfterDocChange(article) {
    if (article && D) D.applyArticle(article);
    await refreshLibrary({ silent: true, delay: 500 });
  }

  Api.exportZip = exportZip;
  Api.exportDatabase = exportDatabaseBlob;
  window.Gen6Api = Api;
  window.Gen6Bridge = {
    exportZip,
    markdownOf,
    plainOfTitle,
    saveDoc,
    refreshLibrary,
    reloadArticle,
    onNodeSaved,
    flushNode,
    publishNodeModal,
    newArticle,
    openInMap,
    syncAfterDocChange,
    confirmConflict,
    confirmFrozen,
    ApiError,
  };
})();
