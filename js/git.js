/* ============================================================
   git.js · GitHub 同步（Fine-grained PAT）
   ============================================================ */
(function () {
  'use strict';
  const U = window.U;
  const S = window.Store;

  function cfg() {
    const c = window.lsGet('git', null) || {};
    return {
      user: c.user || '', repo: c.repo || '', branch: c.branch || 'main',
      dir: c.dir || '写作库', token: c.token || ''
    };
  }
  function saveCfg(c) { window.lsSet('git', c); }
  function ready(c) { return c.user && c.repo && c.token; }

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob((b64 || '').replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function api(path, opts) {
    const c = cfg();
    if (!c.token) throw new Error('请先填写 GitHub Token');
    const url = 'https://api.github.com' + path;
    let res;
    try {
      res = await fetch(url, Object.assign({
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + c.token,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        cache: 'no-store'
      }, opts || {}));
    } catch (e) {
      throw new Error('网络不可用，或 GitHub 无法访问');
    }
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = j.message || ''; } catch (e) {}
      if (res.status === 401) throw new Error('Token 无效或已过期（401）');
      if (res.status === 403) throw new Error('Token 权限不足（403）：需要 Contents 读写');
      if (res.status === 404) throw new Error('找不到仓库或目录（404），请检查用户名/仓库名/分支');
      if (res.status === 409) throw new Error('分支冲突（409），请重试');
      throw new Error(msg || ('GitHub 返回 ' + res.status));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function repoPath(p) {
    return '/repos/' + encodeURIComponent(cfg().user) + '/' + encodeURIComponent(cfg().repo) + p;
  }
  function fileApiPath(path) {
    return repoPath('/contents/' + path.split('/').map(encodeURIComponent).join('/'));
  }

  async function test() {
    const c = cfg();
    if (!ready(c)) throw new Error('请先填写用户名、仓库名和 Token');
    const info = await api(repoPath(''));
    return { name: info.full_name, private: info.private, branch: info.default_branch };
  }

  async function putFile(path, content, message) {
    const c = cfg();
    let sha = null;
    try {
      const old = await api(fileApiPath(path) + '?ref=' + encodeURIComponent(c.branch));
      sha = old && old.sha;
    } catch (e) {
      if (!/404/.test(e.message)) throw e;
    }
    const body = {
      message: message || ('更新 ' + path),
      content: b64encode(content),
      branch: c.branch
    };
    if (sha) body.sha = sha;
    const res = await api(fileApiPath(path), {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    return res && res.commit;
  }

  async function uploadBackup() {
    const c = cfg();
    if (!ready(c)) throw new Error('请先完成 Git 配置');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = U.todayKey(d) + '-' + pad(d.getHours()) + pad(d.getMinutes());
    const path = c.dir.replace(/\/+$/, '') + '/工程备份-' + stamp + '.json';
    const data = S.exportAll();
    const commit = await putFile(path, JSON.stringify(data, null, 2), '写作库 Studio 工程备份 ' + stamp);
    return { path, commit };
  }

  async function uploadBook(p) {
    const c = cfg();
    if (!ready(c)) throw new Error('请先完成 Git 配置');
    if (!p) throw new Error('没有打开的作品');
    const md = window.LibExport.mdOf(p);
    const path = c.dir.replace(/\/+$/, '') + '/' + p.name.replace(/[\\/:*?"<>|]/g, '_') + '.md';
    const commit = await putFile(path, md, '更新小说成稿：' + p.name);
    return { path, commit };
  }

  async function listCloud() {
    const c = cfg();
    if (!ready(c)) throw new Error('请先完成 Git 配置');
    try {
      const list = await api(fileApiPath(c.dir) + '?ref=' + encodeURIComponent(c.branch));
      if (!Array.isArray(list)) return [];
      return list.filter((f) => f.type === 'file' && /\.(json|md)$/i.test(f.name))
        .sort((a, b) => (b.name > a.name ? 1 : -1));
    } catch (e) {
      if (/404/.test(e.message)) return [];
      throw e;
    }
  }

  async function readFile(path) {
    const res = await api(fileApiPath(path) + '?ref=' + encodeURIComponent(cfg().branch));
    return b64decode(res.content || '');
  }

  window.GitSync = { cfg, saveCfg, ready, test, uploadBackup, uploadBook, listCloud, readFile, putFile };
})();
