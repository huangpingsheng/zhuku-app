/* ============================================================
   local-api.js · 6.4 同步版
   把前端发出的 /api/* 请求接到种子数据（data/）与浏览器 IndexedDB。
   P1：编辑保存 / 新建文章 / 草稿发布 / 修订历史 / 数据库启停都已接通，
   改动写进浏览器本地存储，刷新后仍在。
   P2：GitHub 同步（登录、检查、拉取、提交、冲突选择）已接通。
   ============================================================ */
(function () {
  'use strict';
  if (window.WB64) return;

  const BUILD = '6.4.0-p2';
  const DB1 = 'zhuku';
  const TYPES = ['小说', '毕设', '资料', '素材'];
  const PREFIX = { 小说: 'XS', 毕设: 'BS', 资料: 'ZL', 素材: 'SC' };
  const STATUSES = ['草稿', '待定', '定稿', '已发布', '已归档', '冲突副本', '废弃'];
  const TYPE_ORDER = { 小说: 0, 资料: 1, 素材: 2, 毕设: 3 };
  const CAT_COLORS = ['#C05B4D', '#6B7FD7', '#B06A9E', '#4E8F7C', '#C08A3E', '#5C8DB8', '#8A7B5A', '#9A6BC0', '#C07A5A', '#5F9E62', '#A85B5B', '#7B8794'];
  const MAX_REVISIONS = 160;
  const MAX_WRITE_LOG = 1000;
  const DAY_MS = 86400000;
  const SYNC_DOMAINS = [
    { key: 'articles', file: '文章改动.json', label: '文章改动' },
    { key: 'drafts', file: '草稿.json', label: '草稿' },
    { key: 'revisions', file: '修订.json', label: '修订' },
    { key: 'workspace', file: '工程.json', label: '写作台工程' },
    { key: 'meta', file: '数据库开关.json', label: '数据库开关' }
  ];
  const SYNC_HEAD = '同步状态.json';
  const SYNC_APP = '写作库';
  const SYNC_REVISION_LIMIT = 20;
  const SYNC_REVISION_TOTAL = 400;
  const GITHUB_DEFAULT_API = 'https://api.github.com';
  const MD = window.WBMd || {
    escapeHtml: (s) => String(s == null ? '' : s),
    mdToHtml: (s) => '<p>' + String(s || '') + '</p>',
    plainOfMarkdown: (s) => String(s || ''),
    textOfMarkdown: (s) => String(s || '')
  };
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  /* ---------------- IndexedDB：本机持久化 ---------------- */
  let dbPromise = null;
  function dbOpen() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('WB64', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function kvGet(key) {
    try {
      const db = await dbOpen();
      return await new Promise((resolve) => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result == null ? null : req.result);
        req.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }
  async function kvSet(key, value) {
    try {
      const db = await dbOpen();
      await new Promise((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 种子 ---------------- */
  function seedUrl(name) {
    return new URL('data/' + name, document.baseURI).href;
  }
  async function seedJson(name, fallback) {
    try {
      const res = await nativeFetch(seedUrl(name), { cache: 'no-cache' });
      if (!res.ok) return fallback;
      return await res.json();
    } catch (e) { return fallback; }
  }

  const state = {
    lib: null,
    workspace: null,
    settings: null,
    plugins: [],
    drafts: [],
    records: [],
    seedRecords: [],
    overlay: [],
    revisions: {},
    daily: { version: 1, since: '', updatedAt: '', days: {} },
    writeLog: [],
    dbFlags: {},
    githubCfg: null,
    githubToken: '',
    githubRepoInfo: null,
    syncBase: null,
    syncConflicts: [],
    syncLog: [],
    syncStatus: { configured: false, ok: false, checkedAt: '', remoteHead: '', remoteChanged: false, error: '' },
    lastNotifiedHead: '',
    pollTimer: null,
    pollBusy: false,
    allIds: new Set(),
    catIds: new Map(),
    subIds: new Map(),
    catColor: {},
    generatedAt: new Date().toISOString(),
    byId: new Map()
  };

  function indexLib() {
    state.byId = new Map();
    const lib = state.lib;
    if (!lib || !Array.isArray(lib.cats)) return;
    lib.cats.forEach((cat) => {
      (cat.subs || []).forEach((sub) => {
        (sub.files || []).forEach((f) => { state.byId.set(f.docId || f.file, f); });
      });
    });
  }

  /* ---------------- 文本与哈希 ---------------- */
  function apiError(message, status, code) {
    const error = new Error(message);
    error.status = status || 400;
    error.code = code || '';
    return error;
  }
  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
  function notMine(message) {
    return json({ message: message || '6.4 这一版还没有接上这个功能', code: 'NOT_READY' }, 501);
  }
  function normalizeBody(body) {
    return String(body == null ? '' : body).replace(/\r\n/g, '\n').replace(/\s+$/, '');
  }
  function listOf(value) {
    const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,，、\n]/);
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  function uniq(list) { return [...new Set(list)]; }
  function sameList(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function nowIso() { return new Date().toISOString(); }
  function safeName(title) {
    return String(title)
      .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || '未命名';
  }
  function stripTypeLiteral(cats) {
    const literals = new Set(TYPES);
    return literals.has(cats[0]) ? cats.slice(1) : cats;
  }
  function categoryOf(cats, type) {
    if (type === '小说') {
      return { group: cats[1] || cats[0] || '未分类', sub: cats[2] || '' };
    }
    const cleaned = stripTypeLiteral(cats);
    return { group: cleaned[0] || '未分类', sub: cleaned[1] || '' };
  }
  function normalizeCats(type, value) {
    let cats = uniq(listOf(value));
    if (type === '小说') {
      if (cats.length === 0) cats = ['正文', '未分类', '未分卷'];
      else if (cats.length === 1) cats = ['正文', cats[0], '未分卷'];
      else if (cats.length === 2) cats = ['正文', cats[0], cats[1]];
    } else if (cats.length === 0) {
      cats = [type, '未分类'];
    } else if (cats[0] !== type) {
      cats = [type].concat(cats);
    }
    return cats;
  }
  function countWords(body) {
    const noCode = String(body || '').replace(/```[\s\S]*?```/g, ' ');
    const noSpace = noCode.replace(/\s+/g, '');
    const marks = /[，。、；：？！“”‘’（）《》〈〉【】〔〕…—·,.;:?!"'`()\[\]{}<>\/\\|~@#$%^&*+=_\-]/g;
    const core = noSpace.replace(marks, '');
    const cjk = (core.match(/[\u3400-\u9fff]/g) || []).length;
    const latin = (core.match(/[A-Za-z]+/g) || []).length;
    const nums = (core.match(/\d+/g) || []).length;
    return cjk + latin + nums;
  }
  function metaString(cats, tags, status) {
    return `${[...cats].sort().join('|')}#${[...tags].sort().join('|')}#${status}`;
  }
  function fnv16(text) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    const s = String(text);
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + i; h2 = Math.imul(h2, 0x85ebca6b);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }
  async function hash16(text) {
    const value = String(text || '');
    try {
      if (window.crypto && window.crypto.subtle && window.isSecureContext) {
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      }
    } catch (e) { /* 回退到本地哈希 */ }
    return fnv16(value);
  }
  function stableId(prefix, value) {
    return prefix + fnv16(value).slice(0, 6);
  }
  function stableJson(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  function syncHash(text) {
    const value = String(text == null ? '' : text);
    return fnv16(value) + '-' + value.length;
  }
  function byteLengthOf(text) {
    try { return new TextEncoder().encode(String(text == null ? '' : text)).length; } catch (e) { return String(text == null ? '' : text).length; }
  }
  function cloneRecord(rec) {
    const copy = Object.assign({}, rec);
    ['cats', 'tags', 'entities', 'characters', 'links'].forEach((key) => {
      copy[key] = Array.isArray(rec[key]) ? rec[key].slice() : [];
    });
    copy.publish = Object.assign({}, rec.publish || {});
    return copy;
  }
  function articleKeyOf(entry) {
    if (!entry) return '';
    const body = normalizeBody(entry.body || entry.text || '');
    const meta = stableJson({
      title: String(entry.title || ''),
      type: String(entry.type || ''),
      cats: Array.isArray(entry.cats) ? entry.cats : [],
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      status: String(entry.status || '')
    });
    return syncHash(body) + '|' + syncHash(meta);
  }
  function draftKeyOf(draft) {
    if (!draft) return '';
    return syncHash(stableJson({
      title: String(draft.title || ''),
      markdown: String(draft.markdown != null ? draft.markdown : (draft.text || '')),
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      sourceDocId: String(draft.sourceDocId || ''),
      sourceTitle: String(draft.sourceTitle || ''),
      publishedId: String(draft.publishedId || '')
    }));
  }
  function normalizeGithubCfg(raw) {
    const c = raw && typeof raw === 'object' ? raw : {};
    return {
      owner: String(c.owner || '').trim(),
      repo: String(c.repo || '').trim(),
      branch: String(c.branch || 'main').trim() || 'main',
      dir: String(c.dir || '写作库同步').replace(/^\/+|\/+$/g, '').trim() || '写作库同步',
      apiBase: String(c.apiBase || GITHUB_DEFAULT_API).trim() || GITHUB_DEFAULT_API,
      remember: c.remember !== false,
      autoCheck: c.autoCheck !== false,
      autoPull: !!c.autoPull,
      device: String(c.device || '')
    };
  }
  function normalizeApiBase(raw) {
    const value = String(raw || GITHUB_DEFAULT_API).trim().replace(/\/+$/, '');
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') return value;
      if (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(url.hostname)) return value;
    } catch (e) { /* 落到下面报错 */ }
    throw apiError('API 地址必须是 https://，或本机 http://127.0.0.1（测试用）', 400);
  }
  function deviceName() {
    try {
      let name = localStorage.getItem('ws.deviceName') || '';
      if (!name) {
        const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        name = (mobile ? '手机网页' : '电脑网页') + '-' + Math.random().toString(36).slice(2, 6);
        localStorage.setItem('ws.deviceName', name);
      }
      return name;
    } catch (e) {
      return '这台设备';
    }
  }
  function githubReady() {
    return !!(state.githubCfg && state.githubCfg.owner && state.githubCfg.repo && state.githubToken);
  }
  function githubClientCfg() {
    return Object.assign({}, normalizeGithubCfg(state.githubCfg), { token: state.githubToken });
  }
  function requireGithub() {
    if (!githubReady()) throw apiError('还没有连接 GitHub：请先填写仓库和 Token', 400, 'NOT_CONFIGURED');
    return githubClientCfg();
  }
  function publicGithubCfg() {
    const cfg = normalizeGithubCfg(state.githubCfg);
    return {
      owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, dir: cfg.dir,
      apiBase: cfg.apiBase, remember: cfg.remember, autoCheck: cfg.autoCheck,
      autoPull: cfg.autoPull, device: cfg.device || deviceName()
    };
  }
  function emitSync(type, detail) {
    try { window.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); } catch (e) { /* 忽略 */ }
  }
  function stripTitleLine(body) {
    return String(body || '').replace(/^\s*#\s+.*$/m, '');
  }
  function quoteOf(body) {
    const line = String(body || '').split('\n').find((item) => /^\s*>\s?\S/.test(item));
    return line ? line.replace(/^\s*>\s?/, '').trim() : '';
  }
  function entitiesOf(tags) {
    return (tags || [])
      .filter((tag) => !/^(情绪|类型|导入|作品|来源|时间|年代|主题|原类型|笔记本|原目录)[-－:：·]/.test(tag) && !String(tag).includes('-') && String(tag).length <= 14)
      .slice(0, 12);
  }
  function catIcon(name) {
    if (/日月|太阳|月/.test(name)) return 'sun';
    if (/情感|爱|小米/.test(name)) return 'sparkles';
    if (/哲学|自我|存在/.test(name)) return 'compass';
    if (/AI|技术|工具/.test(name)) return 'cube';
    if (/游戏|策划/.test(name)) return 'target';
    if (/艺术|设计|视觉/.test(name)) return 'palette';
    if (/音乐|声音/.test(name)) return 'quill';
    if (/计划|待办|时间/.test(name)) return 'clock';
    if (/记忆|自传|散文/.test(name)) return 'feather';
    if (/诗词|短句|意象/.test(name)) return 'gem';
    if (/碎片|空壳|口嗨/.test(name)) return 'note';
    if (/毕设|设计|潮汐/.test(name)) return 'bookOpen';
    return 'book';
  }

  /* ---------------- 数据库 / 目录规则 ---------------- */
  function dbById(id) {
    return (state.lib && state.lib.databases || []).find((db) => db.id === id) || null;
  }
  function dbEnabled(id) {
    if (state.dbFlags[id] != null) return !!state.dbFlags[id];
    const db = dbById(id);
    return !db || db.enabled !== false;
  }
  function defaultDir(type, cats, db) {
    const cleaned = stripTypeLiteral(cats);
    if (db && db.id !== DB1) {
      const root = (db.roots && db.roots[0]) || '';
      const group = type === '小说' ? (cats[1] || '未分类') : (cleaned[0] || '未分类');
      const sub = type === '小说' ? (cats[2] || '未分卷') : (cleaned[1] || '');
      return [root, safeName(group), sub ? safeName(sub) : ''].filter(Boolean).join('/');
    }
    if (type === '小说') {
      const work = cats[1] || '未分类';
      const volume = cats[2] || '未分卷';
      return ['01-小说', '作品', safeName(work), safeName(volume)].join('/');
    }
    if (type === '素材') {
      return ['01-小说', '素材', safeName(cleaned[0] || '未分类'), cleaned[1] ? safeName(cleaned[1]) : ''].filter(Boolean).join('/');
    }
    if (type === '资料') {
      return ['04-资料与收件箱', '资料', safeName(cleaned[0] || '未分类'), cleaned[1] ? safeName(cleaned[1]) : ''].filter(Boolean).join('/');
    }
    return ['02-毕设', safeName(cleaned[0] || '未分类'), cleaned[1] ? safeName(cleaned[1]) : ''].filter(Boolean).join('/');
  }
  function safeRelDir(input) {
    const rel = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!rel) return '';
    const parts = rel.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..')) throw apiError('存放目录不合法', 400);
    return parts.join('/');
  }
  function nextId(type, db) {
    const prefix = PREFIX[type];
    const nums = state.records
      .filter((rec) => rec.dbId === db.id && String(rec.docId || '').startsWith(prefix + '-'))
      .map((rec) => Number(String(rec.docId).slice(3, 7)))
      .filter((num) => Number.isInteger(num) && num > 0);
    const taken = new Set(state.allIds);
    let next = (nums.length ? Math.max(...nums) : 0) + 1;
    while (taken.has(`${prefix}-${String(next).padStart(4, '0')}`)) next += 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  /* ---------------- 记录 ---------------- */
  function fallbackCats(rec) {
    const group = rec.catName || '未分类';
    const sub = rec.subName && rec.subName !== '未分卷' ? rec.subName : '';
    if (rec.type === '小说') return ['正文', group, sub || '未分卷'];
    return [rec.type || '资料', group].concat(sub ? [sub] : []);
  }
  function decorate(rec) {
    rec.docId = rec.docId || rec.file;
    rec.file = rec.docId;
    if (!Array.isArray(rec.cats) || !rec.cats.length) rec.cats = fallbackCats(rec);
    const cat = categoryOf(rec.cats, rec.type);
    rec.group = cat.group;
    rec.subTitle = cat.sub;
    rec.empty = !String(rec.text || '').trim();
    rec.summary = String(rec.summary || rec.text || '').slice(0, 140);
    rec.entities = entitiesOf(rec.tags);
    rec.characters = rec.characters || [];
    rec.links = rec.links || [];
    rec.relationCount = rec.relationCount || 0;
    if (!rec.publish) rec.publish = { git: '未发布', siyuan: '未发布', ob: '未发布', studio: '未发布' };
    return rec;
  }
  function hydrate() {
    const lib = state.lib;
    state.records = [];
    state.allIds = new Set();
    state.catIds = new Map();
    state.subIds = new Map();
    state.catColor = {};
    if (!lib || !Array.isArray(lib.cats)) return;
    lib.cats.forEach((cat) => {
      const dbId = cat.dbId || DB1;
      state.catColor[cat.id] = cat.color;
      state.catIds.set(dbId + '|' + cat.type + '|' + cat.name, cat.id);
      (cat.subs || []).forEach((sub) => {
        state.subIds.set(dbId + '|' + cat.type + '|' + cat.name + '|' + sub.name, sub.id);
        (sub.files || []).forEach((f) => {
          f.docId = f.docId || f.file;
          f.file = f.docId;
          if (!Array.isArray(f.cats) || !f.cats.length) f.cats = fallbackCats(f);
          const info = categoryOf(f.cats, f.type);
          f.group = info.group;
          f.subTitle = info.sub;
          state.records.push(f);
          state.allIds.add(f.docId);
        });
      });
    });
  }
  function makeRecord(fields) {
    const rec = Object.assign({
      file: fields.docId,
      docId: fields.docId,
      title: '',
      words: 0,
      type: '资料',
      tone: '其他',
      summary: '',
      tags: [],
      entities: [],
      characters: [],
      links: [],
      relationCount: 0,
      quote: '',
      sub: '',
      subTitle: '',
      subName: '',
      cat: '',
      catName: '',
      text: '',
      html: '',
      path: '',
      dir: '',
      created: today(),
      updated: today(),
      mtime: nowIso(),
      ctime: nowIso(),
      status: '草稿',
      bodyHash: '',
      metaHash: '',
      empty: true,
      dbId: DB1,
      dbName: '写作库',
      dbShort: '原稿',
      dbColor: CAT_COLORS[0],
      body: '',
      cats: []
    }, fields);
    return decorate(rec);
  }
  function recordBody(rec) {
    if (rec.body) return rec.body;
    if (rec.html && window.U && window.U.htmlToMarkdown) {
      try {
        const md = window.U.htmlToMarkdown(rec.html).trim();
        if (md) return '# ' + rec.title + '\n\n' + md;
      } catch (e) { /* 回退到纯文本 */ }
    }
    return '# ' + rec.title + '\n\n' + String(rec.text || '');
  }
  function applyOverlay() {
    state.overlay.forEach((entry) => {
      if (!entry || !entry.docId) return;
      const rec = state.records.find((item) => item.docId === entry.docId);
      if (rec) {
        Object.assign(rec, entry);
        decorate(rec);
      } else {
        const created = makeRecord(Object.assign({}, entry));
        state.records.push(created);
      }
      state.allIds.add(entry.docId);
    });
  }
  function resetRecordsFromSeed() {
    state.records = state.seedRecords.map(cloneRecord);
    state.allIds = new Set(state.records.map((rec) => rec.docId));
  }
  function rehydrateLibrary() {
    resetRecordsFromSeed();
    applyOverlay();
    rebuildLib();
    if (window.LibData) {
      try { window.LibData.rebuild(window.LIB); } catch (e) { /* 忽略 */ }
    }
    emitSync('wb64:library-changed', { at: nowIso(), overlay: state.overlay.length });
  }
  const OVERLAY_FIELDS = ['docId', 'title', 'type', 'cats', 'tags', 'status', 'body', 'text', 'html', 'words',
    'bodyHash', 'metaHash', 'summary', 'quote', 'tone', 'entities', 'characters', 'links', 'relationCount',
    'created', 'updated', 'mtime', 'ctime', 'publish', 'path', 'dir', 'dbId'];
  async function persistRecord(rec) {
    const copy = {};
    OVERLAY_FIELDS.forEach((key) => { if (rec[key] !== undefined) copy[key] = rec[key]; });
    const at = state.overlay.findIndex((item) => item.docId === rec.docId);
    if (at >= 0) state.overlay[at] = copy;
    else state.overlay.push(copy);
    await kvSet('articles', state.overlay);
  }

  /* ---------------- 重建 LIB 结构 ---------------- */
  function summarize(records, cats) {
    const tagSet = new Set();
    let links = 0, linked = 0, empty = 0, words = 0;
    records.forEach((rec) => {
      words += rec.words || 0;
      if (rec.empty) empty += 1;
      const rel = rec.relationCount || 0;
      links += rel;
      if (rel) linked += 1;
      (rec.tags || []).forEach((tag) => tagSet.add(tag));
    });
    return {
      files: records.length,
      words,
      cats: cats.length,
      subs: cats.reduce((sum, cat) => sum + cat.subs.length, 0),
      empty,
      links,
      linked,
      tags: tagSet.size
    };
  }
  function rebuildLib() {
    const lib = state.lib;
    if (!lib) return;
    const dbs = Array.isArray(lib.databases) && lib.databases.length ? lib.databases : [{
      id: DB1, name: '写作库', short: '原稿', color: CAT_COLORS[0], enabled: true, editable: true, roots: []
    }];
    dbs.forEach((db) => { db.enabled = dbEnabled(db.id); });
    lib.databases = dbs;
    const live = state.records.filter((rec) => dbEnabled(rec.dbId));
    const byDb = new Map();
    live.forEach((rec) => {
      if (!byDb.has(rec.dbId)) byDb.set(rec.dbId, []);
      byDb.get(rec.dbId).push(rec);
    });
    const cats = [];
    dbs.forEach((db) => {
      if (!db.enabled) {
        db.cats = [];
        db.stats = summarize([], []);
        return;
      }
      const groups = new Map();
      (byDb.get(db.id) || []).forEach((rec) => {
        const groupName = rec.group || rec.catName || '未分类';
        const key = rec.type + '\u0000' + groupName;
        let group = groups.get(key);
        if (!group) {
          group = { name: groupName, type: rec.type, subs: new Map(), count: 0, words: 0 };
          groups.set(key, group);
        }
        group.count += 1;
        group.words += rec.words || 0;
        const subName = rec.subTitle || '未分卷';
        if (!group.subs.has(subName)) {
          group.subs.set(subName, { name: subName, files: [], words: 0, firstId: String(rec.docId) });
        }
        const sub = group.subs.get(subName);
        sub.files.push(rec);
        sub.words += rec.words || 0;
        if (String(rec.docId).localeCompare(sub.firstId) < 0) sub.firstId = String(rec.docId);
      });
      const dbCats = [...groups.values()]
        .sort((a, b) => ((TYPE_ORDER[a.type] == null ? 9 : TYPE_ORDER[a.type]) - (TYPE_ORDER[b.type] == null ? 9 : TYPE_ORDER[b.type]))
          || (b.count - a.count) || String(a.name).localeCompare(String(b.name), 'zh'))
        .map((group, index) => {
          const catKey = db.id + '|' + group.type + '|' + group.name;
          const catId = state.catIds.get(catKey) || stableId('c', catKey);
          state.catIds.set(catKey, catId);
          const subs = [...group.subs.values()]
            .sort((a, b) => String(a.firstId).localeCompare(String(b.firstId)) || String(a.name).localeCompare(String(b.name), 'zh'))
            .map((sub) => {
              sub.files.sort((a, b) => String(a.docId).localeCompare(String(b.docId)));
              const subKey = catKey + '|' + sub.name;
              const subId = state.subIds.get(subKey) || stableId('s', subKey);
              state.subIds.set(subKey, subId);
              sub.files.forEach((rec) => {
                rec.cat = catId;
                rec.sub = subId;
                rec.catName = group.name;
                rec.subName = sub.name;
                rec.dbId = db.id;
                rec.dbName = db.name;
                rec.dbShort = db.short || '';
                rec.dbColor = db.color || CAT_COLORS[0];
              });
              return { id: subId, name: sub.name, files: sub.files, words: sub.words };
            });
          const color = state.catColor[catId] || (db.id === DB1 ? CAT_COLORS[index % CAT_COLORS.length] : (db.color || CAT_COLORS[0]));
          return {
            id: catId,
            name: group.name,
            type: group.type,
            icon: catIcon(group.name),
            color,
            desc: subs.slice(0, 5).map((sub) => sub.name).join(' · ') || (group.count + ' 篇'),
            subs,
            count: group.count,
            words: group.words,
            dbId: db.id,
            dbName: db.name,
            dbColor: db.color || CAT_COLORS[0]
          };
        });
      db.cats = dbCats;
      db.stats = summarize(byDb.get(db.id) || [], dbCats);
      cats.push(...dbCats);
    });
    cats.sort((a, b) => ((TYPE_ORDER[a.type] == null ? 9 : TYPE_ORDER[a.type]) - (TYPE_ORDER[b.type] == null ? 9 : TYPE_ORDER[b.type]))
      || (b.count - a.count) || String(a.name).localeCompare(String(b.name), 'zh'));
    lib.cats = cats;
    const stats = summarize(live, cats);
    stats.databases = dbs.filter((db) => db.enabled).length;
    lib.stats = stats;
    state.generatedAt = new Date().toISOString();
    indexLib();
  }

  /* ---------------- article 视图 ---------------- */
  function articleOf(rec) {
    const text = rec.text || '';
    const cats = Array.isArray(rec.cats) && rec.cats.length
      ? rec.cats
      : [rec.type, rec.catName, rec.subName].filter(Boolean);
    return {
      id: rec.docId || rec.file,
      docId: rec.docId || rec.file,
      title: rec.title,
      type: rec.type || '资料',
      group: rec.group || rec.catName || '',
      sub: rec.subTitle || '',
      chapter: rec.chapter || '',
      catId: rec.cat || '',
      subId: rec.sub || '',
      cats,
      tags: rec.tags || [],
      status: rec.status || '草稿',
      words: rec.words || 0,
      empty: !!rec.empty,
      path: rec.path || '',
      dir: rec.dir || '',
      created: rec.created || '',
      updated: rec.updated || '',
      mtime: rec.mtime || '',
      ctime: rec.ctime || '',
      publish: rec.publish || { git: '未发布', siyuan: '未发布', ob: '未发布', studio: '未发布' },
      bodyHash: rec.bodyHash || '',
      metaHash: rec.metaHash || '',
      excerpt: rec.summary || text.slice(0, 80),
      bodyBytes: new TextEncoder().encode(text).length,
      tone: rec.tone || '其他',
      dbId: rec.dbId || '',
      dbName: rec.dbName || '',
      dbShort: rec.dbShort || '',
      dbColor: rec.dbColor || '#8A9099',
      dbKind: rec.dbKind || '',
      relationCount: rec.relationCount || 0,
      relations: rec.links || [],
      quote: rec.quote || '',
      html: rec.html || '',
      text,
      body: recordBody(rec)
    };
  }

  /* ---------------- 修订历史 ---------------- */
  async function saveRevision(record, note, source) {
    if (!record || !record.docId) return null;
    const id = record.docId;
    const list = state.revisions[id] || [];
    const latest = list[0];
    if (latest && latest.bodyHash === record.bodyHash && latest.metaHash === record.metaHash) return null;
    const time = Date.now();
    let base = `${time}_${record.bodyHash || 'nohash'}`;
    let n = 1;
    while (list.some((item) => item.rev === base)) {
      base = `${time}_${record.bodyHash || 'nohash'}-${n}`;
      n += 1;
    }
    const payload = {
      rev: base,
      id,
      title: record.title || '',
      body: record.body || recordBody(record),
      cats: record.cats || [],
      tags: record.tags || [],
      status: record.status || '',
      words: record.words || 0,
      bodyHash: record.bodyHash || '',
      metaHash: record.metaHash || '',
      note: String(note || ''),
      source: String(source || 'save'),
      time: new Date(time).toISOString()
    };
    list.unshift(payload);
    state.revisions[id] = list.slice(0, MAX_REVISIONS);
    await kvSet('revisions', state.revisions);
    return { rev: base, time: payload.time };
  }
  function listRevisions(id) {
    return (state.revisions[id] || []).map((item) => ({
      rev: item.rev,
      id: item.id,
      title: item.title,
      words: item.words,
      status: item.status,
      cats: item.cats,
      tags: item.tags,
      bodyHash: item.bodyHash,
      metaHash: item.metaHash,
      note: item.note || '',
      source: item.source || '',
      time: item.time
    })).sort((a, b) => String(b.time).localeCompare(String(a.time)));
  }
  function readRevision(id, rev) {
    const item = (state.revisions[id] || []).find((entry) => entry.rev === rev);
    if (!item) throw apiError('找不到这个历史版本', 404);
    return item;
  }

  /* ---------------- 写作统计 ---------------- */
  function dayKeyOf(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function emptyStatDay() {
    return {
      written: 0, removed: 0, edits: 0, created: 0,
      draftWritten: 0, draftRemoved: 0, draftEdits: 0,
      hours: new Array(24).fill(0),
      editHours: new Array(24).fill(0),
      byDb: {}, byType: {},
      firstAt: '', lastAt: ''
    };
  }
  function normalizeStatDay(raw) {
    const day = emptyStatDay();
    if (!raw || typeof raw !== 'object') return day;
    ['written', 'removed', 'edits', 'created', 'draftWritten', 'draftRemoved', 'draftEdits'].forEach((key) => {
      day[key] = Math.max(0, Math.round(Number(raw[key]) || 0));
    });
    ['hours', 'editHours'].forEach((key) => {
      if (Array.isArray(raw[key])) raw[key].slice(0, 24).forEach((v, i) => { day[key][i] = Math.max(0, Math.round(Number(v) || 0)); });
    });
    if (raw.byDb && typeof raw.byDb === 'object') day.byDb = raw.byDb;
    if (raw.byType && typeof raw.byType === 'object') day.byType = raw.byType;
    day.firstAt = String(raw.firstAt || '');
    day.lastAt = String(raw.lastAt || '');
    return day;
  }
  async function recordWriting(event) {
    if (!event) return;
    const now = new Date();
    const date = dayKeyOf(now);
    const hour = now.getHours();
    const delta = Math.round(Number(event.delta) || 0);
    const kind = event.kind === 'draft' ? 'draft' : 'article';
    const action = event.action === 'create' ? 'create' : 'save';
    if (!state.daily || typeof state.daily !== 'object') state.daily = { version: 1, since: '', updatedAt: '', days: {} };
    if (!state.daily.days || typeof state.daily.days !== 'object') state.daily.days = {};
    if (!state.daily.since) state.daily.since = date;
    const day = normalizeStatDay(state.daily.days[date]);
    const pos = Math.max(delta, 0);
    const neg = Math.max(-delta, 0);
    if (kind === 'draft') {
      day.draftWritten += pos;
      day.draftRemoved += neg;
      day.draftEdits += 1;
    } else {
      day.written += pos;
      day.removed += neg;
      day.edits += 1;
      if (action === 'create') day.created += 1;
      const dbKey = String(event.dbId || 'unknown');
      const byDb = day.byDb[dbKey] || { written: 0, removed: 0, edits: 0, created: 0 };
      byDb.written += pos;
      byDb.removed += neg;
      byDb.edits += 1;
      if (action === 'create') byDb.created += 1;
      day.byDb[dbKey] = byDb;
      const typeKey = String(event.type || '未分类');
      const byType = day.byType[typeKey] || { written: 0, edits: 0 };
      byType.written += pos;
      byType.edits += 1;
      day.byType[typeKey] = byType;
    }
    day.hours[hour] += pos;
    day.editHours[hour] += 1;
    day.lastAt = now.toISOString();
    if (!day.firstAt) day.firstAt = day.lastAt;
    state.daily.days[date] = day;
    state.daily.updatedAt = day.lastAt;
    const keys = Object.keys(state.daily.days).sort();
    while (keys.length > 730) delete state.daily.days[keys.shift()];
    const entry = {
      at: day.lastAt,
      date,
      hour,
      kind,
      action,
      id: String(event.id || ''),
      title: String(event.title || '').slice(0, 120),
      type: String(event.type || ''),
      dbId: String(event.dbId || ''),
      dbName: String(event.dbName || ''),
      delta,
      words: Math.max(0, Math.round(Number(event.words) || 0))
    };
    state.writeLog.unshift(entry);
    state.writeLog = state.writeLog.slice(0, MAX_WRITE_LOG);
    await Promise.all([kvSet('daily', state.daily), kvSet('writeLog', state.writeLog)]);
  }
  function scanRevisions() {
    const days = {};
    const all = [];
    Object.keys(state.revisions).forEach((id) => {
      (state.revisions[id] || []).forEach((item) => {
        const at = Date.parse(item.time);
        if (!at) return;
        const key = dayKeyOf(new Date(at));
        days[key] = (days[key] || 0) + 1;
        all.push({ item, at, id });
      });
    });
    all.sort((a, b) => b.at - a.at);
    return {
      days,
      total: all.length,
      recent: all.slice(0, 12).map(({ item, at, id }) => ({
        id,
        rev: item.rev || '',
        title: item.title || '',
        note: item.note || '',
        words: item.words || 0,
        time: item.time || new Date(at).toISOString()
      }))
    };
  }
  function activeDayKeys(days) {
    return Object.keys(days || {}).filter((key) => {
      const d = normalizeStatDay(days[key]);
      return d.written + d.draftWritten + d.edits + d.draftEdits + d.created > 0;
    }).sort();
  }
  function streakOf(keys) {
    const set = new Set(keys);
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!set.has(dayKeyOf(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
    let current = 0;
    while (set.has(dayKeyOf(cursor))) {
      current += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    let best = 0;
    let run = 0;
    let prev = null;
    keys.forEach((key) => {
      const t = new Date(key + 'T00:00:00').getTime();
      run = prev != null && t - prev === DAY_MS ? run + 1 : 1;
      if (run > best) best = run;
      prev = t;
    });
    return { current, best, activeDays: keys.length };
  }
  function syncWebUrl() {
    try {
      return githubReady() && window.GitHubApi ? window.GitHubApi.repoWebUrl(githubClientCfg()) : '';
    } catch (e) { return ''; }
  }
  function gitInfoOf() {
    const cfg = normalizeGithubCfg(state.githubCfg);
    const configured = githubReady();
    const base = state.syncBase;
    const status = state.syncStatus || {};
    let pending = null;
    try { pending = configured ? githubPending() : null; } catch (e) { pending = null; }
    const last = state.syncLog[0] || null;
    const subjectOf = (entry) => !entry ? '' : (entry.message || (entry.action === 'pull' ? '从云端拉取' : '提交到云端'));
    const commits = state.syncLog.slice(0, 30).map((entry) => ({
      hash: String(entry.commit || '').slice(0, 7),
      subject: subjectOf(entry),
      date: entry.at || '',
      author: entry.device || ''
    }));
    const dayCount = {};
    state.syncLog.forEach((entry) => {
      const day = String(entry.at || '').slice(0, 10);
      if (!day) return;
      if (entry.action === 'push') dayCount[day] = (dayCount[day] || 0) + 1;
    });
    return {
      ok: !!configured,
      configured,
      branch: configured ? cfg.branch : '—',
      commit: String(status.remoteHead || (base && base.head) || '').slice(0, 7) || '—',
      subject: last ? subjectOf(last) : (configured ? '还没有同步记录' : '6.4 尚未连接 GitHub'),
      date: last ? last.at : '',
      dirty: pending ? pending.changed : 0,
      remote: configured ? cfg.owner + '/' + cfg.repo : '',
      remoteConfigured: configured,
      commits,
      dayCount,
      head: (base && base.head) || '',
      checkedAt: status.checkedAt || '',
      remoteChanged: !!status.remoteChanged,
      conflicts: state.syncConflicts.length,
      error: status.error || '',
      webUrl: syncWebUrl()
    };
  }
  function dashboardPayload(dayParam) {
    const span = Math.max(7, Math.min(365, Math.round(Number(dayParam) || 30)));
    const lib = state.lib || { stats: {}, databases: [], cats: [] };
    const daily = state.daily && state.daily.days ? state.daily : { days: {} };
    const todayK = dayKeyOf(new Date());
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const revisionInfo = scanRevisions();
    const gitInfo = gitInfoOf();

    const series = [];
    for (let i = span - 1; i >= 0; i -= 1) {
      const date = dayKeyOf(new Date(todayStart.getTime() - i * DAY_MS));
      const raw = daily.days[date] || null;
      const day = raw ? normalizeStatDay(raw) : emptyStatDay();
      series.push({
        date,
        written: day.written,
        removed: day.removed,
        net: day.written - day.removed,
        edits: day.edits,
        created: day.created,
        draftWritten: day.draftWritten,
        draftRemoved: day.draftRemoved,
        draftNet: day.draftWritten - day.draftRemoved,
        draftEdits: day.draftEdits,
        revisions: revisionInfo.days[date] || 0,
        commits: gitInfo.dayCount[date] || 0
      });
    }

    const todayDay = normalizeStatDay(daily.days[todayK]);
    const dbNames = new Map((lib.databases || []).map((db) => [db.id, db.name]));
    const todayByDb = Object.keys(todayDay.byDb).map((id) => {
      const item = todayDay.byDb[id] || {};
      return {
        id,
        name: dbNames.get(id) || id,
        written: Number(item.written) || 0,
        removed: Number(item.removed) || 0,
        edits: Number(item.edits) || 0,
        created: Number(item.created) || 0
      };
    }).sort((a, b) => b.written - a.written);

    const typeMap = new Map();
    const statusMap = new Map();
    state.byId.forEach((article) => {
      const typeName = article.type || '未分类';
      const t = typeMap.get(typeName) || { name: typeName, files: 0, words: 0 };
      t.files += 1;
      t.words += article.words || 0;
      typeMap.set(typeName, t);
      const statusName = article.status || '未标注';
      const s = statusMap.get(statusName) || { name: statusName, files: 0, words: 0 };
      s.files += 1;
      s.words += article.words || 0;
      statusMap.set(statusName, s);
    });

    const hourWords = new Array(24).fill(0);
    const hourEdits = new Array(24).fill(0);
    series.forEach((item) => {
      const raw = daily.days[item.date];
      if (!raw) return;
      const day = normalizeStatDay(raw);
      for (let h = 0; h < 24; h += 1) {
        hourWords[h] += day.hours[h];
        hourEdits[h] += day.editHours[h];
      }
    });

    const activeKeys = activeDayKeys(daily.days);
    const sum = (key) => series.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
    const last7 = series.slice(-7);
    const sumOf = (list, key) => list.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
    const topCats = (lib.cats || []).slice().sort((a, b) => (b.words || 0) - (a.words || 0)).slice(0, 12).map((cat) => ({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      files: cat.count || 0,
      words: cat.words || 0,
      color: cat.color,
      dbName: cat.dbName
    }));

    return {
      generatedAt: new Date().toISOString(),
      today: todayK,
      span,
      recordingSince: daily.since || '',
      hasRecords: activeKeys.length > 0,
      library: {
        files: lib.stats.files || 0,
        words: lib.stats.words || 0,
        avgWords: lib.stats.files ? Math.round(lib.stats.words / lib.stats.files) : 0,
        cats: lib.stats.cats || 0,
        subs: lib.stats.subs || 0,
        links: lib.stats.links || 0,
        tags: lib.stats.tags || 0,
        empty: lib.stats.empty || 0,
        databases: (lib.databases || []).map((db) => ({
          id: db.id,
          name: db.name,
          short: db.short || '',
          color: db.color || CAT_COLORS[0],
          kind: db.kind || '',
          files: (db.stats && db.stats.files) || 0,
          words: (db.stats && db.stats.words) || 0,
          bytes: db.bytes || 0
        })),
        types: Array.from(typeMap.values()).sort((a, b) => b.words - a.words),
        statuses: Array.from(statusMap.values()).sort((a, b) => b.files - a.files),
        topCats
      },
      todayStats: {
        date: todayK,
        written: todayDay.written,
        removed: todayDay.removed,
        net: todayDay.written - todayDay.removed,
        edits: todayDay.edits,
        created: todayDay.created,
        draftWritten: todayDay.draftWritten,
        draftRemoved: todayDay.draftRemoved,
        draftNet: todayDay.draftWritten - todayDay.draftRemoved,
        draftEdits: todayDay.draftEdits,
        byDb: todayByDb,
        firstAt: todayDay.firstAt,
        lastAt: todayDay.lastAt
      },
      week: {
        written: sumOf(last7, 'written'),
        removed: sumOf(last7, 'removed'),
        net: sumOf(last7, 'net'),
        edits: sumOf(last7, 'edits'),
        created: sumOf(last7, 'created'),
        draftNet: sumOf(last7, 'draftNet')
      },
      month: {
        written: sumOf(series.slice(-30), 'written'),
        removed: sumOf(series.slice(-30), 'removed'),
        net: sumOf(series.slice(-30), 'net'),
        edits: sumOf(series.slice(-30), 'edits'),
        created: sumOf(series.slice(-30), 'created'),
        draftNet: sumOf(series.slice(-30), 'draftNet')
      },
      range: {
        written: sum('written'),
        removed: sum('removed'),
        net: sum('net'),
        edits: sum('edits'),
        created: sum('created'),
        draftNet: sum('draftNet'),
        revisions: sum('revisions'),
        commits: sum('commits')
      },
      streak: streakOf(activeKeys),
      series,
      hourly: hourWords.map((words, hour) => ({ hour, words, edits: hourEdits[hour] })),
      recent: state.writeLog.slice(0, 60),
      revisions: {
        total: revisionInfo.total,
        recent: revisionInfo.recent
      },
      git: gitInfo
    };
  }

  /* ---------------- GitHub 同步 ---------------- */
  function domainCount(key, data) {
    if (!data) return 0;
    if (key === 'articles') return Object.keys(data).length;
    if (key === 'drafts') return Array.isArray(data) ? data.length : 0;
    if (key === 'revisions') return Object.keys(data).reduce((n, id) => n + ((data[id] || []).length), 0);
    if (key === 'workspace') return Array.isArray(data.projects) ? data.projects.length : 0;
    if (key === 'meta') return Object.keys(data.dbFlags || {}).length;
    return 0;
  }
  function syncArticleOf(rec) {
    const body = normalizeBody(rec.body || recordBody(rec));
    const cats = Array.isArray(rec.cats) && rec.cats.length ? rec.cats.slice() : fallbackCats(rec);
    return {
      docId: String(rec.docId || rec.file || ''),
      title: String(rec.title || ''),
      type: TYPES.includes(rec.type) ? rec.type : '资料',
      cats,
      tags: Array.isArray(rec.tags) ? rec.tags.slice() : [],
      status: STATUSES.includes(rec.status) ? rec.status : '草稿',
      body,
      words: Number(rec.words) || countWords(body),
      summary: String(rec.summary || ''),
      quote: String(rec.quote || quoteOf(body)),
      tone: String(rec.tone || '其他'),
      created: String(rec.created || ''),
      updated: String(rec.updated || ''),
      mtime: String(rec.mtime || ''),
      path: String(rec.path || ''),
      dir: String(rec.dir || ''),
      dbId: String(rec.dbId || DB1),
      publish: rec.publish && typeof rec.publish === 'object' ? rec.publish : null
    };
  }
  function syncDraftOf(draft) {
    if (!draft || !draft.id) return null;
    return {
      id: String(draft.id),
      title: String(draft.title || ''),
      markdown: String(draft.markdown != null ? draft.markdown : (draft.text || '')),
      tags: Array.isArray(draft.tags) ? draft.tags.slice() : [],
      sourceDocId: String(draft.sourceDocId || ''),
      sourceTitle: String(draft.sourceTitle || ''),
      createdAt: String(draft.createdAt || ''),
      updatedAt: String(draft.updatedAt || ''),
      publishedId: String(draft.publishedId || '')
    };
  }
  function syncRevisionOf(rev) {
    if (!rev || !rev.rev) return null;
    return {
      rev: String(rev.rev),
      id: String(rev.id || ''),
      title: String(rev.title || ''),
      body: String(rev.body || ''),
      cats: Array.isArray(rev.cats) ? rev.cats.slice() : [],
      tags: Array.isArray(rev.tags) ? rev.tags.slice() : [],
      status: String(rev.status || ''),
      words: Number(rev.words) || 0,
      note: String(rev.note || ''),
      source: String(rev.source || ''),
      time: String(rev.time || '')
    };
  }
  function workspaceForSync() {
    const src = state.workspace && Array.isArray(state.workspace.projects) ? state.workspace.projects : [];
    const projects = src.map((project) => {
      if (!project || typeof project !== 'object') return project;
      const copy = Object.assign({}, project);
      if (Array.isArray(project.nodes)) {
        copy.nodes = project.nodes.map((node) => {
          if (!node || typeof node !== 'object' || !node.docId) return node;
          const bare = Object.assign({}, node);
          delete bare.body;
          delete bare.html;
          delete bare.docHash;
          return bare;
        });
      }
      return copy;
    });
    return {
      projects,
      curation: state.workspace && state.workspace.curation && typeof state.workspace.curation === 'object' ? state.workspace.curation : {}
    };
  }
  function buildSyncSnapshot() {
    const articles = {};
    state.overlay.forEach((rec) => {
      if (!rec || !rec.docId) return;
      articles[rec.docId] = syncArticleOf(rec);
    });
    const drafts = state.drafts.map(syncDraftOf).filter(Boolean)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const allRevs = [];
    Object.keys(state.revisions).sort().forEach((id) => {
      const list = (state.revisions[id] || []).map(syncRevisionOf).filter(Boolean)
        .sort((a, b) => String(b.time).localeCompare(String(a.time)))
        .slice(0, SYNC_REVISION_LIMIT);
      if (list.length) allRevs.push({ id, list });
    });
    let revisions = {};
    let total = allRevs.reduce((n, item) => n + item.list.length, 0);
    if (total <= SYNC_REVISION_TOTAL) {
      allRevs.forEach((item) => { revisions[item.id] = item.list; });
    } else {
      const flat = [];
      allRevs.forEach((item) => item.list.forEach((rev) => flat.push({ id: item.id, rev })));
      flat.sort((a, b) => String(b.rev.time).localeCompare(String(a.rev.time)));
      flat.slice(0, SYNC_REVISION_TOTAL).forEach(({ id, rev }) => {
        if (!revisions[id]) revisions[id] = [];
        revisions[id].push(rev);
      });
      Object.keys(revisions).forEach((id) => revisions[id].sort((a, b) => String(b.time).localeCompare(String(a.time))));
    }
    const workspace = workspaceForSync();
    const meta = { dbFlags: state.dbFlags && typeof state.dbFlags === 'object' ? state.dbFlags : {} };
    const data = { articles, drafts, revisions, workspace, meta };
    const out = {};
    Object.keys(data).forEach((key) => {
      const text = stableJson(data[key]);
      out[key] = { key, data: data[key], text, hash: syncHash(text), count: domainCount(key, data[key]), bytes: byteLengthOf(text) };
    });
    return out;
  }
  function snapshotHashes(snapshot) {
    const out = {};
    SYNC_DOMAINS.forEach((d) => { out[d.key] = snapshot[d.key].hash; });
    return out;
  }
  function baseArticlesFromOverlay() {
    const map = {};
    state.overlay.forEach((rec) => {
      if (!rec || !rec.docId) return;
      map[rec.docId] = { key: articleKeyOf(rec), updated: String(rec.updated || '') };
    });
    return map;
  }
  function baseDraftsFrom() {
    const map = {};
    state.drafts.forEach((draft) => {
      if (!draft || !draft.id) return;
      map[draft.id] = { key: draftKeyOf(draft), updatedAt: String(draft.updatedAt || '') };
    });
    return map;
  }
  function hasLocalContent() {
    return state.overlay.length > 0 || state.drafts.length > 0;
  }
  function conflictExcerpt(text) {
    return String(text || '')
      .replace(/^#\s+.*$/m, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
  }
  function conflictView(c) {
    const view = { key: c.key, kind: c.kind, title: c.title || '', at: c.at || '', subType: c.subType || 'both' };
    if (c.kind === 'article') {
      const local = state.overlay.find((rec) => rec && rec.docId === c.articleId);
      view.articleId = c.articleId;
      view.updatedLocal = (local && local.updated) || c.updatedLocal || '';
      view.updatedRemote = (c.remote && c.remote.updated) || c.updatedRemote || '';
      view.wordsLocal = Number(local && local.words) || c.wordsLocal || 0;
      view.wordsRemote = Number(c.remote && c.remote.words) || c.wordsRemote || 0;
      view.excerptLocal = conflictExcerpt((local && (local.body || local.text)) || c.localBody || '');
      view.excerptRemote = conflictExcerpt(c.remote && c.remote.body);
      view.remoteMissing = !c.remote;
    } else if (c.kind === 'draft') {
      const local = state.drafts.find((d) => d && d.id === c.draftId);
      view.draftId = c.draftId;
      view.updatedLocal = (local && local.updatedAt) || c.updatedLocal || '';
      view.updatedRemote = (c.remote && c.remote.updatedAt) || c.updatedRemote || '';
      view.wordsLocal = countWords((local && (local.markdown || local.text)) || '');
      view.wordsRemote = countWords(c.remote && (c.remote.markdown || c.remote.text));
      view.excerptLocal = conflictExcerpt((local && (local.markdown || local.text)) || '');
      view.excerptRemote = conflictExcerpt(c.remote && (c.remote.markdown || c.remote.text));
      view.remoteMissing = !c.remote;
      view.localMissing = !local;
    } else {
      view.domain = c.domain;
      view.label = c.label || c.domain;
      view.localSummary = c.localSummary || '';
      view.remoteSummary = c.remoteSummary || '';
    }
    return view;
  }
  function githubPending() {
    const snapshot = buildSyncSnapshot();
    const base = state.syncBase;
    const domains = SYNC_DOMAINS.map((d) => {
      const localHash = snapshot[d.key].hash;
      const baseHash = base && base.local ? String(base.local[d.key] || '') : '';
      return {
        key: d.key, label: d.label, file: d.file,
        changed: baseHash ? localHash !== baseHash : true,
        first: !baseHash,
        count: snapshot[d.key].count,
        bytes: snapshot[d.key].bytes
      };
    });
    return {
      domains,
      changed: domains.filter((d) => d.changed).length,
      first: !base || !base.head,
      articles: snapshot.articles.count,
      drafts: snapshot.drafts.count,
      revisions: snapshot.revisions.count
    };
  }
  function githubBaseSummary() {
    const base = state.syncBase;
    if (!base) return null;
    return {
      head: base.head || '',
      at: base.at || '',
      repo: base.repo || {},
      domains: base.remote || {},
      entries: { articles: Object.keys(base.articles || {}).length, drafts: Object.keys(base.drafts || {}).length }
    };
  }
  async function readRemoteState(cfg) {
    const ref = await GitHubApi.getRef(cfg);
    if (!ref) return { head: '', message: '', date: '', author: '', treeSha: '', files: {} };
    const commit = await GitHubApi.getCommit(cfg, ref.object.sha);
    const treeSha = commit && commit.tree ? commit.tree.sha : '';
    const files = {};
    if (treeSha) {
      const root = await GitHubApi.getTree(cfg, treeSha);
      const dirEntry = (root && root.tree || []).find((entry) => entry.type === 'tree' && entry.path === cfg.dir);
      if (dirEntry) {
        const dirTree = await GitHubApi.getTree(cfg, dirEntry.sha);
        (dirTree && dirTree.tree || []).forEach((entry) => {
          if (entry.type === 'blob' && entry.path) files[entry.path] = entry.sha;
        });
      }
    }
    return {
      head: ref.object.sha,
      message: commit.message || '',
      date: (commit.author && commit.author.date) || '',
      author: (commit.author && commit.author.name) || '',
      treeSha,
      files
    };
  }
  async function fetchRemoteDomain(cfg, domain, sha) {
    const text = await GitHubApi.getBlob(cfg, sha);
    let payload = null;
    try { payload = JSON.parse(text); } catch (e) { throw apiError('云端的「' + domain.file + '」不是合法 JSON', 422, 'BAD_PAYLOAD'); }
    if (!payload || payload.app !== SYNC_APP || !payload.data || typeof payload.data !== 'object') {
      throw apiError('云端的「' + domain.file + '」不是写作库 6.4 的同步文件', 422, 'BAD_PAYLOAD');
    }
    return {
      key: domain.key, file: domain.file, sha,
      payload, data: payload.data,
      hash: syncHash(stableJson(payload.data)),
      count: domainCount(domain.key, payload.data),
      bytes: byteLengthOf(text)
    };
  }
  function sanitizeArticleMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach((key) => {
      const item = raw[key];
      if (!item || typeof item !== 'object') return;
      const id = String(item.docId || key || '');
      if (!id) return;
      out[id] = Object.assign({}, item, { docId: id });
    });
    return out;
  }
  function sanitizeDrafts(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    raw.forEach((item) => {
      if (!item || !item.id || seen.has(String(item.id))) return;
      seen.add(String(item.id));
      out.push(normalizeRemoteDraft(item));
    });
    return out;
  }
  function normalizeRemoteDraft(draft) {
    const markdown = String(draft.markdown != null ? draft.markdown : (draft.text || '')).replace(/\r\n/g, '\n');
    const title = String(draft.title || '无题速写');
    return {
      id: String(draft.id),
      title,
      markdown,
      text: MD.plainOfMarkdown(markdown),
      html: MD.mdToHtml(markdown, title),
      tags: Array.isArray(draft.tags) ? draft.tags.slice() : listOf(draft.tags),
      sourceDocId: String(draft.sourceDocId || ''),
      sourceTitle: String(draft.sourceTitle || ''),
      createdAt: String(draft.createdAt || nowIso()),
      updatedAt: String(draft.updatedAt || draft.createdAt || nowIso()),
      publishedId: String(draft.publishedId || '')
    };
  }
  async function overlayEntryFromRemote(remote, old) {
    const title = String(remote.title || (old && old.title) || '未命名');
    let body = normalizeBody(remote.body || '');
    if (!body) body = '# ' + title + '\n\n';
    const bare = stripTitleLine(body).trim();
    const text = MD.plainOfMarkdown(bare);
    const type = TYPES.includes(remote.type) ? remote.type : ((old && TYPES.includes(old.type)) ? old.type : '资料');
    let cats = Array.isArray(remote.cats) && remote.cats.length ? remote.cats.slice() : ((old && Array.isArray(old.cats) && old.cats.length) ? old.cats.slice() : []);
    if (!cats.length) cats = fallbackCats({ type, catName: old && old.catName, subName: old && old.subName });
    const tags = Array.isArray(remote.tags) ? remote.tags.slice() : ((old && old.tags) || []);
    const status = STATUSES.includes(remote.status) ? remote.status : ((old && STATUSES.includes(old.status)) ? old.status : '草稿');
    const db = dbById(String(remote.dbId || (old && old.dbId) || DB1)) || dbById(DB1);
    return {
      docId: String(remote.docId || (old && old.docId) || ''),
      title,
      type,
      cats,
      tags,
      status,
      body,
      text,
      html: MD.mdToHtml(body, title),
      words: Number(remote.words) || countWords(body),
      bodyHash: await hash16(body),
      metaHash: await hash16(metaString(cats, tags, status)),
      summary: String(remote.summary || text.slice(0, 140)),
      quote: String(remote.quote || quoteOf(body)),
      tone: String(remote.tone || (old && old.tone) || '其他'),
      created: String(remote.created || (old && old.created) || today()),
      updated: String(remote.updated || today()),
      mtime: String(remote.mtime || nowIso()),
      ctime: String((old && old.ctime) || nowIso()),
      path: String(remote.path || (old && old.path) || ''),
      dir: String(remote.dir || (old && old.dir) || ''),
      dbId: db ? db.id : DB1,
      publish: remote.publish && typeof remote.publish === 'object'
        ? remote.publish
        : Object.assign({ git: '未发布', siyuan: '未发布', ob: '未发布', studio: '未发布' }, (old && old.publish) || {})
    };
  }
  function makeArticleConflict(id, local, remote, baseEntry) {
    return {
      key: 'article:' + id,
      kind: 'article',
      articleId: id,
      title: (remote && remote.title) || (local && local.title) || id,
      subType: !remote ? 'remote-missing' : 'both',
      updatedLocal: (local && local.updated) || '',
      updatedRemote: (remote && remote.updated) || '',
      wordsLocal: Number(local && local.words) || 0,
      wordsRemote: Number(remote && remote.words) || 0,
      localBody: local ? normalizeBody(local.body || local.text || '') : '',
      remote: remote || null,
      base: baseEntry ? { key: baseEntry.key || '', updated: baseEntry.updated || '' } : null,
      at: nowIso()
    };
  }
  async function mergeArticles(remoteMap, options) {
    const opts = options || {};
    const localMap = {};
    state.overlay.forEach((rec) => { if (rec && rec.docId) localMap[rec.docId] = rec; });
    const baseMap = opts.base && opts.base.articles && typeof opts.base.articles === 'object' ? opts.base.articles : {};
    const existing = new Map();
    state.syncConflicts.forEach((c) => { if (c.kind === 'article' && c.articleId) existing.set(c.articleId, c); });
    const applied = [];
    const conflicts = [];
    const ids = new Set([...Object.keys(localMap), ...Object.keys(remoteMap), ...Object.keys(baseMap)]);
    for (const id of ids) {
      const local = localMap[id] || null;
      const remote = remoteMap[id] || null;
      const baseEntry = baseMap[id] || null;
      const lk = local ? articleKeyOf(local) : '';
      const rk = remote ? articleKeyOf(remote) : '';
      const bk = baseEntry ? String(baseEntry.key || '') : '';
      if (opts.first || opts.force) {
        if (remote && lk !== rk) {
          localMap[id] = await overlayEntryFromRemote(remote, local);
          applied.push(id);
        }
        continue;
      }
      if (rk === bk) continue;
      if (lk === bk) {
        if (remote) {
          if (rk !== lk) {
            localMap[id] = await overlayEntryFromRemote(remote, local);
            applied.push(id);
          }
        } else if (local) {
          delete localMap[id];
          applied.push(id);
        }
        continue;
      }
      if (lk === rk) continue;
      const old = existing.get(id);
      if (old) {
        if (rk !== articleKeyOf(old.remote)) {
          old.remote = remote;
          old.updatedRemote = (remote && remote.updated) || '';
          old.wordsRemote = Number(remote && remote.words) || 0;
          old.title = (remote && remote.title) || old.title;
          old.at = nowIso();
        }
        continue;
      }
      conflicts.push(makeArticleConflict(id, local, remote, baseEntry));
    }
    return {
      overlayArray: Object.keys(localMap).sort().map((id) => localMap[id]),
      applied,
      conflicts
    };
  }
  function makeDraftConflict(id, local, remote, baseEntry, subType) {
    return {
      key: 'draft:' + id,
      kind: 'draft',
      draftId: id,
      title: (remote && remote.title) || (local && local.title) || id,
      subType: subType || 'both',
      updatedLocal: (local && local.updatedAt) || '',
      updatedRemote: (remote && remote.updatedAt) || '',
      wordsLocal: countWords((local && (local.markdown || local.text)) || ''),
      wordsRemote: countWords((remote && (remote.markdown || remote.text)) || ''),
      remote: remote || null,
      base: baseEntry ? { key: baseEntry.key || '', updatedAt: baseEntry.updatedAt || '' } : null,
      at: nowIso()
    };
  }
  function mergeDrafts(remoteList, options) {
    const opts = options || {};
    const localMap = new Map(state.drafts.map((d) => [d.id, d]));
    const remoteMap = new Map(remoteList.map((d) => [d.id, d]));
    const baseMap = opts.base && opts.base.drafts && typeof opts.base.drafts === 'object' ? opts.base.drafts : {};
    const existing = new Map();
    state.syncConflicts.forEach((c) => { if (c.kind === 'draft' && c.draftId) existing.set(c.draftId, c); });
    const applied = [];
    const removed = [];
    const conflicts = [];
    const ids = new Set([...localMap.keys(), ...remoteMap.keys(), ...Object.keys(baseMap)]);
    ids.forEach((id) => {
      const local = localMap.get(id) || null;
      const remote = remoteMap.get(id) || null;
      const baseEntry = baseMap[id] || null;
      const lk = local ? draftKeyOf(local) : '';
      const rk = remote ? draftKeyOf(remote) : '';
      const bk = baseEntry ? String(baseEntry.key || '') : '';
      if (opts.first || opts.force) {
        if (remote && lk !== rk) {
          localMap.set(id, normalizeRemoteDraft(remote));
          applied.push(id);
        }
        return;
      }
      if (rk === bk) return;
      if (lk === bk) {
        if (remote) {
          if (rk !== lk) {
            localMap.set(id, normalizeRemoteDraft(remote));
            applied.push(id);
          }
        } else if (local) {
          localMap.delete(id);
          removed.push(id);
        }
        return;
      }
      if (lk === rk) return;
      const old = existing.get(id);
      if (old) {
        if (rk !== draftKeyOf(old.remote)) {
          old.remote = remote;
          old.updatedRemote = (remote && remote.updatedAt) || '';
          old.at = nowIso();
        }
        return;
      }
      conflicts.push(makeDraftConflict(id, local, remote, baseEntry, !remote ? 'remote-missing' : !local ? 'local-missing' : 'both'));
    });
    return {
      drafts: Array.from(localMap.values()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
      applied,
      removed,
      conflicts
    };
  }
  function mergeRevisions(remoteData) {
    let added = 0;
    Object.keys(remoteData || {}).forEach((id) => {
      const incoming = Array.isArray(remoteData[id]) ? remoteData[id] : [];
      if (!incoming.length) return;
      const list = state.revisions[id] || [];
      const seen = new Set(list.map((rev) => rev.rev));
      incoming.forEach((rev) => {
        if (!rev || !rev.rev || seen.has(rev.rev)) return;
        list.push({
          rev: String(rev.rev),
          id: String(rev.id || id),
          title: String(rev.title || ''),
          body: String(rev.body || ''),
          cats: Array.isArray(rev.cats) ? rev.cats : [],
          tags: Array.isArray(rev.tags) ? rev.tags : [],
          status: String(rev.status || ''),
          words: Number(rev.words) || 0,
          note: String(rev.note || ''),
          source: String(rev.source || 'sync'),
          time: String(rev.time || nowIso())
        });
        seen.add(rev.rev);
        added += 1;
      });
      list.sort((a, b) => String(b.time).localeCompare(String(a.time)));
      state.revisions[id] = list.slice(0, MAX_REVISIONS);
    });
    return added;
  }
  function workspaceFromData(data) {
    return {
      projects: Array.isArray(data && data.projects) ? data.projects : [],
      curation: data && data.curation && typeof data.curation === 'object' ? data.curation : {}
    };
  }
  async function applyWorkspaceData(data) {
    const next = workspaceFromData(data);
    state.workspace = Object.assign({}, state.workspace || {}, {
      app: '写作库 6.4',
      version: BUILD,
      projects: next.projects,
      curation: next.curation,
      updatedAt: Date.now(),
      savedAt: nowIso(),
      device: deviceName(),
      initialized: true
    });
    await kvSet('workspace', state.workspace);
    try {
      if (window.Store) {
        window.Store.projects = next.projects.map((project) => window.Store.migrate(project));
        await window.Store.flush();
      }
    } catch (e) { /* 忽略 */ }
    try { if (window.Curation) window.Curation.importAll(next.curation, 'replace'); } catch (e) { /* 忽略 */ }
    try {
      if (window.Gen6Projects && window.Gen6Projects.syncAll) await window.Gen6Projects.syncAll({ quiet: true });
    } catch (e) { /* 忽略 */ }
  }
  async function applyMetaData(data) {
    state.dbFlags = data && data.dbFlags && typeof data.dbFlags === 'object' ? data.dbFlags : {};
    await kvSet('databases', state.dbFlags);
    resetRecordsFromSeed();
    applyOverlay();
    rebuildLib();
    if (window.LibData) {
      try { window.LibData.rebuild(window.LIB); } catch (e) { /* 忽略 */ }
    }
  }
  function domainSummary(domain, data) {
    if (domain === 'workspace') {
      const projects = Array.isArray(data && data.projects) ? data.projects : [];
      const names = projects.slice(0, 3).map((p) => p && p.name).filter(Boolean).join('、');
      return projects.length + ' 个写作台作品' + (names ? '：' + names : '');
    }
    if (domain === 'meta') {
      const flags = data && data.dbFlags && typeof data.dbFlags === 'object' ? data.dbFlags : {};
      const disabled = Object.keys(flags).filter((key) => flags[key] === false).length;
      return disabled ? '停用 ' + disabled + ' 个数据库' : '全部数据库启用';
    }
    return '';
  }
  function makeDomainConflict(domain, remoteData, payload, localHash) {
    const label = domain === 'workspace' ? '写作台工程' : '数据库开关';
    return {
      key: 'domain:' + domain,
      kind: 'domain',
      domain,
      label,
      title: label,
      subType: 'both',
      localHash,
      remoteHash: payload.hash,
      remoteSha: payload.sha,
      remoteData,
      localSummary: domainSummary(domain, domain === 'workspace'
        ? { projects: (state.workspace && state.workspace.projects) || [], curation: (state.workspace && state.workspace.curation) || {} }
        : { dbFlags: state.dbFlags }),
      remoteSummary: domainSummary(domain, remoteData),
      at: nowIso()
    };
  }
  async function flushLocalBeforeSync() {
    try { if (window.WorkspaceSync && window.WorkspaceSync.flush) await window.WorkspaceSync.flush(); } catch (e) { /* 忽略 */ }
    try { if (window.Store && window.Store.flush) await window.Store.flush(); } catch (e) { /* 忽略 */ }
  }
  function buildSyncBaseAfterPull(snapshot, remote, base, fetched) {
    const oldRemote = base && base.remote ? base.remote : {};
    const oldLocal = base && base.local ? base.local : {};
    const remoteInfo = {};
    SYNC_DOMAINS.forEach((d) => {
      const fresh = fetched[d.key];
      const remoteSha = remote.files[d.file] || '';
      if (fresh) {
        remoteInfo[d.key] = { file: d.file, sha: fresh.sha, hash: fresh.hash, bytes: fresh.bytes, count: fresh.count };
      } else if (remoteSha) {
        const previous = oldRemote[d.key];
        remoteInfo[d.key] = previous && previous.sha === remoteSha
          ? Object.assign({ file: d.file }, previous)
          : { file: d.file, sha: remoteSha, hash: '', bytes: 0, count: 0 };
      } else {
        remoteInfo[d.key] = { file: d.file, sha: '', hash: '', bytes: 0, count: 0 };
      }
    });
    const local = snapshotHashes(snapshot);
    state.syncConflicts.forEach((c) => {
      if (c.kind === 'domain' && c.domain) local[c.domain] = oldLocal[c.domain] || '';
    });
    const articleConflicts = new Set(state.syncConflicts.filter((c) => c.kind === 'article').map((c) => c.articleId));
    const articles = {};
    state.overlay.forEach((rec) => {
      if (!rec || !rec.docId || articleConflicts.has(rec.docId)) return;
      articles[rec.docId] = { key: articleKeyOf(rec), updated: String(rec.updated || '') };
    });
    articleConflicts.forEach((id) => {
      if (base && base.articles && base.articles[id]) articles[id] = base.articles[id];
    });
    const draftConflicts = new Set(state.syncConflicts.filter((c) => c.kind === 'draft').map((c) => c.draftId));
    const drafts = {};
    state.drafts.forEach((draft) => {
      if (!draft || !draft.id || draftConflicts.has(draft.id)) return;
      drafts[draft.id] = { key: draftKeyOf(draft), updatedAt: String(draft.updatedAt || '') };
    });
    draftConflicts.forEach((id) => {
      if (base && base.drafts && base.drafts[id]) drafts[id] = base.drafts[id];
    });
    return {
      version: 1,
      head: remote.head,
      at: nowIso(),
      repo: {
        owner: state.githubCfg.owner,
        repo: state.githubCfg.repo,
        branch: state.githubCfg.branch,
        dir: state.githubCfg.dir
      },
      remote: remoteInfo,
      local,
      articles,
      drafts,
      workspace: { hash: local.workspace },
      meta: { hash: local.meta }
    };
  }
  function recordSyncLog(entry) {
    const cfg = normalizeGithubCfg(state.githubCfg);
    const full = Object.assign({
      at: nowIso(),
      device: deviceName(),
      repo: cfg.owner + '/' + cfg.repo,
      branch: cfg.branch
    }, entry || {});
    state.syncLog.unshift(full);
    state.syncLog = state.syncLog.slice(0, 50);
    kvSet('syncLog', state.syncLog);
  }
  async function githubPull(body) {
    const opts = body || {};
    const cfg = requireGithub();
    const remote = await readRemoteState(cfg);
    if (!remote.head) return { ok: true, empty: true, message: '云端还没有同步内容' };
    const base = state.syncBase;
    if (base && base.head === remote.head && !opts.force) {
      state.syncStatus = { configured: true, ok: true, checkedAt: nowIso(), remoteHead: remote.head, remoteChanged: false, error: '' };
      return { ok: true, upToDate: true, head: remote.head, message: '云端没有新提交' };
    }
    const first = !base || !base.head;
    if (first && hasLocalContent() && !opts.acceptRemote) {
      return {
        ok: true,
        needsChoice: true,
        reason: 'first',
        head: remote.head,
        message: remote.message,
        date: remote.date,
        localArticles: state.overlay.length,
        localDrafts: state.drafts.length
      };
    }
    const snapshotBefore = buildSyncSnapshot();
    const fetched = {};
    for (const d of SYNC_DOMAINS) {
      const sha = remote.files[d.file] || '';
      if (!sha) continue;
      const baseSha = base && base.remote && base.remote[d.key] ? String(base.remote[d.key].sha || '') : '';
      if (baseSha && sha === baseSha && !opts.force) continue;
      const payload = await fetchRemoteDomain(cfg, d, sha);
      if (base && !first && !opts.force && base.local && base.local[d.key] === payload.hash) {
        fetched[d.key] = payload;
        continue;
      }
      fetched[d.key] = payload;
    }
    const report = {
      ok: true,
      head: remote.head,
      message: remote.message,
      date: remote.date,
      appliedArticles: 0,
      appliedDrafts: 0,
      removedDrafts: 0,
      revisionsAdded: 0,
      workspace: false,
      meta: false,
      conflicts: 0
    };
    if (fetched.articles) {
      const merge = await mergeArticles(sanitizeArticleMap(fetched.articles.data), { first, force: !!opts.force, base });
      if (merge.applied.length) {
        state.overlay = merge.overlayArray;
        await kvSet('articles', state.overlay);
        rehydrateLibrary();
      }
      report.appliedArticles = merge.applied.length;
      if (merge.conflicts.length) {
        state.syncConflicts.push(...merge.conflicts);
        report.conflicts += merge.conflicts.length;
      }
    }
    if (fetched.drafts) {
      const merge = mergeDrafts(sanitizeDrafts(fetched.drafts.data), { first, force: !!opts.force, base });
      if (merge.applied.length || merge.removed.length) {
        state.drafts = merge.drafts;
        await kvSet('drafts', state.drafts);
      }
      report.appliedDrafts = merge.applied.length;
      report.removedDrafts = merge.removed.length;
      if (merge.conflicts.length) {
        state.syncConflicts.push(...merge.conflicts);
        report.conflicts += merge.conflicts.length;
      }
    }
    if (fetched.revisions) {
      report.revisionsAdded = mergeRevisions(fetched.revisions.data);
      if (report.revisionsAdded) await kvSet('revisions', state.revisions);
    }
    if (fetched.workspace) {
      const payload = fetched.workspace;
      const baseHash = base && base.local ? String(base.local.workspace || '') : '';
      const localHash = snapshotBefore.workspace.hash;
      const existing = state.syncConflicts.find((c) => c.kind === 'domain' && c.domain === 'workspace');
      if (first || opts.force) {
        await applyWorkspaceData(payload.data);
        report.workspace = true;
      } else if (payload.hash === baseHash) {
        /* 云端没变 */
      } else if (localHash === baseHash) {
        await applyWorkspaceData(payload.data);
        report.workspace = true;
      } else if (localHash === payload.hash) {
        /* 两边一样 */
      } else if (existing) {
        existing.remoteData = payload.data;
        existing.remoteHash = payload.hash;
        existing.remoteSha = payload.sha;
        existing.remoteSummary = domainSummary('workspace', payload.data);
        existing.at = nowIso();
      } else {
        state.syncConflicts.push(makeDomainConflict('workspace', payload.data, payload, localHash));
        report.conflicts += 1;
      }
    }
    if (fetched.meta) {
      const payload = fetched.meta;
      const baseHash = base && base.local ? String(base.local.meta || '') : '';
      const localHash = snapshotBefore.meta.hash;
      const existing = state.syncConflicts.find((c) => c.kind === 'domain' && c.domain === 'meta');
      if (first || opts.force) {
        await applyMetaData(payload.data);
        report.meta = true;
      } else if (payload.hash === baseHash) {
        /* 云端没变 */
      } else if (localHash === baseHash) {
        await applyMetaData(payload.data);
        report.meta = true;
      } else if (localHash === payload.hash) {
        /* 两边一样 */
      } else if (existing) {
        existing.remoteData = payload.data;
        existing.remoteHash = payload.hash;
        existing.remoteSha = payload.sha;
        existing.remoteSummary = domainSummary('meta', payload.data);
        existing.at = nowIso();
      } else {
        state.syncConflicts.push(makeDomainConflict('meta', payload.data, payload, localHash));
        report.conflicts += 1;
      }
    }
    await kvSet('syncConflicts', state.syncConflicts);
    const snapshotAfter = buildSyncSnapshot();
    const nextBase = buildSyncBaseAfterPull(snapshotAfter, remote, base, fetched);
    state.syncBase = nextBase;
    await kvSet('syncBase', nextBase);
    state.lastNotifiedHead = remote.head;
    state.syncStatus = { configured: true, ok: true, checkedAt: nowIso(), remoteHead: remote.head, remoteChanged: false, error: '' };
    recordSyncLog({
      action: 'pull',
      commit: remote.head,
      message: remote.message || '',
      applied: {
        articles: report.appliedArticles,
        drafts: report.appliedDrafts,
        removedDrafts: report.removedDrafts,
        revisions: report.revisionsAdded,
        workspace: report.workspace,
        meta: report.meta
      },
      conflicts: report.conflicts
    });
    report.pending = githubPending();
    report.base = githubBaseSummary();
    report.conflictItems = state.syncConflicts.map(conflictView);
    if (report.appliedArticles || report.appliedDrafts || report.removedDrafts || report.workspace || report.meta) {
      emitSync('wb64:library-changed', { at: nowIso(), source: 'github-pull' });
    }
    emitSync('wb64:sync-pulled', report);
    return report;
  }
  function defaultCommitMessage(snapshot, changedKeys) {
    const d = new Date();
    const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    const labels = SYNC_DOMAINS.filter((item) => changedKeys.indexOf(item.key) >= 0).map((item) => item.label);
    return '写作库同步 · ' + stamp + (labels.length ? ' · ' + labels.join(' / ') : '');
  }
  async function githubPush(body) {
    const opts = body || {};
    await flushLocalBeforeSync();
    const cfg = requireGithub();
    const snapshot = buildSyncSnapshot();
    const pending = githubPending();
    if (!pending.changed && !opts.force) {
      return { ok: true, empty: true, message: '本机没有新的同步改动' };
    }
    if (state.syncConflicts.length) {
      throw apiError('还有 ' + state.syncConflicts.length + ' 个冲突没有处理。请先在同步面板里选择保留哪一边。', 409, 'CONFLICTS');
    }
    const remote = await readRemoteState(cfg);
    const base = state.syncBase;
    if (!opts.force) {
      if (remote.head && base && base.head && remote.head !== base.head) {
        throw apiError('云端有新的提交，请先拉取，再提交本机改动。', 409, 'REMOTE_AHEAD');
      }
      if (remote.head && (!base || !base.head)) {
        throw apiError('云端已经有同步内容。请先拉取；如果确定以本机为准，可以选择覆盖云端。', 409, 'FIRST_PUSH');
      }
    }
    const entries = [];
    const remoteInfo = {};
    const blobs = {};
    const changedKeys = [];
    for (const d of SYNC_DOMAINS) {
      const localHash = snapshot[d.key].hash;
      const baseHash = base && base.local ? String(base.local[d.key] || '') : '';
      const remoteSha = remote.files[d.file] || '';
      const need = !!opts.force || !base || localHash !== baseHash || !remoteSha;
      if (!need) {
        blobs[d.key] = remoteSha;
        const previous = base.remote && base.remote[d.key] ? base.remote[d.key] : {};
        remoteInfo[d.key] = { file: d.file, sha: remoteSha, hash: previous.hash || localHash, bytes: previous.bytes || 0, count: snapshot[d.key].count };
        continue;
      }
      const payload = {
        app: SYNC_APP,
        appVersion: BUILD,
        kind: d.key,
        hash: localHash,
        count: snapshot[d.key].count,
        generatedAt: nowIso(),
        device: deviceName(),
        data: snapshot[d.key].data
      };
      const text = JSON.stringify(payload, null, 2);
      const sha = await GitHubApi.createBlob(cfg, text);
      blobs[d.key] = sha;
      remoteInfo[d.key] = { file: d.file, sha, hash: localHash, bytes: byteLengthOf(text), count: snapshot[d.key].count };
      entries.push({ path: cfg.dir + '/' + d.file, mode: '100644', type: 'blob', sha });
      changedKeys.push(d.key);
    }
    const headPayload = {
      app: SYNC_APP,
      appVersion: BUILD,
      kind: 'head',
      version: 1,
      generatedAt: nowIso(),
      device: deviceName(),
      repo: cfg.owner + '/' + cfg.repo,
      branch: cfg.branch,
      dir: cfg.dir,
      note: '只同步相对初始文库的改动；不含种子全文，也不含 Token。',
      domains: {}
    };
    SYNC_DOMAINS.forEach((d) => { headPayload.domains[d.key] = remoteInfo[d.key]; });
    const headSha = await GitHubApi.createBlob(cfg, JSON.stringify(headPayload, null, 2));
    entries.push({ path: cfg.dir + '/' + SYNC_HEAD, mode: '100644', type: 'blob', sha: headSha });
    const treeSha = await GitHubApi.createTree(cfg, entries, remote.treeSha || undefined);
    const message = String(opts.message || '').trim().slice(0, 200) || defaultCommitMessage(snapshot, changedKeys);
    const commit = await GitHubApi.createCommit(cfg, message, treeSha, remote.head ? [remote.head] : []);
    try {
      if (remote.head) await GitHubApi.updateRef(cfg, commit.sha);
      else await GitHubApi.createRef(cfg, commit.sha);
    } catch (error) {
      if (error && (error.status === 409 || error.status === 422)) {
        throw apiError('云端刚刚又更新了，请先拉取再提交。', 409, 'REMOTE_AHEAD');
      }
      throw error;
    }
    const nextBase = {
      version: 1,
      head: commit.sha,
      at: nowIso(),
      repo: { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, dir: cfg.dir },
      remote: remoteInfo,
      local: snapshotHashes(snapshot),
      articles: baseArticlesFromOverlay(),
      drafts: baseDraftsFrom(),
      workspace: { hash: snapshot.workspace.hash },
      meta: { hash: snapshot.meta.hash }
    };
    state.syncBase = nextBase;
    await kvSet('syncBase', nextBase);
    state.lastNotifiedHead = commit.sha;
    state.syncStatus = { configured: true, ok: true, checkedAt: nowIso(), remoteHead: commit.sha, remoteChanged: false, error: '' };
    recordSyncLog({ action: 'push', commit: commit.sha, message, changed: changedKeys });
    const result = {
      ok: true,
      empty: false,
      head: commit.sha,
      message,
      changed: changedKeys,
      webUrl: GitHubApi.repoWebUrl(cfg) ? GitHubApi.repoWebUrl(cfg) + '/commit/' + commit.sha : '',
      pending: githubPending(),
      base: githubBaseSummary()
    };
    emitSync('wb64:sync-pushed', result);
    return result;
  }
  async function githubCheck() {
    const cfg = requireGithub();
    const remote = await readRemoteState(cfg);
    const pending = githubPending();
    const base = state.syncBase;
    const remoteChanged = !!(remote.head && (!base || base.head !== remote.head));
    state.syncStatus = { configured: true, ok: true, checkedAt: nowIso(), remoteHead: remote.head, remoteChanged, error: '' };
    if (remoteChanged && remote.head !== state.lastNotifiedHead) {
      state.lastNotifiedHead = remote.head;
      emitSync('wb64:remote-changed', {
        head: remote.head,
        baseHead: (base && base.head) || '',
        message: remote.message || '',
        date: remote.date || ''
      });
    }
    emitSync('wb64:sync-status', state.syncStatus);
    return {
      ok: true,
      checkedAt: state.syncStatus.checkedAt,
      remote: { head: remote.head, message: remote.message, date: remote.date, files: remote.files },
      baseHead: (base && base.head) || '',
      remoteChanged,
      pending,
      repo: state.githubRepoInfo,
      webUrl: GitHubApi.repoWebUrl(cfg),
      conflicts: state.syncConflicts.map(conflictView)
    };
  }
  async function githubPoll() {
    if (state.pollBusy || !githubReady()) return;
    state.pollBusy = true;
    try {
      const cfg = githubClientCfg();
      const ref = await GitHubApi.getRef(cfg);
      const head = ref ? ref.object.sha : '';
      const base = state.syncBase;
      const changed = !!(head && (!base || base.head !== head));
      state.syncStatus = { configured: true, ok: true, checkedAt: nowIso(), remoteHead: head, remoteChanged: changed, error: '' };
      if (changed && head !== state.lastNotifiedHead) {
        state.lastNotifiedHead = head;
        emitSync('wb64:remote-changed', { head, baseHead: (base && base.head) || '', message: '', date: '' });
      }
      emitSync('wb64:sync-status', state.syncStatus);
      if (changed && state.githubCfg && state.githubCfg.autoPull
        && !state.overlay.length && !state.drafts.length && !state.syncConflicts.length) {
        try {
          const result = await githubPull({ auto: true });
          if (result && result.ok && !result.upToDate && !result.needsChoice) emitSync('wb64:sync-pulled', result);
        } catch (error) {
          state.syncStatus = { configured: true, ok: false, checkedAt: nowIso(), remoteHead: head, remoteChanged: true, error: error.message || '自动拉取失败' };
          emitSync('wb64:sync-status', state.syncStatus);
        }
      }
    } catch (error) {
      state.syncStatus = { configured: true, ok: false, checkedAt: nowIso(), remoteHead: '', remoteChanged: false, error: error.message || '检查云端失败' };
      emitSync('wb64:sync-status', state.syncStatus);
    } finally {
      state.pollBusy = false;
    }
  }
  function startGithubPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(() => {
      if (document.hidden) return;
      if (!githubReady()) return;
      if (state.githubCfg && state.githubCfg.autoCheck === false) return;
      githubPoll();
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (!githubReady()) return;
      if (state.githubCfg && state.githubCfg.autoCheck === false) return;
      githubPoll();
    });
  }
  function findOverlayEntry(id) {
    return state.overlay.find((rec) => rec && rec.docId === id) || null;
  }
  function upsertOverlayEntry(entry) {
    if (!entry || !entry.docId) return;
    const at = state.overlay.findIndex((rec) => rec && rec.docId === entry.docId);
    if (at >= 0) state.overlay[at] = entry;
    else state.overlay.push(entry);
  }
  function removeOverlayEntry(id) {
    state.overlay = state.overlay.filter((rec) => !rec || rec.docId !== id);
  }
  async function createConflictCopy(local) {
    const db = dbById(String(local.dbId || '')) || dbById(DB1);
    const type = TYPES.includes(local.type) ? local.type : '资料';
    const id = nextId(type, db || { id: DB1 });
    let body = normalizeBody(local.body || recordBody(local));
    if (!body) body = '# ' + (local.title || '未命名') + '\n\n';
    const title = String(local.title || '未命名') + '（冲突副本 ' + today() + '）';
    const cats = Array.isArray(local.cats) && local.cats.length ? local.cats.slice() : normalizeCats(type, []);
    const tags = Array.isArray(local.tags) ? local.tags.slice() : [];
    const dir = String(local.dir || defaultDir(type, cats, db || dbById(DB1)));
    const entry = {
      docId: id,
      title,
      type,
      cats,
      tags,
      status: '冲突副本',
      body,
      text: MD.plainOfMarkdown(stripTitleLine(body).trim()),
      html: MD.mdToHtml(body, title),
      words: Number(local.words) || countWords(body),
      bodyHash: await hash16(body),
      metaHash: await hash16(metaString(cats, tags, '冲突副本')),
      summary: String(local.summary || ''),
      quote: String(local.quote || quoteOf(body)),
      tone: String(local.tone || '其他'),
      created: today(),
      updated: today(),
      mtime: nowIso(),
      ctime: nowIso(),
      path: dir + '/' + id + ' ' + safeName(title) + '.md',
      dir,
      dbId: db ? db.id : DB1,
      publish: { git: '未发布', siyuan: '未发布', ob: '未发布', studio: '未发布' }
    };
    upsertOverlayEntry(entry);
    state.allIds.add(id);
    await kvSet('articles', state.overlay);
    return entry;
  }
  function createConflictDraft(local) {
    const copy = normalizeRemoteDraft(Object.assign({}, local, {
      id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title: String(local.title || '无题速写') + '（冲突副本 ' + today() + '）',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      publishedId: ''
    }));
    state.drafts.push(copy);
    return copy;
  }
  async function githubResolve(body) {
    const items = Array.isArray(body && body.items) ? body.items : [];
    if (!items.length) throw apiError('没有要处理的冲突', 400);
    const base = state.syncBase;
    const forcePush = { articles: false, drafts: false, workspace: false, meta: false };
    const touched = { articles: false, drafts: false, workspace: false, meta: false };
    for (const item of items) {
      const at = state.syncConflicts.findIndex((c) => c.key === item.key);
      if (at < 0) continue;
      const conflict = state.syncConflicts[at];
      const choice = item.choice === 'remote' ? 'remote' : item.choice === 'both' ? 'both' : 'local';
      if (conflict.kind === 'article') {
        const id = conflict.articleId;
        const local = findOverlayEntry(id);
        if (choice === 'local') {
          if (base) {
            if (local) base.articles[id] = { key: articleKeyOf(local), updated: String(local.updated || '') };
            else delete base.articles[id];
          }
          forcePush.articles = true;
          touched.articles = true;
        } else if (choice === 'remote') {
          if (conflict.remote) {
            const entry = await overlayEntryFromRemote(conflict.remote, local);
            upsertOverlayEntry(entry);
            if (base) base.articles[id] = { key: articleKeyOf(conflict.remote), updated: String(conflict.remote.updated || '') };
          } else {
            removeOverlayEntry(id);
            if (base) delete base.articles[id];
          }
          touched.articles = true;
        } else {
          if (local) {
            const copy = await createConflictCopy(local);
            if (base) base.articles[copy.docId] = { key: articleKeyOf(copy), updated: String(copy.updated || '') };
          }
          if (conflict.remote) {
            const entry = await overlayEntryFromRemote(conflict.remote, findOverlayEntry(id));
            upsertOverlayEntry(entry);
            if (base) base.articles[id] = { key: articleKeyOf(conflict.remote), updated: String(conflict.remote.updated || '') };
          }
          forcePush.articles = true;
          touched.articles = true;
        }
      } else if (conflict.kind === 'draft') {
        const id = conflict.draftId;
        const local = state.drafts.find((d) => d && d.id === id) || null;
        if (choice === 'local') {
          if (base) {
            if (local) base.drafts[id] = { key: draftKeyOf(local), updatedAt: String(local.updatedAt || '') };
            else delete base.drafts[id];
          }
          forcePush.drafts = true;
          touched.drafts = true;
        } else if (choice === 'remote') {
          state.drafts = state.drafts.filter((d) => !d || d.id !== id);
          if (conflict.remote) state.drafts.push(normalizeRemoteDraft(conflict.remote));
          if (base) {
            if (conflict.remote) base.drafts[id] = { key: draftKeyOf(conflict.remote), updatedAt: String(conflict.remote.updatedAt || '') };
            else delete base.drafts[id];
          }
          touched.drafts = true;
        } else {
          if (local) {
            const copy = createConflictDraft(local);
            if (base) base.drafts[copy.id] = { key: draftKeyOf(copy), updatedAt: String(copy.updatedAt || '') };
          }
          state.drafts = state.drafts.filter((d) => !d || d.id !== id);
          if (conflict.remote) state.drafts.push(normalizeRemoteDraft(conflict.remote));
          if (base) {
            if (conflict.remote) base.drafts[id] = { key: draftKeyOf(conflict.remote), updatedAt: String(conflict.remote.updatedAt || '') };
            else delete base.drafts[id];
          }
          forcePush.drafts = true;
          touched.drafts = true;
        }
      } else if (conflict.kind === 'domain') {
        if (conflict.domain === 'workspace') {
          if (choice === 'remote') {
            await applyWorkspaceData(conflict.remoteData);
            touched.workspace = true;
          } else {
            forcePush.workspace = true;
            touched.workspace = true;
          }
        } else if (conflict.domain === 'meta') {
          if (choice === 'remote') {
            await applyMetaData(conflict.remoteData);
            touched.meta = true;
          } else {
            forcePush.meta = true;
            touched.meta = true;
          }
        }
      }
      state.syncConflicts.splice(at, 1);
    }
    if (touched.articles) {
      await kvSet('articles', state.overlay);
      rehydrateLibrary();
    }
    if (touched.drafts) await kvSet('drafts', state.drafts);
    await kvSet('syncConflicts', state.syncConflicts);
    if (base) {
      const snapshot = buildSyncSnapshot();
      if (forcePush.articles) base.local.articles = '';
      else if (touched.articles) base.local.articles = snapshot.articles.hash;
      if (forcePush.drafts) base.local.drafts = '';
      else if (touched.drafts) base.local.drafts = snapshot.drafts.hash;
      if (forcePush.workspace) base.local.workspace = '';
      else if (touched.workspace) base.local.workspace = snapshot.workspace.hash;
      if (forcePush.meta) base.local.meta = '';
      else if (touched.meta) base.local.meta = snapshot.meta.hash;
      state.syncBase = base;
      await kvSet('syncBase', base);
    }
    const result = {
      ok: true,
      remaining: state.syncConflicts.length,
      pending: githubPending(),
      base: githubBaseSummary(),
      conflicts: state.syncConflicts.map(conflictView)
    };
    emitSync('wb64:sync-resolved', result);
    return result;
  }
  async function githubConfigPayload() {
    return {
      ok: true,
      configured: githubReady(),
      config: publicGithubCfg(),
      tokenPresent: !!state.githubToken,
      tokenSaved: !!(state.githubToken && state.githubCfg && state.githubCfg.remember),
      repo: state.githubRepoInfo,
      webUrl: githubReady() ? GitHubApi.repoWebUrl(githubClientCfg()) : '',
      status: state.syncStatus,
      base: githubBaseSummary(),
      pending: githubPending(),
      conflicts: state.syncConflicts.map(conflictView),
      log: state.syncLog.slice(0, 20)
    };
  }
  async function githubSaveConfig(body) {
    const patch = body || {};
    const prev = normalizeGithubCfg(state.githubCfg);
    const next = normalizeGithubCfg({
      owner: patch.owner != null ? patch.owner : prev.owner,
      repo: patch.repo != null ? patch.repo : prev.repo,
      branch: patch.branch != null ? patch.branch : prev.branch,
      dir: patch.dir != null ? patch.dir : prev.dir,
      apiBase: patch.apiBase != null ? patch.apiBase : prev.apiBase,
      remember: patch.remember != null ? patch.remember !== false : prev.remember,
      autoCheck: patch.autoCheck != null ? patch.autoCheck !== false : prev.autoCheck,
      autoPull: patch.autoPull != null ? !!patch.autoPull : prev.autoPull,
      device: deviceName()
    });
    next.apiBase = normalizeApiBase(next.apiBase);
    if (!next.dir || next.dir.split('/').some((part) => !part || part === '.' || part === '..')) throw apiError('同步目录不合法', 400);
    if (next.owner && /[\s/]/.test(next.owner)) throw apiError('GitHub 用户名不能包含空格或斜杠', 400);
    if (next.repo && /[\s/]/.test(next.repo)) throw apiError('仓库名不能包含空格或斜杠', 400);
    if (patch.token != null) {
      const token = String(patch.token).trim();
      if (token) {
        state.githubToken = token;
        next.remember = patch.remember != null ? patch.remember !== false : next.remember;
        await kvSet('githubToken', next.remember ? token : null);
      } else if (patch.clearToken) {
        state.githubToken = '';
        next.remember = false;
        await kvSet('githubToken', null);
      }
    } else if (patch.remember != null) {
      if (next.remember && state.githubToken) await kvSet('githubToken', state.githubToken);
      if (!next.remember) await kvSet('githubToken', null);
    }
    const identity = ['owner', 'repo', 'branch', 'dir', 'apiBase'];
    const identityChanged = !!state.githubCfg && identity.some((key) => prev[key] !== next[key]);
    if (identityChanged) {
      state.syncBase = null;
      state.syncConflicts = [];
      state.lastNotifiedHead = '';
      await Promise.all([kvSet('syncBase', null), kvSet('syncConflicts', null)]);
    }
    state.githubCfg = next;
    await kvSet('githubCfg', next);
    if (identityChanged) {
      state.githubRepoInfo = null;
      await kvSet('githubRepoInfo', null);
      state.syncStatus = { configured: githubReady(), ok: false, checkedAt: '', remoteHead: '', remoteChanged: false, error: '' };
    } else {
      state.syncStatus = Object.assign({}, state.syncStatus, { configured: githubReady() });
    }
    startGithubPolling();
    return githubConfigPayload();
  }
  async function githubTest(body) {
    const patch = body || {};
    const prev = normalizeGithubCfg(state.githubCfg);
    const cfg = normalizeGithubCfg({
      owner: patch.owner != null ? patch.owner : prev.owner,
      repo: patch.repo != null ? patch.repo : prev.repo,
      branch: patch.branch != null ? patch.branch : prev.branch,
      dir: patch.dir != null ? patch.dir : prev.dir,
      apiBase: patch.apiBase != null ? patch.apiBase : prev.apiBase
    });
    cfg.apiBase = normalizeApiBase(cfg.apiBase);
    const token = patch.token != null && String(patch.token).trim() ? String(patch.token).trim() : state.githubToken;
    if (!cfg.owner || !cfg.repo) throw apiError('先填写 GitHub 用户名和仓库名', 400);
    if (!token) throw apiError('先填写 GitHub Token', 400);
    cfg.token = token;
    const info = await GitHubApi.test(cfg);
    const ref = await GitHubApi.getRef(cfg);
    state.githubRepoInfo = {
      fullName: info.fullName,
      private: info.private,
      defaultBranch: info.defaultBranch,
      canPush: info.canPush,
      htmlUrl: info.htmlUrl,
      apiBase: cfg.apiBase,
      owner: cfg.owner,
      repo: cfg.repo,
      checkedAt: nowIso()
    };
    await kvSet('githubRepoInfo', state.githubRepoInfo);
    return {
      ok: true,
      repo: state.githubRepoInfo,
      branch: cfg.branch,
      branchExists: !!ref,
      head: ref ? ref.object.sha : ''
    };
  }
  async function githubDisconnect(body) {
    const mode = body && body.mode === 'all' ? 'all' : 'token';
    if (mode === 'all') {
      state.githubCfg = normalizeGithubCfg(null);
      state.githubToken = '';
      state.githubRepoInfo = null;
      state.syncBase = null;
      state.syncConflicts = [];
      state.syncLog = [];
      state.lastNotifiedHead = '';
      state.syncStatus = { configured: false, ok: false, checkedAt: '', remoteHead: '', remoteChanged: false, error: '' };
      await Promise.all([
        kvSet('githubCfg', null), kvSet('githubToken', null), kvSet('githubRepoInfo', null),
        kvSet('syncBase', null), kvSet('syncConflicts', null), kvSet('syncLog', null)
      ]);
    } else {
      state.githubToken = '';
      if (state.githubCfg) state.githubCfg.remember = false;
      if (state.githubCfg) await kvSet('githubCfg', state.githubCfg);
      await kvSet('githubToken', null);
      state.syncStatus = { configured: false, ok: false, checkedAt: '', remoteHead: '', remoteChanged: false, error: '' };
    }
    return githubConfigPayload();
  }

  /* ---------------- 写入文章 ---------------- */
  async function updateArticle(id, payload) {
    const rec = state.byId.get(id);
    if (!rec) throw apiError('找不到文章 ' + id, 404);
    const currentDb = dbById(rec.dbId) || dbById(DB1);
    const targetDb = dbById(payload.dbId || (currentDb && currentDb.id) || DB1);
    if (!targetDb) throw apiError('找不到目标数据库', 404);
    if (!dbEnabled(targetDb.id)) throw apiError('目标数据库已停用', 400);
    if (targetDb.editable === false) throw apiError('目标数据库是只读的', 400);

    const baseHash = String(payload.baseHash || '');
    if (!payload.force && baseHash !== rec.bodyHash) {
      return { conflict: true, current: rec };
    }

    const title = String(payload.title != null ? payload.title : rec.title).replace(/[\r\n]+/g, ' ').trim() || rec.title;
    const type = TYPES.includes(String(payload.type || '').trim()) ? String(payload.type).trim() : rec.type;
    const cats = normalizeCats(type, payload.cats != null ? payload.cats : (type === rec.type ? rec.cats : []));
    const tags = uniq(listOf(payload.tags != null ? payload.tags : rec.tags));
    const status = String(payload.status != null ? payload.status : rec.status).trim();
    if (!tags.length) throw apiError('标签至少填一个', 400);
    if (!STATUSES.includes(status)) throw apiError('状态不合法：' + status, 400);
    if (!payload.restore && ['已发布', '已归档'].includes(rec.status) && status === rec.status) {
      return { frozen: true, current: rec };
    }

    let body = String(payload.body != null ? payload.body : recordBody(rec)).replace(/\r\n/g, '\n');
    body = normalizeBody(body);
    const bare = stripTitleLine(body).trim();
    const text = MD.plainOfMarkdown(bare);
    const html = MD.mdToHtml(body, title);
    const bodyHash = await hash16(body);
    const metaHash = await hash16(metaString(cats, tags, status));
    const publish = Object.assign({ git: '未发布', siyuan: '未发布', ob: '未发布', studio: '未发布' }, rec.publish || {});
    if (rec.status === '已发布' && status === '定稿') {
      Object.keys(publish).forEach((key) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(publish[key]))) publish[key] = '有改动待发';
      });
    }

    const catsChanged = !sameList(cats, rec.cats || []);
    const dbChanged = targetDb.id !== rec.dbId;
    let dir = rec.dir || defaultDir(rec.type, rec.cats || [], targetDb);
    if (payload.dir) dir = safeRelDir(String(payload.dir)) || dir;
    else if (catsChanged || dbChanged) dir = defaultDir(type, cats, targetDb);
    const oldPath = rec.path;
    const path = dir + '/' + id + ' ' + safeName(title) + '.md';

    const before = {
      docId: rec.docId, title: rec.title, body: recordBody(rec), cats: rec.cats,
      tags: rec.tags, status: rec.status, words: rec.words,
      bodyHash: rec.bodyHash, metaHash: rec.metaHash
    };
    await saveRevision(before, '改动前', 'before');

    Object.assign(rec, {
      title,
      type,
      cats,
      tags,
      status,
      body,
      text,
      html,
      words: countWords(body),
      bodyHash,
      metaHash,
      summary: text.slice(0, 140),
      quote: quoteOf(body),
      tone: rec.tone || '其他',
      created: rec.created || today(),
      updated: today(),
      mtime: nowIso(),
      path,
      dir,
      dbId: targetDb.id,
      dbName: targetDb.name,
      dbShort: targetDb.short || '',
      dbColor: targetDb.color || CAT_COLORS[0],
      publish,
      empty: !bare
    });
    decorate(rec);
    await persistRecord(rec);
    rebuildLib();
    const revision = await saveRevision(rec, String(payload.note || '保存').slice(0, 80), payload.restore ? 'restore' : 'save');
    await recordWriting({
      kind: 'article', action: 'save',
      id: rec.docId, title: rec.title, type: rec.type,
      dbId: rec.dbId, dbName: rec.dbName,
      delta: rec.words - before.words, words: rec.words
    });
    return { record: rec, moved: path !== oldPath, backup: { file: oldPath, at: nowIso() }, revision };
  }

  async function createArticle(payload) {
    const type = String(payload.type || '').trim();
    if (!TYPES.includes(type)) throw apiError('类型必须是小说、毕设、资料或素材', 400);
    const db = dbById(String(payload.dbId || DB1));
    if (!db) throw apiError('找不到要写入的数据库', 404);
    if (!dbEnabled(db.id)) throw apiError('这个数据库已停用，启用后才能写入', 400);
    if (db.editable === false) throw apiError('这个数据库是只读的', 400);
    const title = String(payload.title || '').replace(/[\r\n]+/g, ' ').trim();
    if (!title) throw apiError('标题不能为空', 400);

    const cats = normalizeCats(type, payload.cats);
    let tags = uniq(listOf(payload.tags));
    if (!tags.length) tags = [cats[cats.length - 1] || type];
    const status = STATUSES.includes(payload.status) ? payload.status : '草稿';
    const id = nextId(type, db);

    let body = String(payload.body || '').replace(/\r\n/g, '\n').trim();
    if (!/^#\s/.test(body)) body = '# ' + title + '\n\n' + body;
    body = normalizeBody(body);
    const bare = stripTitleLine(body).trim();
    const text = MD.plainOfMarkdown(bare);
    const dir = payload.dir ? (safeRelDir(String(payload.dir)) || defaultDir(type, cats, db)) : defaultDir(type, cats, db);
    const path = dir + '/' + id + ' ' + safeName(title) + '.md';

    const rec = makeRecord({
      docId: id,
      file: id,
      title,
      type,
      cats,
      tags,
      status,
      body,
      text,
      html: MD.mdToHtml(body, title),
      words: countWords(body),
      bodyHash: await hash16(body),
      metaHash: await hash16(metaString(cats, tags, status)),
      summary: text.slice(0, 140),
      quote: quoteOf(body),
      tone: '其他',
      created: today(),
      updated: today(),
      mtime: nowIso(),
      ctime: nowIso(),
      path,
      dir,
      publish: { git: '未发布', siyuan: '未发布', ob: '未发布', studio: '未发布' },
      empty: !bare,
      dbId: db.id,
      dbName: db.name,
      dbShort: db.short || '',
      dbColor: db.color || CAT_COLORS[0]
    });
    state.records.push(rec);
    state.allIds.add(id);
    await persistRecord(rec);
    rebuildLib();
    await saveRevision(rec, '新建文章', 'create');
    await recordWriting({
      kind: 'article', action: 'create',
      id: rec.docId, title: rec.title, type: rec.type,
      dbId: rec.dbId, dbName: rec.dbName,
      delta: rec.words, words: rec.words
    });
    return rec;
  }

  /* ---------------- 同步写入 ---------------- */
  async function saveWorkspace(body) {
    const now = Date.now();
    const prev = state.workspace || {};
    const bytes = JSON.stringify(body.projects || []).length;
    state.workspace = Object.assign({}, prev, {
      app: '写作库 6.4',
      version: BUILD,
      projects: Array.isArray(body.projects) ? body.projects : prev.projects || [],
      curation: body.curation || prev.curation || {},
      settings: prev.settings || {},
      updatedAt: now,
      savedAt: new Date(now).toISOString(),
      device: body.device || '',
      initialized: true
    });
    await kvSet('workspace', state.workspace);
    return { ok: true, updatedAt: now, savedAt: state.workspace.savedAt, bytes, replacedNewer: false, device: body.device || '' };
  }

  async function saveSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch || {});
    if (patch && patch.plugins) state.settings.plugins = Object.assign({}, (state.settings.plugins || {}), patch.plugins);
    await kvSet('settings', state.settings);
    return state.settings;
  }

  function normalizePlugin(m) {
    if (!m || !m.id) throw new Error('插件清单缺少 id');
    return Object.assign({}, m, {
      id: String(m.id),
      name: m.name || m.id,
      version: m.version || '1.0.0',
      type: m.type || 'theme',
      enabled: m.enabled !== false,
      jsText: m.jsText || '',
      cssText: m.cssText || '',
      installedAt: m.installedAt || new Date().toISOString(),
      source: m.source || '浏览器',
      dir: 'data/plugins/' + m.id
    });
  }

  function draftFields(payload, title) {
    const markdown = String(payload.markdown != null ? payload.markdown : (payload.text || '')).replace(/\r\n/g, '\n');
    return {
      markdown,
      text: MD.plainOfMarkdown(markdown),
      html: MD.mdToHtml(markdown, title || '')
    };
  }

  function createDraft(payload) {
    const now = new Date().toISOString();
    const title = String(payload.title || '无题速写').replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || '无题速写';
    const body = draftFields(payload, title);
    return {
      id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title,
      markdown: body.markdown,
      text: body.text,
      html: body.html,
      tags: uniq(listOf(payload.tags)),
      sourceDocId: String(payload.sourceDocId || ''),
      sourceTitle: String(payload.sourceTitle || ''),
      createdAt: now,
      updatedAt: now,
      publishedId: ''
    };
  }

  /* ---------------- 种子加载 ---------------- */
  const ready = (async function loadSeed() {
    state.lib = window.LIB || null;
    if (state.lib) state.generatedAt = state.lib.generatedAt || state.generatedAt;
    hydrate();
    state.seedRecords = state.records.map(cloneRecord);

    const [wsSeed, settingsSeed, pluginSeed, draftsSeed, overlaySeed, dbSeed, revSeed, dailySeed, logSeed,
      ghCfgSeed, ghTokenSeed, ghRepoSeed, syncBaseSeed, conflictsSeed, syncLogSeed] = await Promise.all([
      seedJson('workspace.json', { projects: [], curation: {} }),
      seedJson('settings.json', {}),
      seedJson('plugins.json', { plugins: [] }),
      kvGet('drafts'),
      kvGet('articles'),
      kvGet('databases'),
      kvGet('revisions'),
      kvGet('daily'),
      kvGet('writeLog'),
      kvGet('githubCfg'),
      kvGet('githubToken'),
      kvGet('githubRepoInfo'),
      kvGet('syncBase'),
      kvGet('syncConflicts'),
      kvGet('syncLog')
    ]);

    const savedWs = await kvGet('workspace');
    const wsNewer = savedWs && Number(savedWs.updatedAt) >= Number(wsSeed.updatedAt || 0);
    state.workspace = wsNewer ? savedWs : wsSeed;
    if (!Array.isArray(state.workspace.projects)) state.workspace.projects = [];

    const savedSettings = await kvGet('settings');
    state.settings = Object.assign({}, settingsSeed, savedSettings || {});

    const savedPlugins = await kvGet('plugins');
    state.plugins = Array.isArray(savedPlugins) ? savedPlugins : (pluginSeed.plugins || []);

    state.drafts = Array.isArray(draftsSeed) ? draftsSeed : [];
    state.overlay = Array.isArray(overlaySeed) ? overlaySeed : [];
    state.dbFlags = dbSeed && typeof dbSeed === 'object' ? dbSeed : {};
    state.revisions = revSeed && typeof revSeed === 'object' ? revSeed : {};
    state.daily = dailySeed && typeof dailySeed === 'object' && dailySeed.days && typeof dailySeed.days === 'object'
      ? {
        version: 1,
        since: String(dailySeed.since || ''),
        updatedAt: String(dailySeed.updatedAt || ''),
        days: dailySeed.days
      }
      : { version: 1, since: '', updatedAt: '', days: {} };
    state.writeLog = Array.isArray(logSeed) ? logSeed.filter((entry) => entry && entry.at) : [];

    state.githubCfg = normalizeGithubCfg(ghCfgSeed);
    state.githubToken = typeof ghTokenSeed === 'string' ? ghTokenSeed : '';
    state.githubCfg.remember = !!(ghCfgSeed && ghCfgSeed.remember !== false && state.githubToken);
    state.githubRepoInfo = ghRepoSeed && typeof ghRepoSeed === 'object' ? ghRepoSeed : null;
    state.syncBase = syncBaseSeed && typeof syncBaseSeed === 'object' ? syncBaseSeed : null;
    state.syncConflicts = Array.isArray(conflictsSeed) ? conflictsSeed.filter((c) => c && c.key && c.kind) : [];
    state.syncLog = Array.isArray(syncLogSeed) ? syncLogSeed.filter((e) => e && e.at && e.action) : [];

    if (state.overlay.length) applyOverlay();
    rebuildLib();
    startGithubPolling();
    return true;
  })();

  /* ---------------- 路由 ---------------- */
  async function handle(path, sp, method, init) {
    await ready;

    if (path === '/api/workspace') {
      if (method === 'GET') {
        return json(Object.assign({}, state.workspace, { serverTime: new Date().toISOString() }));
      }
      if (method === 'PUT') {
        return json(await saveWorkspace(await bodyOf(init)));
      }
    }

    if (path === '/api/settings') {
      if (method === 'GET') return json(state.settings);
      if (method === 'PUT') return json(await saveSettings(await bodyOf(init)));
    }

    if (path === '/api/plugins') {
      if (method === 'GET') return json({ plugins: state.plugins });
    }
    if (path === '/api/plugins/install' && method === 'POST') {
      const body = await bodyOf(init);
      if (body.url) return notMine('从网址安装插件需要联网，P2 之后接入');
      const plugin = normalizePlugin(body.manifest || body.plugin);
      state.plugins = state.plugins.filter((p) => p.id !== plugin.id).concat(plugin);
      await kvSet('plugins', state.plugins);
      return json({ ok: true, plugin }, 201);
    }
    if (path === '/api/plugins/toggle' && method === 'POST') {
      const body = await bodyOf(init);
      const plugin = state.plugins.find((p) => p.id === body.id);
      if (!plugin) return json({ message: '找不到这个插件' }, 404);
      plugin.enabled = !!body.enabled;
      await kvSet('plugins', state.plugins);
      return json({ ok: true, plugin });
    }
    if (path === '/api/plugins/delete' && method === 'POST') {
      const body = await bodyOf(init);
      state.plugins = state.plugins.filter((p) => p.id !== body.id);
      await kvSet('plugins', state.plugins);
      return json({ ok: true, removed: body.id });
    }
    if (path === '/api/plugins/market') return notMine('插件市场要连 GitHub，P2 之后接入');

    if (path === '/api/library' || path === '/api/library.js') {
      const lib = state.lib || { version: BUILD, cats: [], stats: {}, databases: [] };
      const payload = {
        version: lib.version || BUILD,
        cats: lib.cats || [],
        stats: lib.stats || {},
        databases: lib.databases || [],
        generatedAt: state.generatedAt
      };
      if (path.endsWith('.js')) {
        return new Response('window.LIB = ' + JSON.stringify(payload) + ';', {
          headers: { 'content-type': 'application/javascript; charset=utf-8' }
        });
      }
      return json(payload);
    }

    if (path === '/api/article' && method === 'GET') {
      const rec = state.byId.get(sp.get('id'));
      if (!rec) return json({ message: '找不到这篇文章' }, 404);
      return json({ article: articleOf(rec) });
    }

    if (path === '/api/article' && method === 'PUT') {
      const result = await updateArticle(String(sp.get('id') || ''), await bodyOf(init));
      if (result.conflict) {
        return json({
          code: 'CONFLICT',
          message: '这篇文件在别处被改过。请选择载入磁盘版本，或确认后用当前编辑覆盖。',
          current: articleOf(result.current)
        }, 409);
      }
      if (result.frozen) {
        return json({
          code: 'FROZEN',
          message: '已发布或已归档的内容是冻结的。请先把状态改成「定稿」再保存。',
          current: articleOf(result.current)
        }, 409);
      }
      return json({ ok: true, article: articleOf(result.record), moved: result.moved, backup: result.backup, revision: result.revision });
    }

    if (path === '/api/article' && method === 'POST') {
      const record = await createArticle(await bodyOf(init));
      return json({ ok: true, article: articleOf(record) }, 201);
    }
    if (path === '/api/article') return notMine('这个文章操作还没有在 6.4 接通：' + method);

    if (path === '/api/search') {
      const q = String(sp.get('q') || '').trim();
      const db = sp.get('db') || 'all';
      const out = [];
      if (q) {
        const low = q.toLowerCase();
        state.byId.forEach((f) => {
          if (db !== 'all' && f.dbId !== db) return;
          const title = String(f.title || '');
          const summary = String(f.summary || '');
          const tags = (f.tags || []).join(' ');
          let rank = 0;
          if (title.toLowerCase().includes(low)) rank += 100;
          if (tags.toLowerCase().includes(low)) rank += 30;
          if (summary.toLowerCase().includes(low)) rank += 20;
          const hits = countOf(f.text, low);
          rank += Math.min(hits, 20);
          if (!rank) return;
          out.push({
            id: f.docId || f.file,
            title,
            type: f.type || '',
            group: f.catName || '',
            sub: f.subName || '',
            status: f.status || '',
            words: f.words || 0,
            empty: !!f.empty,
            snippet: snippetOf(f.text, low),
            dbId: f.dbId || '',
            dbName: f.dbName || '',
            dbColor: f.dbColor || '#8A9099',
            relationCount: f.relationCount || 0,
            rank
          });
        });
      }
      out.sort((a, b) => b.rank - a.rank);
      return json({ query: q, results: out.slice(0, 200) });
    }

    if (path === '/api/cross-search') {
      return json(crossSearch(String(sp.get('q') || '').trim(), sp.get('db') || 'all'));
    }

    if (path === '/api/databases') {
      const lib = state.lib || {};
      return json({
        generatedAt: state.generatedAt,
        total: lib.stats || {},
        dropRoot: '04-资料与收件箱/数据库',
        backupRoot: '07-备份/数据库',
        databases: (lib.databases || []).map((db) => Object.assign({}, db, {
          roots: db.roots || [],
          enabled: db.enabled !== false
        }))
      });
    }
    if (path === '/api/databases/toggle' && method === 'POST') {
      const body = await bodyOf(init);
      const db = dbById(String(body.id || ''));
      if (!db) throw apiError('找不到这个数据库', 404);
      state.dbFlags[db.id] = body.enabled !== false;
      await kvSet('databases', state.dbFlags);
      rebuildLib();
      return json({ ok: true, database: db, list: databaseList() });
    }
    if (/^\/api\/databases\//.test(path)) return notMine('数据库的加入、移出与导出会在 P3 接入');

    if (path === '/api/drafts') {
      if (method === 'GET') return json({ drafts: state.drafts });
      if (method === 'POST') {
        const draft = createDraft(await bodyOf(init));
        state.drafts.unshift(draft);
        await kvSet('drafts', state.drafts);
        const draftWords = countWords(draft.text || '');
        await recordWriting({ kind: 'draft', action: 'create', id: draft.id, title: draft.title, type: '速写', delta: draftWords, words: draftWords });
        return json({ ok: true, draft }, 201);
      }
      const id = sp.get('id');
      if (method === 'PUT') {
        const draft = state.drafts.find((d) => d.id === id);
        if (!draft) return json({ message: '找不到这份草稿' }, 404);
        const body = await bodyOf(init);
        const beforeWords = countWords(draft.text || '');
        if (body.title != null) draft.title = String(body.title).replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || draft.title;
        if (body.markdown != null || body.text != null) {
          const fields = draftFields(body, draft.title);
          draft.markdown = fields.markdown;
          draft.text = fields.text;
          draft.html = fields.html;
        }
        if (body.tags != null) draft.tags = uniq(listOf(body.tags));
        if (body.sourceDocId != null) draft.sourceDocId = String(body.sourceDocId);
        draft.updatedAt = new Date().toISOString();
        await kvSet('drafts', state.drafts);
        const afterWords = countWords(draft.text || '');
        await recordWriting({ kind: 'draft', action: 'save', id: draft.id, title: draft.title, type: '速写', delta: afterWords - beforeWords, words: afterWords });
        return json({ ok: true, draft });
      }
      if (method === 'DELETE') {
        state.drafts = state.drafts.filter((d) => d.id !== id);
        await kvSet('drafts', state.drafts);
        return json({ ok: true });
      }
    }

    if (path === '/api/drafts/publish' && method === 'POST') {
      const body = await bodyOf(init);
      const draft = state.drafts.find((d) => d.id === body.draftId);
      if (!draft) throw apiError('找不到这份草稿', 404);
      const type = TYPES.includes(body.type) ? body.type : '资料';
      const record = await createArticle({
        type,
        title: String(body.title || draft.title || '无题').trim(),
        cats: body.cats,
        tags: body.tags != null ? body.tags : draft.tags,
        status: STATUSES.includes(body.status) ? body.status : '草稿',
        body: draft.markdown || draft.text || ''
      });
      draft.publishedId = record.docId;
      draft.updatedAt = new Date().toISOString();
      await kvSet('drafts', state.drafts);
      return json({ ok: true, article: articleOf(record), draft }, 201);
    }

    if (path === '/api/revisions' && method === 'GET') {
      const id = String(sp.get('id') || '');
      return json({ id, revisions: listRevisions(id) });
    }
    if (path === '/api/revision' && method === 'GET') {
      const id = String(sp.get('id') || '');
      const revision = readRevision(id, String(sp.get('rev') || ''));
      return json({ revision: Object.assign({}, revision, { html: MD.mdToHtml(revision.body || '', revision.title || '') }) });
    }
    if (path === '/api/revision/restore' && method === 'POST') {
      const body = await bodyOf(init);
      const id = String(body.id || '');
      const revision = readRevision(id, String(body.rev || ''));
      const current = state.byId.get(id);
      if (!current) throw apiError('找不到文章 ' + id, 404);
      const result = await updateArticle(id, {
        title: revision.title,
        cats: revision.cats,
        tags: revision.tags,
        status: revision.status,
        body: revision.body,
        baseHash: current.bodyHash,
        force: true,
        restore: true,
        note: '恢复 ' + String(revision.time || '').replace('T', ' ').slice(0, 19)
      });
      return json({ ok: true, article: articleOf(result.record), revision: result.revision });
    }

    if (path === '/api/github/config') {
      if (method === 'GET') return json(await githubConfigPayload());
      if (method === 'PUT') return json(await githubSaveConfig(await bodyOf(init)));
    }
    if (path === '/api/github/test' && method === 'POST') return json(await githubTest(await bodyOf(init)));
    if (path === '/api/github/check' && method === 'POST') return json(await githubCheck());
    if (path === '/api/github/pull' && method === 'POST') return json(await githubPull(await bodyOf(init)));
    if (path === '/api/github/push' && method === 'POST') return json(await githubPush(await bodyOf(init)));
    if (path === '/api/github/resolve' && method === 'POST') return json(await githubResolve(await bodyOf(init)));
    if (path === '/api/github/disconnect' && method === 'POST') return json(await githubDisconnect(await bodyOf(init)));
    if (/^\/api\/github\//.test(path)) return notMine('还没有这个 GitHub 接口：' + path);

    if (path === '/api/git/status') {
      const info = gitInfoOf();
      return json({
        ok: info.ok,
        branch: info.branch,
        commit: info.commit,
        subject: info.subject,
        date: info.date,
        files: [],
        remote: info.remote,
        dirty: info.dirty,
        gitOk: info.ok,
        configured: info.configured,
        conflicts: info.conflicts,
        checkedAt: info.checkedAt,
        webUrl: info.webUrl
      });
    }
    if (/^\/api\/git\//.test(path)) return notMine('本机 Git 命令已停用：6.4 直接走 GitHub 同步面板');

    if (path === '/api/system') {
      const lib = state.lib || {};
      const gitInfo = gitInfoOf();
      return json({
        app: '写作库 · 6.4 同步版',
        version: BUILD,
        root: '浏览器本地数据',
        port: 0,
        branch: gitInfo.branch,
        commit: gitInfo.commit,
        subject: gitInfo.subject,
        date: new Date().toISOString().slice(0, 10),
        dirty: gitInfo.dirty,
        remote: gitInfo.remote,
        gitOk: gitInfo.ok,
        articleCount: (lib.stats && lib.stats.files) || 0,
        wordCount: (lib.stats && lib.stats.words) || 0,
        databases: lib.databases || []
      });
    }

    if (path === '/api/dashboard') return json(dashboardPayload(sp.get('days')));
    if (path === '/api/maintenance') return notMine('体检要读磁盘，P3 接入');
    if (path === '/api/obsidian/scan' || path === '/api/obsidian/import' || path === '/api/obsidian/export') {
      return notMine('Obsidian 导入导出会在 P3 接入');
    }
    if (path === '/api/export/zip' || path === '/api/databases/export') return notMine('打包导出会在 P3 接入');

    return notMine('6.4 还没有这个接口：' + path);
  }

  function databaseList() {
    const lib = state.lib || {};
    return (lib.databases || []).map((db) => Object.assign({}, db, { enabled: db.enabled !== false }));
  }

  function snippetOf(text, low) {
    const i = (text || '').toLowerCase().indexOf(low);
    if (i < 0) return (text || '').slice(0, 80);
    const start = Math.max(0, i - 34);
    return (start > 0 ? '…' : '') + text.slice(start, i + low.length + 46) + '…';
  }
  function countOf(text, low) {
    if (!text) return 0;
    const src = text.toLowerCase();
    let n = 0, i = 0;
    while ((i = src.indexOf(low, i)) !== -1) { n++; i += low.length; }
    return n;
  }

  function crossSearch(query, db) {
    const empty = { query, databases: [], topDocs: [], total: { docs: 0, occurrences: 0, words: 0, links: 0, tags: 0 }, elapsedMs: 0 };
    if (!query) return empty;
    const started = performance.now();
    const low = query.toLowerCase();
    const dbMap = new Map();
    (state.lib && state.lib.databases || []).forEach((d) => {
      dbMap.set(d.id, { id: d.id, name: d.name, color: d.color, docs: 0, occurrences: 0, words: 0, links: 0, tags: new Map() });
    });
    const docs = [];
    const tagSet = new Set();
    state.byId.forEach((f) => {
      if (db !== 'all' && f.dbId !== db) return;
      const hits = countOf(f.text, low) + countOf(f.title, low) * 2 + countOf((f.tags || []).join(' '), low);
      if (!hits) return;
      const agg = dbMap.get(f.dbId) || { id: f.dbId, name: f.dbName, color: f.dbColor, docs: 0, occurrences: 0, words: 0, links: 0, tags: new Map() };
      agg.docs++;
      agg.occurrences += hits;
      agg.words += f.words || 0;
      agg.links += f.relationCount || 0;
      (f.tags || []).forEach((t) => { if (String(t).toLowerCase().includes(low)) agg.tags.set(t, (agg.tags.get(t) || 0) + 1); });
      dbMap.set(f.dbId, agg);
      (f.tags || []).forEach((t) => { if (String(t).toLowerCase().includes(low)) tagSet.add(t); });
      docs.push({
        id: f.docId || f.file, title: f.title, catName: f.catName, subName: f.subName,
        words: f.words || 0, dbName: f.dbName, dbColor: f.dbColor,
        relationCount: f.relationCount || 0, hits
      });
    });
    docs.sort((a, b) => b.hits - a.hits);
    const databases = Array.from(dbMap.values()).map((d) => Object.assign({}, d, {
      topTags: Array.from(d.tags.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8)
    })).map((d) => { delete d.tags; return d; });
    const total = {
      docs: docs.length,
      occurrences: databases.reduce((a, d) => a + d.occurrences, 0),
      words: docs.reduce((a, d) => a + d.words, 0),
      links: docs.reduce((a, d) => a + (d.relationCount || 0), 0),
      tags: tagSet.size
    };
    return { query, databases, topDocs: docs.slice(0, 12), total, elapsedMs: Math.round(performance.now() - started) };
  }

  async function bodyOf(init) {
    if (!init || init.body == null) return {};
    if (typeof init.body !== 'string') return {};
    try { return JSON.parse(init.body); } catch (e) { return {}; }
  }

  /* ---------------- fetch 拦截 ---------------- */
  function apiPathOf(pathname) {
    const i = pathname.lastIndexOf('/api/');
    return i < 0 ? '' : pathname.slice(i);
  }

  window.fetch = function (input, init) {
    let url = null;
    try {
      if (typeof input === 'string') url = new URL(input, document.baseURI);
      else if (input && input.url) url = new URL(input.url, document.baseURI);
    } catch (e) { url = null; }
    const api = url ? apiPathOf(url.pathname) : '';
    if (!api) return nativeFetch(input, init);
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    return handle(api, url.searchParams, method, init).catch((error) => {
      if (error && error.status) return json({ message: error.message, code: error.code || '' }, error.status);
      console.error(error);
      return json({ message: error.message || String(error) }, 500);
    });
  };

  window.WB64 = {
    BUILD,
    ready,
    state,
    reset() { return storageReset(); },
    github: {
      config: githubConfigPayload,
      save: githubSaveConfig,
      test: githubTest,
      check: githubCheck,
      pull: githubPull,
      push: githubPush,
      resolve: githubResolve,
      disconnect: githubDisconnect,
      pending: githubPending,
      snapshot: buildSyncSnapshot
    }
  };

  async function storageReset() {
    await kvSet('workspace', null);
    await kvSet('plugins', null);
    await kvSet('drafts', null);
    await kvSet('settings', null);
    await kvSet('articles', null);
    await kvSet('databases', null);
    await kvSet('revisions', null);
    await kvSet('daily', null);
    await kvSet('writeLog', null);
    await kvSet('githubCfg', null);
    await kvSet('githubToken', null);
    await kvSet('githubRepoInfo', null);
    await kvSet('syncBase', null);
    await kvSet('syncConflicts', null);
    await kvSet('syncLog', null);
    return true;
  }

  window.WB64._internals = {
    updateArticle, createArticle, articleOf, rebuildLib, defaultDir, normalizeCats,
    githubPending, githubPull, githubPush, githubCheck, githubResolve, githubInfo: gitInfoOf
  };
})();
