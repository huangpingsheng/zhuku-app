/* ============================================================
   workspace.js · 写作台共用数据库（服务端工程.json）
   ============================================================ */
(function () {
  'use strict';
  const S = window.Store, C = window.Curation;

  const state = {
    loaded: false,
    applying: false,
    dirty: false,
    status: 'loading',
    error: '',
    baseUpdatedAt: 0,
    lastSavedAt: '',
    serverTime: '',
    device: '',
    replacedNewer: false,
    bytes: 0
  };

  let timer = null;
  let saving = null;

  function api() { return window.Gen6Api; }

  function deviceName() {
    if (state.device) return state.device;
    let name = window.lsGet('device.name', '');
    if (!name) {
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      name = (mobile ? '手机网页' : '电脑网页') + '-' + Math.random().toString(36).slice(2, 6);
      window.lsSet('device.name', name);
    }
    state.device = name;
    return name;
  }

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('workspace:status', { detail: info() }));
    } catch (e) { /* 忽略 */ }
  }

  function info() {
    return {
      loaded: state.loaded,
      status: state.status,
      error: state.error,
      dirty: state.dirty,
      lastSavedAt: state.lastSavedAt,
      baseUpdatedAt: state.baseUpdatedAt,
      device: state.device,
      replacedNewer: state.replacedNewer
    };
  }

  function mergeProjects(remote, local) {
    const map = new Map();
    (local || []).forEach((p) => { if (p && p.id) map.set(p.id, p); });
    (remote || []).forEach((raw) => {
      if (!raw || !raw.id) return;
      const mine = map.get(raw.id);
      if (!mine) { map.set(raw.id, S.migrate(raw)); return; }
      const rt = Number(raw.updatedAt) || 0;
      const lt = Number(mine.updatedAt) || 0;
      if (rt > lt) map.set(raw.id, S.migrate(raw));
    });
    return Array.from(map.values()).sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  }

  function mergeCuration(remote) {
    if (!remote || typeof remote !== 'object') return false;
    const merged = {};
    ['edits', 'notes', 'stars', 'reads'].forEach((key) => {
      merged[key] = Object.assign({}, remote[key] || {}, C[key] || {});
    });
    merged.recent = (C.recent && C.recent.length ? C.recent : (remote.recent || [])).slice(0, 12);
    C.importAll(merged, 'replace');
    return true;
  }

  async function load() {
    if (state.loaded) return true;
    if (!api() || !api().workspace) {
      state.status = 'offline';
      emit();
      return false;
    }
    state.status = 'loading';
    emit();
    try {
      const remote = await api().workspace();
      state.baseUpdatedAt = Number(remote.updatedAt) || 0;
      state.lastSavedAt = remote.savedAt || '';
      state.serverTime = remote.serverTime || '';
      state.applying = true;
      const remoteProjects = Array.isArray(remote.projects) ? remote.projects : [];
      if (remoteProjects.length) {
        S.projects = mergeProjects(remoteProjects, S.projects || []);
        await S.flush();
      }
      mergeCuration(remote.curation);
      state.applying = false;
      state.loaded = true;
      state.status = 'synced';
      state.error = '';
      emit();
      if (!remoteProjects.length && S.projects.length) schedule(800);
      return true;
    } catch (error) {
      state.applying = false;
      state.status = 'offline';
      state.error = error.message || '读取共用数据库失败';
      emit();
      return false;
    }
  }

  function schedule(delay) {
    if (state.applying || !state.loaded) return;
    state.dirty = true;
    if (state.status !== 'saving') state.status = 'dirty';
    clearTimeout(timer);
    timer = setTimeout(() => { flush(); }, delay == null ? 1500 : delay);
    emit();
  }

  async function flush() {
    clearTimeout(timer);
    if (state.applying || !state.loaded || !api() || !api().saveWorkspace) return false;
    if (saving) {
      await saving;
      if (!state.dirty) return true;
    }
    if (!state.dirty) return true;
    const payload = {
      baseUpdatedAt: state.baseUpdatedAt,
      device: deviceName(),
      projects: S.projects,
      curation: C.exportAll()
    };
    state.dirty = false;
    state.status = 'saving';
    emit();
    saving = api().saveWorkspace(payload).then((result) => {
      state.baseUpdatedAt = Number(result.updatedAt) || state.baseUpdatedAt;
      state.lastSavedAt = result.savedAt || new Date().toISOString();
      state.bytes = Number(result.bytes) || 0;
      state.replacedNewer = !!result.replacedNewer;
      state.status = 'synced';
      state.error = '';
      saving = null;
      emit();
      if (state.dirty) schedule(500);
      return true;
    }).catch((error) => {
      state.dirty = true;
      state.status = 'error';
      state.error = error.message || '保存到共用数据库失败';
      saving = null;
      emit();
      return false;
    });
    return saving;
  }

  function flushBeacon() {
    if (!state.dirty || !state.loaded) return;
    try {
      const body = JSON.stringify({
        baseUpdatedAt: state.baseUpdatedAt,
        device: deviceName(),
        projects: S.projects,
        curation: C.exportAll()
      });
      fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true
      }).catch(() => {});
      state.dirty = false;
    } catch (e) { /* 忽略 */ }
  }

  window.addEventListener('pagehide', flushBeacon);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.loaded) flush();
    } else if (state.loaded && state.status === 'offline') {
      load();
    }
  });

  window.WorkspaceSync = {
    load,
    schedule,
    flush,
    info,
    get state() { return info(); },
    get ready() { return state.loaded; }
  };
})();
