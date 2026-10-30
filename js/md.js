/* ============================================================
   md.js · Markdown → HTML（与 6.3.1 服务端同一套规则）
   供浏览器内建篇、保存、修订预览使用。
   ============================================================ */
(function () {
  'use strict';
  if (window.WBMd) return;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHref(value) {
    const url = String(value || '').trim();
    if (!/^(https?:|mailto:|#|\/)/i.test(url)) return '';
    return url.replace(/"/g, '%22').replace(/'/g, '%27');
  }

  function inlineMd(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, href) => {
      const url = safeHref(href);
      return url ? '<img alt="' + alt + '" src="' + url + '">' : alt;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      const url = safeHref(href);
      return url ? '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>' : label;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return out;
  }

  function stripTitle(markdown) {
    return String(markdown || '').replace(/^\s*#\s+.*(?:\n+|$)/, '');
  }

  function mdToHtml(markdown, title) {
    let text = String(markdown || '').replace(/\r\n/g, '\n');
    text = stripTitle(text);
    if (title) {
      const first = text.match(/^\s*#\s+(.+)(?:\n+|$)/);
      if (first && first[1].trim() === String(title).trim()) text = text.slice(first[0].length);
    }
    const lines = text.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i += 1; continue; }

      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        const buf = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i += 1;
        out.push('<pre><code' + (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') + '>' +
          escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        out.push('<h' + level + '>' + inlineMd(heading[2].trim()) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ''));
          i += 1;
        }
        const inner = buf.map((item) => inlineMd(item)).join('<br>');
        if (inner.trim()) out.push('<blockquote><p>' + inner + '</p></blockquote>');
        continue;
      }

      const listMark = line.match(/^\s*([-*+]|\d+[.)])\s+/);
      if (listMark) {
        const ordered = /\d/.test(listMark[1]);
        const items = [];
        while (i < lines.length) {
          const next = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
          if (!next) break;
          items.push(next[2]);
          i += 1;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map((item) => '<li>' + inlineMd(item) + '</li>').join('') + '</' + tag + '>');
        continue;
      }

      const buf = [];
      while (i < lines.length && lines[i].trim()
        && !/^```/.test(lines[i])
        && !/^(#{1,6})\s+/.test(lines[i])
        && !/^\s*>/.test(lines[i])
        && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (buf.length) out.push('<p>' + buf.map((item) => inlineMd(item)).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  function plainOfMarkdown(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textOfMarkdown(markdown) {
    return plainOfMarkdown(stripTitle(markdown));
  }

  window.WBMd = { escapeHtml, safeHref, inlineMd, stripTitle, mdToHtml, plainOfMarkdown, textOfMarkdown };
})();
