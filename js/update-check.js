/* 应用版本检查：发现远端版本更新时提示刷新，不自动打断写作。 */
(function () {
  'use strict';

  const SKIP_KEY = 'update.skip';
  let timer = null;
  let checking = false;

  function localBuild() {
    return (window.WB64 && window.WB64.BUILD) || '';
  }

  function remoteUrl() {
    return (window.WB64 && window.WB64.remote && window.WB64.remote.versionUrl) || '';
  }

  function parts(value) {
    return (String(value || '').match(/\d+/g) || []).map(Number);
  }

  function newer(remote, local) {
    const a = parts(remote);
    const b = parts(local);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  function dismissed(build) {
    try {
      const saved = JSON.parse(localStorage.getItem(SKIP_KEY) || 'null');
      return !!(saved && saved.build === build && Date.now() < Number(saved.until || 0));
    } catch (e) {
      return false;
    }
  }

  function remember(build, until) {
    try { localStorage.setItem(SKIP_KEY, JSON.stringify({ build, until })); } catch (e) { /* 忽略 */ }
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function show(data) {
    if (document.querySelector('.update-banner')) return;
    const box = document.createElement('div');
    box.className = 'update-banner';
    box.innerHTML = '<div class="ub-main"><b>写作库 ' + esc(data.build) + ' 已发布</b>' +
      '<span>' + esc(data.notes || '刷新后使用新版本；本机文章、设置和同步基线不受影响。') + '</span></div>' +
      '<div class="ub-actions"><button class="btn sm" data-update-later>稍后</button>' +
      '<button class="btn sm primary" data-update-now>刷新</button></div>';
    document.body.appendChild(box);
    box.querySelector('[data-update-now]').onclick = () => {
      remember(data.build, 0);
      const url = new URL(location.href);
      url.searchParams.set('v', data.build);
      location.replace(url.toString());
    };
    box.querySelector('[data-update-later]').onclick = () => {
      remember(data.build, Date.now() + 24 * 3600 * 1000);
      box.remove();
    };
  }

  async function check() {
    if (checking) return;
    const build = localBuild();
    const url = remoteUrl();
    if (!build || !url || location.protocol === 'file:' || navigator.onLine === false) return;
    checking = true;
    try {
      const res = await fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.build && newer(data.build, build) && !dismissed(data.build)) show(data);
    } catch (e) {
      /* 离线或清单还没发布时静默 */
    } finally {
      checking = false;
    }
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => check(), 10 * 60 * 1000);
  }

  window.addEventListener('online', () => check());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setTimeout(() => { check(); schedule(); }, 6000);

  window.UpdateCheck = { check };
})();
