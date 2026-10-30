/* ============================================================
   dashboard.js · 数据看台（每日写作、图表、修订与 Git 记录）
   ============================================================ */
(function () {
  'use strict';
  const U = window.U, $ = U.$, $$ = U.$$;
  const Api = window.Gen6Api;

  const state = {
    days: 30,
    data: null,
    token: 0,
    loading: false,
    timer: null,
    updatedAt: 0,
  };
  const TYPE_COLORS = {
    小说: '#C05B4D',
    毕设: '#6B7FD7',
    资料: '#4E8F7C',
    素材: '#C08A3E',
  };
  const FALLBACK_COLORS = ['#C05B4D', '#6B7FD7', '#B06A9E', '#4E8F7C', '#C08A3E', '#5C8DB8', '#8A7B5A', '#9A6BC0'];

  function fmt(n) { return U.fmt(Math.round(Number(n) || 0)); }
  function signed(n) {
    const v = Math.round(Number(n) || 0);
    return (v > 0 ? '+' : '') + U.fmt(v);
  }
  function pct(part, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, (Number(part) || 0) / total * 100));
  }
  function dateShort(date) {
    const m = String(date || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[1])}/${Number(m[2])}` : String(date || '');
  }
  function timeShort(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function dateTimeShort(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${dateShort(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)} ${timeShort(iso)}`;
  }
  function toneClass(n) { return Number(n) > 0 ? 'up' : Number(n) < 0 ? 'down' : ''; }
  function emptyChart(title, desc, icon) {
    return '<div class="dc-empty">' + U.icon(icon || 'chart') + '<b>' + U.esc(title) + '</b><p>' + U.esc(desc || '') + '</p></div>';
  }

  /* ---------------- 图表 ---------------- */

  function trendSvg(series) {
    if (!series.length) return emptyChart('还没有数据', '先写一篇，统计会从这里开始。');
    const active = series.some((s) => s.net || s.revisions);
    if (!active) {
      const commits = series.reduce((a, s) => a + (Number(s.commits) || 0), 0);
      return emptyChart('这一段还没有写作记录', commits
        ? 'Git 有 ' + commits + ' 次提交，但还没有保存过正文或修订。写一篇后，这里会出现每日净增柱和修订线。'
        : '保存一次正文或草稿，柱状图与修订线就会从这里开始。');
    }
    const W = 840, H = 252, L = 48, R = 16, T = 18, B = 32;
    const iw = W - L - R, ih = H - T - B;
    const nets = series.map((s) => Number(s.net) || 0);
    const maxPos = Math.max(0, ...nets);
    const minNeg = Math.min(0, ...nets);
    const range = (maxPos - minNeg) || 1;
    const yOf = (v) => T + ih - ((v - minNeg) / range) * ih;
    const step = iw / series.length;
    const bw = Math.max(2, Math.min(16, step * 0.58));
    const zeroY = yOf(0);
    const bars = series.map((s, i) => {
      const x = L + step * i + (step - bw) / 2;
      const top = yOf(Math.max(0, s.net));
      const h = Math.max(s.net ? 1.6 : 1, Math.abs(yOf(s.net) - zeroY));
      const fill = s.net < 0 ? 'var(--danger)' : 'var(--accent)';
      const op = s.net ? 0.82 : 0.12;
      return '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="2.5" fill="' + fill + '" opacity="' + op + '"><title>' + s.date + ' 净增 ' + signed(s.net) + ' 字 · 修订 ' + s.revisions + ' 次</title></rect>';
    }).join('');
    const maxRev = Math.max(1, ...series.map((s) => s.revisions));
    const pts = series.map((s, i) => [
      L + step * i + step / 2,
      T + ih - (s.revisions / maxRev) * ih * 0.72,
    ]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const dots = pts.map((p, i) => series[i].revisions
      ? '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.3" fill="var(--ink-3)" opacity=".7"><title>' + series[i].date + ' 修订 ' + series[i].revisions + ' 次</title></circle>'
      : '').join('');
    const grid = [0, 0.5, 1].map((f) => {
      const v = minNeg + range * f;
      const gy = yOf(v);
      return '<line x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) +
        '" stroke="var(--line-2)" stroke-dasharray="3 5"/>' +
        '<text x="' + (L - 8) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" class="dc-axis">' + fmt(v) + '</text>';
    }).join('');
    const labelEvery = Math.max(1, Math.ceil(series.length / 7));
    const labels = series.map((s, i) => (i % labelEvery === 0 || i === series.length - 1)
      ? '<text x="' + (L + step * i + step / 2).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" class="dc-axis">' + dateShort(s.date) + '</text>'
      : '').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dc-svg" role="img" aria-label="每日净增字数与修订次数">' +
      grid + bars +
      '<path d="' + line + '" fill="none" stroke="var(--ink-3)" stroke-width="1.4" stroke-dasharray="4 4" opacity=".55"/>' +
      dots + labels + '</svg>';
  }

  function hourSvg(hourly) {
    const total = hourly.reduce((a, h) => a + h.words, 0);
    if (!total) return emptyChart('还没有时段记录', '写一次正文或速写，这里会显示你一天里最常在几点动笔。', 'clock');
    const W = 840, H = 190, L = 40, R = 16, T = 16, B = 26;
    const iw = W - L - R, ih = H - T - B;
    const max = Math.max(1, ...hourly.map((h) => h.words));
    const step = iw / 24;
    const bw = Math.max(3, step * 0.62);
    const nowHour = new Date().getHours();
    const bars = hourly.map((h) => {
      const x = L + step * h.hour + (step - bw) / 2;
      const bh = h.words ? Math.max(2, h.words / max * ih) : 1.5;
      const y = T + ih - bh;
      const color = h.hour === nowHour ? 'var(--accent)' : 'var(--ink-3)';
      const op = h.words ? (h.hour === nowHour ? 0.95 : 0.55) : 0.1;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) +
        '" rx="2" fill="' + color + '" opacity="' + op + '"><title>' + h.hour + ':00 · ' + fmt(h.words) + ' 字 · ' + h.edits + ' 次</title></rect>';
    }).join('');
    const labels = hourly.filter((h) => h.hour % 3 === 0).map((h) => {
      const x = L + step * h.hour + step / 2;
      return '<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="dc-axis">' + h.hour + '时</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dc-svg dc-svg-hour" role="img" aria-label="写作时段分布">' + bars + labels + '</svg>';
  }

  function donutSvg(items, totalWords) {
    const sum = items.reduce((a, x) => a + Math.max(0, Number(x.value) || 0), 0);
    if (!sum) return emptyChart('还没有数据库数据', '启用一个数据库后这里会显示字数占比。', 'database');
    const cx = 92, cy = 92, r = 62, sw = 21;
    let angle = -Math.PI / 2;
    const arcs = items.map((item, i) => {
      const value = Math.max(0, Number(item.value) || 0);
      if (!value) return '';
      const frac = value / sum;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const color = item.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      if (frac > 0.9999) {
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '"><title>' + U.esc(item.name) + ' · ' + fmt(value) + ' 字</title></circle>';
      }
      const large = frac > 0.5 ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      return '<path d="M ' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
        '" fill="none" stroke="' + color + '" stroke-width="' + sw + '"><title>' + U.esc(item.name) + ' · ' + fmt(value) + ' 字</title></path>';
    }).join('');
    return '<div class="dc-donut-wrap"><svg viewBox="0 0 184 184" class="dc-donut" role="img" aria-label="数据库字数占比">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="' + sw + '"/>' + arcs +
      '<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" class="dc-donut-big">' + fmt(totalWords) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 17) + '" text-anchor="middle" class="dc-donut-small">总字数</text></svg>' +
      '<div class="dc-donut-legend">' + items.map((item, i) => '<div class="dcl-item"><i style="background:' + (item.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]) + '"></i><span>' + U.esc(item.name) + '</span><b>' + Math.round(item.value / sum * 100) + '%</b></div>').join('') + '</div></div>';
  }

  function typeBars(types) {
    if (!types.length) return emptyChart('还没有分类数据', '');
    const max = Math.max(1, ...types.map((t) => t.words));
    return '<div class="dc-bars">' + types.map((t) => '<div class="dc-bar-row">' +
      '<span class="dc-bar-label">' + U.esc(t.name) + '</span>' +
      '<span class="dc-bar-track"><i style="width:' + Math.max(2, pct(t.words, max)) + '%;background:' + (TYPE_COLORS[t.name] || 'var(--accent)') + '"></i></span>' +
      '<span class="dc-bar-value">' + fmt(t.files) + ' 篇 · ' + fmt(t.words) + ' 字</span></div>').join('') + '</div>';
  }

  function catBars(cats) {
    if (!cats.length) return emptyChart('还没有分类数据', '');
    const max = Math.max(1, ...cats.map((c) => c.words));
    return '<div class="dc-bars">' + cats.slice(0, 9).map((c) => '<div class="dc-bar-row">' +
      '<span class="dc-bar-label" title="' + U.esc(c.name) + '">' + U.esc(c.name) + '</span>' +
      '<span class="dc-bar-track"><i style="width:' + Math.max(2, pct(c.words, max)) + '%;background:' + (c.color || 'var(--accent)') + '"></i></span>' +
      '<span class="dc-bar-value">' + fmt(c.files) + ' 篇 · ' + fmt(c.words) + ' 字</span></div>').join('') + '</div>';
  }

  function statusChips(statuses) {
    if (!statuses.length) return '';
    return '<div class="dc-chips">' + statuses.map((s) => '<span class="dc-chip">' + U.esc(s.name) + '<b>' + fmt(s.files) + '</b></span>').join('') + '</div>';
  }

  /* ---------------- 局部渲染 ---------------- */

  function kpiHtml(d) {
    const t = d.todayStats;
    const items = [
      {
        label: '今日净增', value: signed(t.net), unit: '字', tone: toneClass(t.net), icon: 'pen',
        sub: '写入 ' + fmt(t.written) + ' · 删减 ' + fmt(t.removed),
      },
      {
        label: '今日编辑', value: fmt(t.edits), unit: '次', tone: '', icon: 'activity',
        sub: '新建 ' + fmt(t.created) + ' 篇 · 速写 ' + fmt(t.draftEdits) + ' 次',
      },
      {
        label: '近 7 天净增', value: signed(d.week.net), unit: '字', tone: toneClass(d.week.net), icon: 'chart',
        sub: '写入 ' + fmt(d.week.written) + ' · 删减 ' + fmt(d.week.removed),
      },
      {
        label: '连续写作', value: fmt(d.streak.current), unit: '天', tone: d.streak.current ? 'up' : '', icon: 'flame',
        sub: '最长 ' + fmt(d.streak.best) + ' 天 · 共 ' + fmt(d.streak.activeDays) + ' 天有记录',
      },
      {
        label: '当前总字数', value: fmt(d.library.words), unit: '字', tone: '', icon: 'bookOpen',
        sub: fmt(d.library.files) + ' 篇 · 篇均 ' + fmt(d.library.avgWords) + ' 字',
      },
      {
        label: '今日速写', value: signed(t.draftNet), unit: '字', tone: toneClass(t.draftNet), icon: 'feather',
        sub: '草稿 ' + fmt(t.draftEdits) + ' 次 · 不含正文',
      },
    ];
    return items.map((item) => '<div class="dash-kpi">' +
      '<span class="dk-icon">' + U.icon(item.icon) + '</span>' +
      '<span class="dk-label">' + item.label + '</span>' +
      '<b class="dk-value ' + item.tone + '">' + item.value + '<em>' + item.unit + '</em></b>' +
      '<span class="dk-sub">' + item.sub + '</span></div>').join('');
  }

  function recentHtml(recent) {
    if (!recent.length) {
      return emptyChart('还在等第一笔记录', '打开写作台、阅读页或速写，保存一次就会出现在这里。', 'clock') +
        '<div class="dc-empty-action"><a class="btn sm" href="#/write">' + U.icon('pen') + '去写一篇</a><a class="btn sm dark" href="#/drafts">' + U.icon('note') + '打开草稿箱</a></div>';
    }
    return '<div class="dc-logs">' + recent.slice(0, 24).map((r) => {
      const isDraft = r.kind === 'draft';
      const badge = isDraft ? '速写' : (r.action === 'create' ? '新建' : '保存');
      return '<div class="dc-log">' +
        '<span class="dcl-time">' + timeShort(r.at) + '</span>' +
        '<span class="dcl-badge ' + (isDraft ? 'draft' : r.action) + '">' + badge + '</span>' +
        '<span class="dcl-title" title="' + U.esc(r.title || r.id || '') + '">' + U.esc(r.title || r.id || '未命名') + '</span>' +
        '<span class="dcl-delta ' + toneClass(r.delta) + '">' + signed(r.delta) + ' 字</span>' +
        '<span class="dcl-db">' + U.esc(r.dbName || (isDraft ? '草稿' : '')) + '</span></div>';
    }).join('') + '</div>';
  }

  function revisionsHtml(info) {
    if (!info || !info.recent || !info.recent.length) {
      return emptyChart('还没有修订记录', '每次保存都会留下一个可回看的版本。', 'history');
    }
    return '<div class="dc-revs">' + info.recent.slice(0, 7).map((r) => '<a class="dc-rev" href="#/a/' + encodeURIComponent(r.id) + '">' +
      '<span class="dcr-time">' + dateTimeShort(r.time) + '</span>' +
      '<span class="dcr-title">' + U.esc(r.title || r.id) + '</span>' +
      '<span class="dcr-note">' + U.esc(r.note || '保存') + '</span>' +
      '<span class="dcr-words">' + fmt(r.words) + ' 字</span></a>').join('') + '</div>';
  }

  function gitTime(iso, withTime) {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return String(iso || '').slice(0, 16);
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return withTime ? day + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : day;
  }

  function gitHtml(git) {
    if (!git || !git.ok) {
      return emptyChart('还没有连接 GitHub', git && git.error ? git.error : '去「设置 → GitHub 同步」连接一个私有仓库；之后每次提交与拉取都会显示在这里。', 'gitBranch');
    }
    const last = git.commits[0] || {};
    return '<div class="git-head"><span class="git-branch">' + U.icon('gitBranch') + U.esc(git.branch) + '</span>' +
      '<span class="git-state ' + (git.dirty ? 'dirty' : 'clean') + '">' + (git.dirty ? git.dirty + ' 项本机改动待提交' : (git.remoteChanged ? '云端有更新待拉取' : '与云端一致')) + '</span></div>' +
      '<div class="git-last"><span class="gl-hash">' + U.esc(last.hash || '') + '</span>' +
      '<div class="gl-main"><b>' + U.esc(last.subject || '') + '</b><span>' + U.esc(gitTime(last.date, true)) + ' · ' + U.esc(last.author || '') + '</span></div></div>' +
      '<div class="dc-git-spark">' + sparkSvg(git.dayCount) + '</div>' +
      '<div class="git-commits">' + git.commits.slice(0, 8).map((c) => '<div class="gc-row"><span>' + U.esc(gitTime(c.date, true)) + '</span><code>' + U.esc(c.hash) + '</code><b>' + U.esc(c.subject) + '</b></div>').join('') + '</div>' +
      '<div class="git-foot">' + (git.remoteConfigured ? '仓库：' + U.esc(git.remote) + (git.conflicts ? ' · ' + git.conflicts + ' 个冲突待处理' : '') : '还没有配置远程仓库') +
      ' · <a href="#/settings">GitHub 同步</a></div>';
  }

  function sparkSvg(dayCount) {
    const days = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(start.getTime() - i * 86400000);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ date: key, count: dayCount[key] || 0 });
    }
    const W = 200, H = 34, step = W / days.length;
    const max = Math.max(1, ...days.map((d) => d.count));
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-label="近两周提交"><title>近 14 天 Git 提交</title>' +
      days.map((d, i) => {
        const h = d.count ? Math.max(3, d.count / max * (H - 4)) : 1.5;
        return '<rect x="' + (i * step + 1).toFixed(1) + '" y="' + (H - h) + '" width="' + (step - 2).toFixed(1) + '" height="' + h.toFixed(1) +
          '" rx="1.5" fill="var(--ink-3)" opacity="' + (d.count ? 0.6 : 0.12) + '"><title>' + d.date + ' · ' + d.count + ' 次提交</title></rect>';
      }).join('') + '</svg><span class="spark-label">近 14 天提交</span>';
  }

  function noteHtml(d) {
    const since = d.recordingSince ? '统计从 ' + d.recordingSince + ' 起逐次记录' : '从第一次保存开始逐次记录';
    return '<div class="dash-note">' + U.icon('info') +
      '<p>' + since + '。在写作台、阅读页或速写里保存后立即更新；统计按本机浏览器换算日期与时段。' +
      (d.hasRecords ? '' : ' <b>现在还没有增量记录，写一篇就能看到曲线。</b>') + '</p></div>';
  }

  /* ---------------- 页面 ---------------- */

  function shell() {
    return '<div class="dash">' +
      '<section class="dash-hero">' +
      '<div class="dash-eyebrow">DATA DECK · 数据看台</div>' +
      '<div class="dash-hero-line"><div><h1 class="dash-title">数据看台<em>。</em></h1>' +
      '<p class="dash-sub">每一天写了多少、在什么时候写、哪些库在长、修订与 Git 提交，都在这里实时记着。</p></div>' +
      '<div class="dash-actions">' +
      '<span class="dash-live" id="dashLive"><i></i>实时记录</span>' +
      '<div class="dash-range" id="dashRange">' +
      [7, 30, 90].map((n) => '<button data-days="' + n + '"' + (n === state.days ? ' class="on"' : '') + '>' + n + ' 天</button>').join('') +
      '</div>' +
      '<button class="btn sm" id="dashRefresh">' + U.icon('refresh') + '刷新</button>' +
      '</div></div>' +
      '<div id="dashNote"></div>' +
      '<div class="dash-kpis" id="dashKpis"><div class="dash-kpi loading"></div><div class="dash-kpi loading"></div><div class="dash-kpi loading"></div><div class="dash-kpi loading"></div><div class="dash-kpi loading"></div><div class="dash-kpi loading"></div></div>' +
      '</section>' +
      '<div class="dash-grid">' +
      '<section class="dash-card span2"><div class="dc-head"><div><h2>' + U.icon('chart') + '每日净增与修订</h2><p id="dashTrendSub">柱：净增字数 · 虚线：修订次数</p></div><span class="dc-badge" id="dashRangeBadge"></span></div><div id="dashTrend"></div></section>' +
      '<section class="dash-card"><div class="dc-head"><div><h2>' + U.icon('pie') + '数据库字数占比</h2><p>实时读取两个数据库</p></div></div><div id="dashDonut"></div></section>' +
      '</div>' +
      '<div class="dash-grid three">' +
      '<section class="dash-card"><div class="dc-head"><div><h2>' + U.icon('layers') + '类型分布</h2><p>小说 / 毕设 / 资料 / 素材</p></div></div><div id="dashTypes"></div><div id="dashStatuses"></div></section>' +
      '<section class="dash-card"><div class="dc-head"><div><h2>' + U.icon('target') + '分类 Top</h2><p>按字数排序，最多九类</p></div></div><div id="dashCats"></div></section>' +
      '<section class="dash-card"><div class="dc-head"><div><h2>' + U.icon('clock') + '写作时段</h2><p>当前范围内每小时写入字数</p></div></div><div id="dashHours"></div></section>' +
      '</div>' +
      '<div class="dash-grid">' +
      '<section class="dash-card span2"><div class="dc-head"><div><h2>' + U.icon('activity') + '最近写作记录</h2><p>每一次新建、保存与速写</p></div><span class="dc-badge" id="dashRecentBadge"></span></div><div id="dashRecent"></div></section>' +
      '<section class="dash-card"><div class="dc-head"><div><h2>' + U.icon('gitBranch') + 'GitHub 同步</h2><p>只读 · 提交由你发起</p></div></div><div id="dashGit"></div></section>' +
      '</div>' +
      '<div class="dash-grid">' +
      '<section class="dash-card span2"><div class="dc-head"><div><h2>' + U.icon('history') + '最近修订</h2><p>每次保存留下的版本，可回到文章里回看</p></div><span class="dc-badge" id="dashRevBadge"></span></div><div id="dashRevisions"></div></section>' +
      '<section class="dash-card"><div class="dc-head"><div><h2>' + U.icon('database') + '数据库明细</h2><p>文件、字数与体积</p></div></div><div id="dashDbs"></div></section>' +
      '</div>' +
      '<div class="dash-foot" id="dashFoot">正在读取统计…</div>' +
      '</div>';
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function paint(d) {
    state.data = d;
    state.updatedAt = Date.now();
    setHtml('dashNote', noteHtml(d));
    setHtml('dashKpis', kpiHtml(d));
    setHtml('dashTrend', trendSvg(d.series));
    setHtml('dashRangeBadge', d.range.written + ' 写入 · ' + d.range.revisions + ' 修订 · ' + d.range.commits + ' 提交');
    setHtml('dashTrendSub', '柱：净增字数（' + d.span + ' 天）· 虚线：修订次数');
    setHtml('dashDonut', donutSvg(d.library.databases.map((db) => ({ name: db.name, value: db.words, color: db.color })), d.library.words));
    setHtml('dashTypes', typeBars(d.library.types));
    setHtml('dashStatuses', statusChips(d.library.statuses));
    setHtml('dashCats', catBars(d.library.topCats));
    setHtml('dashHours', hourSvg(d.hourly));
    setHtml('dashRecent', recentHtml(d.recent));
    setHtml('dashRecentBadge', d.recent.length ? '最近 ' + d.recent.length + ' 条' : '暂无记录');
    setHtml('dashGit', gitHtml(d.git));
    setHtml('dashRevisions', revisionsHtml(d.revisions));
    setHtml('dashRevBadge', d.revisions.total ? '累计 ' + fmt(d.revisions.total) + ' 个版本' : '暂无版本');
    setHtml('dashDbs', '<div class="dc-dbs">' + d.library.databases.map((db) => '<div class="dc-db" style="--db:' + db.color + '">' +
      '<span class="dcdb-head"><i></i><b>' + U.esc(db.name) + '</b><span>' + U.esc(db.short || '') + '</span></span>' +
      '<div class="dcdb-stats"><span><b>' + fmt(db.files) + '</b> 篇</span><span><b>' + fmt(db.words) + '</b> 字</span><span><b>' + fmtBytes(db.bytes) + '</b></span></div>' +
      '<div class="dcdb-bar"><i style="width:' + Math.max(2, pct(db.words, d.library.words)) + '%"></i></div></div>').join('') + '</div>');
    const foot = document.getElementById('dashFoot');
    if (foot) {
      const tm = new Date(d.generatedAt);
      foot.textContent = '统计生成于 ' + (Number.isNaN(tm.getTime()) ? '' : tm.toLocaleTimeString('zh-CN', { hour12: false })) +
        ' · 每 20 秒自动刷新 · 统计保存在本机浏览器（IndexedDB）';
    }
    const live = document.getElementById('dashLive');
    if (live) {
      live.classList.add('on');
      live.innerHTML = '<i></i>实时记录 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
    }
  }

  function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function showError(error) {
    const message = U.esc((error && error.message) || '读取统计失败');
    setHtml('dashNote', '<div class="dash-note error">' + U.icon('alert') + '<p>' + message + '。稍后自动重试，或点右上角刷新；统计保存在本机浏览器，不依赖外部服务。</p></div>');
    const foot = document.getElementById('dashFoot');
    if (foot) foot.textContent = '读取失败，稍后自动重试。';
  }

  async function load(silent) {
    if (state.loading) return;
    state.loading = true;
    const token = ++state.token;
    if (!silent) {
      const live = document.getElementById('dashLive');
      if (live) live.classList.remove('on');
    }
    try {
      const data = await Api.dashboard(state.days);
      if (token !== state.token) return;
      paint(data);
    } catch (error) {
      if (token === state.token) showError(error);
    } finally {
      state.loading = false;
    }
  }

  function bind() {
    const root = document.getElementById('libView');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const rangeBtn = e.target.closest('#dashRange [data-days]');
      if (rangeBtn) {
        const days = Number(rangeBtn.getAttribute('data-days')) || 30;
        if (days === state.days) return;
        state.days = days;
        $$('#dashRange [data-days]').forEach((b) => b.classList.toggle('on', Number(b.getAttribute('data-days')) === days));
        load();
        return;
      }
      if (e.target.closest('#dashRefresh')) {
        U.toast('正在刷新统计…', 'refresh');
        load();
      }
    });
  }

  function stop() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function open() {
    const host = document.getElementById('libView');
    if (!host) return;
    stop();
    state.token += 1;
    state.loading = false;
    host.innerHTML = shell();
    bind();
    load();
    state.timer = setInterval(() => {
      if (document.hidden) return;
      if (location.hash.replace(/^#/, '') !== '/dashboard') { stop(); return; }
      load(true);
    }, 20000);
  }

  window.Dashboard = { open, stop, refresh: load };
})();
