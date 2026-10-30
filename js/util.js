/* ============================================================
   util.js · DOM / 图标 / 主题 / 弹层 / 文本工具
   ============================================================ */
(function () {
  'use strict';
  const W = window;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronUp: '<path d="m6 15 6-6 6 6"/>',
    star: '<path d="m12 3.6 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8Z"/>',
    starFill: '<path d="m12 3.6 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8Z" fill="currentColor"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    book: '<path d="M4 19.5V6a2 2 0 0 1 2-2h9l5 5v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 4v6h6"/>',
    bookOpen: '<path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2Z"/><path d="M12 6.5v13"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    feather: '<path d="M20.2 3.8a6 6 0 0 0-8.5 0L4 11.5V20h8.5l7.7-7.7a6 6 0 0 0 0-8.5Z"/><path d="M16 8 4 20"/><path d="M17.5 12H9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    folder: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h4l2 2.5h5A2.5 2.5 0 0 1 20 10v7.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z"/>',
    file: '<path d="M6 3.5h7l5 5v12H6z"/><path d="M13 3.5v5h5"/>',
    doc: '<path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8Z"/><path d="M14 3.5V8h4.5"/><path d="M9 12h6M9 15.5h6"/>',
    scene: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M9 9v10"/>',
    note: '<path d="M5 4.5h14v11l-4 4H5z"/><path d="M15 19.5v-4h4"/><path d="M8.5 9h7M8.5 12.5h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
    layout: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15M15 4.5v15"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4.5V11h-6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
    upload: '<path d="M12 16V5"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M5 19.5h14"/>',
    cloud: '<path d="M7.5 18.5A4.5 4.5 0 0 1 7 9.6 6 6 0 0 1 18.7 11a4 4 0 0 1-.7 7.5Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5"/><path d="M10 10v6M14 10v6"/>',
    link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
    pin: '<path d="M9 3.5h6l-1 6 3.5 3.5H6.5L10 9.5Z"/><path d="M12 13v7.5"/>',
    pinFill: '<path d="M9 3.5h6l-1 6 3.5 3.5H6.5L10 9.5Z" fill="currentColor"/><path d="M12 13v7.5"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    tree: '<rect x="4" y="3.5" width="7" height="5" rx="1.5"/><rect x="13" y="15.5" width="7" height="5" rx="1.5"/><rect x="4" y="15.5" width="7" height="5" rx="1.5"/><path d="M7.5 8.5v7M17 15.5v-3.5H7.5"/>',
    sparkles: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9ZM5 3l.7 1.8L7.5 5.5l-1.8.7L5 8l-.7-1.8L2.5 5.5l1.8-.7Z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M11 8.5v5M8.5 11h5"/>',
    zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8.5 11h5"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    filter: '<path d="M3.5 5.5h17l-6.5 7.5v5l-4 2v-7Z"/>',
    arrowLeft: '<path d="M15 5l-7 7 7 7"/>',
    arrowRight: '<path d="M9 5l7 7-7 7"/>',
    arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4.5 17 5-5 4 4 3-3 4 4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    mapPin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    gem: '<path d="m7 4 5-1.5L17 4l3.5 5L12 20.5 3.5 9Z"/><path d="M3.5 9h17M9.5 9 12 20.5 14.5 9M7 4l2.5 5M17 4l-2.5 5"/>',
    quill: '<path d="M20 4c-6 0-11 4.5-13 11l-2 5 5-2C16 15.5 20 10.5 20 4Z"/><path d="M4 20 12 12"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V10H9"/><path d="M12 8v4.5l3 1.7"/>',
    grip: '<circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
    wifiOff: '<path d="m2 2 20 20"/><path d="M8.5 8.5a10 10 0 0 1 11 2M5 12a10 10 0 0 1 2-1.5M12 18h.01M8.5 15.5a4.5 4.5 0 0 1 5.5-.5"/>',
    bold: '<path d="M7 4.5h6a4 4 0 0 1 0 8H7Z"/><path d="M7 12.5h6.5a4 4 0 0 1 0 8H7Z"/>',
    italic: '<path d="M10 4.5h8M6 19.5h8M14.5 4.5l-5 15"/>',
    underline: '<path d="M6.5 4.5v6a5.5 5.5 0 0 0 11 0v-6"/><path d="M4.5 20.5h15"/>',
    quote: '<path d="M9.5 6.5A4 4 0 0 0 6 10.5v7h5v-5H8.5a1 1 0 0 1 1-1 3 3 0 0 0 0-5ZM18.5 6.5A4 4 0 0 0 15 10.5v7h5v-5h-2.5a1 1 0 0 1 1-1 3 3 0 0 0 0-5Z"/>',
    ul: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    ol: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4 6.5h1v4M3.7 10.5H5M3.7 14h2l-2 3.5h2"/>',
    undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2"/>',
    redo: '<path d="m15 7 4.5 4.5L15 16"/><path d="M19.5 11.5H10a5.5 5.5 0 0 0 0 11h2"/>',
    save: '<path d="M5 4.5h11l3 3v12H5z"/><path d="M8 4.5V9h7V4.5M8 19.5v-6h8v6"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v5.5H4.5V6H10"/>',
    cube: '<path d="m12 2.5 8 4.5v10l-8 4.5-8-4.5V7Z"/><path d="m4 7 8 4.5L20 7M12 11.5v10"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 4 2.8 20h18.4Z"/><path d="M12 10v4M12 17h.01"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 2-2 0-1.5 1-2 2-2h2a2.5 2.5 0 0 0 2.5-2.5A8.5 8.5 0 0 0 12 3.5Z"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/><circle cx="16" cy="10" r="1" fill="currentColor"/>',
    type: '<path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6"/>',
    layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5Z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    chart: '<path d="M4 20V4M4 20h16"/><rect x="7.5" y="12" width="3" height="5" rx="1"/><rect x="12.5" y="8.5" width="3" height="8.5" rx="1"/><rect x="17" y="5.5" width="3" height="11.5" rx="1"/>',
    pie: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12Z"/><path d="M14.5 3.8A8.5 8.5 0 0 1 20.2 9.5H14.5Z"/>',
    gitBranch: '<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 7.2v9.6M18 11.2c0 3.4-2.5 5.6-6 5.6H6"/>',
    flame: '<path d="M12 21c4 0 6.5-2.5 6.5-6 0-4.5-4-6.5-4.5-11-2 2.5-3 4.5-3 7-1-.7-1.7-2-2-3.5-1.3 2-3.5 4-3.5 7.5 0 3.5 2.5 6 6.5 6Z"/>',
    activity: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.8 5 2.8-1.5-7"/>',
    commit: '<circle cx="12" cy="12" r="3.2"/><path d="M2.5 12h6.3M15.2 12h6.3"/>'
  };

  function icon(name, cls) {
    const body = ICONS[name] || ICONS.circle;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' + (cls ? ' class="' + cls + '"' : '') + '>' + body + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t;
    const d = function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
    d.cancel = () => clearTimeout(t);
    d.flush = function () { clearTimeout(t); fn.apply(this, arguments); };
    return d;
  }

  function fmt(n) {
    n = Number(n) || 0;
    return n.toLocaleString('en-US');
  }

  const CJK = /[\u3400-\u9FFF\uF900-\uFAFF]/;
  function countWords(text) {
    if (!text) return 0;
    text = String(text).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    if (!text) return 0;
    const cjk = (text.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length;
    const latin = (text.replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
    return cjk + latin;
  }

  let _uid = 0;
  function uid(prefix) {
    _uid += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + _uid.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function todayKey(d) {
    const x = d ? new Date(d) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }

  function relTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
    if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function textToHtml(text) {
    if (!text) return '';
    return String(text).split(/\n{2,}/).map((chunk) => {
      chunk = chunk.replace(/^\n+|\n+$/g, '');
      if (!chunk) return '';
      if (/^###\s+/.test(chunk)) return '<h3>' + esc(chunk.replace(/^###\s+/, '')) + '</h3>';
      if (/^##\s+/.test(chunk)) return '<h2>' + esc(chunk.replace(/^##\s+/, '')) + '</h2>';
      if (/^>\s?/.test(chunk)) return '<blockquote>' + esc(chunk.replace(/^>\s?/gm, '')) + '</blockquote>';
      return '<p>' + chunk.split('\n').map(esc).join('<br>') + '</p>';
    }).join('');
  }

  function htmlToText(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('p,div,h1,h2,h3,h4,li,blockquote,br').forEach((el) => {
      if (el.tagName === 'BR') el.replaceWith('\n');
      else el.appendChild(document.createTextNode('\n'));
    });
    return (tmp.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function inlineMd(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { out += '\n'; return; }
      if (tag === 'img') {
        const src = n.getAttribute('src') || '';
        if (src) out += '![' + (n.getAttribute('alt') || '') + '](' + src + ')';
        return;
      }
      const inner = inlineMd(n);
      if (tag === 'strong' || tag === 'b') out += '**' + inner + '**';
      else if (tag === 'em' || tag === 'i') out += '*' + inner + '*';
      else if (tag === 'u') out += '<u>' + inner + '</u>';
      else if (tag === 'del' || tag === 's' || tag === 'strike') out += '~~' + inner + '~~';
      else if (tag === 'code') out += '`' + inner + '`';
      else if (tag === 'a') out += '[' + inner + '](' + (n.getAttribute('href') || '') + ')';
      else out += inner;
    });
    return out;
  }

  const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'figure', 'figcaption', 'li', 'pre', 'blockquote', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table']);

  function listMd(el, ordered, depth) {
    const rows = [];
    Array.from(el.children).forEach((li, i) => {
      if (li.tagName.toLowerCase() !== 'li') return;
      const nested = [];
      let text = '';
      li.childNodes.forEach((n) => {
        if (n.nodeType === 1 && /^(ul|ol)$/i.test(n.tagName)) nested.push(n);
        else if (n.nodeType === 3) text += n.nodeValue;
        else if (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName.toLowerCase())) text += '\n' + inlineMd(n);
        else text += inlineMd(n);
      });
      const pad = '  '.repeat(depth);
      rows.push(pad + (ordered ? (i + 1) + '. ' : '- ') + text.replace(/\s+/g, ' ').trim());
      nested.forEach((sub) => {
        rows.push(listMd(sub, sub.tagName.toLowerCase() === 'ol', depth + 1));
      });
    });
    return rows.filter(Boolean).join('\n');
  }

  function tableMd(el) {
    const rows = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((cell) => inlineMd(cell).replace(/\|/g, '\\|').trim()));
    if (!rows.length) return '';
    const width = Math.max.apply(null, rows.map((r) => r.length));
    const pad = (r) => r.concat(Array(width - r.length).fill('')).join(' | ');
    const out = ['| ' + pad(rows[0]) + ' |', '| ' + Array(width).fill('---').join(' | ') + ' |'];
    rows.slice(1).forEach((r) => out.push('| ' + pad(r) + ' |'));
    return out.join('\n');
  }

  function blockMd(el) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const text = inlineMd(el).trim();
      return text ? '#'.repeat(Number(tag[1])) + ' ' + text : '';
    }
    if (tag === 'hr') return '---';
    if (tag === 'pre') {
      const code = el.textContent.replace(/\n$/, '');
      const cls = (el.querySelector('code') || el).className || '';
      const lang = (String(cls).match(/language-([\w-]+)/) || [])[1] || '';
      return '```' + lang + '\n' + code + '\n```';
    }
    if (tag === 'blockquote') {
      const text = blocksOf(el).join('\n\n');
      return text ? text.split('\n').map((line) => '> ' + line).join('\n') : '';
    }
    if (tag === 'ul' || tag === 'ol') return listMd(el, tag === 'ol', 0);
    if (tag === 'table') return tableMd(el);
    if (tag === 'figure' || tag === 'figcaption') {
      const text = blocksOf(el).join('\n\n');
      const img = el.querySelector('img');
      if (img && img.getAttribute('src')) {
        const cap = inlineMd(el).trim();
        return '![' + (img.getAttribute('alt') || cap) + '](' + img.getAttribute('src') + ')';
      }
      return text;
    }
    return blocksOf(el).join('\n\n');
  }

  function blocksOf(parent) {
    const out = [];
    let buffer = '';
    const flush = () => {
      const text = buffer
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (text) out.push(text);
      buffer = '';
    };
    parent.childNodes.forEach((n) => {
      if (n.nodeType === 3) { buffer += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (BLOCK_TAGS.has(tag)) {
        flush();
        const md = blockMd(n);
        if (md) out.push(md);
      } else {
        buffer += inlineMd(n);
      }
    });
    flush();
    return out;
  }

  function htmlToMarkdown(html) {
    if (!html) return '';
    const root = document.createElement('div');
    root.innerHTML = html;
    return blocksOf(root).filter(Boolean).join('\n\n');
  }

  function highlight(text, q) {
    const t = esc(text || '');
    if (!q) return t;
    const safe = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!safe) return t;
    try { return t.replace(new RegExp('(' + safe + ')', 'gi'), '<mark>$1</mark>'); } catch (e) { return t; }
  }

  function fuzzyScore(query, text) {
    if (!text) return 0;
    const q = query.toLowerCase(), t = String(text).toLowerCase();
    if (!q) return 1;
    const idx = t.indexOf(q);
    if (idx === 0) return 120;
    if (idx > 0) return 90 - Math.min(idx, 30);
    let qi = 0, score = 0, streak = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) { qi++; streak++; score += 2 + streak * 2; }
      else streak = 0;
    }
    return qi === q.length ? score : 0;
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    ta.remove();
    return Promise.resolve();
  }

  let toastTimer = null;
  function toast(msg, iconName) {
    const wrap = $('#toastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = icon(iconName || 'check') + '<span>' + esc(msg) + '</span>';
    wrap.appendChild(el);
    clearTimeout(toastTimer);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }, 2100);
  }

  function openModal(html, cls) {
    const ov = $('#modalOverlay'), box = $('#modalBox');
    box.className = 'modal' + (cls ? ' ' + cls : '');
    box.innerHTML = html;
    ov.hidden = false;
    return { ov, box, close: () => { ov.hidden = true; box.innerHTML = ''; } };
  }

  function confirmModal(opts) {
    return new Promise((resolve) => {
      const m = openModal(
        '<div class="modal-head"><div><h3>' + esc(opts.title || '确认') + '</h3>' +
        (opts.desc ? '<p>' + esc(opts.desc) + '</p>' : '') + '</div></div>' +
        '<div class="modal-foot"><div class="foot-actions">' +
        '<button class="btn ghost" data-cancel>取消</button>' +
        '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-ok>' + esc(opts.okText || '确认') + '</button>' +
        '</div></div>'
      );
      m.box.querySelector('[data-cancel]').onclick = () => { m.close(); resolve(false); };
      m.box.querySelector('[data-ok]').onclick = () => { m.close(); resolve(true); };
      m.ov.onclick = (e) => { if (e.target === m.ov) { m.close(); resolve(false); } };
    });
  }

  function promptModal(opts) {
    return new Promise((resolve) => {
      const multiline = !!opts.multiline;
      const field = multiline
        ? '<textarea class="input" data-val placeholder="' + esc(opts.placeholder || '') + '">' + esc(opts.value || '') + '</textarea>'
        : '<input class="input" data-val value="' + esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '">';
      const m = openModal(
        '<div class="modal-head"><div><h3>' + esc(opts.title || '输入') + '</h3>' +
        (opts.desc ? '<p>' + esc(opts.desc) + '</p>' : '') + '</div></div>' +
        '<div class="modal-body"><div class="field"><label>' + esc(opts.label || '') + '</label>' + field + '</div></div>' +
        '<div class="modal-foot"><div class="foot-actions">' +
        '<button class="btn ghost" data-cancel>取消</button>' +
        '<button class="btn primary" data-ok>' + esc(opts.okText || '确定') + '</button>' +
        '</div></div>'
      );
      const input = m.box.querySelector('[data-val]');
      setTimeout(() => { input.focus(); input.select && input.select(); }, 40);
      const done = (val) => { m.close(); resolve(val); };
      m.box.querySelector('[data-cancel]').onclick = () => done(null);
      m.box.querySelector('[data-ok]').onclick = () => done(input.value.trim());
      m.ov.onclick = (e) => { if (e.target === m.ov) done(null); };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); done(input.value.trim()); }
        if (e.key === 'Escape') done(null);
      });
    });
  }

  function isMobile() { return W.matchMedia('(max-width: 900px)').matches; }
  function isTouch() { return W.matchMedia('(hover: none)').matches; }

  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0C0D0F' : '#F7F7F4');
    const btn = $('#btnTheme'), btnW = $('#btnThemeW');
    const svg = icon(t === 'dark' ? 'sun' : 'moon');
    if (btn) btn.innerHTML = svg;
    if (btnW) btnW.innerHTML = svg;
    return t;
  }

  W.U = {
    $: $, $$: $$, icon: icon, esc: esc, debounce: debounce, fmt: fmt, countWords: countWords,
    uid: uid, clamp: clamp, todayKey: todayKey, relTime: relTime, textToHtml: textToHtml,
    htmlToText: htmlToText, htmlToMarkdown: htmlToMarkdown, highlight: highlight,
    fuzzyScore: fuzzyScore, download: download, copyText: copyText, toast: toast,
    openModal: openModal, confirmModal: confirmModal, promptModal: promptModal,
    isMobile: isMobile, isTouch: isTouch, applyTheme: applyTheme, ICONS: ICONS
  };
})();
