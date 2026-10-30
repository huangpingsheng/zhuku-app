/* ============================================================
   theme-engine.js · 主题插件引擎（纸质 / 玻璃 / 磨砂 / 液态）
   ============================================================ */
(function () {
  'use strict';
  const U = window.U;
  const root = document.documentElement;
  const state = {
    active: '',
    plugins: [],
    market: null,
    ready: false,
    error: ''
  };

  const BUILTINS = [
    {
      id: 'paper-texture',
      name: '纸质纹理',
      version: '1.2.0',
      author: '写作库 6.3',
      description: '温热的纸面、细纤维与边缘暗角。适合长文阅读与手写感的稿纸。',
      params: {
        tint: { label: '纸色', type: 'color', def: '#F4EDDF' },
        ink: { label: '墨色', type: 'color', def: '#2E2924' },
        grain: { label: '颗粒', type: 'range', min: 0, max: 60, step: 1, def: 38 },
        fiber: { label: '纤维', type: 'range', min: 0, max: 60, step: 1, def: 28 },
        vignette: { label: '边缘暗角', type: 'range', min: 0, max: 60, step: 1, def: 26 },
        radius: { label: '圆角', type: 'range', min: 0, max: 26, step: 1, unit: 'px', def: 10 }
      },
      cssText: `
html[data-skin="paper-texture"]{
  --bg:var(--skin-tint,#F4EDDF);
  --surface:color-mix(in srgb,var(--skin-tint,#F4EDDF) 78%,#fff);
  --surface-2:color-mix(in srgb,var(--skin-tint,#F4EDDF) 86%,#000 4%);
  --surface-3:color-mix(in srgb,var(--skin-tint,#F4EDDF) 80%,#000 8%);
  --ink:var(--skin-ink,#2E2924);
  --ink-2:color-mix(in srgb,var(--skin-ink,#2E2924) 76%,var(--skin-tint,#F4EDDF));
  --ink-3:color-mix(in srgb,var(--skin-ink,#2E2924) 48%,var(--skin-tint,#F4EDDF));
  --line:color-mix(in srgb,var(--skin-ink,#2E2924) 14%,transparent);
  --line-2:color-mix(in srgb,var(--skin-ink,#2E2924) 8%,transparent);
  --accent:#8A4B2F;--accent-soft:color-mix(in srgb,#8A4B2F 14%,transparent);--accent-ink:#FFF8EE;
  --star:#A9761E;
  --r-sm:8px;--r-md:10px;--r-lg:14px;--r-xl:18px;
  --sh-sm:0 1px 0 rgba(60,40,20,.07);
  --sh-md:0 16px 36px -22px rgba(70,45,20,.45),0 2px 6px rgba(70,45,20,.08);
  --sh-lg:0 28px 70px -30px rgba(70,45,20,.5),0 4px 12px rgba(70,45,20,.08);
}
html[data-theme="dark"][data-skin="paper-texture"]{
  --bg:color-mix(in srgb,var(--skin-tint,#F4EDDF) 8%,#14110E);
  --surface:color-mix(in srgb,var(--skin-tint,#F4EDDF) 13%,#1A1712);
  --surface-2:color-mix(in srgb,var(--skin-tint,#F4EDDF) 18%,#1E1A14);
  --surface-3:color-mix(in srgb,var(--skin-tint,#F4EDDF) 23%,#241F18);
  --ink:#E9DFCD;
  --ink-2:color-mix(in srgb,#E9DFCD 74%,#14110E);
  --ink-3:color-mix(in srgb,#E9DFCD 46%,#14110E);
  --accent:#D9A877;--accent-soft:color-mix(in srgb,#D9A877 16%,transparent);--accent-ink:#1A1410;
  --line:color-mix(in srgb,#E9DFCD 14%,transparent);
  --line-2:color-mix(in srgb,#E9DFCD 8%,transparent);
}
html[data-skin="paper-texture"] body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:9997;
  background-image:var(--theme-noise);background-size:180px 180px;
  opacity:calc(var(--skin-grain,38) * .006);mix-blend-mode:multiply;
}
html[data-skin="paper-texture"] body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:9996;
  background:
    radial-gradient(ellipse at 50% 42%,transparent 52%,rgba(72,46,20,calc(var(--skin-vignette,26) * .0035)) 100%),
    repeating-linear-gradient(0deg,rgba(106,74,38,calc(var(--skin-fiber,28) * .0018)) 0 1px,transparent 1px 5px),
    repeating-linear-gradient(90deg,rgba(255,255,255,calc(var(--skin-fiber,28) * .0022)) 0 1px,transparent 1px 7px);
}
html[data-theme="dark"][data-skin="paper-texture"] body::after{mix-blend-mode:screen;opacity:calc(var(--skin-grain,38) * .004)}
`
    },
    {
      id: 'glass-clear',
      name: '清透玻璃',
      version: '1.2.0',
      author: '写作库 6.3',
      description: '半透明面板、柔光与蓝色折射。界面像浮在纸面与光线之间。',
      params: {
        tint: { label: '玻璃颜色', type: 'color', def: '#FFFFFF' },
        alpha: { label: '通透度', type: 'range', min: 30, max: 92, step: 1, unit: '%', def: 64 },
        blur: { label: '模糊', type: 'range', min: 0, max: 40, step: 1, unit: 'px', def: 24 },
        border: { label: '描边', type: 'range', min: 0, max: 70, step: 1, unit: '%', def: 30 },
        radius: { label: '圆角', type: 'range', min: 0, max: 30, step: 1, unit: 'px', def: 18 }
      },
      cssText: `
html[data-skin="glass-clear"]{
  --surface:color-mix(in srgb,var(--skin-tint,#FFFFFF) var(--skin-alpha,64%),transparent);
  --surface-2:color-mix(in srgb,var(--skin-tint,#FFFFFF) calc(var(--skin-alpha,64%) * .62),transparent);
  --surface-3:color-mix(in srgb,var(--skin-tint,#FFFFFF) calc(var(--skin-alpha,64%) * .84),transparent);
  --line:color-mix(in srgb,#FFFFFF var(--skin-border,30%),transparent);
  --line-2:color-mix(in srgb,#FFFFFF calc(var(--skin-border,30%) * .55),transparent);
  --r-sm:10px;--r-md:14px;--r-lg:18px;--r-xl:24px;
}
html[data-theme="dark"][data-skin="glass-clear"]{
  --surface:color-mix(in srgb,#1A1D22 var(--skin-alpha,64%),transparent);
  --surface-2:color-mix(in srgb,#20242B calc(var(--skin-alpha,64%) * .72),transparent);
  --line:color-mix(in srgb,#FFFFFF calc(var(--skin-border,30%) * .4),transparent);
  --line-2:color-mix(in srgb,#FFFFFF calc(var(--skin-border,30%) * .2),transparent);
}
html[data-skin="glass-clear"] body{
  background:
    radial-gradient(900px 620px at 8% -8%,color-mix(in srgb,#A8C4FF 34%,transparent),transparent 62%),
    radial-gradient(900px 680px at 98% 108%,color-mix(in srgb,#FFC9A8 26%,transparent),transparent 60%),
    var(--bg);
}
html[data-skin="glass-clear"] .app{background:transparent}
html[data-skin="glass-clear"] .topbar,
html[data-skin="glass-clear"] .sidebar,
html[data-skin="glass-clear"] .wpanel,
html[data-skin="glass-clear"] .wtop,
html[data-skin="glass-clear"] .modal,
html[data-skin="glass-clear"] .palette,
html[data-skin="glass-clear"] .menu,
html[data-skin="glass-clear"] .mobile-nav,
html[data-skin="glass-clear"] .lib-fab,
html[data-skin="glass-clear"] .art-row,
html[data-skin="glass-clear"] .cat-card,
html[data-skin="glass-clear"] .project-card,
html[data-skin="glass-clear"] .insight-card,
html[data-skin="glass-clear"] .continue-card,
html[data-skin="glass-clear"] .ent-card,
html[data-skin="glass-clear"] .set-box,
html[data-skin="glass-clear"] .goal-card{
  background:var(--surface)!important;
  -webkit-backdrop-filter:blur(var(--skin-blur,24px)) saturate(1.55);
  backdrop-filter:blur(var(--skin-blur,24px)) saturate(1.55);
  border-color:var(--line);
}
html[data-skin="glass-clear"] .topbar,
html[data-skin="glass-clear"] .wtop,
html[data-skin="glass-clear"] .mobile-nav{
  box-shadow:inset 0 1px 0 rgba(255,255,255,.42);
}
`
    },
    {
      id: 'frosted-soft',
      name: '磨砂雾面',
      version: '1.2.0',
      author: '写作库 6.3',
      description: '低饱和雾面、细颗粒与柔和的边界。长时间写作不刺眼。',
      params: {
        tint: { label: '雾面色', type: 'color', def: '#F7F6F2' },
        alpha: { label: '厚度', type: 'range', min: 45, max: 96, step: 1, unit: '%', def: 74 },
        frost: { label: '磨砂强度', type: 'range', min: 4, max: 42, step: 1, unit: 'px', def: 22 },
        grain: { label: '细颗粒', type: 'range', min: 0, max: 50, step: 1, def: 16 },
        radius: { label: '圆角', type: 'range', min: 0, max: 28, step: 1, unit: 'px', def: 16 }
      },
      cssText: `
html[data-skin="frosted-soft"]{
  --surface:color-mix(in srgb,var(--skin-tint,#F7F6F2) var(--skin-alpha,74%),transparent);
  --surface-2:color-mix(in srgb,var(--skin-tint,#F7F6F2) calc(var(--skin-alpha,74%) * .68),transparent);
  --surface-3:color-mix(in srgb,var(--skin-tint,#F7F6F2) calc(var(--skin-alpha,74%) * .88),transparent);
  --line:color-mix(in srgb,#7B8794 16%,transparent);
  --line-2:color-mix(in srgb,#7B8794 9%,transparent);
  --r-sm:9px;--r-md:12px;--r-lg:16px;--r-xl:22px;
}
html[data-theme="dark"][data-skin="frosted-soft"]{
  --surface:color-mix(in srgb,#191C21 var(--skin-alpha,74%),transparent);
  --surface-2:color-mix(in srgb,#20242A calc(var(--skin-alpha,74%) * .72),transparent);
  --line:color-mix(in srgb,#C9D2DD 12%,transparent);
  --line-2:color-mix(in srgb,#C9D2DD 7%,transparent);
}
html[data-skin="frosted-soft"] body{
  background:
    radial-gradient(1100px 720px at 50% -20%,color-mix(in srgb,#DDE4EE 55%,transparent),transparent 65%),
    var(--bg);
}
html[data-skin="frosted-soft"] .app{background:transparent}
html[data-skin="frosted-soft"] .topbar,
html[data-skin="frosted-soft"] .sidebar,
html[data-skin="frosted-soft"] .wpanel,
html[data-skin="frosted-soft"] .wtop,
html[data-skin="frosted-soft"] .modal,
html[data-skin="frosted-soft"] .palette,
html[data-skin="frosted-soft"] .menu,
html[data-skin="frosted-soft"] .mobile-nav,
html[data-skin="frosted-soft"] .lib-fab,
html[data-skin="frosted-soft"] .art-row,
html[data-skin="frosted-soft"] .cat-card,
html[data-skin="frosted-soft"] .project-card,
html[data-skin="frosted-soft"] .insight-card,
html[data-skin="frosted-soft"] .continue-card,
html[data-skin="frosted-soft"] .ent-card,
html[data-skin="frosted-soft"] .set-box,
html[data-skin="frosted-soft"] .goal-card{
  background:var(--surface)!important;
  -webkit-backdrop-filter:blur(var(--skin-frost,22px)) saturate(1.08);
  backdrop-filter:blur(var(--skin-frost,22px)) saturate(1.08);
  border-color:var(--line);
}
html[data-skin="frosted-soft"] body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:9997;
  background-image:var(--theme-noise);background-size:200px 200px;
  opacity:calc(var(--skin-grain,16) * .005);mix-blend-mode:soft-light;
}
`
    },
    {
      id: 'liquid-glass',
      name: '液态玻璃',
      version: '1.2.0',
      author: '写作库 6.3',
      description: '更厚的折射、流动的色光与高光边缘。缓慢呼吸，不抢文字。',
      params: {
        tint: { label: '液体颜色', type: 'color', def: '#EEF4FF' },
        alpha: { label: '通透度', type: 'range', min: 28, max: 88, step: 1, unit: '%', def: 52 },
        blur: { label: '折射模糊', type: 'range', min: 8, max: 48, step: 1, unit: 'px', def: 32 },
        highlight: { label: '高光', type: 'range', min: 0, max: 100, step: 1, def: 62 },
        motion: { label: '流动速度', type: 'range', min: 2, max: 20, step: 1, def: 10 },
        radius: { label: '圆角', type: 'range', min: 8, max: 34, step: 1, unit: 'px', def: 22 }
      },
      cssText: `
html[data-skin="liquid-glass"]{
  --surface:color-mix(in srgb,var(--skin-tint,#EEF4FF) var(--skin-alpha,52%),transparent);
  --surface-2:color-mix(in srgb,var(--skin-tint,#EEF4FF) calc(var(--skin-alpha,52%) * .6),transparent);
  --surface-3:color-mix(in srgb,var(--skin-tint,#EEF4FF) calc(var(--skin-alpha,52%) * .82),transparent);
  --line:color-mix(in srgb,#FFFFFF 34%,transparent);
  --line-2:color-mix(in srgb,#FFFFFF 18%,transparent);
  --r-sm:12px;--r-md:16px;--r-lg:22px;--r-xl:30px;
}
html[data-theme="dark"][data-skin="liquid-glass"]{
  --surface:color-mix(in srgb,#171B22 var(--skin-alpha,52%),transparent);
  --surface-2:color-mix(in srgb,#1E232C calc(var(--skin-alpha,52%) * .7),transparent);
  --line:color-mix(in srgb,#FFFFFF 16%,transparent);
  --line-2:color-mix(in srgb,#FFFFFF 8%,transparent);
}
html[data-skin="liquid-glass"] body{
  background:
    radial-gradient(60% 50% at 18% 16%,color-mix(in srgb,#8DB7FF 42%,transparent),transparent 66%),
    radial-gradient(55% 46% at 86% 18%,color-mix(in srgb,#D7B9FF 34%,transparent),transparent 64%),
    radial-gradient(62% 52% at 64% 96%,color-mix(in srgb,#9BE7D2 28%,transparent),transparent 66%),
    var(--bg);
  background-size:170% 170%;
  animation:skin-liquid-move calc(34s - var(--skin-motion,10) * 1s) ease-in-out infinite alternate;
}
@keyframes skin-liquid-move{
  from{background-position:0% 0%,100% 0%,50% 100%,0 0}
  to{background-position:26% 18%,72% 22%,40% 74%,0 0}
}
html[data-skin="liquid-glass"] .app{background:transparent}
html[data-skin="liquid-glass"] .topbar,
html[data-skin="liquid-glass"] .sidebar,
html[data-skin="liquid-glass"] .wpanel,
html[data-skin="liquid-glass"] .wtop,
html[data-skin="liquid-glass"] .modal,
html[data-skin="liquid-glass"] .palette,
html[data-skin="liquid-glass"] .menu,
html[data-skin="liquid-glass"] .mobile-nav,
html[data-skin="liquid-glass"] .lib-fab,
html[data-skin="liquid-glass"] .art-row,
html[data-skin="liquid-glass"] .cat-card,
html[data-skin="liquid-glass"] .project-card,
html[data-skin="liquid-glass"] .insight-card,
html[data-skin="liquid-glass"] .continue-card,
html[data-skin="liquid-glass"] .ent-card,
html[data-skin="liquid-glass"] .set-box,
html[data-skin="liquid-glass"] .goal-card{
  background:var(--surface)!important;
  -webkit-backdrop-filter:blur(var(--skin-blur,32px)) saturate(1.8);
  backdrop-filter:blur(var(--skin-blur,32px)) saturate(1.8);
  border-color:var(--line);
  box-shadow:inset 0 1px 0 rgba(255,255,255,calc(var(--skin-highlight,62) * .006)),0 14px 44px -26px rgba(20,40,90,.5);
}
html[data-skin="liquid-glass"] .topbar,
html[data-skin="liquid-glass"] .wtop,
html[data-skin="liquid-glass"] .mobile-nav{
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 10px 30px -24px rgba(20,40,90,.55);
}
`
    }
  ];

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem('ws.' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem('ws.' + key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
  }

  function normalizeManifest(manifest) {
    const params = manifest && manifest.params && typeof manifest.params === 'object' ? manifest.params : {};
    const defaults = Object.assign({}, manifest && manifest.defaults, {});
    Object.keys(params).forEach((key) => {
      const meta = params[key] || {};
      if (defaults[key] == null && meta.def != null) defaults[key] = meta.def;
    });
    return {
      id: String(manifest.id || ''),
      name: String(manifest.name || manifest.id || '未命名主题'),
      version: String(manifest.version || '1.0.0'),
      author: String(manifest.author || ''),
      description: String(manifest.description || ''),
      params,
      defaults,
      cssText: String(manifest.cssText || manifest.css || ''),
      plugin: !!manifest.plugin,
      enabled: manifest.enabled !== false
    };
  }

  function builtinSkins() {
    return BUILTINS.map((s) => normalizeManifest(Object.assign({}, s, { plugin: false, enabled: true })));
  }

  function pluginSkins() {
    return state.plugins
      .filter((p) => p && p.type === 'theme')
      .map((p) => normalizeManifest(Object.assign({}, p, { plugin: true })));
  }

  function allSkins() {
    const map = new Map();
    builtinSkins().forEach((s) => map.set(s.id, s));
    pluginSkins().forEach((s) => map.set(s.id, Object.assign({}, map.get(s.id) || {}, s, { plugin: true })));
    return Array.from(map.values());
  }

  function findSkin(id) {
    return allSkins().find((s) => s.id === id) || null;
  }

  function isDark() {
    return root.getAttribute('data-theme') === 'dark';
  }

  function savedParams() {
    return lsGet('theme.params', {}) || {};
  }

  function paramsOf(id) {
    const skin = findSkin(id);
    if (!skin) return {};
    const saved = savedParams()[id] || {};
    const out = Object.assign({}, skin.defaults, saved);
    if (skin.id === 'glass-clear' && isDark() && !('tint' in saved)) out.tint = '#1A1D22';
    if (skin.id === 'liquid-glass' && isDark() && !('tint' in saved)) out.tint = '#171B22';
    if (skin.id === 'frosted-soft' && isDark() && !('tint' in saved)) out.tint = '#191C21';
    return out;
  }

  function ensureStyle(key, css) {
    let el = document.querySelector('style[data-skin-css="' + key + '"]');
    if (!css) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.setAttribute('data-skin-css', key);
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  function injectCss() {
    builtinSkins().forEach((skin) => ensureStyle('builtin-' + skin.id, skin.cssText));
    const keep = new Set();
    pluginSkins().forEach((skin) => {
      if (!skin.enabled) return;
      keep.add(skin.id);
      ensureStyle('plugin-' + skin.id, skin.cssText || '');
    });
    Array.from(document.querySelectorAll('style[data-skin-css^="plugin-"]')).forEach((el) => {
      const id = el.getAttribute('data-skin-css').replace(/^plugin-/, '');
      if (!keep.has(id)) el.remove();
    });
  }

  function applyTheme(id, options) {
    const opts = options || {};
    const skin = id ? findSkin(id) : null;
    if (!skin) {
      clear();
      return false;
    }
    ensureStyle(skin.plugin ? 'plugin-' + skin.id : 'builtin-' + skin.id, skin.cssText || '');
    root.setAttribute('data-skin', skin.id);
    const params = paramsOf(skin.id);
    Object.keys(params).forEach((key) => {
      const meta = skin.params[key] || {};
      let value = params[key];
      if (meta.type === 'range') value = String(value) + (meta.unit || '');
      root.style.setProperty('--skin-' + key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(value));
    });
    if (skin.params.radius) root.style.setProperty('--skin-radius', String(params.radius) + (skin.params.radius.unit || ''));
    state.active = skin.id;
    if (!opts.silent) lsSet('theme.active', skin.id);
    document.dispatchEvent(new CustomEvent('theme:applied', { detail: { id: skin.id, skin, params } }));
    return true;
  }

  function clear() {
    root.removeAttribute('data-skin');
    const props = [];
    for (let i = 0; i < root.style.length; i++) {
      const name = root.style[i];
      if (name.indexOf('--skin-') === 0) props.push(name);
    }
    props.forEach((name) => root.style.removeProperty(name));
    state.active = '';
    lsSet('theme.active', '');
    document.dispatchEvent(new CustomEvent('theme:applied', { detail: { id: '', skin: null, params: {} } }));
  }

  function setParam(id, key, value) {
    const map = savedParams();
    if (!map[id]) map[id] = {};
    map[id][key] = value;
    lsSet('theme.params', map);
    if (state.active === id) applyTheme(id, { silent: true });
  }

  function reset(id) {
    const map = savedParams();
    delete map[id];
    lsSet('theme.params', map);
    if (state.active === id) applyTheme(id, { silent: true });
  }

  function defaultsOf(id) {
    const skin = findSkin(id);
    return skin ? Object.assign({}, skin.defaults) : {};
  }

  function manifestOf(id) {
    const skin = findSkin(id);
    if (!skin) return null;
    return {
      id: skin.id,
      name: skin.name,
      version: skin.version,
      type: 'theme',
      author: skin.author,
      description: skin.description,
      params: skin.params,
      defaults: skin.defaults,
      cssText: skin.cssText,
      source: '写作库 6.3 内置'
    };
  }

  function exportSkin(id) {
    const manifest = manifestOf(id);
    if (!manifest) { U.toast('找不到这个主题', 'alert'); return; }
    U.download(manifest.id + '-' + manifest.version + '.theme.json', JSON.stringify(manifest, null, 2), 'application/json');
    U.toast('主题已下载，可上传到你的插件仓库', 'download');
  }

  async function refreshPlugins() {
    if (!window.Gen6Api) return;
    const raw = await window.Gen6Api.plugins();
    state.plugins = Array.isArray(raw) ? raw : ((raw && raw.plugins) || []);
    injectCss();
    if (state.active && !findSkin(state.active)) clear();
    return state.plugins;
  }

  async function installManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') throw new Error('主题清单不合法');
    manifest.type = 'theme';
    const record = await window.Gen6Api.installPlugin({ manifest });
    await refreshPlugins();
    return record;
  }

  async function installFromUrl(url) {
    if (!window.Gen6Api) throw new Error('本地服务没有连上');
    const record = await window.Gen6Api.installPlugin({ url });
    await refreshPlugins();
    return record;
  }

  async function removeSkin(id) {
    const skin = findSkin(id);
    if (!skin || !skin.plugin) throw new Error('内置主题不能删除，可以关闭或恢复默认');
    await window.Gen6Api.deletePlugin(id);
    if (state.active === id) clear();
    await refreshPlugins();
  }

  async function toggleSkin(id, enabled) {
    await window.Gen6Api.togglePlugin(id, enabled);
    if (!enabled && state.active === id) clear();
    await refreshPlugins();
  }

  async function seedBuiltins() {
    if (!window.Gen6Api) return;
    let settings = null;
    try { settings = await window.Gen6Api.settings(); } catch (e) { return; }
    if (settings && settings.plugins && settings.plugins.themesSeeded) return;
    const installed = new Set(state.plugins.filter((p) => p.type === 'theme').map((p) => p.id));
    for (const skin of BUILTINS) {
      if (installed.has(skin.id)) continue;
      try {
        await window.Gen6Api.installPlugin({ manifest: Object.assign({}, skin, { type: 'theme', plugin: true }) });
      } catch (e) { console.warn('主题安装失败', skin.id, e); }
    }
    try {
      await window.Gen6Api.saveSettings({
        plugins: Object.assign({}, (settings && settings.plugins) || {}, { themesSeeded: true })
      });
    } catch (e) { console.warn(e); }
    await refreshPlugins();
  }

  async function boot() {
    applyTheme(lsGet('theme.active', '') || '', { silent: true });
    injectCss();
    if (!window.Gen6Api) { state.ready = true; return; }
    try {
      await refreshPlugins();
      await seedBuiltins();
      injectCss();
      const active = state.active;
      if (active) applyTheme(active, { silent: true });
      state.ready = true;
      state.error = '';
    } catch (error) {
      state.ready = true;
      state.error = error.message || '主题插件读取失败';
      console.warn('主题引擎启动失败', error);
    }
  }

  /* 主题切换后刷新默认色（深色玻璃） */
  const observer = new MutationObserver((changes) => {
    changes.forEach((change) => {
      if (change.attributeName === 'data-theme' && state.active) applyTheme(state.active, { silent: true });
    });
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  window.ThemeEngine = {
    boot,
    list: allSkins,
    builtins: builtinSkins,
    active: () => state.active,
    apply: applyTheme,
    clear,
    paramsOf,
    defaultsOf,
    setParam,
    reset,
    manifestOf,
    exportSkin,
    refreshPlugins,
    installManifest,
    installFromUrl,
    removeSkin,
    toggleSkin,
    injectCss,
    find: findSkin,
    get plugins() { return state.plugins.slice(); },
    get ready() { return state.ready; },
    get error() { return state.error; }
  };
})();
