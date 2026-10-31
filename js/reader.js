/* ============================================================
   reader.js · 阅读 / 编辑 / 笔记 / 单篇导出 / 章节阅读
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const D = window.LibData, C = window.Curation, S = window.Store, P = window.Prefs;
  let current = null;
  let editing = false;
  let saveChain = Promise.resolve();
  let flushEdit = null;
  let saveHash = '';

  function nav(p) { location.hash = '#' + p; }

  function backTarget(rec) {
    return '#/s/' + rec.catId + '/' + rec.subId;
  }

  function actionBtn(iconName, label, attrs, cls) {
    return '<button class="ra-btn ' + (cls || '') + '" ' + (attrs || '') + '>' + U.icon(iconName) + '<span>' + label + '</span></button>';
  }

  function open(id, opts) {
    D.init();
    const rec = D.get(id);
    if (!rec) { nav('/'); return; }
    current = rec;
    editing = !!(opts && opts.editing);
    saveHash = rec.bodyHash || '';
    C.addRecent(rec.id);
    const html = rec.html || C.htmlOf(rec);
    const text = rec.text || C.textOf(rec);
    const star = C.isStarred(rec.id);
    const read = C.isRead(rec.id);
    const note = C.note(rec.id);
    const nb = D.neighbors(rec);
    const size = P.get('readerSize') || 18;
    const related = [];
    (rec.links || []).forEach((t) => {
      const list = D.byTitleList(t);
      list.forEach((x) => { if (related.indexOf(x) < 0 && related.length < 6) related.push(x); });
    });
    const entities = (rec.entities || []).concat(rec.characters || []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 18);

    let h = '<div class="reader-wrap">';
    h += '<div class="reader-top"><a class="back" href="' + backTarget(rec) + '">' + U.icon('arrowLeft') + ' ' + U.esc(rec.subName) + '</a>';
    h += '<div class="reader-actions" id="readerActions">' +
      actionBtn('pen', editing ? '完成' : '编辑', 'data-ra="edit"', editing ? 'accent' : '') +
      actionBtn('feather', '沉浸写作', 'data-ra="imm"', 'accent') +
      actionBtn(star ? 'starFill' : 'star', star ? '已收藏' : '收藏', 'data-ra="star"', star ? 'on' : '') +
      actionBtn(read ? 'check' : 'circle', read ? '已读' : '标记已读', 'data-ra="read"', read ? 'accent' : '') +
      actionBtn('tree', '进导图', 'data-ra="map"') +
      actionBtn('download', '导出', 'data-ra="export"') +
      actionBtn('more', '更多', 'data-ra="more"') +
      '<button class="ra-btn" data-ra="font" title="调整字号" style="font-family:var(--font-serif);font-size:15px">A<span style="font-size:9px">' + size + '</span></button>' +
      '</div></div>';

    h += '<div class="reader-head">';
    const recDb = D.db(rec.dbId);
    const dbChip = (D.databases.length > 1 && recDb)
      ? '<span class="crumb-db" style="--db:' + (recDb.color || '#8A9099') + '">' + U.esc(recDb.short || recDb.name) + '</span>' + U.icon('chevronRight') : '';
    h += '<div class="crumb" style="margin-bottom:10px"><a href="#/">写作库</a>' + U.icon('chevronRight') + dbChip + '<a href="#/c/' + rec.catId + '">' + U.esc(rec.catName) + '</a>' + U.icon('chevronRight') + '<a href="' + backTarget(rec) + '">' + U.esc(rec.subName) + '</a></div>';
    h += '<h1 class="reader-title">' + U.esc(rec.title) + '</h1>';
    h += '<div class="reader-meta"><span>' + U.fmt(rec.words) + ' 字</span><i class="dot"></i><span>' + U.esc(rec.type || '随笔') + '</span><i class="dot"></i>' +
      '<span class="tone" style="--tone:' + D.toneColor(rec.tone) + '">' + U.esc(rec.tone) + '</span>' +
      (rec.updated ? '<i class="dot"></i><span>更新 ' + U.esc(rec.updated) + '</span>' : '') +
      (rec.created ? '<i class="dot"></i><span>创建 ' + U.esc(rec.created) + '</span>' : '') +
      (note ? '<span style="color:var(--star)">有笔记</span>' : '') + '</div>';
    h += '</div>';

    if (editing) {
      h += '<div class="editor-hint">' + U.icon('pen') + '<span class="grow">正在编辑，改动会直接写回这篇 md，原文件先备份。</span><button data-ra="edit">完成编辑</button></div>';
    }
    if (rec.summary) {
      h += '<div class="summary-block"><b>摘 要</b>' + U.esc(rec.summary) + '</div>';
    }
    if (rec.quote) {
      h += '<div class="quote-block">“' + U.esc(rec.quote) + '”</div>';
    }
    h += '<div class="prose" id="readerBody" ' + (editing ? 'contenteditable="true" spellcheck="false"' : '') + ' style="--reader-size:' + size + 'px">' + html + '</div>';

    h += '<div class="reader-foot">';
    if (entities.length) {
      h += '<div class="foot-section"><div class="foot-label">世界元素</div><div class="chips">' +
        entities.map((e) => '<span class="chip-soft" data-entity="' + U.esc(e) + '">' + U.esc(e) + '</span>').join('') + '</div></div>';
    }
    if (related.length) {
      h += '<div class="foot-section"><div class="foot-label">相关文字</div><div class="related-list">';
      related.forEach((r) => {
        h += '<div class="related-item" data-related="' + r.id + '">' + U.icon('file') + '<span>' + U.esc(r.title) + '</span><span class="rmeta">' + U.esc(r.catName) + ' · ' + U.fmt(r.words) + ' 字</span></div>';
      });
      h += '</div></div>';
    }
    h += '<div class="foot-section"><div class="notes-box' + (note ? ' open' : '') + '" id="notesBox">' +
      '<div class="notes-head" data-ra="notes">' + U.icon('note') + '<span>我的笔记</span>' + (note ? '<span class="n-dot"></span>' : '') +
      '<span class="n-status" id="noteStatus">' + (note ? '已保存' : '仅自己可见') + '</span>' + U.icon('chevronDown', 'chev') + '</div>' +
      '<div class="notes-body"><textarea id="noteText" placeholder="写下与这篇有关的想法、线索或待办…" spellcheck="false">' + U.esc(note) + '</textarea></div></div></div>';

    h += '<div class="pager">' +
      (nb.prev ? '<a href="#/a/' + encodeURIComponent(nb.prev.id) + '"><div class="pg-label">' + U.icon('arrowLeft') + ' 上一篇</div><div class="pg-title">' + U.esc(nb.prev.title) + '</div></a>' : '<a class="disabled"></a>') +
      (nb.next ? '<a class="next" href="#/a/' + encodeURIComponent(nb.next.id) + '"><div class="pg-label">下一篇 ' + U.icon('arrowRight') + '</div><div class="pg-title">' + U.esc(nb.next.title) + '</div></a>' : '<a class="disabled"></a>') +
      '</div>';
    h += '</div></div>';

    h += '<div class="reader-bottom-bar">' + actionBtn(star ? 'starFill' : 'star', star ? '已收藏' : '收藏', 'data-ra="star"', star ? 'on' : '') +
      actionBtn(read ? 'check' : 'circle', read ? '已读' : '未读', 'data-ra="read"', read ? 'accent' : '') +
      actionBtn('pen', '编辑', 'data-ra="edit"') +
      actionBtn('note', '笔记', 'data-ra="notes"') +
      actionBtn('more', '更多', 'data-ra="more"') + '</div>';

    const view = $('#libView');
    view.innerHTML = h;
    view.scrollTop = 0;
    $('#libMain').scrollTop = 0;
    window.Lib.renderSide();
    bind(rec);
  }

  function rerender(rec) { open(rec.id, { keepScroll: true }); }

  function bind(rec) {
    const root = $('#libView');

    root.querySelectorAll('[data-related]').forEach((el) => {
      el.addEventListener('click', () => nav('/a/' + encodeURIComponent(el.getAttribute('data-related'))));
    });
    root.querySelectorAll('[data-entity]').forEach((el) => {
      el.addEventListener('click', () => nav('/q/' + encodeURIComponent(el.getAttribute('data-entity'))));
    });

    root.querySelectorAll('[data-ra]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const act = el.getAttribute('data-ra');
        if (act === 'star') {
          const on = C.toggleStar(rec.id);
          U.toast(on ? '已加入收藏' : '已取消收藏', 'star');
          open(rec.id);
        } else if (act === 'read') {
          const on = !C.isRead(rec.id);
          C.setRead(rec.id, on);
          U.toast(on ? '已标记为已读' : '已取消已读标记', 'check');
          open(rec.id);
        } else if (act === 'edit') {
          toggleEdit(rec);
        } else if (act === 'imm') {
          const go = () => {
            if (window.Immersive) window.Immersive.openDoc(rec.id, { returnTo: location.hash || ('#/a/' + encodeURIComponent(rec.id)) });
          };
          if (editing && flushEdit) flushEdit().then((ok) => { if (ok !== false) go(); });
          else go();
        } else if (act === 'map') {
          openInMap(rec);
        } else if (act === 'export') {
          exportMenu(el, rec);
        } else if (act === 'more') {
          if (window.DocActions) window.DocActions.menu(el, rec);
        } else if (act === 'notes') {
          const box = $('#notesBox');
          box.classList.toggle('open');
          if (box.classList.contains('open')) $('#noteText').focus();
        } else if (act === 'font') {
          fontMenu(el);
        }
      });
    });

    const body = $('#readerBody');
    flushEdit = null;
    if (body && editing) {
      body.focus();
      let dirty = false;
      const status = () => {
        const len = U.countWords(body.innerHTML);
        const meta = $('.reader-meta');
        if (meta) meta.firstElementChild.textContent = U.fmt(len) + ' 字';
      };
      const write = async () => {
        if (!dirty) return true;
        dirty = false;
        const html = body.innerHTML;
        const hint = $('.editor-hint span');
        if (hint) hint.textContent = '正在写入 md…';
        const run = async () => {
          try {
            const result = await window.Gen6Bridge.saveDoc({
              id: rec.id,
              title: rec.title,
              html,
              cats: rec.cats,
              tags: rec.tags || [],
              status: rec.status,
              baseHash: saveHash
            });
            if (result && result.ok) {
              saveHash = result.article.bodyHash;
              Object.assign(rec, { bodyHash: saveHash, html: result.article.html || html, words: result.article.words });
              D.applyArticle(result.article);
              if (hint) hint.textContent = '已写入 md · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              window.Gen6Bridge.refreshLibrary({ silent: true, delay: 900 });
              return true;
            }
            if (result && result.reloaded) {
              U.toast('已载入磁盘上的版本', 'refresh');
              dirty = false;
              editing = false;
              open(rec.id);
              return false;
            }
            dirty = true;
            if (hint) hint.textContent = result && result.frozen ? '未写入：这篇已冻结' : '未写入：你选择了先不处理';
            return false;
          } catch (error) {
            dirty = true;
            if (hint) hint.textContent = '写入失败：' + (error.message || '未知错误');
            U.toast(error.message || '写入 md 失败', 'alert');
            return false;
          }
        };
        saveChain = saveChain.then(run, run);
        return saveChain;
      };
      flushEdit = write;
      const schedule = U.debounce(() => { write(); }, 900);
      body.addEventListener('input', () => { dirty = true; status(); schedule(); });
      status();
    }

    const noteText = $('#noteText');
    if (noteText) {
      const saveNote = U.debounce(() => {
        C.setNote(rec.id, noteText.value);
        const st = $('#noteStatus');
        if (st) st.textContent = noteText.value.trim() ? '已保存' : '仅自己可见';
        if (st) st.style.color = 'var(--ok)';
        setTimeout(() => { if (st) st.style.color = ''; }, 1400);
      }, 500);
      noteText.addEventListener('input', saveNote);
    }
    updateProgress();
    window.Lib.renderSide();
  }

  async function toggleEdit(rec) {
    if (editing) {
      const ok = flushEdit ? await flushEdit() : true;
      if (!ok) {
        U.toast('还有改动没有写进 md，先留在这里继续编辑', 'alert');
        return;
      }
      editing = false;
      U.toast('已写入 md', 'check');
      open(rec.id);
      return;
    }
    editing = true;
    open(rec.id, { editing: true });
  }

  function exportMenu(anchor, rec) {
    const text = rec.text || C.textOf(rec);
    const html = rec.html || C.htmlOf(rec);
    const items = [
      { label: '导出 TXT', icon: 'download', fn: () => { U.download(rec.title + '.txt', rec.title + '\n\n' + text, 'text/plain'); U.toast('TXT 已开始下载', 'download'); } },
      { label: '导出 Markdown', icon: 'doc', fn: () => {
        const md = '# ' + rec.title + '\n\n' + (rec.summary ? '> ' + rec.summary + '\n\n' : '') + U.htmlToMarkdown(html);
        U.download(rec.title + '.md', md, 'text/markdown'); U.toast('Markdown 已开始下载', 'download');
      } },
      { label: '复制正文', icon: 'note', fn: () => { U.copyText(text); U.toast('正文已复制'); } }
    ];
    menu(anchor, items);
  }

  function fontMenu(anchor) {
    const cur = P.get('readerSize') || 18;
    const items = [];
    const set = (n) => { P.set('readerSize', n); const b = $('#readerBody'); if (b) b.style.setProperty('--reader-size', n + 'px'); const t = anchor.querySelector('span'); if (t) t.textContent = n; U.toast('正文字号 ' + n + 'px'); };
    items.push({ label: 'A− 小一点', icon: 'minus', fn: () => set(Math.max(13, cur - 1)) });
    items.push({ label: 'A+ 大一点', icon: 'plus', fn: () => set(Math.min(24, cur + 1)) });
    items.push({ label: '恢复默认 18px', icon: 'refresh', fn: () => set(18) });
    menu(anchor, items);
  }

  function menu(anchor, items) {
    const el = $('#ctxMenu');
    el.innerHTML = items.map((it, i) => '<button class="mi" data-i="' + i + '"><span class="mi-ico">' + U.icon(it.icon) + '</span>' + U.esc(it.label) + '</button>').join('');
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mw = 190;
    el.style.left = Math.min(r.right - mw, window.innerWidth - mw - 10) + 'px';
    el.style.top = (r.bottom + 6) + 'px';
    el.querySelectorAll('.mi').forEach((b) => {
      b.onclick = () => { el.hidden = true; items[+b.getAttribute('data-i')].fn(); };
    });
  }

  function openInMap(rec) {
    if (window.Gen6Bridge && window.Gen6Bridge.openInMap) {
      window.Gen6Bridge.openInMap(rec.id);
      return;
    }
    U.toast('写作台还没有准备好', 'alert');
  }

  /* ---------------- chapter reader (写作台镜像) ---------------- */
  function openChapter(pid, nid) {
    const p = S.get(pid);
    if (!p) { nav('/mine'); return; }
    const n = (p.nodes || []).find((x) => x.id === nid);
    if (!n) { nav('/p/' + pid); return; }
    const chapters = S.sortedChapters(p);
    const idx = chapters.indexOf(n);
    const prev = idx > 0 ? chapters[idx - 1] : null;
    const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
    const plain = U.htmlToText(n.body);
    let h = '<div class="reader-wrap">';
    h += '<div class="reader-top"><a class="back" href="#/p/' + pid + '">' + U.icon('arrowLeft') + ' ' + U.esc(p.name) + '</a>' +
      '<div class="reader-actions">' +
      '<button class="ra-btn accent" data-ch-act="edit">' + U.icon('pen') + '<span>去编辑</span></button>' +
      '<button class="ra-btn" data-ch-act="export">' + U.icon('download') + '<span>导出</span></button>' +
      '</div></div>';
    h += '<div class="reader-head"><div class="crumb" style="margin-bottom:10px"><a href="#/">写作库</a>' + U.icon('chevronRight') + '<a href="#/mine">我的写作</a>' + U.icon('chevronRight') + '<a href="#/p/' + pid + '">' + U.esc(p.name) + '</a></div>';
    h += '<h1 class="reader-title">' + U.esc(n.title) + '</h1>';
    h += '<div class="reader-meta"><span>' + U.fmt(U.countWords(n.body)) + ' 字</span><i class="dot"></i><span>' + window.NODE_LABEL(n.type) + '</span>' +
      (n.time ? '<i class="dot"></i><span>' + U.esc(n.time) + '</span>' : '') + '<i class="dot"></i><span>写作台工程</span></div></div>';
    h += '<div class="prose" style="--reader-size:' + (P.get('readerSize') || 18) + 'px">' + (n.body || '<p class="ql-empty">这一章还没有内容。</p>') + '</div>';
    h += '<div class="reader-foot"><div class="pager">' +
      (prev ? '<a href="#/p/' + pid + '/' + prev.id + '"><div class="pg-label">' + U.icon('arrowLeft') + ' 上一章</div><div class="pg-title">' + U.esc(prev.title) + '</div></a>' : '<a class="disabled"></a>') +
      (next ? '<a class="next" href="#/p/' + pid + '/' + next.id + '"><div class="pg-label">下一章 ' + U.icon('arrowRight') + '</div><div class="pg-title">' + U.esc(next.title) + '</div></a>' : '<a class="disabled"></a>') +
      '</div></div></div>';
    const view = $('#libView');
    view.innerHTML = h;
    $('#libMain').scrollTop = 0;
    view.querySelector('[data-ch-act="edit"]').onclick = () => window.App.openWriter(pid, { view: 'editor', nodeId: n.id });
    view.querySelector('[data-ch-act="export"]').onclick = () => {
      U.download(n.title + '.txt', n.title + '\n\n' + plain, 'text/plain');
      U.toast('TXT 已开始下载', 'download');
    };
    window.Lib.renderSide();
    updateProgress();
  }

  function updateProgress() {
    const main = $('#libMain'), bar = $('#readProgress');
    if (!main || !bar) return;
    const inReader = /^\/(a|p)\//.test(window.Lib.route().replace(/^\/?/, '/'));
    const max = main.scrollHeight - main.clientHeight;
    const pct = max > 8 ? U.clamp(main.scrollTop / max, 0, 1) : 1;
    bar.querySelector('i').style.width = (pct * 100) + '%';
    bar.classList.toggle('on', inReader);
  }

  window.Reader = { open, openChapter, updateProgress, isEditing: () => editing };
})();
