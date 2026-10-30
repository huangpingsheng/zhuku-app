/* ============================================================
   timeline.js · 时间线（弓字形 / 拖拽排序 / 连线）
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$;
  const S = window.Store, NT = window.NODE_TYPES;
  let tlZoom = 1;
  let dragId = null;

  function render(host, p, shared) {
    window.Outline.live = false;
    const items = p.nodes.filter((n) => n.time && n.time.trim()).slice().sort((a, b) => a.order - b.order);
    let h = '<div class="tl-wrap"><div class="tl-head"><div><h2>时间线</h2>' +
      '<div class="sub">' + (items.length ? items.length + ' 个时间点 · 拖动卡片可调整先后' : '给节点填上「时间点」，它就会出现在这里') + '</div></div><span class="grow"></span>' +
      '<button class="btn sm" data-tl="fit">适应宽度</button></div>';
    if (!items.length) {
      h += '<div class="tl-empty"><b>时间线还是空的</b>在大纲里选中一个章节，在右侧属性面板填上「时间点」；<br>或双击时间线卡片上的序号来排序。填好后会自动排成一条弓字形的线。</div></div>';
      host.innerHTML = h;
      bindBasic(host, p, shared);
      return;
    }
    h += '<div class="tl-zoom" id="tlZoom" style="transform:scale(' + tlZoom + ')"><div class="tl-rows" id="tlRows">';
    const perRow = window.innerWidth < 700 ? 2 : window.innerWidth < 1100 ? 3 : 4;
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
    rows.forEach((row, ri) => {
      h += '<div class="tl-row' + (ri % 2 ? ' rev' : '') + '">';
      row.forEach((n) => {
        const type = NT[n.type] || NT.ch;
        h += '<div class="tl-card" data-tlcard="' + n.id + '" draggable="true" style="--nc:' + (n.color || type.color) + '">' +
          '<span class="tl-no" title="点击修改序号">' + (items.indexOf(n) + 1) + '</span>' +
          '<div class="tl-time">' + U.icon('clock') + U.esc(n.time) + '</div>' +
          '<div class="tl-title">' + U.esc(n.title) + '</div>' +
          '<div class="tl-meta"><span>' + type.label + '</span><span>' + (S.nodeWords(n) ? U.fmt(S.nodeWords(n)) + ' 字' : '未写') + '</span></div></div>';
      });
      h += '</div>';
    });
    h += '</div><svg class="tl-conn" id="tlConn"></svg></div></div>';
    host.innerHTML = h;
    drawConnections(items);
    bindBasic(host, p, shared);
    bindCards(host, p, shared, items);
    setTimeout(() => drawConnections(items), 60);
  }

  function bindBasic(host, p, shared) {
    const fit = host.querySelector('[data-tl="fit"]');
    if (fit) fit.onclick = () => { tlZoom = 1; const el = $('#tlZoom'); if (el) el.style.transform = 'scale(1)'; drawConnections(currentItems(p)); };
  }

  function currentItems(p) {
    return p.nodes.filter((n) => n.time && n.time.trim()).slice().sort((a, b) => a.order - b.order);
  }

  function drawConnections(items) {
    const rows = $('#tlRows'), svg = $('#tlConn');
    if (!rows || !svg) return;
    const rr = rows.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + rows.scrollWidth + ' ' + rows.scrollHeight);
    svg.style.width = rows.scrollWidth + 'px';
    svg.style.height = rows.scrollHeight + 'px';
    let d = '';
    const cards = items.map((n) => $('#tlRows [data-tlcard="' + n.id + '"]')).filter(Boolean);
    for (let i = 0; i < cards.length - 1; i++) {
      const a = cards[i].getBoundingClientRect(), b = cards[i + 1].getBoundingClientRect();
      const x1 = a.right - rr.left + rows.scrollLeft, y1 = a.top + a.height / 2 - rr.top + rows.scrollTop;
      const x2 = b.left - rr.left + rows.scrollLeft, y2 = b.top + b.height / 2 - rr.top + rows.scrollTop;
      const dx = Math.max(30, Math.abs(x2 - x1) * 0.4);
      d += 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2 + ' ';
    }
    svg.innerHTML = '<defs><linearGradient id="tlGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2E4BFF"/><stop offset=".55" stop-color="#8B5CF6"/><stop offset="1" stop-color="#4E8F7C"/></linearGradient></defs><path d="' + d + '" fill="none" stroke="url(#tlGrad)" stroke-width="1.8" opacity=".55"/>';
  }

  function bindCards(host, p, shared, items) {
    host.querySelectorAll('[data-tlcard]').forEach((card) => {
      const id = card.getAttribute('data-tlcard');
      const n = p.nodes.find((x) => x.id === id);
      card.addEventListener('click', (e) => {
        if (e.target.closest('.tl-no')) return;
        window.Writer.selectNode(id);
        preview(n, p);
      });
      card.querySelector('.tl-no').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = items.indexOf(n) + 1;
        U.promptModal({ title: '调整顺序', label: '序号（1 – ' + items.length + '）', value: String(idx), okText: '调整' }).then((v) => {
          const num = parseInt(v, 10);
          if (!num || num < 1 || num > items.length) return;
          reorder(items, n, num - 1, p);
        });
      });
      card.addEventListener('dragstart', (e) => {
        dragId = id;
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => { dragId = null; card.classList.remove('dragging'); host.querySelectorAll('.dragover').forEach((x) => x.classList.remove('dragover')); });
      card.addEventListener('dragover', (e) => {
        if (!dragId || dragId === id) return;
        e.preventDefault();
        card.classList.add('dragover');
      });
      card.addEventListener('dragleave', () => card.classList.remove('dragover'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('dragover');
        if (!dragId || dragId === id) return;
        const from = items.findIndex((x) => x.id === dragId);
        const to = items.findIndex((x) => x.id === id);
        if (from < 0 || to < 0) return;
        const seq = items.slice();
        const [moved] = seq.splice(from, 1);
        seq.splice(to, 0, moved);
        seq.forEach((x, i) => { x.order = i + 1; });
        S.save();
        render(host, p, shared);
        window.Writer.updateStats();
        U.toast('顺序已调整');
      });
    });
  }

  function reorder(items, n, index, p) {
    const seq = items.filter((x) => x.id !== n.id);
    seq.splice(index, 0, n);
    seq.forEach((x, i) => { x.order = i + 1; });
    S.save();
    const host = $('#wView');
    render(host, p, window.Writer.state);
    window.Writer.updateStats();
    U.toast('顺序已调整');
  }

  function preview(n, p) {
    const type = NT[n.type] || NT.ch;
    const plain = U.htmlToText(n.body || '');
    const m = U.openModal(
      '<div class="modal-head"><div><h3>' + U.esc(n.title) + '</h3><p>' + type.label + ' · ' + U.esc(n.time || '') + ' · ' + (S.nodeWords(n) ? U.fmt(S.nodeWords(n)) + ' 字' : '未写') + '</p></div>' +
      '<button class="icon-btn sm" data-x>' + U.icon('x') + '</button></div>' +
      '<div class="modal-body" style="font-size:13px;line-height:1.8;color:var(--ink-2);white-space:pre-wrap">' + U.esc(plain.slice(0, 600) || '这一章还没有内容。') + '</div>' +
      '<div class="modal-foot"><div class="foot-actions"><button class="btn ghost" data-cancel>关闭</button>' +
      '<button class="btn primary" data-edit>' + U.icon('pen') + '进入写作</button></div></div>', 'wide');
    m.box.querySelector('[data-x]').onclick = m.close;
    m.box.querySelector('[data-cancel]').onclick = m.close;
    m.box.querySelector('[data-edit]').onclick = () => { m.close(); window.Editor.openNode(n.id); };
  }

  window.Timeline = { render, drawConnections };
})();
