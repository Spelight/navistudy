const API_BASE = 'https://study.dxir.net.cn/api/v1';
const SESSION_KEY = 'navi_passport_session_v1';
const DEVICE_KEY = 'navi_passport_device_id';
const QUEUE_PREFIX = 'navi_sync_queue_';
const META_PREFIX = 'navi_sync_meta_';
const timers = {};
const retryTimers = {};
const retryDelays = { words: 2000, mt: 2000 };
const running = { words: false, mt: false };
let refreshing = null;

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function deviceId() {
  let id = wx.getStorageSync(DEVICE_KEY);
  if (!id) { id = randomId('wx'); wx.setStorageSync(DEVICE_KEY, id); }
  return id;
}

function session() { return wx.getStorageSync(SESSION_KEY) || null; }
function saveSession(value) { if (value) wx.setStorageSync(SESSION_KEY, value); else wx.removeStorageSync(SESSION_KEY); }

function rawRequest(path, data, method, token) {
  return new Promise((resolve, reject) => wx.request({
    url: API_BASE + path,
    data: data || {},
    method: method || 'GET',
    timeout: 15000,
    header: Object.assign({ 'content-type': 'application/json', Accept: 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
    success(response) {
      const body = typeof response.data === 'object' ? response.data : {};
      if (response.statusCode >= 200 && response.statusCode < 300 && body.ok !== false) resolve(body);
      else { const error = new Error((body.error && body.error.message) || `HTTP ${response.statusCode}`); error.code = body.error && body.error.code; error.statusCode = response.statusCode; reject(error); }
    },
    fail(error) { reject(new Error(error.errMsg || '网络连接失败')); }
  }));
}

async function refresh() {
  if (refreshing) return refreshing;
  const current = session();
  if (!current || !current.refreshToken) throw new Error('请重新登录 Navi Passport');
  refreshing = rawRequest('/auth/refresh', { refreshToken: current.refreshToken }, 'POST').then(result => {
    const next = Object.assign({}, current, result, { account: result.account || current.account });
    saveSession(next);
    return next;
  }).catch(error => { saveSession(null); throw error; }).finally(() => { refreshing = null; });
  return refreshing;
}

async function request(path, data, method, retry = true) {
  const current = session();
  try { return await rawRequest(path, data, method, current && current.accessToken); }
  catch (error) {
    if (retry && error.statusCode === 401 && current && current.refreshToken) { await refresh(); return request(path, data, method, false); }
    throw error;
  }
}

async function register(username, password) {
  const result = await rawRequest('/auth/register', { username, password, deviceId: deviceId(), deviceName: '微信小程序', clientId: 'navistudy-wechat', transport: 'native' }, 'POST');
  saveSession(result);
  return result;
}

async function login(username, password) {
  const result = await rawRequest('/auth/login', { username, password, deviceId: deviceId(), deviceName: '微信小程序', clientId: 'navistudy-wechat', transport: 'native' }, 'POST');
  saveSession(result);
  return result;
}

async function recover(username, recoveryCode, newPassword) {
  return rawRequest('/auth/recover', { username, recoveryCode, newPassword }, 'POST');
}

async function logout() {
  try { await request('/auth/logout', {}, 'POST'); } catch (error) {}
  saveSession(null);
}

function account() { return (session() && session().account) || null; }
function syncStatus(product) { return wx.getStorageSync(`navi_sync_status_${product}`) || (account() ? '正在同步' : '仅本机'); }
function setStatus(product, value) { wx.setStorageSync(`navi_sync_status_${product}`, value); }

function identity(item) {
  if (item === null || typeof item !== 'object') return String(item);
  if (item.key != null) return String(item.key);
  if (item.id != null) return String(item.id);
  if (item.uuid != null) return String(item.uuid);
  if (item.w != null || item.e != null) return `${item.t || 'w'}_${item.w || item.e || ''}_${item.u || ''}`;
  if (item.word != null) return String(item.word);
  return JSON.stringify(item);
}

function prepareSnapshot(product, data, base) {
  const next = JSON.parse(JSON.stringify(data || {}));
  const previous = base && typeof base === 'object' ? base : {};
  const sync = { tombstones: {}, entityUpdatedAt: {} };
  ['tombstones', 'entityUpdatedAt'].forEach(kind => {
    [previous._sync && previous._sync[kind], next._sync && next._sync[kind]].forEach(source => {
      if (!source || typeof source !== 'object') return;
      Object.keys(source).forEach(collection => { sync[kind][collection] = Object.assign(sync[kind][collection] || {}, source[collection] || {}); });
    });
  });
  const definitions = product === 'words'
    ? { favs: 'list', wrongbook: 'map', mastered: 'map', progress_positions: 'map', custom_lists: 'list', srs_state: 'map' }
    : { favorites: 'list', answers: 'map', wrongbook: 'map', mastered: 'map', progressPositions: 'map' };
  const now = Date.now();
  Object.keys(definitions).forEach(collection => {
    if (!Object.prototype.hasOwnProperty.call(next, collection)) return;
    const shape = definitions[collection];
    const oldIds = new Set(shape === 'list' ? (Array.isArray(previous[collection]) ? previous[collection].map(identity) : []) : Object.keys(previous[collection] || {}));
    const newIds = new Set(shape === 'list' ? (Array.isArray(next[collection]) ? next[collection].map(identity) : []) : Object.keys(next[collection] || {}));
    sync.tombstones[collection] = sync.tombstones[collection] || {};
    sync.entityUpdatedAt[collection] = sync.entityUpdatedAt[collection] || {};
    oldIds.forEach(id => { if (!newIds.has(id)) sync.tombstones[collection][id] = now; });
    newIds.forEach(id => { if (!oldIds.has(id)) { sync.entityUpdatedAt[collection][id] = now; delete sync.tombstones[collection][id]; } });
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
  if (!account()) { setStatus(product, '仅本机'); return; }
  clearTimeout(timers[product]);
  setStatus(product, '正在同步');
  timers[product] = setTimeout(() => { enqueue(product, data); flush(product).catch(() => {}); }, 1500);
}

async function initializeProduct(product, data) {
  if (!account()) return;
  const key = META_PREFIX + product;
  const meta = wx.getStorageSync(key) || { revision: 0, initialized: false };
  if (!meta.initialized) {
    wx.setStorageSync(`navi_premerge_${product}_${Date.now()}`, data);
    meta.initialized = true;
    wx.setStorageSync(key, meta);
    enqueue(product, data);
  }
  await flush(product);
}

async function flush(product) {
  if (!account()) { setStatus(product, '仅本机'); return; }
  if (running[product]) return;
  const queueKey = QUEUE_PREFIX + product;
  const queue = wx.getStorageSync(queueKey) || [];
  if (!queue.length) { setStatus(product, '已同步'); return; }
  setStatus(product, '正在同步');
  const metaKey = META_PREFIX + product;
  const meta = wx.getStorageSync(metaKey) || { revision: 0, initialized: true };
  running[product] = true;
  try {
    const result = await request(`/sync/${product}`, { deviceId: deviceId(), baseRevision: meta.revision || 0, schemaVersion: 1, mutations: queue.slice(0, 500) }, 'POST');
    const storageKey = product === 'words' ? 'words_learning_data' : 'military_theory_learning_v1';
    wx.setStorageSync(storageKey, result.document);
    const remaining = queue.slice(Math.min(queue.length, 500));
    meta.revision = result.revision;
    meta.lastSnapshot = result.document;
    if (!remaining.length) meta.lastLocalSnapshot = result.document;
    wx.setStorageSync(metaKey, meta);
    wx.setStorageSync(queueKey, remaining);
    retryDelays[product] = 2000;
    clearTimeout(retryTimers[product]);
    setStatus(product, '已同步');
    if (remaining.length) setTimeout(() => flush(product).catch(() => {}), 0);
  } catch (error) {
    setStatus(product, /network|timeout|网络|超时/i.test(error.message) ? '等待网络' : '需要处理');
    clearTimeout(retryTimers[product]);
    retryTimers[product] = setTimeout(() => flush(product).catch(() => {}), retryDelays[product]);
    retryDelays[product] = Math.min(300000, retryDelays[product] * 2);
    throw error;
  } finally {
    running[product] = false;
  }
}

if (typeof wx.onNetworkStatusChange === 'function') {
  wx.onNetworkStatusChange(state => {
    if (!state.isConnected || !account()) return;
    ['words', 'mt'].forEach(product => flush(product).catch(() => {}));
  });
}

module.exports = { account, session, register, login, recover, logout, request, queueSync, flush, initializeProduct, syncStatus };
