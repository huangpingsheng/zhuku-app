/* ============================================================
   store.js · 本地存储 / 文库索引 / 作品数据
   ============================================================ */
(function () {
  'use strict';
  const U = window.U;
  const LS_KEY = 'ws.';
  const PREF_KEY = 'ws.prefs';
  const PROJ_DB = 'WritingStudioDB';
  const PROJ_KEY = 'projects';
  const SEED_KEY = 'ws.seeded';

  const DEFAULT_PREFS = {
    theme: 'auto',
    readerSize: 18,
    lastMode: 'lib',
    wView: 'outline',
    panels: { left: true, right: true },
    readerLine: 2.0
  };

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(LS_KEY + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(LS_KEY + key, JSON.stringify(val)); } catch (e) {
      U.toast('本机存储空间不足，请先导出备份', 'alert');
    }
  }

  function touchWorkspace() {
    if (window.WorkspaceSync) window.WorkspaceSync.schedule();
  }

  const Prefs = {
    data: Object.assign({}, DEFAULT_PREFS),
    load() {
      const saved = lsGet('prefs', null);
      this.data = Object.assign({}, DEFAULT_PREFS, saved || {});
      this.data.panels = Object.assign({}, DEFAULT_PREFS.panels, (saved && saved.panels) || {});
      return this.data;
    },
    get(k) { return this.data[k]; },
    set(k, v) {
      this.data[k] = v;
      lsSet('prefs', this.data);
    },
    patch(obj) { Object.assign(this.data, obj); lsSet('prefs', this.data); }
  };

  /* ---------- 文库索引 ---------- */
  const CAT_COLORS = ['#C05B4D', '#6B7FD7', '#B06A9E', '#4E8F7C', '#C08A3E', '#5C8DB8', '#8A7B5A', '#9A6BC0', '#C07A5A', '#5F9E62', '#A85B5B', '#7B8794'];
  const TONE_COLORS = {
    '冷静': '#5C7C9E', '平静': '#5F9E80', '痛苦': '#A85B5B', '虚无': '#7B7F94',
    '戏谑': '#C08A3E', '迷幻': '#9A6BC0', '焦虑': '#C0703E', '温柔': '#C77F9E',
    '愤怒': '#B84A3E', '温暖': '#C9A24E', '其他': '#8A9099'
  };

  const LibData = {
    cats: [],
    files: [],
    byFile: {},
    byTitle: {},
    stats: {},
    databases: [],
    dbFilter: 'all',
    tones: [],
    entities: [],
    version: '',
    ready: false,
    init(rawArg) {
      if (this.ready && !rawArg) return;
      const raw = rawArg || window.LIB;
      if (!raw) { console.warn('library data missing'); return; }
      this.version = raw.version || this.version || '';
      const dbMeta = Array.isArray(raw.databases) ? raw.databases : [];
      const fallbackDbId = (dbMeta[0] && dbMeta[0].id) || 'zhuku';
      const files = [];
      const byFile = {}, byTitle = {};
      let words = 0, empty = 0, subCount = 0;
      raw.cats.forEach((c, ci) => {
        c.color = c.color || CAT_COLORS[ci % CAT_COLORS.length];
        c.subs.forEach((s) => {
          subCount++;
          s.files.forEach((f) => {
            const rec = Object.assign({}, f, {
              id: f.docId || f.file,
              docId: f.docId || f.file,
              catId: c.id, catName: c.name, catColor: c.color,
              subId: s.id, subName: s.name,
              dbId: f.dbId || c.dbId || fallbackDbId,
              dbName: f.dbName || c.dbName || '写作库主库',
              dbColor: f.dbColor || c.dbColor || CAT_COLORS[0],
              tone: f.tone || '其他',
              text: f.text || '',
              html: f.html || '',
              words: Number(f.words) || 0
            });
            files.push(rec);
            byFile[rec.id] = rec;
            byFile[c.id + '/' + s.id + '/' + f.file] = rec;
            if (!byTitle[f.title]) byTitle[f.title] = [];
            byTitle[f.title].push(rec);
            words += rec.words;
            if (!rec.words || !rec.text.trim()) empty++;
          });
        });
      });
      this.cats = raw.cats;
      this.files = files;
      this.byFile = byFile;
      this.byTitle = byTitle;
      this.stats = {
        files: files.length, words: words, cats: raw.cats.length,
        subs: subCount, empty: empty
      };
      Object.assign(this.stats, raw.stats || {});

      const self = this;
      const makeStats = (list, cats) => {
        const tagSet = new Set();
        let links = 0, linked = 0, emptyCount = 0, sum = 0;
        list.forEach((f) => {
          sum += f.words;
          if (!f.words) emptyCount++;
          links += f.relationCount || 0;
          if (f.relationCount) linked++;
          (f.tags || []).forEach((t) => tagSet.add(t));
        });
        return {
          files: list.length, words: sum, cats: cats.length,
          subs: cats.reduce((n, c) => n + c.subs.length, 0),
          empty: emptyCount, links, linked, tags: tagSet.size
        };
      };
      this.databases = dbMeta.length ? dbMeta.map((db) => {
        const dbCats = raw.cats.filter((c) => (c.dbId || fallbackDbId) === db.id);
        const docs = files.filter((f) => f.dbId === db.id);
        return Object.assign({}, db, {
          cats: dbCats,
          stats: Object.assign(makeStats(docs, dbCats), db.stats || {})
        });
      }) : [{
        id: fallbackDbId, name: '写作库主库', short: '主库', kind: 'builtin',
        color: CAT_COLORS[0], icon: 'book', description: '写作库自带的文章库',
        enabled: true, removable: false, editable: true, roots: [],
        cats: raw.cats, stats: makeStats(files, raw.cats)
      }];
      this.dbFilter = this.validDbId(lsGet('dbfilter', 'all'));

      const insight = this.insights(files);
      this.tones = insight.tones;
      this.entities = insight.entities;
      this.ready = true;
    },
    rebuild(raw) {
      this.ready = false;
      this.cats = [];
      this.files = [];
      this.byFile = {};
      this.byTitle = {};
      this.databases = [];
      this.init(raw || window.LIB);
      return this;
    },
    insights(list) {
      const toneMap = new Map();
      const entMap = new Map();
      (list || this.files).forEach((f) => {
        toneMap.set(f.tone, (toneMap.get(f.tone) || 0) + 1);
        (f.entities || []).forEach((e) => entMap.set(e, (entMap.get(e) || 0) + 1));
        (f.characters || []).forEach((e) => entMap.set(e, (entMap.get(e) || 0) + 1));
      });
      const tones = Array.from(toneMap.entries())
        .map(([name, count]) => ({ name, count, color: TONE_COLORS[name] || '#8A9099' }))
        .sort((a, b) => b.count - a.count);
      const entities = Array.from(entMap.entries())
        .map(([name, count]) => ({ name, count }))
        .filter((e) => e.count >= 4)
        .sort((a, b) => b.count - a.count)
        .slice(0, 40);
      return { tones, entities };
    },
    validDbId(id) {
      if (!id || id === 'all') return 'all';
      return this.databases.some((db) => db.id === id) ? id : 'all';
    },
    setDbFilter(id) {
      this.dbFilter = this.validDbId(id);
      lsSet('dbfilter', this.dbFilter);
      return this.dbFilter;
    },
    db(id) { return this.databases.find((d) => d.id === id) || null; },
    activeDb() { return this.dbFilter === 'all' ? null : this.db(this.dbFilter); },
    inDb(item) {
      if (!item || this.dbFilter === 'all') return true;
      return item.dbId === this.dbFilter;
    },
    visibleCats() { return this.cats.filter((c) => this.inDb(c)); },
    visibleFiles() { return this.files.filter((f) => this.inDb(f)); },
    dbStats() {
      const db = this.activeDb();
      return db ? db.stats : this.stats;
    },
    applyArticle(article) {
      const rec = article && this.byFile[article.id];
      if (!rec) return null;
      Object.assign(rec, {
        title: article.title,
        words: article.words,
        text: article.text || rec.text,
        html: article.html || rec.html,
        summary: article.excerpt || rec.summary,
        tags: article.tags || rec.tags,
        status: article.status,
        updated: article.updated,
        path: article.path,
        dir: article.dir,
        bodyHash: article.bodyHash,
        dbId: article.dbId || rec.dbId,
        dbName: article.dbName || rec.dbName,
        dbColor: article.dbColor || rec.dbColor,
        tone: article.tone || rec.tone
      });
      return rec;
    },
    fileList() { return this.ready ? this.files : []; },
    get(id) { return this.byFile[id]; },
    byTitleList(title) { return this.byTitle[title] || []; },
    cat(id) { return this.cats.find((c) => c.id === id); },
    sub(catId, subId) {
      const c = this.cat(catId);
      return c ? c.subs.find((s) => s.id === subId) : null;
    },
    neighbors(rec) {
      const list = this.files, i = list.indexOf(rec);
      return { prev: i > 0 ? list[i - 1] : null, next: i < list.length - 1 ? list[i + 1] : null };
    },
    toneColor(name) { return TONE_COLORS[name] || '#8A9099'; }
  };

  /* ---------- 整理数据（编辑/笔记/收藏/已读/最近） ---------- */
  const Curation = {
    edits: lsGet('edits', {}),
    notes: lsGet('notes', {}),
    stars: lsGet('stars', {}),
    reads: lsGet('reads', {}),
    recent: lsGet('recent', []),
    saveEdits: U.debounce(function () { lsSet('edits', Curation.edits); touchWorkspace(); }, 400),
    saveNotes: U.debounce(function () { lsSet('notes', Curation.notes); touchWorkspace(); }, 400),
    saveStars: U.debounce(function () { lsSet('stars', Curation.stars); touchWorkspace(); }, 200),
    saveReads: U.debounce(function () { lsSet('reads', Curation.reads); touchWorkspace(); }, 200),
    saveRecent: U.debounce(function () { lsSet('recent', Curation.recent); touchWorkspace(); }, 200),

    isStarred(id) { return !!this.stars[id]; },
    toggleStar(id) {
      if (this.stars[id]) delete this.stars[id]; else this.stars[id] = 1;
      this.saveStars();
      return !!this.stars[id];
    },
    isRead(id) { return !!this.reads[id]; },
    setRead(id, on) {
      if (on) this.reads[id] = 1; else delete this.reads[id];
      this.saveReads();
    },
    note(id) { return this.notes[id] || ''; },
    setNote(id, text) {
      if (text && text.trim()) this.notes[id] = text; else delete this.notes[id];
      this.saveNotes();
    },
    hasNote(id) { return !!(this.notes[id] && this.notes[id].trim()); },
    edit(id) { return this.edits[id] || ''; },
    hasEdit(id) { return !!(this.edits[id] && this.edits[id].trim()); },
    setEdit(id, html) {
      if (html) this.edits[id] = html; else delete this.edits[id];
      this.saveEdits();
    },
    textOf(rec) {
      const e = this.edits[rec.id];
      return (e && U.htmlToText(e)) || rec.text || '';
    },
    htmlOf(rec) {
      const e = this.edits[rec.id];
      if (e && e.trim()) return e;
      return rec.html || U.textToHtml(rec.text || '');
    },
    addRecent(id) {
      this.recent = [id].concat(this.recent.filter((x) => x !== id)).slice(0, 10);
      this.saveRecent();
    },
    exportAll() {
      return { edits: this.edits, notes: this.notes, stars: this.stars, reads: this.reads, recent: this.recent };
    },
    importAll(obj, mode) {
      if (!obj) return;
      ['edits', 'notes', 'stars', 'reads'].forEach((k) => {
        if (!obj[k]) return;
        if (mode === 'replace') this[k] = obj[k];
        else Object.assign(this[k], obj[k]);
      });
      if (Array.isArray(obj.recent)) {
        if (mode === 'replace') this.recent = obj.recent.slice(0, 10);
        else this.recent = obj.recent.concat(this.recent.filter((x) => obj.recent.indexOf(x) < 0)).slice(0, 10);
      }
      this.saveEdits(); this.saveNotes(); this.saveStars(); this.saveReads(); this.saveRecent();
    },
    clear() {
      this.edits = {}; this.notes = {}; this.stars = {}; this.reads = {}; this.recent = [];
      this.saveEdits(); this.saveNotes(); this.saveStars(); this.saveReads(); this.saveRecent();
    }
  };

  /* ---------- 作品库（IndexedDB，失败时回退 localStorage） ---------- */
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('no idb'));
      const req = indexedDB.open(PROJ_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function idbGet(key) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })).catch(() => lsGet('projects', null));
  }
  function idbSet(key, val) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    })).catch(() => { lsSet('projects', val); return true; });
  }

  /* ---------- 作品模型 ---------- */
  const NODE_TYPES = {
    vol: { label: '卷', color: '#2E4BFF', icon: 'book' },
    ch: { label: '章', color: '#4E8F7C', icon: 'file' },
    scene: { label: '场景', color: '#C08A3E', icon: 'scene' },
    note: { label: '备注', color: '#9A6BC0', icon: 'note' }
  };
  const NODE_COLORS = ['#2E4BFF', '#4E8F7C', '#C08A3E', '#9A6BC0', '#C05B4D', '#5C8DB8', '#B06A9E', '#7B8794'];

  function blankNode(type, title, x, y) {
    const t = type || 'ch';
    return {
      id: U.uid('n'),
      type: t,
      title: title || ({ vol: '新卷', ch: '新章节', scene: '新场景', note: '备注' }[t]),
      body: '',
      parents: [],
      color: NODE_COLORS[['vol', 'ch', 'scene', 'note'].indexOf(t) % NODE_COLORS.length],
      line: 'main',
      time: '',
      order: Date.now(),
      x: x || 0,
      y: y || 0
    };
  }

  function blankProject(name, demo) {
    const p = {
      id: U.uid('p'),
      name: name || '未命名作品',
      desc: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: [],
      chars: [],
      places: [],
      items: [],
      ideas: [],
      goal: { daily: 1500 },
      daily: {},
      panels: [],
      view: 'outline'
    };
    if (demo) {
      const vol = blankNode('vol', '第一卷 · 起笔', 120, 120);
      const ch1 = blankNode('ch', '第一章 开场', 430, 30);
      const ch2 = blankNode('ch', '第二章 回响', 430, 210);
      const sc = blankNode('scene', '场景 · 雨夜的车站', 740, 30);
      ch1.parents = [vol.id];
      ch2.parents = [vol.id];
      sc.parents = [ch1.id];
      ch1.time = '故事第 1 天 · 傍晚';
      ch2.time = '故事第 3 天 · 清晨';
      ch1.body = U.textToHtml('雨在傍晚落下来的时候，城市像被人轻轻合上了一本书。\n\n他站在站台尽头，看着电子屏上的时间跳过一次又一次。那趟车从来没有准时来过，而他似乎也并不着急。\n\n口袋里那张折了四次的纸，边角已经起毛。上面只有一句话——是他自己写的，却已经想不起写给谁。');
      ch2.body = U.textToHtml('清晨的光从窗帘缝隙里挤进来，落在桌面上那道旧划痕上。\n\n她第一次注意到，那条划痕的形状，和昨天梦里出现的地图一模一样。');
      p.nodes = [vol, ch1, ch2, sc];
      p.chars = [
        { id: U.uid('c'), name: '林见', role: '主角', desc: '在城市里替人修补旧书，记得所有纸张的气味，却记不清自己的来处。', tags: ['沉默', '旧物'], emoji: '林' },
        { id: U.uid('c'), name: '阿澈', role: '友人', desc: '在车站工作，总能提前知道哪一班车会晚点。', tags: ['温和', '守夜'], emoji: '澈' }
      ];
      p.places = [{ id: U.uid('pl'), name: '雾港车站', role: '起点', desc: '城市西边的旧车站，夜里只剩一盏灯。', tags: ['雨', '钟声'], emoji: '站' }];
      p.items = [{ id: U.uid('it'), name: '折过四次的纸', role: '线索', desc: '边角起毛的纸片，上面只有一句话。', tags: ['记忆'], emoji: '纸' }];
      p.ideas = [
        { id: U.uid('i'), text: '车站的钟比城市慢四分钟，正好是一场梦的长度。', createdAt: Date.now() - 3600e3 },
        { id: U.uid('i'), text: '旧书里夹着一张不属于这本书的借书卡。', createdAt: Date.now() - 7200e3 }
      ];
      p.daily[U.todayKey()] = 268;
    }
    return p;
  }

  const Store = {
    projects: [],
    seeded: false,
    _saveTimer: null,
    async load() {
      let list = await idbGet(PROJ_KEY);
      if (!Array.isArray(list)) list = [];
      list = list.map((p) => this.migrate(p));
      this.projects = list;
      await idbSet(PROJ_KEY, list);
      return list;
    },
    migrate(p) {
      p.nodes = (p.nodes || []).map((n) => {
        n.parents = n.parents || ((n.parentId && n.parentId !== n.id) ? [n.parentId] : []);
        n.parents = n.parents.filter((id) => id !== n.id);
        n.type = n.type || 'ch';
        n.body = n.body || '';
        n.color = n.color || NODE_COLORS[0];
        n.line = n.line || 'main';
        n.x = Number(n.x) || 0;
        n.y = Number(n.y) || 0;
        n.order = Number(n.order) || Date.now();
        return n;
      });
      const ids = new Set(p.nodes.map((n) => n.id));
      p.nodes.forEach((n) => { n.parents = n.parents.filter((id) => ids.has(id)); });
      p.ideas = p.ideas || []; p.chars = p.chars || []; p.places = p.places || []; p.items = p.items || [];
      p.goal = p.goal || { daily: 1500 }; p.daily = p.daily || {}; p.panels = (p.panels || []).filter((id) => ids.has(id));
      return p;
    },
    save() {
      const snapshot = JSON.parse(JSON.stringify(this.projects));
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => { idbSet(PROJ_KEY, snapshot); }, 180);
      touchWorkspace();
    },
    flush() {
      const snapshot = JSON.parse(JSON.stringify(this.projects));
      clearTimeout(this._saveTimer);
      touchWorkspace();
      return idbSet(PROJ_KEY, snapshot);
    },
    get(id) { return this.projects.find((p) => p.id === id); },
    add(project) {
      this.projects.unshift(project);
      this.save();
      return project;
    },
    remove(id) {
      this.projects = this.projects.filter((p) => p.id !== id);
      this.save();
    },
    countWords(p) {
      return (p.nodes || []).reduce((sum, n) => sum + U.countWords(n.body || ''), 0);
    },
    nodeWords(n) { return U.countWords((n && n.body) || ''); },
    treeWords(p, n, seen) {
      if (!n) return 0;
      if (n.type !== 'vol') return this.nodeWords(n);
      seen = seen || new Set([n.id]);
      let total = this.nodeWords(n);
      ((p && p.nodes) || []).forEach((c) => {
        if (seen.has(c.id) || (c.parents || []).indexOf(n.id) < 0) return;
        seen.add(c.id);
        total += this.treeWords(p, c, seen);
      });
      return total;
    },
    addWords(p, delta) {
      if (!p || !delta) return;
      const key = U.todayKey();
      p.daily[key] = (p.daily[key] || 0) + delta;
      if (p.daily[key] < 0) p.daily[key] = 0;
    },
    sortedChapters(p) {
      return (p.nodes || []).filter((n) => n.type === 'ch' || n.type === 'scene').slice().sort((a, b) => a.order - b.order);
    },
    exportAll() {
      return {
        app: 'writing-studio', version: 3,
        exportedAt: new Date().toISOString(),
        projects: JSON.parse(JSON.stringify(this.projects)),
        curation: Curation.exportAll()
      };
    },
    importAll(data, mode) {
      if (!data || !Array.isArray(data.projects)) throw new Error('文件格式不正确');
      if (mode === 'replace') {
        this.projects = data.projects.map((p) => this.migrate(p));
      } else {
        data.projects.forEach((incoming) => {
          const p = this.migrate(incoming);
          const i = this.projects.findIndex((x) => x.id === p.id);
          if (i > -1) this.projects[i] = p; else this.projects.unshift(p);
        });
      }
      if (data.curation) Curation.importAll(data.curation, mode);
      this.save();
    }
  };

  window.Store = Store;
  window.Prefs = Prefs;
  window.Curation = Curation;
  window.LibData = LibData;
  window.CAT_COLORS = CAT_COLORS;
  window.TONE_COLORS = TONE_COLORS;
  window.NODE_TYPES = NODE_TYPES;
  window.NODE_COLORS = NODE_COLORS;
  window.blankNode = blankNode;
  window.blankProject = blankProject;
  window.lsGet = lsGet;
  window.lsSet = lsSet;
})();
