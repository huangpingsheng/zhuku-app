/* ============================================================
   github-api.js · 6.4 GitHub REST / Git Data API 客户端
   浏览器直连 api.github.com，不经过任何自建服务器。
   Token 只放在请求头里，不写日志、不写同步文件。
   ============================================================ */
(function () {
  'use strict';
  if (window.GitHubApi) return;

  const NATIVE_FETCH = window.fetch ? window.fetch.bind(window) : null;

  class GitHubError extends Error {
    constructor(message, status, code, data) {
      super(message);
      this.name = 'GitHubError';
      this.status = status || 0;
      this.code = code || '';
      this.data = data || null;
    }
  }

  function apiBase(cfg) {
    return String((cfg && cfg.apiBase) || 'https://api.github.com').replace(/\/+$/, '');
  }
  function seg(value) { return encodeURIComponent(String(value == null ? '' : value)); }
  function pathSegs(value) { return String(value || '').split('/').filter(Boolean).map(seg).join('/'); }
  function repoPath(cfg) {
    return '/repos/' + seg(cfg.owner) + '/' + seg(cfg.repo);
  }
  function refPath(cfg) {
    return repoPath(cfg) + '/git/ref/heads/' + pathSegs(cfg.branch || 'main');
  }
  function fileApiPath(cfg, path) {
    return repoPath(cfg) + '/contents/' + String(path || '').split('/').filter(Boolean).map(seg).join('/');
  }

  function b64encode(text) {
    const bytes = new TextEncoder().encode(String(text == null ? '' : text));
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64decode(value) {
    const bin = atob(String(value == null ? '' : value).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function byteLength(text) {
    try { return new TextEncoder().encode(String(text || '')).length; } catch (e) { return String(text || '').length; }
  }

  function friendlyMessage(status, data) {
    const raw = data && data.message ? String(data.message) : '';
    if (status === 401) return 'Token 无效或已过期（401）。请重新生成 fine-grained PAT，并勾选 Contents 读写。';
    if (status === 403) {
      if (data && /rate limit/i.test(raw)) return 'GitHub 接口频率限制（403）。请稍后再试。';
      return 'Token 权限不足（403）。fine-grained PAT 需要这个仓库的 Contents 读写权限。';
    }
    if (status === 404) return '找不到仓库、分支或文件（404）。请检查用户名、仓库名与分支。';
    if (status === 409) return '云端在提交时发生了变化（409）。请先拉取，再提交。';
    if (status === 422) return 'GitHub 拒绝了这次操作（422）：' + (raw || '分支不是快进更新，可能刚被其它设备推送过。');
    return raw || ('GitHub 返回 ' + status);
  }

  async function req(cfg, path, options) {
    if (!cfg || !cfg.token) throw new GitHubError('还没有填写 GitHub Token', 401, 'NO_TOKEN');
    if (!NATIVE_FETCH) throw new GitHubError('当前浏览器不支持网络请求', 0, 'NO_FETCH');
    const opts = Object.assign({ method: 'GET' }, options || {});
    opts.headers = Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + cfg.token,
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    opts.cache = 'no-store';
    if (opts.body != null && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await NATIVE_FETCH(apiBase(cfg) + path, opts);
    } catch (error) {
      throw new GitHubError('网络不可用，连不上 GitHub。请检查网络、代理或 API 地址。', 0, 'NETWORK');
    }
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { message: text }; }
    if (!res.ok) {
      throw new GitHubError(friendlyMessage(res.status, data), res.status, 'HTTP_' + res.status, data);
    }
    return data;
  }

  async function test(cfg) {
    const info = await req(cfg, repoPath(cfg));
    return {
      fullName: info.full_name || (cfg.owner + '/' + cfg.repo),
      private: !!info.private,
      defaultBranch: info.default_branch || '',
      canPush: !!(info.permissions && info.permissions.push),
      htmlUrl: info.html_url || ''
    };
  }

  async function getRef(cfg) {
    try {
      const ref = await req(cfg, refPath(cfg));
      return ref && ref.object ? ref : null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function getCommit(cfg, sha) {
    return req(cfg, repoPath(cfg) + '/git/commits/' + seg(sha));
  }

  async function getTree(cfg, sha) {
    return req(cfg, repoPath(cfg) + '/git/trees/' + seg(sha));
  }

  async function getBlob(cfg, sha) {
    const blob = await req(cfg, repoPath(cfg) + '/git/blobs/' + seg(sha));
    if (!blob) throw new GitHubError('云端文件为空', 404, 'EMPTY_BLOB');
    if (blob.encoding === 'base64') return b64decode(blob.content || '');
    return String(blob.content || '');
  }

  async function createBlob(cfg, text) {
    const blob = await req(cfg, repoPath(cfg) + '/git/blobs', {
      method: 'POST',
      body: { content: b64encode(text), encoding: 'base64' }
    });
    return blob && blob.sha;
  }

  async function createTree(cfg, entries, baseTree) {
    const body = { tree: entries || [] };
    if (baseTree) body.base_tree = baseTree;
    const tree = await req(cfg, repoPath(cfg) + '/git/trees', { method: 'POST', body });
    return tree && tree.sha;
  }

  async function createCommit(cfg, message, treeSha, parents) {
    const body = { message: message, tree: treeSha, parents: parents || [] };
    return req(cfg, repoPath(cfg) + '/git/commits', { method: 'POST', body });
  }

  async function updateRef(cfg, sha) {
    return req(cfg, repoPath(cfg) + '/git/refs/heads/' + pathSegs(cfg.branch || 'main'), {
      method: 'PATCH',
      body: { sha: sha, force: false }
    });
  }

  async function createRef(cfg, sha) {
    return req(cfg, repoPath(cfg) + '/git/refs', {
      method: 'POST',
      body: { ref: 'refs/heads/' + String(cfg.branch || 'main'), sha: sha }
    });
  }

  async function getContents(cfg, path) {
    return req(cfg, fileApiPath(cfg, path) + '?ref=' + seg(cfg.branch || 'main'));
  }

  async function listCommits(cfg, options) {
    const opts = options || {};
    const qs = new URLSearchParams();
    qs.set('sha', opts.sha || cfg.branch || 'main');
    qs.set('per_page', String(opts.perPage || 12));
    if (opts.path) qs.set('path', opts.path);
    return req(cfg, repoPath(cfg) + '/commits?' + qs.toString());
  }

  function repoWebUrl(cfg) {
    if (apiBase(cfg) !== 'https://api.github.com') return '';
    return 'https://github.com/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  }

  window.GitHubApi = {
    GitHubError,
    req,
    test,
    getRef,
    getCommit,
    getTree,
    getBlob,
    createBlob,
    createTree,
    createCommit,
    updateRef,
    createRef,
    getContents,
    listCommits,
    repoWebUrl,
    b64encode,
    b64decode,
    byteLength,
    apiBase
  };
})();
