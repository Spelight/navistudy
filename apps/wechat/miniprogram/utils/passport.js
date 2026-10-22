const DEFAULT_API_BASE = 'https://words.example.test/navistudy-api';
const SESSION_KEY = 'navi_passport_session_v1';
const DEVICE_KEY = 'navi_passport_device_id';
const QUEUE_PREFIX = 'navi_sync_queue_';
const META_PREFIX = 'navi_sync_meta_';
const PRODUCTS = ['words', 'mt', 'reading', 'plan'];
const timers = {};
const retryTimers = {};
const retryDelays = { words: 2000, mt: 2000, reading: 2000, plan: 2000 };
const running = { words: false, mt: false, reading: false, plan: false };
let refreshing = null;

function apiBase() {
  try {
    const configured = getApp().globalData.passportApiBase;
    if (configured) return String(configured).replace(/\/$/, '');
  } catch (error) {}
  return DEFAULT_API_BASE;
}

function networkError(error) {
  const message = String(error && error.errMsg || '网络连接失败');
  if (/url not in domain list|合法域名/i.test(message)) {
    return new Error('Passport 服务域名未获微信授权，请更新小程序后重试');
  }
  if (/timeout/i.test(message)) return new Error('连接 Passport 超时，请检查网络后重试');
  return new Error(message.replace(/^request:fail\s*/i, '') || '网络连接失败');
}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function deviceId() {
  let id = wx.getStorageSync(DEVICE_KEY);
  if (!id) {
    id = randomId('wx');
    wx.setStorageSync(DEVICE_KEY, id);
  }
  return id;
}

function session() {
  return wx.getStorageSync(SESSION_KEY) || null;
}

function saveSession(value) {
  if (value) wx.setStorageSync(SESSION_KEY, value);
  else wx.removeStorageSync(SESSION_KEY);
}

