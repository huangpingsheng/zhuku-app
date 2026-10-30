/* ============================================================
   focus-cursor.js · 写作光标（行级 / 段落聚焦）
   行级：用磨砂遮罩盖住当前行上下的内容，正文不改一个字符。
   段落：保留原来的整段聚焦方式。
   ============================================================ */
(function () {
  'use strict';
  const root = document.documentElement;
  const KEY = 'focusCursor';
  const DEFAULTS = { enabled: false, mode: 'line', lines: 1, dim: 22, blur: 2.2, duration: 220 };

  function lsGet() {
    try {
      const raw = localStorage.getItem('ws.' + KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function lsSet(value) {
    try { localStorage.setItem('ws.' + KEY, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
  }

  const state = Object.assign({}, DEFAULTS, lsGet());
  state.mode = state.mode === 'para' ? 'para' : 'line';
  state.lines = clamp(state.lines, 1, 5);
  state.dim = clamp(state.dim, 4, 80);
  state.blur = clamp(state.blur, 0, 8);
  state.duration = clamp(state.duration, 60, 600);

  let lastEditor = null;
  let lastBlock = null;
  let raf = 0;
  let masks = null;

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function editorSelector() {
    return '#immBody, #readerBody, [data-edbody], [data-fc-demo]';
  }

  function isEditor(el) {
    return !!el && el.nodeType === 1 && el.isContentEditable && el.matches(editorSelector());
  }

  function activeEditor() {
    const el = document.activeElement;
    if (isEditor(el)) return el;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node = sel.getRangeAt(0).startContainer;
    while (node && node !== document) {
      if (isEditor(node)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function blockOf(editor) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (node === editor) node = editor.childNodes[range.startOffset] || null;
    while (node && node.parentNode !== editor) node = node.parentNode;
    return node && node.nodeType === 1 ? node : null;
  }

  function hideLineMasks() {
    if (masks) masks.hidden = true;
  }

  function clearBlockMarks() {
    document.querySelectorAll('[data-fc-on]').forEach((el) => el.removeAttribute('data-fc-on'));
    lastBlock = null;
  }

  function clearMarks() {
    document.querySelectorAll('.fc-scope').forEach((el) => el.classList.remove('fc-scope'));
    clearBlockMarks();
    hideLineMasks();
    lastEditor = null;
  }

  function primeDemo() {
    if (state.mode !== 'para') return false;
    const demo = document.querySelector('[data-fc-demo]');
    if (!demo) return false;
    demo.classList.add('fc-scope');
    const block = demo.querySelector('[data-fc-on="1"]') || demo.firstElementChild;
    if (!block) return false;
    block.setAttribute('data-fc-on', '1');
    lastEditor = demo;
    lastBlock = block;
    return true;
  }

  function markBlock(editor) {
    const block = blockOf(editor);
    if (!block) { clearBlockMarks(); return; }
    if (block !== lastBlock) {
      clearBlockMarks();
      block.setAttribute('data-fc-on', '1');
      lastBlock = block;
    }
  }

  function ensureMasks() {
    if (masks && masks.isConnected) return masks;
    masks = document.createElement('div');
    masks.className = 'fc-line-masks';
    masks.setAttribute('aria-hidden', 'true');
    masks.innerHTML = '<div class="fc-cover fc-cover-top"></div><div class="fc-cover fc-cover-bottom"></div><div class="fc-line-band"></div>';
    document.body.appendChild(masks);
    return masks;
  }

  function setBox(el, left, top, width, height) {
    if (!el) return;
    if (width <= 0 || height <= 0) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
    el.style.width = Math.round(width) + 'px';
    el.style.height = Math.round(height) + 'px';
  }

  function caretLineRect(editor, range) {
    let caret = range.getBoundingClientRect();
    if (!caret || (!caret.height && !caret.width)) {
      const rects = range.getClientRects();
      caret = rects && rects.length ? rects[0] : null;
    }
    let block = range.startContainer;
    if (block && block.nodeType !== 1) block = block.parentElement;
    while (block && block !== editor && block.parentElement !== editor) block = block.parentElement;
    if (!block) block = editor;
    let rects = [];
    try {
      const r = document.createRange();
      r.selectNodeContents(block);
      rects = Array.from(r.getClientRects()).filter((x) => x.height > 0);
    } catch (e) { /* 忽略 */ }
    if (!rects.length) return caret && caret.height ? { top: caret.top, height: caret.height } : null;
    const cy = caret && caret.height ? caret.top + caret.height / 2 : (caret ? caret.top + 1 : null);
    if (cy == null) return { top: rects[0].top, height: rects[0].height };
    let best = rects[0];
    let bestD = Infinity;
    for (const r of rects) {
      const d = cy < r.top ? r.top - cy : (cy > r.bottom ? cy - r.bottom : 0);
      if (d < bestD) { bestD = d; best = r; }
      if (d === 0) break;
    }
    const style = window.getComputedStyle(block);
    const cssLine = parseFloat(style.lineHeight);
    const glyphH = best.height || 24;
    const lineH = Number.isFinite(cssLine) && cssLine > 0 ? Math.max(glyphH, cssLine) : glyphH;
    return { top: best.top - (lineH - glyphH) / 2, height: lineH };
  }

  function drawLineMasks(editor) {
    const m = ensureMasks();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { m.hidden = true; return; }
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer)) { m.hidden = true; return; }
    const rect = editor.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 12) { m.hidden = true; return; }
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
      m.hidden = true;
      return;
    }
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    if (bottom - top < 8) { m.hidden = true; return; }

    let bandTop;
    let bandBottom;
    let bandLeft;
    let bandRight;
    if (!range.collapsed) {
      const r = range.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) { m.hidden = true; return; }
      bandTop = r.top;
      bandBottom = r.bottom;
      bandLeft = r.left - 6;
      bandRight = r.right + 6;
    } else {
      const line = caretLineRect(editor, range);
      if (!line) { m.hidden = true; return; }
      const lineH = line.height || 24;
      bandTop = line.top;
      bandBottom = line.top + lineH * state.lines;
      bandLeft = left + 8;
      bandRight = right - 8;
    }
    if (bandBottom <= top || bandTop >= bottom) { m.hidden = true; return; }
    bandTop = Math.max(top, Math.min(bottom, bandTop - 2));
    bandBottom = Math.max(bandTop, Math.min(bottom, bandBottom + 2));
    bandLeft = Math.max(left, Math.min(right, bandLeft));
    bandRight = Math.max(bandLeft, Math.min(right, bandRight));

    m.hidden = false;
    setBox(m.querySelector('.fc-cover-top'), left, top, right - left, bandTop - top);
    setBox(m.querySelector('.fc-cover-bottom'), left, bandBottom, right - left, bottom - bandBottom);
    setBox(m.querySelector('.fc-line-band'), bandLeft - 2, bandTop, Math.max(18, bandRight - bandLeft + 4), bandBottom - bandTop);
  }

  function mark() {
    raf = 0;
    if (!state.enabled) { clearMarks(); return; }
    const editor = activeEditor();
    if (!editor || !editor.isConnected) {
      if (state.mode === 'para' && primeDemo()) { hideLineMasks(); return; }
      clearMarks();
      return;
    }
    if (editor !== lastEditor) {
      if (lastEditor) lastEditor.classList.remove('fc-scope');
      lastEditor = editor;
      editor.classList.add('fc-scope');
      lastBlock = null;
      clearBlockMarks();
    }
    if (state.mode === 'para') {
      hideLineMasks();
      markBlock(editor);
    } else {
      clearBlockMarks();
      drawLineMasks(editor);
    }
  }

  function schedule() {
    if (raf) return;
    raf = setTimeout(mark, 16);
  }

  function applyVars() {
    root.style.setProperty('--fc-dim', String(state.dim / 100));
    root.style.setProperty('--fc-blur', state.blur + 'px');
    root.style.setProperty('--fc-dur', state.duration + 'ms');
  }

  function applyMode() {
    root.classList.toggle('fc-on', !!state.enabled);
    root.classList.toggle('fc-mode-line', state.mode !== 'para');
    root.classList.toggle('fc-mode-para', state.mode === 'para');
    document.body.classList.toggle('fc-enabled', !!state.enabled);
  }

  function apply(persist) {
    applyVars();
    applyMode();
    if (!state.enabled) clearMarks();
    else schedule();
    if (persist !== false) lsSet(state);
    document.dispatchEvent(new CustomEvent('focuscursor:change', { detail: snapshot() }));
  }

  function snapshot() {
    return {
      enabled: !!state.enabled,
      mode: state.mode,
      lines: state.lines,
      dim: state.dim,
      blur: state.blur,
      duration: state.duration
    };
  }

  function set(patch, options) {
    const opts = options || {};
    const before = state.mode + ':' + state.lines;
    if (patch && typeof patch === 'object') {
      if ('enabled' in patch) state.enabled = !!patch.enabled;
      if ('mode' in patch) state.mode = patch.mode === 'para' ? 'para' : 'line';
      if ('lines' in patch) state.lines = Math.round(clamp(patch.lines, 1, 5));
      if ('dim' in patch) state.dim = clamp(patch.dim, 4, 80);
      if ('blur' in patch) state.blur = clamp(patch.blur, 0, 8);
      if ('duration' in patch) state.duration = clamp(patch.duration, 60, 600);
    }
    if (before !== state.mode + ':' + state.lines) {
      clearBlockMarks();
      hideLineMasks();
    }
    apply(opts.persist);
    return snapshot();
  }

  function reset() {
    Object.assign(state, DEFAULTS);
    clearMarks();
    apply(true);
    return snapshot();
  }

  function toggle(force) {
    return set({ enabled: force == null ? !state.enabled : !!force });
  }

  function previewHtml() {
    return '<div class="fc-demo" contenteditable="true" spellcheck="false" data-fc-demo="1">' +
      '<p>光标停在哪一行，哪一行就清晰起来。</p>' +
      '<p>按行聚焦时，当前行上下会像磨砂玻璃一样退到背景里，正文本身不会被改动。</p>' +
      '<p>把「聚焦行数」调到 2，当前行和下一行都会保持清晰；切到「整段」就回到段落聚焦。</p>' +
      '<p>这里是调试区，点一行、换行、滚动，或者选中几句话试试。</p>' +
      '</div>';
  }

  function init() {
    applyVars();
    applyMode();
    document.body.classList.add('fc-ready');

    document.addEventListener('selectionchange', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', () => {
      setTimeout(schedule, 20);
    });
    document.addEventListener('input', schedule);
    window.addEventListener('scroll', () => { if (state.enabled) schedule(); }, true);
    window.addEventListener('resize', schedule);
    if (state.enabled) schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.FocusCursor = {
    get state() { return snapshot(); },
    set,
    reset,
    toggle,
    refresh: schedule,
    previewHtml
  };
})();
