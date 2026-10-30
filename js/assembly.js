/* ============================================================
   assembly.js · 拼装 / 导出（Markdown / TXT / HTML）
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$;
  const S = window.Store, NT = window.NODE_TYPES;
  let dragId = null;
  let orderMode = window.lsGet('6.asmOrder', 'relation') === 'order' ? 'order' : 'relation';

  function relationSort(list) {
    const ids = new Set(list.map((n) => n.id));
    const parents = new Map();
    list.forEach((n) => {
      parents.set(n.id, new Set((n.parents || []).filter((pid) => ids.has(pid) && pid !== n.id)));
    });
    const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
    const ready = list.filter((n) => !parents.get(n.id).size).sort(byOrder);
    const out = [];
    const seen = new Set();
    while (ready.length) {
      const n = ready.shift();
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
      list.forEach((c) => {
        const set = parents.get(c.id);
        if (!set || !set.size) return;
        if (set.delete(n.id) && !set.size && !seen.has(c.id)) ready.push(c);
      });
      ready.sort(byOrder);
    }
    list.forEach((n) => { if (!seen.has(n.id)) out.push(n); });
    return out;
  }

  function orderedChapters(p, mode) {
    const list = S.sortedChapters(p);
    if (mode === 'order') return list;
    const volOf = (n) => {
      let cur = (n.parents || [])[0] ? p.nodes.find((x) => x.id === (n.parents || [])[0]) : null;
      let guard = 0;
      while (cur && guard++ < 20) {
        if (cur.type === 'vol') return cur;
        cur = (cur.parents || [])[0] ? p.nodes.find((x) => x.id === (cur.parents || [])[0]) : null;
      }
      return null;
    };
    const groups = new Map();
    const order = [];
    list.forEach((n) => {
      const vol = volOf(n);
      const key = vol ? vol.id : '__none';
      if (!groups.has(key)) { groups.set(key, { vol, items: [] }); order.push(key); }
      groups.get(key).items.push(n);
    });
    const sortedKeys = order.slice().sort((a, b) => {
      const ga = groups.get(a), gb = groups.get(b);
      return (ga.vol ? ga.vol.order || 0 : -1) - (gb.vol ? gb.vol.order || 0 : -1);
    });
    const out = [];
    sortedKeys.forEach((key) => {
      const g = groups.get(key);
      relationSort(g.items).forEach((n) => out.push(n));
    });
    return out;
  }

  function chapterGroups(p, chapters) {
    const list = chapters || S.sortedChapters(p);
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const groups = [];
    const map = new Map();
    list.forEach((n) => {
      let par = (n.parents || [])[0] ? byId.get((n.parents || [])[0]) : null;
      let vol = null, guard = 0;
      while (par && guard++ < 20) {
        if (par.type === 'vol') { vol = par; break; }
        par = (par.parents || [])[0] ? byId.get((par.parents || [])[0]) : null;
      }
      const key = vol ? vol.id : '__none';
      if (!map.has(key)) { map.set(key, { vol, items: [] }); groups.push(map.get(key)); }
      map.get(key).items.push(n);
    });
    return groups;
  }

  function render(host, p, shared) {
    window.Outline.live = false;
    const chapters = orderedChapters(p, orderMode);
    const groups = chapterGroups(p, chapters);
    const total = S.countWords(p);
    let h = '<div class="asm-wrap"><div class="asm-grid"><div class="asm-col">';
    h += '<h2>' + U.icon('layout') + '章节顺序</h2><div class="sub">' +
      (orderMode === 'relation' ? '按大纲关系拼装：先主线、后支线，同层按目录顺序' : '按目录手动顺序拼装') + '</div>';
    h += '<div class="asm-actions">' +
      '<button class="btn" data-asm="add">' + U.icon('plus') + '加一章</button>' +
      '<button class="btn" data-asm="mode">' + U.icon('link') + (orderMode === 'relation' ? '按关系' : '按顺序') + '</button>' +
      '<button class="btn" data-asm="outline">' + U.icon('tree') + '回大纲</button></div>';
    h += '<div class="asm-actions">' +
      '<button class="btn dark" data-exp="md">' + U.icon('download') + 'Markdown</button>' +
      '<button class="btn" data-exp="txt">TXT</button>' +
      '<button class="btn" data-exp="html">HTML</button></div>';
    h += '<div class="asm-book" id="asmBook">';
    if (!chapters.length) {
      h += '<div class="asm-empty">还没有章节。<br>去大纲里加一章，或点上方「加一章」。</div>';
    } else {
      groups.forEach((g) => {
        h += '<div class="asm-vol">' + U.icon('book') + (g.vol ? U.esc(g.vol.title) : '未分卷') + '<span style="margin-left:auto;font-weight:400;color:var(--ink-3)">' + g.items.length + '</span></div>';
        g.items.forEach((n) => {
          const idx = chapters.indexOf(n) + 1;
          h += '<div class="asm-item" draggable="true" data-asmitem="' + n.id + '">' +
            '<span class="grip">' + U.icon('grip') + '</span>' +
            '<span class="asm-no">' + idx + '</span>' +
            '<span class="asm-name">' + U.esc(n.title) + '</span>' +
            '<span class="asm-words">' + (S.nodeWords(n) ? U.fmt(S.nodeWords(n)) : '—') + '</span>' +
            '<button class="del" data-asmopen="' + n.id + '" title="打开">' + U.icon('pen') + '</button></div>';
        });
      });
    }
    h += '</div></div>';

    h += '<div class="asm-col"><div class="asm-preview" id="asmPreview"><h1>' + U.esc(p.name) + '</h1>' +
      '<div class="ap-meta">' + (chapters.length ? chapters.length + ' 章 · ' + U.fmt(total) + ' 字' : '尚未成书') + '</div>';
    if (!chapters.length) {
      h += '<div class="asm-empty">正文会在这里按卷、章的顺序拼成一本书。开始写第一章吧。</div>';
    } else {
      chapters.forEach((n) => {
        h += '<h2>' + U.esc(n.title) + '</h2>';
        if (n.body) h += '<div class="prose">' + n.body + '</div>';
        else h += '<div class="asm-empty" style="padding:16px 0;text-align:left">（这一章还没有内容）</div>';
      });
    }
    h += '</div></div></div></div>';
    host.innerHTML = h;
    bind(host, p, shared);
  }

  function bind(host, p, shared) {
    host.querySelector('[data-asm="add"]').onclick = () => {
      const n = window.blankNode('ch', '第' + (S.sortedChapters(p).length + 1) + '章', 420, 120 + p.nodes.length * 30);
      p.nodes.push(n);
      S.save();
      render(host, p, shared);
      window.Writer.refreshAfterNodeChange(false);
      U.toast('已加一章');
    };
    host.querySelector('[data-asm="outline"]').onclick = () => window.Writer.setView('outline');
    const modeBtn = host.querySelector('[data-asm="mode"]');
    if (modeBtn) modeBtn.onclick = () => {
      orderMode = orderMode === 'relation' ? 'order' : 'relation';
      window.lsSet('6.asmOrder', orderMode);
      render(host, p, shared);
      U.toast(orderMode === 'relation' ? '已按大纲关系拼装' : '已切换为按目录顺序', 'layout');
    };
    host.querySelectorAll('[data-exp]').forEach((b) => {
      b.onclick = () => window.LibExport.exportProject(p, b.getAttribute('data-exp'), orderMode);
    });
    host.querySelectorAll('[data-asmopen]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); window.Editor.openNode(b.getAttribute('data-asmopen')); };
    });

    host.querySelectorAll('[data-asmitem]').forEach((el) => {
      const id = el.getAttribute('data-asmitem');
      el.addEventListener('dragstart', (e) => {
        dragId = id; el.style.opacity = '.45';
        e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => { dragId = null; el.style.opacity = ''; host.querySelectorAll('.dragover').forEach((x) => x.classList.remove('dragover')); });
      el.addEventListener('dragover', (e) => { if (dragId && dragId !== id) { e.preventDefault(); el.classList.add('dragover'); } });
      el.addEventListener('dragleave', () => el.classList.remove('dragover'));
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('dragover');
        if (!dragId || dragId === id) return;
        const chapters = orderedChapters(p, orderMode);
        const from = chapters.findIndex((x) => x.id === dragId);
        const to = chapters.findIndex((x) => x.id === id);
        if (from < 0 || to < 0) return;
        const seq = chapters.slice();
        const [moved] = seq.splice(from, 1);
        seq.splice(to, 0, moved);
        seq.forEach((n, i) => { n.order = i + 1; });
        if (orderMode === 'relation') {
          orderMode = 'order';
          window.lsSet('6.asmOrder', orderMode);
        }
        S.save();
        render(host, p, shared);
        window.Writer.updateStats();
        U.toast('顺序已调整，已切换为按目录顺序');
      });
    });
  }

  /* ---------------- export helpers ---------------- */
  function exportList(p, mode) {
    return orderedChapters(p, mode === 'order' ? 'order' : 'relation');
  }
  function mdOf(p, mode) {
    const chapters = exportList(p, mode);
    let out = '# ' + p.name + '\n\n';
    chapters.forEach((n) => {
      out += '## ' + n.title + '\n\n';
      out += n.body ? U.htmlToMarkdown(n.body) + '\n\n' : '\n';
    });
    return out.trim() + '\n';
  }
  function txtOf(p, mode) {
    const chapters = exportList(p, mode);
    let out = p.name + '\n\n';
    chapters.forEach((n) => {
      out += n.title + '\n\n' + (n.body ? U.htmlToText(n.body) : '') + '\n\n';
    });
    return out.trim() + '\n';
  }
  function htmlOf(p, mode) {
    const chapters = exportList(p, mode);
    const body = chapters.map((n) => '<h2>' + U.esc(n.title) + '</h2>' + (n.body || '')).join('\n');
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + U.esc(p.name) + '</title><style>' +
      ':root{color-scheme:light}' +
      'body{max-width:720px;margin:0 auto;padding:64px 24px 96px;background:#FBFBF8;color:#181A1D;' +
      'font-family:"Source Han Serif SC","Songti SC",Georgia,serif;font-size:18px;line-height:2}' +
      'h1{text-align:center;font-size:38px;font-weight:600;letter-spacing:-.02em;margin:0 0 10px}' +
      '.meta{text-align:center;font-family:system-ui,sans-serif;font-size:12px;color:#8A9099;margin-bottom:56px}' +
      'h2{font-size:24px;font-weight:600;margin:56px 0 20px;padding-top:8px;border-top:1px solid #ECECE5}' +
      'h2:first-of-type{border-top:0;margin-top:0}' +
      'p{text-indent:2em;margin:0 0 .6em}' +
      'blockquote{border-left:2px solid #DDD;margin:1.2em 0;padding-left:1.2em;color:#555;font-style:italic}' +
      'strong{font-weight:700}em{font-style:italic}' +
      'ul,ol{margin:.6em 0 .8em 1.6em}' +
      '@media(max-width:600px){body{font-size:16px;padding:36px 18px 64px}h1{font-size:28px}}' +
      '</style></head><body><h1>' + U.esc(p.name) + '</h1>' +
      '<div class="meta">' + chapters.length + ' 章 · ' + U.fmt(S.countWords(p)) + ' 字</div>' +
      body + '</body></html>';
  }

  function exportProject(p, fmt, mode) {
    if (!p) { U.toast('没有可导出的作品', 'alert'); return; }
    const list = exportList(p, mode);
    if (!list.length) { U.toast('这部作品还没有章节', 'info'); return; }
    if (!fmt) {
      const m = U.openModal('<div class="modal-head"><div><h3>导出《' + U.esc(p.name) + '》</h3><p>' +
        list.length + ' 章 · ' + U.fmt(S.countWords(p)) + ' 字 · ' + (mode === 'order' ? '按目录顺序' : '按关系拼装') + '</p></div></div>' +
        '<div class="modal-body"><div class="choices">' +
        '<button class="choice" data-f="md"><b>Markdown</b><span>适合博客、公众号排版</span></button>' +
        '<button class="choice" data-f="txt"><b>TXT</b><span>纯文本，最通用的备份</span></button>' +
        '<button class="choice" data-f="html"><b>HTML</b><span>自带阅读排版，可直接打开</span></button>' +
        '</div></div><div class="modal-foot"><div class="foot-actions"><button class="btn ghost" data-cancel>取消</button></div></div>');
      m.box.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { m.close(); exportProject(p, b.getAttribute('data-f'), mode); });
      m.box.querySelector('[data-cancel]').onclick = m.close;
      return;
    }
    const safe = p.name.replace(/[\\/:*?"<>|]/g, '_');
    if (fmt === 'md') { U.download(safe + '.md', mdOf(p, mode), 'text/markdown'); U.toast('Markdown 已开始下载', 'download'); }
    else if (fmt === 'txt') { U.download(safe + '.txt', txtOf(p, mode), 'text/plain'); U.toast('TXT 已开始下载', 'download'); }
    else if (fmt === 'html') { U.download(safe + '.html', htmlOf(p, mode), 'text/html'); U.toast('HTML 已开始下载', 'download'); }
  }

  window.Assembly = { render, chapterGroups, orderedChapters };
  window.LibExport = { exportProject, mdOf, txtOf, htmlOf };
})();
