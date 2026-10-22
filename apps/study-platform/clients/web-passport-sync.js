(function (global) {
  'use strict';

  const API = '/navistudy-api';

  function randomId(prefix) {
    const suffix = global.crypto?.randomUUID ? global.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  function deviceId() {
    let value = localStorage.getItem('navi_device_id');
    if (!value) {
      value = randomId('web');
      localStorage.setItem('navi_device_id', value);
    }
    return value;
  }

  function csrf() {
    return decodeURIComponent((document.cookie.match(/(?:^|; )navi_csrf=([^;]*)/) || [])[1] || '');
  }

  async function request(path, options) {
    const init = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
    init.headers = Object.assign({ Accept: 'application/json' }, init.headers || {});
    if (init.body) init.headers['Content-Type'] = 'application/json';
    if (init.method && init.method !== 'GET' && csrf()) init.headers['X-CSRF-Token'] = csrf();
    let response = await fetch(API + path, init);
    if (response.status === 401 && path !== '/api/v1/auth/refresh') {
      const refreshed = await fetch(API + '/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: '{}' });
      if (refreshed.ok) response = await fetch(API + path, init);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      const error = new Error(body?.error?.message || `HTTP ${response.status}`);
      error.code = body?.error?.code;
      throw error;
    }
    return body;
  }

  async function pkceChallenge(verifier) {
    const bytes = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function startLogin(clientId, redirectUri) {
    const verifier = randomId('pkce') + randomId('v');
    const state = randomId('state');
    sessionStorage.setItem('navi_pkce_verifier', verifier);
    sessionStorage.setItem('navi_oauth_state', state);
    sessionStorage.setItem('navi_oauth_return', location.href);
    const challenge = await pkceChallenge(verifier);
    const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state });
    location.assign(`https://study.example.test/oauth/authorize?${query}`);
  }

  async function finishLogin(clientId, redirectUri) {
    const query = new URLSearchParams(location.search);
    if (!query.get('code')) return false;
    if (query.get('state') !== sessionStorage.getItem('navi_oauth_state')) throw new Error('授权状态校验失败，请重新登录。');
    await request('/oauth/token', { method: 'POST', body: JSON.stringify({
      code: query.get('code'),
      clientId,
      redirectUri,
      codeVerifier: sessionStorage.getItem('navi_pkce_verifier') || '',
      deviceId: deviceId(),
      deviceName: navigator.platform || '浏览器',
    }) });
    const returnTo = sessionStorage.getItem('navi_oauth_return') || '/';
    sessionStorage.removeItem('navi_pkce_verifier');
    sessionStorage.removeItem('navi_oauth_state');
    sessionStorage.removeItem('navi_oauth_return');
    location.replace(returnTo);
    return true;
  }

  function create(config) {
    const product = config.product;
    const queueKey = `navi_sync_queue_${product}`;
    const metaKey = `navi_sync_meta_${product}`;
    let timer = null;
    let running = false;
    let retry = 2000;
    let account = null;

    function status(value, detail) {
      config.onStatus?.(value, detail || '');
    }

    function read(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
    }

    function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

    function enqueue(data) {
      const queue = read(queueKey, []);
      queue.push({ mutationId: randomId('mutation'), type: 'merge_snapshot', data });
      write(queueKey, queue.slice(-500));
    }

    async function initialize() {
      try {
        const result = await request('/api/v1/account');
        account = result.account;
        config.onAccount?.(account);
        const meta = read(metaKey, { revision: 0, initialized: false, lastSnapshot: null });
        const local = config.exportData();
        if (!meta.initialized) {
          write(`navi_premerge_${product}_${Date.now()}`, local);
          enqueue(local);
          meta.initialized = true;
          write(metaKey, meta);
        }
        await flush();
        return account;
      } catch (error) {
        account = null;
        config.onAccount?.(null);
        status(navigator.onLine ? 'local' : 'offline', error.code === 'authentication_required' ? '仅本机' : error.message);
        return null;
      }
    }

    function markDirty() {
      if (!account) { status('local', '仅本机'); return; }
      clearTimeout(timer);
      status('syncing', '正在同步');
      timer = setTimeout(() => {
        enqueue(config.exportData());
        flush();
      }, 1500);
    }

    async function flush() {
      if (running || !account) return;
      const queue = read(queueKey, []);
      if (!queue.length) { status('synced', '已同步'); return; }
      if (!navigator.onLine) { status('offline', '等待网络'); return; }
      running = true;
      status('syncing', '正在同步');
      const meta = read(metaKey, { revision: 0, initialized: true });
      try {
        const result = await request(`/api/v1/sync/${product}`, { method: 'POST', body: JSON.stringify({ deviceId: deviceId(), baseRevision: meta.revision || 0, schemaVersion: 1, mutations: queue.slice(0, 500) }) });
        config.importData(result.document);
        meta.revision = result.revision;
        meta.lastSnapshot = result.document;
        write(metaKey, meta);
        write(queueKey, queue.slice(Math.min(500, queue.length)));
        retry = 2000;
        status('synced', '已同步');
        if (read(queueKey, []).length) setTimeout(flush, 0);
      } catch (error) {
        status(navigator.onLine ? 'attention' : 'offline', navigator.onLine ? '需要处理' : '等待网络');
        setTimeout(flush, retry);
        retry = Math.min(300000, retry * 2);
      } finally { running = false; }
    }

    async function signOut() {
      try { await request('/api/v1/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
      account = null;
      config.onAccount?.(null);
      status('local', '仅本机');
    }

    addEventListener('online', flush);
    addEventListener('offline', () => status('offline', '等待网络'));
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    return { initialize, markDirty, flush, signOut, startLogin: () => startLogin(config.clientId, config.redirectUri), account: () => account };
  }

  global.NaviPassport = { create, startLogin, finishLogin, request };
})(window);

