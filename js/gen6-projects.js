/* ============================================================
   gen6-projects.js · 把文库灌进写作台导图 / 双向同步
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, S = window.Store, D = window.LibData;
  const REMOVED_KEY = 'ws6.removedLibProjects';
  const LAYOUT_VERSION = 2;
  const NODE_W = 240;

  function removedKeys() {
    const list = window.lsGet('6.removedLibProjects', []);
    return new Set(Array.isArray(list) ? list : []);
  }
  function saveRemoved(set) {
    window.lsSet('6.removedLibProjects', Array.from(set));
  }

  function projectKeyFor(rec) {
    if (!rec) return '';
    if (rec.type === '小说') return 'novel:' + rec.catId;
    return 'type:' + rec.type;
  }

  function projectSpecs() {
    const specs = [];
    D.cats.forEach((cat) => {
      if (cat.type === '小说') {
        specs.push({
          key: 'novel:' + cat.id,
          name: cat.name,
          kind: 'novel',
          type: '小说',
          catIds: [cat.id],
          desc: cat.desc || '小说作品'
        });
      }
    });
    ['资料', '素材', '毕设'].forEach((type) => {
      const cats = D.cats.filter((c) => c.type === type);
      if (!cats.length) return;
      const name = type === '资料' ? '资料 · 全景'
        : type === '素材' ? '素材 · 诗意与碎片'
        : '毕设 · 潮汐邮局';
      specs.push({
        key: 'type:' + type,
        name,
        kind: type === '资料' ? 'archive' : type === '素材' ? 'material' : 'thesis',
        type,
        catIds: cats.map((c) => c.id),
        desc: cats.map((c) => c.name).join(' · ')
      });
    });
    return specs;
  }

  function volId(prefix, id) { return 'nv-' + prefix + '-' + id; }
  function docNodeId(docId) { return 'nd-' + docId; }

  function newLibProject(spec) {
    const p = window.blankProject(spec.name);
    p.id = 'p6-' + spec.key.replace(/[^a-z0-9\u4e00-\u9fa5-]/gi, '-');
    p.libKey = spec.key;
    p.libKind = spec.kind;
    p.libType = spec.type;
    p.libCats = spec.catIds.slice();
    p.desc = spec.desc;
    p.nodes = [];
    p.chars = [];
    p.places = [];
    p.items = [];
    p.ideas = [];
    p.panels = [];
    p.createdAt = p.updatedAt = Date.now();
    return p;
  }

  function makeVol(id, title, parentId, order, color) {
    const n = window.blankNode('vol', title, 0, 0);
    n.id = id;
    n.parents = parentId ? [parentId] : [];
    n.order = order;
    n.line = 'main';
    n.color = color || '#2E4BFF';
    return n;
  }

  function makeDocNode(rec, parentId, order) {
    const n = window.blankNode('ch', rec.title, 0, 0);
    n.id = docNodeId(rec.id);
    n.parents = parentId ? [parentId] : [];
    n.docId = rec.id;
    n.docHash = rec.bodyHash || '';
    n.body = rec.html || U.textToHtml(rec.text || '');
    n.order = order;
    n.time = rec.created || '';
    n.color = '#4E8F7C';
    return n;
  }

  function expectedArticle(rec) {
    const specKey = projectKeyFor(rec);
    let catChain = [];
    if (rec.type === '小说') {
      const cat = D.cat(rec.catId);
      const sub = cat && cat.subs.find((s) => s.id === rec.subId);
      catChain = [
        { id: volId('s', rec.subId), title: (sub && sub.name) || rec.subName || '未分卷' }
      ];
    } else {
      const cat = D.cat(rec.catId);
      const sub = cat && cat.subs.find((s) => s.id === rec.subId);
      catChain = [
        { id: volId('c', rec.catId), title: rec.catName || '未分类' },
        { id: volId('s', rec.subId), title: (sub && sub.name) || rec.subName || '未分类' }
      ];
    }
    return { specKey, catChain };
  }

  function orderIndex() {
    const map = new Map();
    let i = 0;
    D.cats.forEach((cat) => {
      cat.subs.forEach((sub) => {
        sub.files.forEach((f) => {
          const rec = D.get(cat.id + '/' + sub.id + '/' + f.file);
          if (rec) map.set(rec.id, ++i);
        });
      });
    });
    return map;
  }

  function nodeIsOpen(n) {
    if (window.__gen6Editing === n.docId) return true;
    if (window.Editor && window.Editor.isEditing) {
      try { if (window.Editor.isEditing(n.id)) return true; } catch (e) { /* noop */ }
    }
    return !!document.querySelector('[data-edbody="' + n.id + '"]');
  }

  function allDocNodes() {
    const map = new Map();
    S.projects.forEach((p) => {
      (p.nodes || []).forEach((n) => {
        if (!n.docId) return;
        if (!map.has(n.docId)) map.set(n.docId, []);
        map.get(n.docId).push({ project: p, node: n });
      });
    });
    return map;
  }

  function ensureVolumes(p, chain) {
    let parentId = null;
    const created = [];
    chain.forEach((v, i) => {
      let node = (p.nodes || []).find((n) => n.id === v.id);
      if (!node) {
        node = makeVol(v.id, v.title, parentId, i + 1, i === 0 && chain.length > 1 ? '#5C8DB8' : '#2E4BFF');
        p.nodes.push(node);
        created.push(node);
      } else {
        node.title = v.title;
        const want = parentId ? [parentId] : [];
        if (JSON.stringify(node.parents || []) !== JSON.stringify(want)) node.parents = want;
      }
      parentId = node.id;
    });
    return { parentId, created };
  }

  function placeNode(p, node, parentId) {
    const parent = parentId ? p.nodes.find((x) => x.id === parentId) : null;
    if (parent) {
      const siblings = p.nodes.filter((x) => x !== node && x.id !== node.id && (x.parents || []).includes(parentId));
      node.x = (parent.x || 0) + 320;
      node.y = siblings.length ? Math.max.apply(null, siblings.map((s) => s.y || 0)) + 110 : (parent.y || 0);
      return;
    }
    let bottom = 0;
    p.nodes.forEach((x) => { if (x !== node) bottom = Math.max(bottom, x.y || 0); });
    node.x = 80;
    node.y = bottom + 126;
  }

  function addToProject(rec, hit, orders) {
    const expected = expectedArticle(rec);
    const p = hit.project;
    if (!p || !Array.isArray(p.nodes)) return { p, node: null, created: false };
    const vols = ensureVolumes(p, expected.catChain);
    const parentId = vols.parentId;
    if (p.libLayout) vols.created.forEach((v) => placeNode(p, v, (v.parents || [])[0] || null));
    let node = hit.node;
    if (!node) {
      node = makeDocNode(rec, parentId, orders.get(rec.id) || Date.now());
      p.nodes.push(node);
      if (p.libLayout) placeNode(p, node, parentId);
      return { p, node, created: true };
    }
    node.parents = parentId ? [parentId] : [];
    let updated = false;
    if (!nodeIsOpen(node)) {
      const nextBody = rec.html || U.textToHtml(rec.text || '');
      if (node.title !== rec.title || node.body !== nextBody || (rec.bodyHash && node.docHash !== rec.bodyHash)) {
        node.title = rec.title;
        node.body = nextBody;
        node.docHash = rec.bodyHash || node.docHash;
        node.time = rec.created || node.time;
        node.order = orders.get(rec.id) || node.order;
        updated = true;
      }
    }
    return { p, node, created: false, updated };
  }

  function tidyLayout(p) {
    if (!p || !p.nodes.length) return;
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const children = new Map();
    p.nodes.forEach((n) => {
      const parents = (n.parents || []).filter((id) => byId.has(id));
      if (!parents.length) {
        if (!children.has('__root')) children.set('__root', []);
        children.get('__root').push(n);
      } else {
        parents.forEach((pid) => {
          if (!children.has(pid)) children.set(pid, []);
          if (!children.get(pid).some((x) => x.id === n.id)) children.get(pid).push(n);
        });
      }
    });
    const sort = (list) => list.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title, 'zh'));
    children.forEach((list, k) => children.set(k, sort(list)));

    const seen = new Set();
    let cursor = 0;
    const rowH = p.nodes.length > 160 ? 100 : p.nodes.length > 80 ? 108 : 126;
    function walk(n, depth) {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      const kids = (children.get(n.id) || []).filter((k) => !seen.has(k.id));
      n.x = 80 + depth * 300;
      if (!kids.length) {
        n.y = 80 + cursor * rowH;
        cursor += 1;
        return;
      }
      const start = cursor;
      kids.forEach((k) => walk(k, depth + 1));
      n.y = 80 + ((start + Math.max(start, cursor - 1)) / 2) * rowH;
    }
    (children.get('__root') || []).forEach((n) => walk(n, 0));
    p.nodes.forEach((n) => { if (!seen.has(n.id)) { n.x = 80; n.y = 80 + cursor * rowH; cursor += 1; } });
    p.libLayout = LAYOUT_VERSION;
    p.updatedAt = Date.now();
  }

  function ensureProject(spec, removed) {
    let p = S.projects.find((x) => x.libKey === spec.key);
    if (p) return p;
    if (removed.has(spec.key)) return null;
    p = newLibProject(spec);
    S.projects.push(p);
    return p;
  }

  let syncing = null;

  function syncAll(options) {
    const opts = options || {};
    D.init();
    if (!D.ready) return Promise.resolve({ ok: false });
    if (syncing) return syncing;
    syncing = Promise.resolve().then(() => {
      const removed = removedKeys();
      const specs = projectSpecs();
      const specByKey = new Map(specs.map((s) => [s.key, s]));
      let changed = false;

      specs.forEach((spec) => {
        const p = ensureProject(spec, removed);
        if (!p) return;
        if (p.name !== spec.name) { p.name = spec.name; changed = true; }
        if ((p.libCats || []).join('|') !== spec.catIds.join('|')) {
          p.libCats = spec.catIds.slice();
          changed = true;
        }
        p.libKind = spec.kind;
        p.libType = spec.type;
        if (!p.libLayout) changed = true;
      });

      const orders = orderIndex();
      const existing = allDocNodes();

      D.files.forEach((rec) => {
        const expected = expectedArticle(rec);
        const spec = specByKey.get(expected.specKey);
        if (!spec) return;
        const removedHit = removed.has(spec.key);
        const hits = existing.get(rec.id) || [];
        hits.forEach((h) => {
          if (h.project.libKey && h.project.libKey !== spec.key) {
            h.project.nodes = h.project.nodes.filter((x) => x.id !== h.node.id);
            changed = true;
          }
        });
        const mirror = hits.find((h) => h.project.libKey === spec.key && (h.project.nodes || []).some((x) => x.id === h.node.id));
        const manual = hits.find((h) => !h.project.libKey);
        let hit = mirror || manual;
        if (hit && !hit.project.libKey) {
          const n = hit.node;
          if (!nodeIsOpen(n)) {
            const nextBody = rec.html || U.textToHtml(rec.text || '');
            if (n.title !== rec.title || n.body !== nextBody || (rec.bodyHash && n.docHash !== rec.bodyHash)) {
              n.title = rec.title;
              n.body = nextBody;
              n.docHash = rec.bodyHash || n.docHash;
              changed = true;
            }
          }
          return;
        }
        if (!hit) {
          if (removedHit) return;
          const p = S.projects.find((x) => x.libKey === spec.key);
          if (!p) return;
          hit = { project: p, node: null };
        }
        const result = addToProject(rec, hit, orders);
        if (result.created || result.updated) changed = true;
      });

      const liveDocs = new Set(D.files.map((f) => f.id));
      S.projects.forEach((p) => {
        if (!p.libKey) return;
        const spec = specByKey.get(p.libKey);
        if (!spec) return;
        const validCats = new Set(spec.catIds);
        const validVols = new Set();
        spec.catIds.forEach((catId) => {
          validVols.add(volId('c', catId));
          const cat = D.cat(catId);
          if (cat) cat.subs.forEach((sub) => {
            if (cat.type === '小说') validVols.add(volId('s', sub.id));
            else validVols.add(volId('s', sub.id));
          });
        });
        p.nodes = p.nodes.filter((n) => {
          if (n.docId) return liveDocs.has(n.docId);
          if (n.id.startsWith('nv-c-')) {
            const catId = n.id.slice(5);
            return validCats.has(catId);
          }
          if (n.id.startsWith('nv-s-')) {
            const subId = n.id.slice(5);
            return validVols.has(volId('s', subId));
          }
          return true;
        });
        const ids = new Set(p.nodes.map((n) => n.id));
        p.nodes.forEach((n) => { n.parents = (n.parents || []).filter((id) => ids.has(id)); });
        if (!p.libLayout) {
          tidyLayout(p);
          changed = true;
        }
      });

      if (changed) S.save();
      return { ok: true, projects: S.projects.filter((p) => p.libKey).length, changed };
    }).catch((error) => {
      console.warn('文库工程同步失败', error);
      return { ok: false, error };
    }).finally(() => { syncing = null; });
    return syncing;
  }

  function findNode(docId) {
    for (const p of S.projects) {
      const n = (p.nodes || []).find((x) => x.docId === docId || x.id === docNodeId(docId));
      if (n) return { project: p, node: n };
    }
    return null;
  }

  async function ensureDoc(docId) {
    let hit = findNode(docId);
    if (hit) return hit;
    const rec = D.get(docId);
    if (!rec) return null;
    await syncAll({ quiet: true });
    hit = findNode(docId);
    if (hit) return hit;
    const expected = expectedArticle(rec);
    const p = S.projects.find((x) => x.libKey === expected.specKey);
    if (!p) return null;
    const parentId = ensureVolumes(p, expected.catChain).parentId;
    const n = makeDocNode(rec, parentId, 1e12 + (S.sortedChapters(p).length || 0));
    const parent = p.nodes.find((x) => x.id === parentId);
    n.x = parent ? parent.x + 320 : 420;
    n.y = parent ? parent.y + 110 : 140;
    p.nodes.push(n);
    p.updatedAt = Date.now();
    S.save();
    return { project: p, node: n };
  }

  function markRemoved(project) {
    if (!project || !project.libKey) return;
    const set = removedKeys();
    set.add(project.libKey);
    saveRemoved(set);
  }

  async function restoreAll() {
    saveRemoved(new Set());
    return syncAll({ quiet: true });
  }

  function stats() {
    const libProjects = S.projects.filter((p) => p.libKey);
    return {
      projects: libProjects.length,
      nodes: libProjects.reduce((a, p) => a + p.nodes.length, 0),
      docs: libProjects.reduce((a, p) => a + p.nodes.filter((n) => n.docId).length, 0)
    };
  }

  window.Gen6Projects = {
    syncAll, findNode, ensureDoc, tidyLayout, markRemoved, restoreAll, stats,
    projectSpecs, docNodeId
  };
})();