function rawRequest(path, data, method, token) {
  return new Promise((resolve, reject) => wx.request({
    url: `${apiBase()}/api/v1${path}`,
    data: data || {},
    method: method || 'GET',
    timeout: 15000,
    header: Object.assign(
      { 'content-type': 'application/json', Accept: 'application/json' },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    success(response) {
      const body = typeof response.data === 'object' ? response.data : {};
      if (response.statusCode >= 200 && response.statusCode < 300 && body.ok !== false) resolve(body);
      else {
        const error = new Error((body.error && body.error.message) || `HTTP ${response.statusCode}`);
        error.code = body.error && body.error.code;
        error.statusCode = response.statusCode;
        reject(error);
      }
    },
    fail(error) {
      reject(networkError(error));
    }
  }));
}

async function refresh() {
  if (refreshing) return refreshing;
  const current = session();
  if (!current || !current.refreshToken) throw new Error('请重新登录 NaviPassport');
  refreshing = rawRequest('/auth/refresh', { refreshToken: current.refreshToken }, 'POST')
    .then(result => {
      const next = Object.assign({}, current, result, { account: result.account || current.account });
      saveSession(next);
      return next;
    })
    .catch(error => {
      saveSession(null);
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request(path, data, method, retry = true) {
  const current = session();
  try {
    return await rawRequest(path, data, method, current && current.accessToken);
  } catch (error) {
    if (retry && error.statusCode === 401 && current && current.refreshToken) {
      await refresh();
      return request(path, data, method, false);
    }
    throw error;
  }
}

async function register(username, password) {
  const result = await rawRequest('/auth/register', {
    username,
    password,
    deviceId: deviceId(),
    deviceName: '微信小程序',
    clientId: 'navistudy-wechat',
    transport: 'native'
  }, 'POST');
  saveSession(result);
  return result;
}

async function login(username, password) {
  const result = await rawRequest('/auth/login', {
    username,
    password,
    deviceId: deviceId(),
    deviceName: '微信小程序',
    clientId: 'navistudy-wechat',
    transport: 'native'
  }, 'POST');
  saveSession(result);
  return result;
}

async function recover(username, recoveryCode, newPassword) {
  return rawRequest('/auth/recover', { username, recoveryCode, newPassword }, 'POST');
}

async function logout() {
  try {
    await request('/auth/logout', {}, 'POST');
  } catch (error) {}
  saveSession(null);
}

function account() {
  return (session() && session().account) || null;
}

function syncStatus(product) {
  return wx.getStorageSync(`navi_sync_status_${product}`) || (account() ? '正在同步' : '仅本机');
}

function statusState(value) {
  return ({
    '仅本机': 'local',
    '正在同步': 'syncing',
    '已同步': 'synced',
    '等待网络': 'offline',
    '需要处理': 'attention',
    '服务未开通': 'disabled'
  })[value] || 'attention';
}

function setStatus(product, value) {
  wx.setStorageSync(`navi_sync_status_${product}`, value);
  const info = wx.getStorageSync(`navi_sync_info_${product}`) || {};
  info.status = value;
  info.state = statusState(value);
  if (value === '已同步') info.lastSyncedAt = Date.now();
  wx.setStorageSync(`navi_sync_info_${product}`, info);
}

function syncInfo(product) {
  const info = wx.getStorageSync(`navi_sync_info_${product}`) || {};
  return {
    status: syncStatus(product),
    state: info.state || statusState(syncStatus(product)),
    lastSyncedAt: Number(info.lastSyncedAt || 0)
  };
}

function identity(item) {
  if (item === null || typeof item !== 'object') return String(item);
  if (item.key != null) return String(item.key);
  if (item.id != null) return String(item.id);
  if (item.uuid != null) return String(item.uuid);
  if (item.w != null || item.e != null) return `${item.t || 'w'}_${item.w || item.e || ''}_${item.u || ''}`;
  if (item.word != null) return String(item.word);
  return JSON.stringify(item);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProductDocument(product, document) {
  const source = isPlainObject(document) ? document : {};
  if (product !== 'reading') return source;
  return Object.assign({}, source, {
    bookmarks: Array.isArray(source.bookmarks) ? source.bookmarks : [],
    notes: isPlainObject(source.notes) ? source.notes : {},
    settings: isPlainObject(source.settings) ? source.settings : {},
    lastProgress: isPlainObject(source.lastProgress) ? source.lastProgress : null
  });
}

function definitionsFor(product) {
  if (product === 'words') {
    return { favs: 'list', wrongbook: 'map', mastered: 'map', progress_positions: 'map', custom_lists: 'list', srs_state: 'map', app_settings: 'map' };
  }
  if (product === 'plan') {
    return { manualCorrections: 'map' };
  }
  if (product === 'reading') {
    return { bookmarks: 'list', notes: 'map', settings: 'map' };
  }
  return { favorites: 'list', answers: 'map', wrongbook: 'map', mastered: 'map', progressPositions: 'map' };
}

function storageKeyFor(product) {
  if (product === 'words') return 'words_learning_data';
  if (product === 'plan') return 'naviplan_data_v1';
  if (product === 'reading') return 'navi_reading_learning_v1';
  return 'military_theory_learning_v1';
}

function prepareSnapshot(product, data, base) {
  const next = JSON.parse(JSON.stringify(data || {}));
  const previous = base && typeof base === 'object' ? base : {};
  const sync = { tombstones: {}, entityUpdatedAt: {} };
  ['tombstones', 'entityUpdatedAt'].forEach(kind => {
    [previous._sync && previous._sync[kind], next._sync && next._sync[kind]].forEach(source => {
      if (!source || typeof source !== 'object') return;
      Object.keys(source).forEach(collection => {
        sync[kind][collection] = Object.assign(sync[kind][collection] || {}, source[collection] || {});
      });
    });
  });
  const definitions = definitionsFor(product);
  const now = Date.now();
  Object.keys(definitions).forEach(collection => {
    if (!Object.prototype.hasOwnProperty.call(next, collection)) return;
    const shape = definitions[collection];
    const oldIds = new Set(shape === 'list' ? (Array.isArray(previous[collection]) ? previous[collection].map(identity) : []) : Object.keys(previous[collection] || {}));
    const newIds = new Set(shape === 'list' ? (Array.isArray(next[collection]) ? next[collection].map(identity) : []) : Object.keys(next[collection] || {}));
    sync.tombstones[collection] = sync.tombstones[collection] || {};
    sync.entityUpdatedAt[collection] = sync.entityUpdatedAt[collection] || {};
    oldIds.forEach(id => {
      if (!newIds.has(id)) sync.tombstones[collection][id] = now;
    });
    newIds.forEach(id => {
      if (!oldIds.has(id)) {
        sync.entityUpdatedAt[collection][id] = now;
        delete sync.tombstones[collection][id];
      }
    });
  });
  next._sync = sync;
  return next;
}

function enqueue(product, data) {
  const key = QUEUE_PREFIX + product;
  const queue = wx.getStorageSync(key) || [];
  const metaKey = META_PREFIX + product;
  const meta = wx.getStorageSync(metaKey) || { revision: 0, initialized: false, lastSnapshot: null, lastLocalSnapshot: null };
  const prepared = prepareSnapshot(product, data, meta.lastLocalSnapshot || meta.lastSnapshot);
  queue.push({ mutationId: randomId('mutation'), type: 'merge_snapshot', data: prepared });
  wx.setStorageSync(key, queue.slice(-500));
  meta.lastLocalSnapshot = prepared;
  wx.setStorageSync(metaKey, meta);
}

function queueSync(product, data) {
  if (!account()) {
    setStatus(product, '仅本机');
    return;
  }
  clearTimeout(timers[product]);
  setStatus(product, '正在同步');
  timers[product] = setTimeout(() => {
    enqueue(product, data);
    flush(product).catch(() => {});
  }, 1500);
}

async function initializeProduct(product, data, options = {}) {
  if (!account()) return;
  const key = META_PREFIX + product;
  const currentAccount = account();
  let meta = wx.getStorageSync(key) || { revision: 0, initialized: false };
  const identityChanged = meta.userId && meta.userId !== currentAccount.id;
  if (identityChanged || options.forceLocalMerge) {
    wx.setStorageSync(`navi_premerge_${product}_${Date.now()}`, data);
    wx.removeStorageSync(QUEUE_PREFIX + product);
    meta = { revision: 0, initialized: false, userId: currentAccount.id };
  }
  meta.userId = currentAccount.id;
  if (!meta.initialized || options.forceLocalMerge) {
    wx.setStorageSync(`navi_premerge_${product}_${Date.now()}`, data);
    meta.initialized = true;
    wx.setStorageSync(key, meta);
    enqueue(product, data);
  }
  await flush(product);
}

async function flush(product) {
  if (!account()) {
    setStatus(product, '仅本机');
    return;
  }
  if (running[product]) return;
  const queueKey = QUEUE_PREFIX + product;
  const queue = wx.getStorageSync(queueKey) || [];
  if (!queue.length) {
    setStatus(product, '已同步');
    return;
  }
  setStatus(product, '正在同步');
  const metaKey = META_PREFIX + product;
  const meta = wx.getStorageSync(metaKey) || { revision: 0, initialized: true };
  running[product] = true;
  try {
    const result = await request(`/sync/${product}`, {
      deviceId: deviceId(),
      baseRevision: meta.revision || 0,
      schemaVersion: 1,
      mutations: queue.slice(0, 500)
    }, 'POST');
    const storageKey = storageKeyFor(product);
    const document = result.document ? normalizeProductDocument(product, result.document) : null;
    if (document) wx.setStorageSync(storageKey, document);
    const remaining = queue.slice(Math.min(queue.length, 500));
    meta.revision = result.revision || meta.revision || 0;
    meta.lastSnapshot = document || meta.lastSnapshot;
    if (!remaining.length) meta.lastLocalSnapshot = document || meta.lastLocalSnapshot;
    wx.setStorageSync(metaKey, meta);
    wx.setStorageSync(queueKey, remaining);
    retryDelays[product] = 2000;
    clearTimeout(retryTimers[product]);
    setStatus(product, '已同步');
    if (remaining.length) setTimeout(() => flush(product).catch(() => {}), 0);
  } catch (error) {
    const disabled = error && error.code === 'service_disabled';
    setStatus(product, disabled ? '服务未开通' : (/network|timeout|网络|超时/i.test(error.message) ? '等待网络' : '需要处理'));
    clearTimeout(retryTimers[product]);
    if (!disabled) {
      retryTimers[product] = setTimeout(() => flush(product).catch(() => {}), retryDelays[product]);
      retryDelays[product] = Math.min(300000, retryDelays[product] * 2);
    }
    throw error;
  } finally {
    running[product] = false;
  }
}

async function pull(product) {
  if (!account()) throw new Error('请先登录 NaviPassport');
  const queue = wx.getStorageSync(QUEUE_PREFIX + product) || [];
  if (queue.length) await flush(product);
  const metaKey = META_PREFIX + product;
  const meta = wx.getStorageSync(metaKey) || { revision: 0, initialized: true };
  const result = await request(`/sync/${product}`, {
    deviceId: deviceId(),
    baseRevision: meta.revision || 0,
    schemaVersion: 1,
    mutations: []
  }, 'POST');
  if (result.document) {
    const document = normalizeProductDocument(product, result.document);
    wx.setStorageSync(storageKeyFor(product), document);
    meta.revision = result.revision || meta.revision || 0;
    meta.initialized = true;
    meta.lastSnapshot = document;
    meta.lastLocalSnapshot = document;
    wx.setStorageSync(metaKey, meta);
    setStatus(product, '已同步');
    return document;
  }
  setStatus(product, '已同步');
  return wx.getStorageSync(storageKeyFor(product)) || {};
}

async function authenticatedRequest(url, data = {}, method = 'GET', retry = true) {
  const current = session();
  if (!current || !current.accessToken) throw new Error('请先登录 NaviPassport');
  return new Promise((resolve, reject) => wx.request({
    url,
    data,
    method,
    timeout: 15000,
    header: {
      Accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${current.accessToken}`
    },
    async success(response) {
      const body = response.data && typeof response.data === 'object' ? response.data : {};
      if (response.statusCode >= 200 && response.statusCode < 300) return resolve(body);
      if (retry && response.statusCode === 401) {
        try {
          await refresh();
          return resolve(await authenticatedRequest(url, data, method, false));
        } catch (error) {}
      }
      const error = new Error(body.message || (body.error && body.error.message) || `请求失败（${response.statusCode}）`);
      error.code = body.code || (body.error && body.error.code);
      error.statusCode = response.statusCode;
      reject(error);
    },
    fail(error) { reject(networkError(error)); }
  }));
}

function toolsProfile() {
  let base = 'https://words.example.test/navitools/api/availability';
  try { base = getApp().globalData.toolsApiBase || base; } catch (error) {}
  return authenticatedRequest(`${String(base).replace(/\/+$/, '')}/admin/me`);
}

if (typeof wx.onNetworkStatusChange === 'function') {
  wx.onNetworkStatusChange(state => {
    if (!state.isConnected || !account()) return;
    PRODUCTS.forEach(product => flush(product).catch(() => {}));
  });
}

module.exports = {
  account,
  session,
  refresh,
  register,
  login,
  recover,
  logout,
  request,
  queueSync,
  flush,
  pull,
  initializeProduct,
  syncStatus,
  syncInfo,
  authenticatedRequest,
  toolsProfile,
  normalizeProductDocument
};
