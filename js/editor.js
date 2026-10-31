/* ============================================================
   editor.js · 多面板写作
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const S = window.Store, NT = window.NODE_TYPES;

  let activeEl = null;
  let activeNode = null;
  const lastWords = new Map();
  const saveTimers = new Map();

  function render(host, p, shared) {
    window.Outline.live = false;
    const chapters = S.sortedChapters(p);
    if (!chapters.length) {
      host.innerHTML = '<div class="ed-empty">' + U.icon('pen') +
        '<b>还没有可以写的章节</b><p>写作台按「章」来写正文。先在大纲里加一章，或点下面的按钮。</p>' +
        '<button class="btn primary" data-ed="add">' + U.icon('plus') + '新增一章</button></div>';
      host.querySelector('[data-ed="add"]').onclick = () => {
        const n = window.blankNode('ch', '第一章', 420, 120);
        p.nodes.push(n);
        p.panels = [n.id];
        S.save();
        window.Writer.refreshAfterNodeChange(false);
        render(host, p, shared);
      };
      return;
    }
    p.panels = (p.panels || []).filter((id) => chapters.some((c) => c.id === id));
    if (!p.panels.length) p.panels = [chapters[0].id];
    if (!shared.selNode || !p.panels.includes(shared.selNode)) {
      if (p.panels.includes(shared.selNode)) { /* keep */ }
    }

    let h = '<div class="ed-wrap">';
    h += '<div class="ed-tabs-bar">';
    p.panels.forEach((id) => {
      const n = chapters.find((c) => c.id === id);
      if (!n) return;
      h += '<button class="ed-tab' + (shared.selNode === id ? ' active' : '') + '" data-edtab="' + id + '">' +
        '<span>' + U.esc(n.title) + '</span><span class="x" data-edclose="' + id + '">' + U.icon('x') + '</span></button>';
    });
    h += '<button class="ed-tab" data-ed="picker" style="flex:0 0 auto" title="打开另一章">' + U.icon('plus') + '<span>章节</span></button>';
    h += '</div><div class="ed-panels' + (p.panels.length === 1 ? ' single' : ' multi') + '" id="edPanels">';

    p.panels.forEach((id) => {
      const n = chapters.find((c) => c.id === id);
      if (!n) return;
      const type = NT[n.type] || NT.ch;
      lastWords.set(n.id, S.nodeWords(n));
      h += '<section class="ed-panel" data-edpanel="' + n.id + '" style="--nc:' + (n.color || type.color) + '">' +
        '<div class="ed-head"><span class="ed-dot"></span>' +
        '<span class="ed-name" data-edsel="' + n.id + '" title="切换章节">' + U.esc(n.title) + '</span>' +
        '<span class="ed-words" id="edw-' + n.id + '">' + (S.nodeWords(n) ? U.fmt(S.nodeWords(n)) : '0') + ' 字</span>' +
        '<span class="ed-state" id="eds-' + n.id + '">已保存</span>' +
        '<div class="ed-tools">' +
        '<button data-edimm="' + n.id + '" title="沉浸写作">' + U.icon('feather') + '</button>' +
        '<button data-edopen="' + n.id + '" title="在画布中定位">' + U.icon('compass') + '</button>' +
        (n.time ? '<button title="时间点：' + U.esc(n.time) + '" disabled style="opacity:.5">' + U.icon('clock') + '</button>' : '') +
        '<button data-edclose="' + n.id + '" title="关闭面板">' + U.icon('x') + '</button></div></div>' +
        '<div class="ed-scroll"><div class="ed-page">' +
        '<div class="ed-title" contenteditable="true" spellcheck="false" data-edtitle="' + n.id + '">' + U.esc(n.title) + '</div>' +
        '<div class="ed-sub"><span>' + type.label + '</span>' + (n.time ? '<span>·</span><span>' + U.esc(n.time) + '</span>' : '') + '<span>·</span><span>自动保存</span></div>' +
        '<div class="prose" contenteditable="true" spellcheck="false" data-edbody="' + n.id + '" style="--reader-size:17px">' +
        (n.body || '<p><br></p>') + '</div></div></div></section>';
    });
    h += '</div>';
    const cur = p.nodes.find((x) => x.id === (shared.selNode || p.panels[0]));
    h += '<div class="rt-toolbar" id="rtToolbar">' +
      '<button class="rt-btn" data-cmd="bold" title="加粗"><b>B</b></button>' +
      '<button class="rt-btn" data-cmd="italic" title="斜体"><i>I</i></button>' +
      '<button class="rt-btn" data-cmd="underline" title="下划线"><u>U</u></button>' +
      '<span class="rt-sep"></span>' +
      '<button class="rt-btn" data-block="h2" title="二级标题">H2</button>' +
      '<button class="rt-btn" data-block="h3" title="三级标题">H3</button>' +
      '<button class="rt-btn" data-block="p" title="正文">正文</button>' +
      '<span class="rt-sep"></span>' +
      '<button class="rt-btn" data-cmd="formatBlock" data-arg="blockquote" title="引用">' + U.icon('quote') + '</button>' +
      '<button class="rt-btn" data-cmd="insertUnorderedList" title="无序列表">' + U.icon('ul') + '</button>' +
      '<button class="rt-btn" data-cmd="insertOrderedList" title="有序列表">' + U.icon('ol') + '</button>' +
      '<span class="rt-sep"></span>' +
      '<button class="rt-btn" data-cmd="undo" title="撤销">' + U.icon('undo') + '</button>' +
      '<button class="rt-btn" data-cmd="redo" title="重做">' + U.icon('redo') + '</button>' +
      '</div></div>';
    host.innerHTML = h;

    bind(host, p, shared, chapters);
    const activeId = shared.selNode && p.panels.includes(shared.selNode) ? shared.selNode : p.panels[0];
    const body = host.querySelector('[data-edbody="' + activeId + '"]');
    if (body) { activeEl = body; activeNode = p.nodes.find((x) => x.id === activeId); }
    const panel = host.querySelector('[data-edpanel="' + activeId + '"]');
    if (panel) panel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function bind(host, p, shared, chapters) {
    host.querySelectorAll('[data-edtab]').forEach((b) => {
      b.onclick = (e) => {
        if (e.target.closest('[data-edclose]')) return;
        const id = b.getAttribute('data-edtab');
        shared.selNode = id; p.panels = p.panels.includes(id) ? p.panels : p.panels.concat([id]);
        window.Writer.selectNode(id);
        const panel = host.querySelector('[data-edpanel="' + id + '"]');
        if (panel) panel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        host.querySelectorAll('[data-edtab]').forEach((x) => x.classList.toggle('active', x.getAttribute('data-edtab') === id));
        const body = host.querySelector('[data-edbody="' + id + '"]');
        if (body) { activeEl = body; activeNode = p.nodes.find((x) => x.id === id); body.focus(); }
      };
    });
    host.querySelectorAll('[data-edclose]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const id = b.getAttribute('data-edclose');
        p.panels = p.panels.filter((x) => x !== id);
        S.save();
        if (shared.selNode === id) shared.selNode = p.panels[0] || null;
        render(host, p, shared);
        window.Writer.updateStats();
      };
    });
    host.querySelectorAll('[data-edimm]').forEach((b) => {
      b.onclick = () => {
        const id = b.getAttribute('data-edimm');
        const n = p.nodes.find((x) => x.id === id);
        if (!n) return;
        const panel = host.querySelector('[data-edpanel="' + id + '"]');
        if (panel) flushSave(n, panel);
        if (window.Immersive) window.Immersive.openNode(id, p.id, { returnTo: '#/w/' + encodeURIComponent(p.id) });
      };
    });
    host.querySelectorAll('[data-edopen]').forEach((b) => {
      b.onclick = () => {
        const id = b.getAttribute('data-edopen');
        shared.selNode = id;
        window.Writer.setView('outline');
        setTimeout(() => { window.Outline.focusNode(id); }, 80);
      };
    });
    host.querySelectorAll('[data-edsel]').forEach((b) => {
      b.onclick = () => {
        const id = b.getAttribute('data-edsel');
        const n = p.nodes.find((x) => x.id === id);
        if (!n) return;
        U.promptModal({ title: '重命名章节', label: '章节标题', value: n.title, okText: '保存' }).then((v) => {
          if (v == null || !v) return;
          n.title = v; n.updatedAt = Date.now(); S.save();
          if (window.Gen6Bridge) window.Gen6Bridge.onNodeSaved(n);
          render(host, p, shared);
          window.Writer.updateStats();
        });
      };
    });

    const picker = host.querySelector('[data-ed="picker"]');
    if (picker) picker.onclick = () => {
      const items = chapters.map((n) => ({
        label: n.title, icon: (NT[n.type] || NT.ch).icon, check: p.panels.includes(n.id),
        fn: () => { openNode(n.id); }
      }));
      window.Writer.popMenu(picker, [{ head: '打开章节' }].concat(items), 260);
    };

    p.panels.forEach((id) => {
      const panel = host.querySelector('[data-edpanel="' + id + '"]');
      if (!panel) return;
      const body = panel.querySelector('[data-edbody]');
      const titleEl = panel.querySelector('[data-edtitle]');
      const n = p.nodes.find((x) => x.id === id);
      if (!n) return;

      body.addEventListener('focus', () => { activeEl = body; activeNode = n; shared.selNode = n.id; });
      titleEl.addEventListener('focus', () => { activeEl = titleEl; activeNode = n; });

      body.addEventListener('input', () => {
        activeEl = body; activeNode = n;
        scheduleSave(n, panel);
      });
      body.addEventListener('paste', (e) => {
        const cd = e.clipboardData || window.clipboardData;
        const text = cd ? cd.getData('text/plain') : '';
        if (!text) return;
        e.preventDefault();
        document.execCommand('insertText', false, text);
      });
      body.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          flushSave(n, panel);
          if (window.Gen6Bridge) window.Gen6Bridge.flushNode(n);
          U.toast(n.docId ? '已写入 md' : '已保存到本机', 'save');
        }
      });
      titleEl.addEventListener('input', () => {
        n.title = titleEl.textContent.trim() || '未命名章节';
        U.debounce(() => {
          S.save();
          if (window.Gen6Bridge) window.Gen6Bridge.onNodeSaved(n);
          panel.querySelector('.ed-name').textContent = n.title;
          window.Writer.renderLeft();
          window.Writer.renderTop();
        }, 400)();
      });
    });

    host.querySelectorAll('.rt-btn').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.onclick = () => {
        const cmd = btn.getAttribute('data-cmd');
        if (!activeEl) return;
        activeEl.focus();
        if (cmd) {
          const arg = btn.getAttribute('data-arg') || null;
          try { document.execCommand(cmd, false, arg); } catch (e) {}
        } else {
          const block = btn.getAttribute('data-block');
          const current = (document.queryCommandValue('formatBlock') || '').toLowerCase();
          const target = block === 'p' ? 'p' : block;
          try { document.execCommand('formatBlock', false, current === target ? 'p' : '<' + target + '>'); } catch (e) {}
        }
        if (activeNode) {
          const panel = host.querySelector('[data-edpanel="' + activeNode.id + '"]');
          if (panel) scheduleSave(activeNode, panel);
        }
      };
    });
  }

  function scheduleSave(n, panel) {
    const body = panel.querySelector('[data-edbody="' + n.id + '"]');
    if (!body) return;
    const status = panel.querySelector('#eds-' + n.id);
    if (status) { status.textContent = '正在保存…'; status.classList.add('on'); status.style.color = 'var(--ink-3)'; }
    clearTimeout(saveTimers.get(n.id));
    const t = setTimeout(() => flushSave(n, panel), 700);
    saveTimers.set(n.id, t);
  }

  function flushSave(n, panel) {
    clearTimeout(saveTimers.get(n.id));
    const body = panel && panel.querySelector('[data-edbody="' + n.id + '"]');
    if (body) n.body = body.innerHTML;
    const p = window.Writer.getProject();
    const words = S.nodeWords(n);
    const prev = lastWords.get(n.id) || 0;
    const delta = words - prev;
    if (p && delta) S.addWords(p, delta);
    lastWords.set(n.id, words);
    n.updatedAt = Date.now();
    if (p) { p.updatedAt = Date.now(); S.save(); }
    if (n.docId && window.Gen6Bridge) window.Gen6Bridge.onNodeSaved(n);
    if (panel) {
      const w = panel.querySelector('#edw-' + n.id);
      if (w) w.textContent = (words ? U.fmt(words) : '0') + ' 字';
      const status = panel.querySelector('#eds-' + n.id);
      if (status) { status.textContent = n.docId ? '等待写入 md' : '已保存'; status.style.color = 'var(--ok)'; setTimeout(() => status.classList.remove('on'), 1200); }
    }
    window.Writer.renderTop();
    window.Writer.renderRight();
    if (p && window.Writer.state.view === 'assembly') { /* noop */ }
  }

  function openNode(id) {
    const p = window.Writer.getProject();
    if (!p || !window.Immersive) return;
    window.Writer.state.selNode = id;
    window.Immersive.openNode(id, p.id, { returnTo: '#/w/' + encodeURIComponent(p.id) });
  }

  window.Editor = { render, openNode, flushSave };
})();
