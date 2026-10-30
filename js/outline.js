/* ============================================================
   outline.js · 无限画布思维导图
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const S = window.Store;
  const NT = window.NODE_TYPES;

  const view = {
    pid: null, panX: 0, panY: 0, zoom: 1,
    filter: 'all', pinned: false, selId: null, selIds: new Set(), pinIds: new Set(),
    hiddenIds: new Set(), pinFocus: new Set(), wireMode: 'selected', multi: false, undo: null, syncingWriter: false,
    wrap: null, world: null, wires: null, pop: null, nodeEls: new Map(), pointerMap: new Map(),
    dragging: null, connecting: null, tempWire: null, moved: false, longTimer: null,
    didFit: {}
  };

  const NODE_W = 212;
  const GAP_X = 300;
  const GAP_Y = 150;
  const WIRE_MODES = ['selected', 'all', 'hidden', 'none'];

  function outlineUI(p) {
    return (p && p.outline) || {};
  }

  function loadOutlineUI(p) {
    const ui = outlineUI(p);
    view.wireMode = WIRE_MODES.indexOf(ui.wires) > -1 ? ui.wires : 'selected';
    const ids = new Set(p.nodes.map((n) => n.id));
    view.pinIds = new Set((Array.isArray(ui.pins) ? ui.pins : []).filter((id) => ids.has(id)));
  }

  function saveOutlineUI(p) {
    if (!p) return;
    p.outline = Object.assign({}, p.outline || {}, {
      wires: view.wireMode,
      pins: Array.from(view.pinIds)
    });
    S.save();
  }

  function hasSelection() { return view.selIds.size > 0; }

  function selectedIds() { return Array.from(view.selIds); }

  function nodeH(el) { return el ? el.offsetHeight : 92; }

  function screenToWorld(sx, sy) {
    const r = view.wrap.getBoundingClientRect();
    return { x: (sx - r.left - view.panX) / view.zoom, y: (sy - r.top - view.panY) / view.zoom };
  }
  function worldToScreen(x, y) {
    const r = view.wrap.getBoundingClientRect();
    return { x: r.left + view.panX + x * view.zoom, y: r.top + view.panY + y * view.zoom };
  }

  function render(host, p, sharedState) {
    if (view.pid !== p.id) { view.undo = null; view.hiddenIds = new Set(); view.pinFocus = new Set(); }
    view.pid = p.id;
    view.selId = (sharedState && sharedState.selNode) || null;
    view.selIds = new Set(view.selId ? [view.selId] : []);
    view.multi = false;
    loadOutlineUI(p);
    view.pinned = false;
    window.Outline.live = true;
    if (!view.didFit[p.id]) {
      view.didFit[p.id] = true;
      view.zoom = 1;
      view.panX = 40; view.panY = 40;
    }
    host.innerHTML =
      '<div class="canvas-wrap" id="cvWrap">' +
      '<div class="canvas-world" id="cvWorld">' +
      '<svg class="wire-layer" id="cvWires" width="1" height="1">' +
      '<defs>' +
      '<linearGradient id="wireGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2E4BFF"/><stop offset=".55" stop-color="#8B5CF6"/><stop offset="1" stop-color="#4E8F7C"/></linearGradient>' +
      '<linearGradient id="wireGradSub" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8A9099"/><stop offset="1" stop-color="#B06A9E"/></linearGradient>' +
      '</defs><g id="cvWireG"></g></svg>' +
      '<div id="cvNodes"></div>' +
      '</div>' +
      '<div class="canvas-toolbar">' +
      '<button class="ct-btn" data-cv="out" title="缩小">' + U.icon('zoomOut') + '</button>' +
      '<span class="ct-zoom" id="cvZoom">100%</span>' +
      '<button class="ct-btn" data-cv="in" title="放大">' + U.icon('zoomIn') + '</button>' +
      '<button class="ct-btn" data-cv="fit" title="适应画布">' + U.icon('fit') + '</button>' +
      '<span class="ct-sep"></span>' +
      '<button class="ct-btn" data-cv="selectall" id="cvSelectAll" title="全选所有节点；再点一次取消全选">' + U.icon('check') + '全选</button>' +
      '<span class="ct-sep"></span>' +
      '<button class="ct-btn" data-cv="wires" id="cvWireBtn" data-node-menu title="显示方式：聚焦 / 全部 / 隐线 / 全隐">' + U.icon('link') + '<span id="cvWireLabel">' + wireLabel() + '</span></button>' +
      '<button class="ct-btn" data-cv="multi" id="cvMultiBtn" title="多选：点击节点加选或减选">' + U.icon('check') + '多选</button>' +
      '<span class="ct-sep"></span>' +
      '<button class="ct-btn" data-cv="add">' + U.icon('plus') + '节点</button>' +
      '<button class="ct-btn" data-cv="layout" data-node-menu title="布局与聚合">' + U.icon('layout') + '布局</button>' +
      '<span class="ct-sep"></span>' +
      '<button class="ct-btn" data-cv="filter" id="cvFilter" data-node-menu>' + U.icon('filter') + '<span>' + filterLabel() + '</span></button>' +
      '</div>' +
      '<div class="sel-bar" id="cvSelBar" hidden>' +
      '<span class="sb-count" id="cvSelCount"></span>' +
      '<button class="ct-btn" data-sel="pin" id="cvSelPin" title="固定后，切换选择也不会隐藏这些节点的连线">' + U.icon('pin') + '固定</button>' +
      '<button class="ct-btn" data-sel="aggregate" title="把选中分支收回默认位置">' + U.icon('layers') + '聚合</button>' +
      '<button class="ct-btn" data-sel="hide" title="隐藏选中节点及其所有下级；只藏节点，不删任何内容">' + U.icon('eye') + '隐藏</button>' +
      '<button class="ct-btn" data-sel="showall" id="cvSelShowAll" title="恢复所有被隐藏的节点">' + U.icon('eye') + '显示全部</button>' +
      '<button class="ct-btn" data-sel="clear" title="清空选择">' + U.icon('x') + '</button>' +
      '</div>' +
      '<div class="canvas-hint">点节点展开这一支 · 全选后可整批隐藏 · 右键或长按聚合</div>' +
      '<div class="canvas-minimap" id="cvMini"></div>' +
      '<div class="canvas-empty" id="cvEmpty" hidden><div class="ce-box"><b>画布已全部隐藏</b><p>节点和连线都收起来了，点下面恢复。</p><button class="btn primary" data-cv="showall">显示全部节点</button></div></div>' +
      '<div class="drop-hint">释放，创建一个节点</div>' +
      '</div>';

    view.wrap = $('#cvWrap');
    view.world = $('#cvWorld');
    view.wires = $('#cvWires');
    view.nodeEls = new Map();
    view.pointerMap = new Map();

    applyTransform();
    renderNodes(p);
    renderWires(p);
    updateMini(p);
    updateSelBar();
    bindCanvas(p, sharedState);
    if (!view.didFit[p.id + ':fitted']) {
      view.didFit[p.id + ':fitted'] = true;
      setTimeout(() => initialView(p), 30);
    }
  }

  function initialView(p) {
    const focus = focusSet(p);
    const roots = p.nodes.filter((n) => !(n.parents || []).length && nodeVisible(p, n, focus));
    const visible = p.nodes.filter((n) => nodeVisible(p, n, focus));
    if (!roots.length || visible.length <= 24) { fit(p); return; }
    const first = roots.slice().sort((a, b) => (a.y || 0) - (b.y || 0))[0];
    const w = view.wrap.clientWidth, h = view.wrap.clientHeight;
    view.zoom = 0.95;
    view.panX = Math.max(60, w * 0.16) - first.x * view.zoom;
    view.panY = h / 2 - (first.y + 50) * view.zoom;
    applyTransform();
  }

  function metaText(p, n) {
    const w = S.treeWords(p, n);
    if (w) return U.fmt(w) + ' 字';
    return n.type === 'vol' ? '空卷' : '未写';
  }

  function renderNodes(p) {
    const host = $('#cvNodes');
    host.innerHTML = '';
    view.nodeEls.clear();
    const focus = focusSet(p);
    p.nodes.forEach((n) => {
      const type = NT[n.type] || NT.ch;
      const el = document.createElement('div');
      el.className = 'node' + (view.selIds.has(n.id) ? ' selected' : '') + (filtered(n) ? ' dim' : '') +
        (nodeVisible(p, n, focus) ? '' : ' node-hidden');
      el.style.left = (n.x || 0) + 'px';
      el.style.top = (n.y || 0) + 'px';
      el.style.setProperty('--nc', n.color || type.color);
      el.setAttribute('data-nid', n.id);
      el.innerHTML =
        '<span class="node-bar"></span>' +
        '<div class="node-top"><span class="node-type">' + U.icon(type.icon) + type.label + '</span>' +
        (n.parents && n.parents.length > 1 ? '<span class="node-line">多父</span>' : (n.line === 'sub' ? '<span class="node-line">支线</span>' : '')) + '</div>' +
        '<div class="node-title">' + U.esc(n.title) + '</div>' +
        '<div class="node-meta"><span>' + metaText(p, n) + '</span>' +
        (n.time ? '<span class="tm">' + U.icon('clock') + U.esc(n.time) + '</span>' : '') + '</div>' +
        '<button class="node-plus" data-connect="' + n.id + '" title="拖到另一个节点连线；单击添加子节点">' + U.icon('plus') + '</button>';
      host.appendChild(el);
      view.nodeEls.set(n.id, el);
      bindNode(el, n, p);
    });
    applyPinClasses();
    updateEmptyState(p);
  }

  function applyPinClasses() {
    view.nodeEls.forEach((el, nid) => {
      const on = view.pinIds.has(nid);
      el.classList.toggle('pinned', on);
      let badge = el.querySelector('.node-pin');
      if (on && !badge) {
        badge = document.createElement('span');
        badge.className = 'node-pin';
        badge.title = '连线已固定';
        badge.innerHTML = U.icon('pinFill');
        const top = el.querySelector('.node-top');
        if (top) top.appendChild(badge);
      } else if (!on && badge) {
        badge.remove();
      }
    });
  }

  function filtered(n) {
    if (view.filter === 'all') return false;
    if (view.filter === 'main') return n.line === 'sub';
    return n.line !== 'sub';
  }

  function focusSet(p) {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const seeds = new Set();
    view.selIds.forEach((id) => { if (byId.has(id)) seeds.add(id); });
    view.pinFocus.forEach((id) => { if (byId.has(id)) seeds.add(id); });
    if (!seeds.size) {
      p.nodes.forEach((n) => { if (!(n.parents || []).length) seeds.add(n.id); });
      return seeds;
    }
    const set = new Set();
    seeds.forEach((id) => collectSubtree(p, id).forEach((x) => set.add(x)));
    const queue = Array.from(seeds);
    while (queue.length) {
      const n = byId.get(queue.shift());
      (n.parents || []).forEach((pid) => {
        if (byId.has(pid) && !set.has(pid)) { set.add(pid); queue.push(pid); }
      });
    }
    return set;
  }

  function nodeVisible(p, n, focus) {
    if (view.hiddenIds.has(n.id)) return false;
    if (view.wireMode === 'none') return false;
    if (view.wireMode === 'selected') return focus.has(n.id);
    return true;
  }

  function applyVisibility(p) {
    const focus = focusSet(p);
    p.nodes.forEach((n) => {
      const el = view.nodeEls.get(n.id);
      if (el) el.classList.toggle('node-hidden', !nodeVisible(p, n, focus));
    });
    updateEmptyState(p);
  }

  function updateEmptyState(p) {
    const el = $('#cvEmpty');
    if (!el) return;
    const focus = focusSet(p);
    const allGone = p.nodes.length > 0 && p.nodes.every((n) => !nodeVisible(p, n, focus));
    el.hidden = !allGone;
  }

  function allSelected(p) {
    return p.nodes.length > 0 && p.nodes.every((n) => view.selIds.has(n.id));
  }

  function wirePath(a, b) {
    const ah = nodeH(view.nodeEls.get(a.id));
    const bh = nodeH(view.nodeEls.get(b.id));
    const acx = a.x + NODE_W / 2, acy = a.y + ah / 2;
    const bcx = b.x + NODE_W / 2, bcy = b.y + bh / 2;
    const dx = bcx - acx, dy = bcy - acy;
    if (Math.abs(dx) >= Math.abs(dy) * 0.9) {
      const right = dx >= 0;
      const x1 = right ? a.x + NODE_W : a.x;
      const y1 = acy;
      const x2 = right ? b.x : b.x + NODE_W;
      const y2 = bcy;
      const k = Math.max(36, Math.min(150, Math.abs(x2 - x1) * 0.45));
      return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + (right ? k : -k)) + ' ' + y1 + ', ' + (x2 - (right ? k : -k)) + ' ' + y2 + ', ' + x2 + ' ' + y2;
    }
    const down = dy >= 0;
    const x1 = acx, x2 = bcx;
    const y1 = down ? a.y + ah : a.y;
    const y2 = down ? b.y : b.y + bh;
    const k = Math.max(32, Math.min(120, Math.abs(y2 - y1) * 0.5));
    return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + (down ? k : -k)) + ', ' + x2 + ' ' + (y2 - (down ? k : -k)) + ', ' + x2 + ' ' + y2;
  }

  function wireLabel() {
    return view.wireMode === 'all' ? '全部' : view.wireMode === 'hidden' ? '隐线' : view.wireMode === 'none' ? '全隐' : '聚焦';
  }

  function renderWires(p) {
    const g = $('#cvWireG');
    if (!g) return;
    if (view.wireMode === 'hidden' || view.wireMode === 'none') { g.innerHTML = ''; return; }
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const focusNodes = focusSet(p);
    const litFocus = new Set();
    view.selIds.forEach((id) => litFocus.add(id));
    view.pinIds.forEach((id) => litFocus.add(id));
    let h = '';
    p.nodes.forEach((n) => {
      if (!nodeVisible(p, n, focusNodes)) return;
      (n.parents || []).forEach((pid) => {
        const par = byId.get(pid);
        if (!par || !nodeVisible(p, par, focusNodes)) return;
        const lit = litFocus.has(n.id) || litFocus.has(par.id);
        const dim = filtered(n) || filtered(par);
        const pinned = view.pinIds.has(n.id) && view.pinIds.has(par.id);
        const cls = 'wire' + (n.line === 'sub' ? ' sub' : '') + (lit ? ' lit' : '') +
          (pinned ? ' pinned' : '') + (dim ? ' hl-dim' : '');
        h += '<path class="' + cls + '" d="' + wirePath(par, n) + '"/>';
      });
    });
    g.innerHTML = h;
  }

  function applyTransform() {
    if (!view.world) return;
    view.world.style.transform = 'translate(' + view.panX + 'px,' + view.panY + 'px) scale(' + view.zoom + ')';
    const z = $('#cvZoom');
    if (z) z.textContent = Math.round(view.zoom * 100) + '%';
    const wrap = view.wrap;
    if (wrap) wrap.style.backgroundPosition = view.panX + 'px ' + view.panY + 'px';
    updateMini(window.Store.get(view.pid));
  }

  function zoomAt(sx, sy, factor) {
    const before = screenToWorld(sx, sy);
    view.zoom = U.clamp(view.zoom * factor, 0.1, 3);
    const after = screenToWorld(sx, sy);
    view.panX += (after.x - before.x) * view.zoom;
    view.panY += (after.y - before.y) * view.zoom;
    applyTransform();
  }

  function fit(p) {
    if (!p || !view.wrap) return;
    const focus = focusSet(p);
    const nodes = p.nodes.filter((n) => nodeVisible(p, n, focus));
    if (!nodes.length) { view.zoom = 1; view.panX = 40; view.panY = 40; applyTransform(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const h = nodeH(view.nodeEls.get(n.id));
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + h);
    });
    const pad = 70;
    const w = view.wrap.clientWidth, h = view.wrap.clientHeight;
    const z = U.clamp(Math.min((w - pad * 2) / Math.max(maxX - minX, 1), (h - pad * 2) / Math.max(maxY - minY, 1)), 0.1, 1.2);
    view.zoom = z;
    view.panX = (w - (maxX - minX) * z) / 2 - minX * z;
    view.panY = (h - (maxY - minY) * z) / 2 - minY * z;
    applyTransform();
  }

  function centerOn(id) {
    const p = S.get(view.pid);
    const n = p && p.nodes.find((x) => x.id === id);
    if (!n || !view.wrap) return;
    const el = view.nodeEls.get(id);
    const h = nodeH(el);
    const w = view.wrap.clientWidth, hh = view.wrap.clientHeight;
    view.panX = w / 2 - (n.x + NODE_W / 2) * view.zoom;
    view.panY = hh / 2 - (n.y + h / 2) * view.zoom;
    applyTransform();
  }

  function focusNode(id) {
    const p = S.get(view.pid);
    if (!p) return;
    centerOn(id);
    select(id, p);
  }

  /* ---------------- node interactions ---------------- */
  function bindNode(el, n, p) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2) return;
      if (e.target.closest('[data-connect]')) return;
      e.stopPropagation();
      const additive = view.multi || e.ctrlKey || e.metaKey || e.shiftKey;
      const wasSelected = view.selIds.has(n.id);
      if (additive && wasSelected) {
        view.pendingToggle = { id: n.id };
      } else {
        view.pendingToggle = null;
        select(n.id, p, false, additive, false);
      }
      const start = { x: e.clientX, y: e.clientY };
      const orig = { x: n.x, y: n.y };
      view.moved = false;
      view.dragging = { id: n.id, el, start, orig };
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      closePopoverUnlessPinned();
      clearTimeout(view.longTimer);
      view.longTimer = setTimeout(() => {
        if (view.dragging && !view.moved) {
          view.dragging = null;
          view.pendingToggle = null;
          el.classList.remove('dragging');
          openNodeMenu(e.clientX, e.clientY, n, p);
        }
      }, 560);
    });

    el.addEventListener('pointermove', (e) => {
      const d = view.dragging;
      if (!d || d.id !== n.id) return;
      const dx = (e.clientX - d.start.x) / view.zoom;
      const dy = (e.clientY - d.start.y) / view.zoom;
      if (!view.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > 4) {
        view.moved = true;
        view.pendingToggle = null;
        clearTimeout(view.longTimer);
      }
      if (!view.moved) return;
      n.x = Math.round(d.orig.x + dx);
      n.y = Math.round(d.orig.y + dy);
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
      renderWires(p);
    });

    el.addEventListener('pointerup', (e) => {
      const d = view.dragging;
      clearTimeout(view.longTimer);
      if (!d || d.id !== n.id) return;
      el.classList.remove('dragging');
      view.dragging = null;
      if (view.moved) {
        view.pendingToggle = null;
        S.save();
        applySelection(p);
        updateMini(p);
      } else if (view.pendingToggle && view.pendingToggle.id === n.id) {
        view.pendingToggle = null;
        select(n.id, p, true, true, true);
      } else {
        select(n.id, p, true, view.multi || e.ctrlKey || e.metaKey || e.shiftKey, false);
        if (U.isTouch()) openNodeMenu(e.clientX, e.clientY, n, p);
      }
    });

    el.addEventListener('pointercancel', () => {
      clearTimeout(view.longTimer);
      if (view.dragging) { view.dragging.el.classList.remove('dragging'); view.dragging = null; }
    });

    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (n.type !== 'vol') window.Editor.openNode(n.id);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!view.selIds.has(n.id)) select(n.id, p, false);
      openNodeMenu(e.clientX, e.clientY, n, p);
    });

    const plus = el.querySelector('[data-connect]');
    plus.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      startConnect(e, n, p);
    });
  }

  function startConnect(e, n, p) {
    e.preventDefault();
    view.connecting = { from: n, p };
    view.wrap.classList.add('connecting');
    const g = $('#cvWireG');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'wire-temp');
    g.appendChild(path);
    view.tempWire = path;
    const move = (ev) => {
      const w = screenToWorld(ev.clientX, ev.clientY);
      const ah = nodeH(view.nodeEls.get(n.id));
      const x1 = n.x + NODE_W, y1 = n.y + ah / 2;
      const dx = Math.max(40, Math.abs(w.x - x1) * 0.45);
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (w.x - dx) + ' ' + w.y + ', ' + w.x + ' ' + w.y);
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      view.wrap.classList.remove('connecting');
      if (path.parentNode) path.remove();
      view.tempWire = null;
      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetNode = targetEl && targetEl.closest('.node');
      const pid = targetNode && targetNode.getAttribute('data-nid');
      const to = pid && p.nodes.find((x) => x.id === pid);
      view.connecting = null;
      if (!to || to.id === n.id) return;
      if ((to.parents || []).indexOf(n.id) > -1) { U.toast('这两个节点已经连着了', 'link'); return; }
      if (wouldCycle(p, n.id, to.id)) { U.toast('不能连成循环：目标节点是它的上级', 'alert'); return; }
      to.parents = (to.parents || []).concat([n.id]);
      S.save();
      renderWires(p);
      U.toast('已连线');
    };
    move(e);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
    view.tempWire = path;
  }

  function wouldCycle(p, parentId, childId) {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    let cur = byId.get(parentId);
    const seen = new Set();
    while (cur) {
      if (cur.id === childId) return true;
      if (seen.has(cur.id)) return false;
      seen.add(cur.id);
      const parent = (cur.parents || [])[0];
      cur = parent ? byId.get(parent) : null;
    }
    return false;
  }

  /* ---------------- popover ---------------- */
  function applySelection(p) {
    view.nodeEls.forEach((el, nid) => el.classList.toggle('selected', view.selIds.has(nid)));
    updateSelBar();
    if (p) { applyVisibility(p); renderWires(p); }
  }

  function syncWriterSelection() {
    view.syncingWriter = true;
    window.Writer.selectNode(view.selId);
    view.syncingWriter = false;
  }

  function select(id, p, showPop, additive, remove) {
    if (!id) { clearSelection(p); return; }
    revealHidden(p, id);
    if (!additive) {
      view.selIds = new Set([id]);
      view.selId = id;
    } else if (remove) {
      view.selIds.delete(id);
      if (view.selId === id) {
        const rest = selectedIds();
        view.selId = rest.length ? rest[rest.length - 1] : null;
      }
    } else {
      view.selIds.add(id);
      view.selId = id;
    }
    applySelection(p);
    syncWriterSelection();
    if (showPop !== false) {
      if (view.selIds.size === 1) showPopover(id);
      else if (!view.pinned) hidePopover();
    }
  }

  function clearSelection(p) {
    view.selIds.clear();
    view.selId = null;
    applySelection(p);
    syncWriterSelection();
    if (!view.pinned) hidePopover();
  }

  function updateSelBar() {
    const bar = $('#cvSelBar');
    if (!bar) return;
    const count = view.selIds.size;
    const hiddenCount = view.hiddenIds.size;
    bar.hidden = count === 0 && hiddenCount === 0 && view.wireMode !== 'none';
    const label = $('#cvSelCount');
    if (label) label.textContent = '已选 ' + count + ' 个' + (hiddenCount ? ' · 隐藏 ' + hiddenCount + ' 个' : '');
    const pinBtn = $('#cvSelPin');
    if (pinBtn) {
      const allPinned = count > 0 && selectedIds().every((id) => view.pinIds.has(id));
      pinBtn.classList.toggle('on', allPinned);
      pinBtn.innerHTML = U.icon(allPinned ? 'pinFill' : 'pin') + (allPinned ? '取消固定' : '固定');
    }
    const showAllBtn = $('#cvSelShowAll');
    if (showAllBtn) showAllBtn.hidden = !(hiddenCount || view.wireMode === 'none');
    const selectAllBtn = $('#cvSelectAll');
    if (selectAllBtn) {
      const p = S.get(view.pid);
      const all = p ? allSelected(p) : false;
      selectAllBtn.classList.toggle('on', all);
      selectAllBtn.innerHTML = U.icon('check') + (all ? '取消全选' : '全选');
    }
    const multiBtn = $('#cvMultiBtn');
    if (multiBtn) multiBtn.classList.toggle('on', view.multi);
  }

  function togglePins(p) {
    togglePinsFor(p, selectedIds());
  }

  function setWireMode(mode, p) {
    if (WIRE_MODES.indexOf(mode) < 0) return;
    view.wireMode = mode;
    saveOutlineUI(p);
    const label = $('#cvWireLabel');
    if (label) label.textContent = wireLabel();
    const btn = $('#cvWireBtn');
    if (btn) btn.classList.toggle('on', mode !== 'selected');
    applyVisibility(p);
    renderWires(p);
    updateSelBar();
    updateEmptyState(p);
    const msg = mode === 'all' ? '已显示全部节点与连线' :
      mode === 'hidden' ? '已隐藏全部连线（节点保留）' :
      mode === 'none' ? '已全部隐藏：节点与连线都收起，点「显示全部」恢复' :
      '聚焦模式：只显示选中这一支，其余节点与连线隐藏';
    U.toast(msg, mode === 'none' ? 'eye' : 'link');
  }

  function toggleMulti() {
    view.multi = !view.multi;
    updateSelBar();
    U.toast(view.multi ? '多选已开启：点击节点加选或减选' : '多选已关闭', 'check');
  }

  function revealHidden(p, id) {
    if (!p || !view.hiddenIds.has(id)) return;
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const queue = [id];
    const seen = new Set();
    while (queue.length) {
      const x = queue.shift();
      if (seen.has(x)) continue;
      seen.add(x);
      view.hiddenIds.delete(x);
      const n = byId.get(x);
      if (n) (n.parents || []).forEach((pid) => queue.push(pid));
    }
    collectSubtree(p, id).forEach((x) => view.hiddenIds.delete(x));
  }

  function toggleSelectAll(p) {
    if (!p || !p.nodes.length) return;
    const all = allSelected(p);
    if (all) {
      view.selIds.clear();
      view.selId = null;
    } else {
      view.selIds = new Set(p.nodes.map((n) => n.id));
      if (view.wireMode === 'none') {
        view.wireMode = 'selected';
        saveOutlineUI(p);
        const label = $('#cvWireLabel');
        if (label) label.textContent = wireLabel();
        const btn = $('#cvWireBtn');
        if (btn) btn.classList.remove('on');
      }
    }
    applySelection(p);
    updateSelBar();
    U.toast(all ? '已取消全选' : '已全选 ' + p.nodes.length + ' 个节点；可点「隐藏」整批收起', 'check');
  }

  function hideSelected(p) {
    if (!view.selIds.size) { U.toast('先点选要隐藏的节点', 'info'); return; }
    const hide = new Set();
    view.selIds.forEach((id) => collectSubtree(p, id).forEach((x) => hide.add(x)));
    hide.forEach((id) => view.hiddenIds.add(id));
    view.selIds.clear();
    view.selId = null;
    applySelection(p);
    updateSelBar();
    U.toast('已隐藏 ' + hide.size + ' 个节点（含所有下级）；点「显示全部」恢复', 'eye');
  }

  function showAll(p) {
    if (!p) return;
    view.hiddenIds.clear();
    view.wireMode = 'all';
    saveOutlineUI(p);
    const label = $('#cvWireLabel');
    if (label) label.textContent = wireLabel();
    const btn = $('#cvWireBtn');
    if (btn) btn.classList.add('on');
    renderNodes(p);
    renderWires(p);
    updateMini(p);
    updateSelBar();
    updateEmptyState(p);
    U.toast('已显示全部节点与连线', 'eye');
  }

  function markSelected(id) {
    if (view.syncingWriter) return;
    if (!id) {
      view.selIds.clear();
      view.selId = null;
    } else if (!view.selIds.has(id)) {
      view.selIds = new Set([id]);
      view.selId = id;
      revealHidden(S.get(view.pid), id);
    } else {
      view.selId = id;
      revealHidden(S.get(view.pid), id);
    }
    applySelection(S.get(view.pid));
  }

  function closePopoverUnlessPinned() {
    if (view.pinned) return;
    const pop = $('.node-pop');
    if (pop) pop.remove();
    view.pop = null;
  }

  function hidePopover() {
    const pop = $('.node-pop');
    if (pop) pop.remove();
    view.pop = null;
    view.pinned = false;
  }

  function showPopover(id) {
    const p = S.get(view.pid);
    const n = p && p.nodes.find((x) => x.id === id);
    if (!n || !view.wrap) return;
    if (view.pinned) return;
    hidePopover();
    const type = NT[n.type] || NT.ch;
    const el = document.createElement('div');
    el.className = 'node-pop';
    el.style.setProperty('--nc', n.color || type.color);
    el.innerHTML =
      '<div class="np-head" data-pop-drag="1"><span class="np-type">' + U.icon(type.icon) + type.label + '</span>' +
      '<span class="np-meta">' + metaText(p, n) + (n.time ? ' · ' + U.esc(n.time) : '') + '</span>' +
      '<span class="np-btns"><button data-pop="pin" title="钉住">' + U.icon('pin') + '</button>' +
      '<button data-pop="edit" title="快速编辑">' + U.icon('pen') + '</button>' +
      '<button data-pop="close" title="关闭">' + U.icon('x') + '</button></span></div>' +
      '<div class="np-title">' + U.esc(n.title) + '</div>' +
      '<div class="np-body' + (n.body ? '' : ' empty') + '">' + (n.body ? U.esc(U.htmlToText(n.body).slice(0, 260)) : '还没有写内容。点右上角笔形图标直接写。') + '</div>' +
      '<div class="np-edit"><textarea placeholder="在这里写这个节点的内容…">' + U.esc(U.htmlToText(n.body || '')) + '</textarea>' +
      '<div class="np-edit-bar"><button class="btn ghost sm" data-pop="cancel-edit">取消</button><button class="btn primary sm" data-pop="save-edit">保存</button></div></div>' +
      '<div class="np-foot"><button class="btn dark" data-pop="write">' + U.icon('pen') + (n.type === 'vol' ? '在章节中写' : '进入完整写作') + '</button>' +
      '<button class="btn" data-pop="add-child">' + U.icon('plus') + '子节点</button></div>';
    view.wrap.appendChild(el);
    view.pop = el;
    positionPopover(el, n);
    bindPopover(el, n, p);
  }

  function positionPopover(el, n) {
    const r = view.wrap.getBoundingClientRect();
    const s = worldToScreen(n.x, n.y);
    const nodeScreenW = NODE_W * view.zoom;
    const popW = 330;
    let left = s.x + nodeScreenW + 14;
    if (left + popW > r.right - 8) left = s.x - popW - 14;
    if (left < r.left + 8) left = r.left + 8;
    let top = s.y;
    const popH = el.offsetHeight || 240;
    if (top + popH > r.bottom - 12) top = r.bottom - popH - 12;
    if (top < r.top + 8) top = r.top + 8;
    el.style.left = (left - r.left) + 'px';
    el.style.top = (top - r.top) + 'px';
  }

  function bindPopover(el, n, p) {
    el.querySelectorAll('[data-pop]').forEach((b) => {
      b.onclick = (e) => {
        const act = b.getAttribute('data-pop');
        if (act === 'close') { view.pinned = false; hidePopover(); }
        else if (act === 'pin') {
          view.pinned = !view.pinned;
          b.classList.toggle('on', view.pinned);
          b.innerHTML = U.icon(view.pinned ? 'pinFill' : 'pin');
          U.toast(view.pinned ? '已钉住，不会被点空白关掉' : '已取消钉住');
        } else if (act === 'edit') {
          el.classList.add('editing');
          const ta = el.querySelector('textarea');
          ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
        } else if (act === 'cancel-edit') {
          el.classList.remove('editing');
        } else if (act === 'save-edit') {
          const ta = el.querySelector('textarea');
          const before = S.nodeWords(n);
          n.body = U.textToHtml(ta.value);
          const after = S.nodeWords(n);
          if (p && after > before) S.addWords(p, after - before);
          S.save();
          window.Writer.updateStats();
          el.classList.remove('editing');
          const nb = el.querySelector('.np-body');
          nb.classList.toggle('empty', !n.body);
          nb.textContent = n.body ? U.htmlToText(n.body).slice(0, 260) : '还没有写内容。点右上角笔形图标直接写。';
          el.querySelector('.np-meta').textContent = metaText(p, n) + (n.time ? ' · ' + n.time : '');
          if (view.nodeEls.get(n.id)) renderNodes(p), renderWires(p), markSelected(n.id);
          U.toast('已保存');
        } else if (act === 'write') {
          if (n.type === 'vol') {
            const child = S.sortedChapters(p)[0];
            if (child) { hidePopover(); window.Editor.openNode(child.id); }
            else { U.toast('先在这卷下面加一章', 'info'); }
          } else { hidePopover(); window.Editor.openNode(n.id); }
        } else if (act === 'add-child') {
          addChild(n, p);
          hidePopover();
        }
      };
    });
    const head = el.querySelector('[data-pop-drag]');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-pop]')) return;
      const r = view.wrap.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const l = el.offsetLeft, t = el.offsetTop;
      head.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        el.style.left = U.clamp(l + ev.clientX - startX, 4, r.width - el.offsetWidth - 4) + 'px';
        el.style.top = U.clamp(t + ev.clientY - startY, 4, r.height - el.offsetHeight - 4) + 'px';
      };
      const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', mv);
      head.addEventListener('pointerup', up);
    });
  }

  /* ---------------- context menu ---------------- */
  let ctxCleanup = null;

  function showCtxMenu(x, y, items, options) {
    closeNodeMenu();
    const el = $('#ctxMenu');
    const opts = options || {};
    const body = items.map((it, i) => {
      if (!it) return '';
      if (it.sep) return '<div class="mi-sep"></div>';
      return '<button class="mi' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '') + '" data-i="' + i + '"' + (it.disabled ? ' disabled' : '') + '><span class="mi-ico">' + U.icon(it.icon) + '</span><span class="grow">' + U.esc(it.label) + '</span>' + (it.check ? '<span class="check">' + U.icon('check') + '</span>' : '') + '</button>';
    }).join('');
    el.innerHTML = (opts.head ? '<div class="mi-head">' + U.esc(opts.head) + '</div>' : '') + body;
    el.hidden = false;
    if (opts.anchor) {
      const r = opts.anchor.getBoundingClientRect();
      const left = r.left + r.width / 2 - el.offsetWidth / 2;
      const top = r.top - el.offsetHeight - 8;
      el.style.left = Math.round(U.clamp(left, 8, window.innerWidth - el.offsetWidth - 8)) + 'px';
      el.style.top = Math.round(U.clamp(top, 8, window.innerHeight - el.offsetHeight - 8)) + 'px';
    } else {
      el.style.left = Math.round(Math.min(x, window.innerWidth - el.offsetWidth - 8)) + 'px';
      el.style.top = Math.round(Math.min(y, window.innerHeight - el.offsetHeight - 8)) + 'px';
    }
    el.querySelectorAll('.mi').forEach((b) => {
      b.onclick = () => {
        const it = items[+b.getAttribute('data-i')];
        if (!it || it.disabled) return;
        closeNodeMenu();
        if (it.fn) it.fn();
      };
    });
    const off = (ev) => { if (!el.contains(ev.target)) closeNodeMenu(); };
    setTimeout(() => document.addEventListener('pointerdown', off), 0);
    ctxCleanup = () => document.removeEventListener('pointerdown', off);
  }

  function menuTargets(n) {
    if (view.selIds.size > 1 && view.selIds.has(n.id)) return selectedIds();
    return [n.id];
  }

  function togglePinsFor(p, ids) {
    if (!ids.length) { U.toast('先点选要固定的节点', 'info'); return; }
    const all = ids.every((id) => view.pinIds.has(id));
    ids.forEach((id) => {
      if (all) { view.pinIds.delete(id); view.pinFocus.delete(id); }
      else { view.pinIds.add(id); view.pinFocus.add(id); }
    });
    saveOutlineUI(p);
    applyPinClasses();
    renderWires(p);
    updateSelBar();
    U.toast(all ? '已取消固定' : '已固定 ' + ids.length + ' 个节点的连线', all ? 'info' : 'pin');
  }

  function openNodeMenu(x, y, n, p) {
    const targets = menuTargets(n);
    const multi = targets.length > 1;
    const allPinned = targets.every((id) => view.pinIds.has(id));
    const items = [
      { label: n.type === 'vol' ? '查看这卷' : '进入写作', icon: 'pen', fn: () => { if (n.type === 'vol') { const c = S.sortedChapters(p)[0]; if (c) { collectSubtree(p, n.id); window.Editor.openNode(c.id); } } else window.Editor.openNode(n.id); } },
      { label: '重命名', icon: 'type', fn: () => renameNode(n, p) },
      { label: '添加子节点', icon: 'plus', fn: () => addChild(n, p) },
      { label: '添加同级', icon: 'list', fn: () => addSibling(n, p) },
      { sep: true },
      { label: multi ? '聚合这 ' + targets.length + ' 个节点' : '聚合（回到默认位置）', icon: 'layers', fn: () => aggregate(p, targets) },
      { label: '恢复聚合前位置', icon: 'undo', disabled: !view.undo || view.undo.pid !== p.id, fn: () => restorePositions(p) },
      { label: allPinned ? '取消固定连线' : '固定显示连线', icon: allPinned ? 'pinFill' : 'pin', fn: () => togglePinsFor(p, targets) },
      view.pinIds.size ? { label: '清空全部固定', icon: 'x', fn: () => { view.pinIds.clear(); view.pinFocus.clear(); saveOutlineUI(p); applyVisibility(p); applyPinClasses(); renderWires(p); updateMini(p); updateSelBar(); U.toast('已清空固定，回到聚焦'); } } : null,
      { label: multi ? '隐藏这 ' + targets.length + ' 个节点（含下级）' : '隐藏这一支（含所有下级）', icon: 'eye', fn: () => hideSelected(p) },
      view.hiddenIds.size ? { label: '显示全部节点（恢复）', icon: 'eye', fn: () => showAll(p) } : null,
      { sep: true },
      { label: n.line === 'main' ? '标记为支线' : '标记为主线', icon: 'link', fn: () => { n.line = n.line === 'main' ? 'sub' : 'main'; S.save(); renderNodes(p); renderWires(p); window.Writer.updateStats(); } },
      { label: '设为卷', icon: 'book', check: n.type === 'vol', fn: () => setType(n, 'vol', p) },
      { label: '设为章', icon: 'file', check: n.type === 'ch', fn: () => setType(n, 'ch', p) },
      { label: '设为场景', icon: 'scene', check: n.type === 'scene', fn: () => setType(n, 'scene', p) },
      { label: '设为备注', icon: 'note', check: n.type === 'note', fn: () => setType(n, 'note', p) },
      { sep: true }
    ];
    if (n.parents && n.parents.length) {
      items.push({ label: '断开所有连线', icon: 'x', fn: () => { n.parents = []; S.save(); renderWires(p); window.Writer.updateStats(); } });
      if (n.parents.length > 1) {
        items.push({ label: '只保留主连线', icon: 'link', fn: () => { n.parents = n.parents.slice(0, 1); S.save(); renderWires(p); window.Writer.updateStats(); } });
      }
    }
    items.push({ label: '删除节点', icon: 'trash', danger: true, fn: () => window.Writer.state && deleteNode(n, p) });
    showCtxMenu(x, y, items);
  }

  function closeNodeMenu() {
    $('#ctxMenu').hidden = true;
    if (ctxCleanup) { ctxCleanup(); ctxCleanup = null; }
  }

  function renameNode(n, p) {
    U.promptModal({ title: '重命名节点', label: '节点名称', value: n.title, okText: '保存' }).then((v) => {
      if (v == null || !v) return;
      n.title = v; S.save();
      renderNodes(p); renderWires(p); markSelected(n.id);
      window.Writer.updateStats();
    });
  }
  function setType(n, t, p) {
    n.type = t;
    const type = NT[t];
    if (type) n.color = type.color;
    S.save(); renderNodes(p); renderWires(p); window.Writer.updateStats();
  }
  function addChild(n, p) {
    const child = window.blankNode(n.type === 'vol' ? 'ch' : 'scene', n.type === 'vol' ? '新章节' : '新场景', (n.x || 0) + 280, (n.y || 0) + 70 + Math.random() * 40);
    child.parents = [n.id];
    p.nodes.push(child);
    S.save();
    renderNodes(p); renderWires(p); updateMini(p);
    window.Writer.updateStats();
    setTimeout(() => focusNode(child.id), 40);
  }
  function addSibling(n, p) {
    const sib = window.blankNode(n.type === 'vol' ? 'vol' : 'ch', n.type === 'vol' ? '新卷' : '新章节', (n.x || 0), (n.y || 0) + 130);
    sib.parents = (n.parents || []).slice();
    p.nodes.push(sib);
    S.save(); renderNodes(p); renderWires(p); updateMini(p); window.Writer.updateStats();
    setTimeout(() => focusNode(sib.id), 40);
  }
  function collectSubtree(p, id) {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      p.nodes.forEach((n) => { if (!ids.has(n.id) && (n.parents || []).some((x) => ids.has(x))) { ids.add(n.id); grew = true; } });
    }
    return ids;
  }
  function deleteNode(n, p) {
    U.confirmModal({ title: '删除「' + n.title + '」？', desc: '节点与正文会一并删除，子节点会变成独立的根节点。', okText: '删除', danger: true }).then((ok) => {
      if (!ok) return;
      p.nodes = p.nodes.filter((x) => x.id !== n.id);
      p.nodes.forEach((x) => { x.parents = (x.parents || []).filter((id) => id !== n.id); });
      p.panels = (p.panels || []).filter((id) => id !== n.id);
      view.selIds.delete(n.id);
      if (view.selId === n.id) {
        const rest = selectedIds();
        view.selId = rest.length ? rest[rest.length - 1] : null;
      }
      if (view.pinIds.delete(n.id)) saveOutlineUI(p);
      S.save();
      renderNodes(p); renderWires(p); updateMini(p); updateSelBar();
      syncWriterSelection();
      window.Writer.updateStats();
      U.toast('节点已删除', 'trash');
    });
  }

  /* ---------------- canvas interactions ---------------- */
  function bindCanvas(p, sharedState) {
    const wrap = view.wrap;

    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.node,.node-pop,.canvas-toolbar,.sel-bar,.canvas-hint,.canvas-minimap')) return;
      closeNodeMenu();
      if (view.dragging || view.connecting) return;
      view.pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (view.pointerMap.size === 1) {
        view.panning = { startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY, moved: false };
        wrap.classList.add('panning');
        if (!view.pinned) hidePopover();
      } else if (view.pointerMap.size === 2) {
        const pts = Array.from(view.pointerMap.values());
        const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
        view.pinching = {
          dist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
          zoom: view.zoom,
          anchor: screenToWorld(cx, cy)
        };
        view.panning = null;
      }
      wrap.setPointerCapture(e.pointerId);
    });

    wrap.addEventListener('pointermove', (e) => {
      if (view.pointerMap.has(e.pointerId)) view.pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (view.pinching && view.pointerMap.size >= 2) {
        const pts = Array.from(view.pointerMap.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        view.zoom = U.clamp(view.pinching.zoom * (d / view.pinching.dist), 0.1, 3);
        const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
        const r = wrap.getBoundingClientRect();
        view.panX = cx - r.left - view.pinching.anchor.x * view.zoom;
        view.panY = cy - r.top - view.pinching.anchor.y * view.zoom;
        applyTransform();
        return;
      }
      const pan = view.panning;
      if (!pan) return;
      const dx = e.clientX - pan.startX, dy = e.clientY - pan.startY;
      if (!pan.moved && Math.hypot(dx, dy) > 3) pan.moved = true;
      if (pan.moved) {
        view.panX = pan.panX + dx;
        view.panY = pan.panY + dy;
        applyTransform();
      }
    });

    const endPan = (e) => {
      view.pointerMap.delete(e.pointerId);
      if (view.pointerMap.size < 2) view.pinching = null;
      const pan = view.panning;
      if (pan && !pan.moved && e.type === 'pointerup' && !e.target.closest('.node')) {
        clearSelection(p);
      }
      view.panning = null;
      wrap.classList.remove('panning');
    };
    wrap.addEventListener('pointerup', endPan);
    wrap.addEventListener('pointercancel', endPan);

    wrap.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0016);
        zoomAt(e.clientX, e.clientY, factor);
      }
    }, { passive: false });

    wrap.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node,.node-pop,.canvas-toolbar,.sel-bar')) return;
      const w = screenToWorld(e.clientX, e.clientY);
      const n = window.blankNode('ch', '新章节', Math.round(w.x - NODE_W / 2), Math.round(w.y - 45));
      p.nodes.push(n);
      S.save();
      renderNodes(p); renderWires(p); updateMini(p);
      window.Writer.updateStats();
      setTimeout(() => { focusNode(n.id); renameNode(n, p); }, 30);
    });

    wrap.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.node,.canvas-toolbar,.sel-bar')) return;
      e.preventDefault();
      const w = screenToWorld(e.clientX, e.clientY);
      const items = [
        { label: '在这里新建章节', icon: 'plus', fn: () => {
          const n = window.blankNode('ch', '新章节', Math.round(w.x - NODE_W / 2), Math.round(w.y - 45));
          p.nodes.push(n); S.save(); renderNodes(p); renderWires(p); window.Writer.updateStats();
        } },
        { sep: true },
        { label: '聚合全部（回到默认）', icon: 'layers', fn: () => autoLayout(p, 'tree') },
        { label: '恢复聚合前位置', icon: 'undo', disabled: !view.undo || view.undo.pid !== p.id, fn: () => restorePositions(p) },
        { label: '层级树（横向）', icon: 'tree', fn: () => autoLayout(p, 'tree') },
        { label: '平面网格（俯瞰）', icon: 'grid', fn: () => autoLayout(p, 'planar') },
        { sep: true },
        { label: '适应画布', icon: 'fit', fn: () => fit(p) },
        { label: '回到 100%', icon: 'target', fn: () => { view.zoom = 1; applyTransform(); } }
      ];
      showCtxMenu(e.clientX, e.clientY, items);
    });

    wrap.addEventListener('dragover', (e) => {
      if (window.__dragIdea) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        wrap.classList.add('dropping');
      }
    });
    wrap.addEventListener('dragleave', (e) => {
      if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('dropping');
    });
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      wrap.classList.remove('dropping');
      const id = window.__dragIdea || e.dataTransfer.getData('text/plain');
      if (!id) return;
      const w = screenToWorld(e.clientX, e.clientY);
      window.Writer.ideaToNode(p, id, Math.round(w.x - NODE_W / 2), Math.round(w.y - 40));
      window.__dragIdea = null;
    });

    wrap.querySelectorAll('[data-cv]').forEach((b) => {
      b.onclick = () => {
        const act = b.getAttribute('data-cv');
        const r = wrap.getBoundingClientRect();
        if (act === 'in') zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2);
        else if (act === 'out') zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2);
        else if (act === 'fit') fit(p);
        else if (act === 'layout') openLayoutMenu(b, p);
        else if (act === 'wires') openWireMenu(b, p);
        else if (act === 'multi') toggleMulti();
        else if (act === 'selectall') toggleSelectAll(p);
        else if (act === 'showall') showAll(p);
        else if (act === 'add') addQuickNode(p);
        else if (act === 'filter') {
          const el = $('#ctxMenu');
          const opts = [['all', '全部节点'], ['main', '仅主线'], ['sub', '仅支线']];
          el.innerHTML = '<div class="mi-head">过滤显示</div>' + opts.map(([k, l]) => '<button class="mi" data-f="' + k + '"><span class="mi-ico">' + U.icon(k === 'all' ? 'grid' : k === 'main' ? 'link' : 'list') + '</span><span class="grow">' + l + '</span>' + (view.filter === k ? '<span class="check">' + U.icon('check') + '</span>' : '') + '</button>').join('');
          el.hidden = false;
          el.style.left = Math.min(r.left + r.width / 2 - 90, window.innerWidth - 190) + 'px';
          el.style.top = (r.bottom - 90) + 'px';
          el.querySelectorAll('[data-f]').forEach((x) => x.onclick = () => {
            view.filter = x.getAttribute('data-f'); el.hidden = true;
            renderNodes(p); renderWires(p);
            const fb = $('#cvFilter span'); if (fb) fb.textContent = filterLabel();
          });
        }
      };
    });

    wrap.querySelectorAll('[data-sel]').forEach((b) => {
      b.onclick = () => {
        const act = b.getAttribute('data-sel');
        if (act === 'pin') togglePins(p);
        else if (act === 'aggregate') { if (hasSelection()) aggregate(p, selectedIds()); }
        else if (act === 'hide') hideSelected(p);
        else if (act === 'showall') showAll(p);
        else if (act === 'clear') clearSelection(p);
      };
    });

    window.addEventListener('resize', U.debounce(() => { if (window.Outline.live) { renderWires(p); updateMini(p); } }, 150));
  }

  function openWireMenu(anchor, p) {
    const items = [
      { label: '聚焦选中（只留这一支）', icon: 'eye', check: view.wireMode === 'selected', fn: () => setWireMode('selected', p) },
      { label: '全部显示（节点与连线）', icon: 'link', check: view.wireMode === 'all', fn: () => setWireMode('all', p) },
      { label: '只隐藏连线（节点保留）', icon: 'x', check: view.wireMode === 'hidden', fn: () => setWireMode('hidden', p) },
      { label: '全部隐藏（节点与连线）', icon: 'eye', check: view.wireMode === 'none', fn: () => setWireMode('none', p) },
      { sep: true },
      { label: '显示全部节点（恢复）', icon: 'eye', disabled: !view.hiddenIds.size && view.wireMode !== 'none', fn: () => showAll(p) },
      { sep: true },
      { label: '固定选中节点连线', icon: 'pin', disabled: !hasSelection(), fn: () => togglePinsFor(p, selectedIds()) },
      { label: '清空全部固定', icon: 'pinFill', disabled: !view.pinIds.size, fn: () => { view.pinIds.clear(); view.pinFocus.clear(); saveOutlineUI(p); applyVisibility(p); applyPinClasses(); renderWires(p); updateMini(p); updateSelBar(); U.toast('已清空固定，回到聚焦'); } }
    ];
    showCtxMenu(0, 0, items, { anchor: anchor, head: '显示方式（整支隐藏）' });
  }

  function openLayoutMenu(anchor, p) {
    const items = [
      { label: '层级树（横向）', icon: 'tree', fn: () => autoLayout(p, 'tree') },
      { label: '平面网格（俯瞰）', icon: 'grid', fn: () => autoLayout(p, 'planar') },
      { label: '聚合全部（回到默认）', icon: 'layers', fn: () => autoLayout(p, 'tree') },
      { label: '恢复聚合前位置', icon: 'undo', disabled: !view.undo || view.undo.pid !== p.id, fn: () => restorePositions(p) },
      { sep: true },
      { label: '适应画布', icon: 'fit', fn: () => fit(p) }
    ];
    if (hasSelection()) {
      items.splice(3, 0, { label: '聚合选中的 ' + view.selIds.size + ' 个节点', icon: 'layers', fn: () => aggregate(p, selectedIds()) });
    }
    showCtxMenu(0, 0, items, { anchor: anchor, head: '布局与聚合' });
  }

  function filterLabel() { return view.filter === 'all' ? '全部' : view.filter === 'main' ? '主线' : '支线'; }

  function addQuickNode(p) {
    const sel = p.nodes.find((n) => n.id === view.selId);
    let x, y;
    if (sel) { x = sel.x + 280; y = sel.y + 70; }
    else if (view.wrap) {
      const w = screenToWorld(view.wrap.getBoundingClientRect().left + view.wrap.clientWidth / 2, view.wrap.getBoundingClientRect().top + view.wrap.clientHeight / 2);
      x = w.x; y = w.y;
    } else { x = 300; y = 200; }
    const n = window.blankNode(sel && sel.type === 'vol' ? 'ch' : 'scene', '新节点', Math.round(x), Math.round(y));
    if (sel) n.parents = [sel.id];
    p.nodes.push(n);
    S.save();
    renderNodes(p); renderWires(p); updateMini(p);
    window.Writer.updateStats();
    setTimeout(() => focusNode(n.id), 40);
  }

  function snapshotPositions(p, ids) {
    const want = ids ? new Set(ids) : null;
    view.undo = {
      pid: p.id,
      at: Date.now(),
      positions: p.nodes.filter((n) => !want || want.has(n.id)).map((n) => ({ id: n.id, x: n.x || 0, y: n.y || 0 }))
    };
  }

  function restorePositions(p) {
    const undo = view.undo;
    if (!undo || undo.pid !== p.id || !undo.positions.length) {
      U.toast('没有可恢复的位置', 'info');
      return;
    }
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    undo.positions.forEach((pos) => {
      const n = byId.get(pos.id);
      if (n) { n.x = pos.x; n.y = pos.y; }
    });
    view.undo = null;
    S.save();
    renderNodes(p); renderWires(p); updateMini(p);
    U.toast('已恢复聚合前的位置', 'undo');
  }

  function moveSubtree(p, id, x, y) {
    const root = p.nodes.find((n) => n.id === id);
    if (!root) return;
    const dx = Math.round(x - (root.x || 0));
    const dy = Math.round(y - (root.y || 0));
    if (!dx && !dy) return;
    collectSubtree(p, id).forEach((nid) => {
      const n = p.nodes.find((x2) => x2.id === nid);
      if (!n) return;
      n.x = Math.round((n.x || 0) + dx);
      n.y = Math.round((n.y || 0) + dy);
    });
  }

  function primaryKids(p, parentId) {
    return p.nodes
      .filter((n) => (n.parents || [])[0] === parentId)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.y || 0) - (b.y || 0) || String(a.title).localeCompare(String(b.title), 'zh'));
  }

  function tidyBranch(p, parentId) {
    const parent = p.nodes.find((n) => n.id === parentId);
    if (!parent) return;
    const kids = primaryKids(p, parentId);
    const count = kids.length;
    kids.forEach((k, i) => {
      const ty = Math.round(parent.y + (i - (count - 1) / 2) * GAP_Y);
      moveSubtree(p, k.id, parent.x + GAP_X, ty);
    });
  }

  function tidyRoots(p) {
    const roots = p.nodes
      .filter((n) => !(n.parents || []).length)
      .sort((a, b) => (a.y || 0) - (b.y || 0) || (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title), 'zh'));
    const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(roots.length))));
    roots.forEach((n, i) => {
      moveSubtree(p, n.id, 80 + (i % cols) * GAP_X, 80 + Math.floor(i / cols) * GAP_Y);
    });
  }

  function tidySubtree(p, rootId, seen) {
    const guard = seen || new Set();
    if (guard.has(rootId)) return;
    guard.add(rootId);
    const root = p.nodes.find((n) => n.id === rootId);
    if (!root) return;
    const kids = primaryKids(p, rootId);
    const count = kids.length;
    kids.forEach((k, i) => {
      const ty = Math.round(root.y + (i - (count - 1) / 2) * GAP_Y);
      moveSubtree(p, k.id, root.x + GAP_X, ty);
    });
    kids.forEach((k) => tidySubtree(p, k.id, guard));
  }

  function aggregate(p, ids) {
    const list = (ids && ids.length ? ids : selectedIds()).filter((id) => p.nodes.some((n) => n.id === id));
    if (!list.length) { U.toast('先选中要聚合的节点', 'info'); return; }
    snapshotPositions(p, null);
    const selected = list.map((id) => p.nodes.find((n) => n.id === id)).filter(Boolean);
    const parents = new Set();
    let hasRoot = false;
    selected.forEach((n) => {
      const par = (n.parents || []).map((pid) => p.nodes.find((x) => x.id === pid)).find(Boolean);
      if (par) parents.add(par.id); else hasRoot = true;
    });
    if (hasRoot) tidyRoots(p);
    parents.forEach((pid) => tidyBranch(p, pid));
    selected.forEach((n) => tidySubtree(p, n.id));
    S.save();
    renderNodes(p); renderWires(p); updateMini(p);
    U.toast('已聚合到默认位置，可用「恢复聚合前位置」撤回', 'layers');
  }

  function treeOrder(p) {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const seen = new Set();
    const order = [];
    const roots = p.nodes.filter((n) => !(n.parents || []).some((x) => byId.has(x)));
    const queue = roots.slice();
    while (queue.length) {
      const n = queue.shift();
      if (!n || seen.has(n.id)) continue;
      seen.add(n.id);
      order.push(n);
      primaryKids(p, n.id).forEach((k) => { if (!seen.has(k.id)) queue.push(k); });
    }
    p.nodes.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); order.push(n); } });
    return order;
  }

  function layoutTree(p) {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const indeg = new Map(p.nodes.map((n) => [n.id, 0]));
    p.nodes.forEach((n) => (n.parents || []).forEach((pid) => { if (byId.has(pid)) indeg.set(n.id, (indeg.get(n.id) || 0) + 1); }));
    const depth = new Map();
    const queue = p.nodes.filter((n) => !(n.parents || []).some((x) => byId.has(x)));
    queue.forEach((n) => depth.set(n.id, 0));
    let guard = 0;
    while (queue.length && guard++ < 5000) {
      const n = queue.shift();
      const d = depth.get(n.id) || 0;
      p.nodes.forEach((c) => {
        if ((c.parents || []).indexOf(n.id) > -1) {
          depth.set(c.id, Math.max(depth.get(c.id) || 0, d + 1));
          indeg.set(c.id, (indeg.get(c.id) || 0) - 1);
          if (indeg.get(c.id) <= 0) queue.push(c);
        }
      });
    }
    p.nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 0); });
    const rows = {};
    p.nodes.forEach((n) => {
      const d = depth.get(n.id);
      rows[d] = (rows[d] || 0) + 1;
      n.x = 80 + d * GAP_X;
      n.y = 80 + (rows[d] - 1) * GAP_Y;
    });
  }

  function layoutPlanar(p) {
    const ordered = treeOrder(p);
    const count = Math.max(1, ordered.length);
    const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.7)));
    ordered.forEach((n, i) => {
      n.x = 80 + (i % cols) * GAP_X;
      n.y = 80 + Math.floor(i / cols) * GAP_Y;
    });
  }

  function autoLayout(p, mode) {
    const m = mode === 'planar' ? 'planar' : 'tree';
    snapshotPositions(p, null);
    if (m === 'planar') layoutPlanar(p); else layoutTree(p);
    S.save();
    renderNodes(p); renderWires(p); updateMini(p);
    setTimeout(() => fit(p), 50);
    U.toast(m === 'planar' ? '已切换为平面俯瞰布局' : '已按层级树聚合到默认位置', 'layout');
  }

  function refresh(p, sharedState) {
    if (!window.Outline.live || !view.wrap || !p) return;
    if (view.pid !== p.id) {
      view.undo = null;
      view.hiddenIds = new Set();
      view.pinFocus = new Set();
      loadOutlineUI(p);
      view.selIds = new Set();
      view.selId = null;
    }
    view.pid = p.id;
    const wanted = sharedState ? sharedState.selNode : null;
    if (sharedState) {
      if (wanted) {
        if (!view.selIds.has(wanted)) view.selIds = new Set([wanted]);
        view.selId = wanted;
      } else {
        view.selIds.clear();
        view.selId = null;
      }
    }
    renderNodes(p);
    renderWires(p);
    updateMini(p);
    updateSelBar();
  }

  function updateMini(p) {
    const mini = $('#cvMini');
    if (!mini || !p || !p.nodes.length || !view.wrap) { if (mini) mini.innerHTML = ''; return; }
    const focus = focusSet(p);
    const nodes = p.nodes.filter((n) => nodeVisible(p, n, focus));
    if (!nodes.length) { mini.innerHTML = ''; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + 92);
    });
    const pad = 60;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const sw = mini.clientWidth || 132, sh = mini.clientHeight || 84;
    const scale = Math.min(sw / (maxX - minX), sh / (maxY - minY));
    const ox = (sw - (maxX - minX) * scale) / 2, oy = (sh - (maxY - minY) * scale) / 2;
    let h = '';
    nodes.forEach((n) => {
      const c = n.color || '#8A9099';
      h += '<i style="left:' + (ox + (n.x - minX) * scale) + 'px;top:' + (oy + (n.y - minY) * scale) + 'px;width:' + Math.max(3, NODE_W * scale) + 'px;height:' + Math.max(2, 26 * scale) + 'px;background:' + c + '"></i>';
    });
    const r = view.wrap.getBoundingClientRect();
    const vx = (ox + ((-view.panX / view.zoom) - minX) * scale);
    const vy = (oy + ((-view.panY / view.zoom) - minY) * scale);
    const vw = (r.width / view.zoom) * scale, vh = (r.height / view.zoom) * scale;
    h += '<i class="vp" style="left:' + vx + 'px;top:' + vy + 'px;width:' + vw + 'px;height:' + vh + 'px"></i>';
    mini.innerHTML = h;
  }

  window.Outline = {
    live: false,
    render, refresh, fit, centerOn, focusNode, markSelected, select, clearSelection,
    autoLayout, aggregate, restorePositions, setWireMode, togglePins, toggleMulti,
    closeMenu: closeNodeMenu, openNodeMenu
  };
})();
