const VISITOR_KEY = 'navi_analytics_visitor_v1';
const QUEUE_KEY = 'navi_analytics_queue_v1';
let timer = null;

function randomId(prefix) { return prefix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2); }
function visitorId() {
  let value = wx.getStorageSync(VISITOR_KEY);
  if (!value) { value = randomId('visitor'); wx.setStorageSync(VISITOR_KEY, value); }
  return value;
}
function readQueue() { return wx.getStorageSync(QUEUE_KEY) || []; }
function writeQueue(value) { wx.setStorageSync(QUEUE_KEY, value.slice(-200)); }
function apiBase() { return String(getApp().globalData.passportApiBase || 'https://words.example.test/navistudy-api').replace(/\/$/, ''); }
function flush() {
  const queue = readQueue();
  if (!queue.length || typeof wx.request !== 'function') return Promise.resolve();
  const session = wx.getStorageSync('navi_passport_session_v1') || {};
  return new Promise((resolve) => wx.request({
    url: apiBase() + '/api/v1/analytics/events', method: 'POST', timeout: 10000,
    data: { platform: 'wechat', visitorId: visitorId(), events: queue.slice(0, 50) },
    header: Object.assign({ 'content-type': 'application/json', Accept: 'application/json' }, session.accessToken ? { Authorization: 'Bearer ' + session.accessToken } : {}),
    success(response) { if (response.statusCode >= 200 && response.statusCode < 300) writeQueue(queue.slice(50)); resolve(); },
    fail() { resolve(); }
  }));
}
function track(name, data = {}) {
  const event = { eventId: randomId('evt'), name, product: data.product || 'study', itemId: data.itemId || undefined, value: Number.isFinite(data.value) ? data.value : undefined, metadata: data.metadata || {}, occurredAt: Math.floor(Date.now() / 1000) };
  const queue = readQueue(); queue.push(event); writeQueue(queue);
  if (typeof wx.request === 'function') { clearTimeout(timer); timer = setTimeout(() => flush(), 800); }
  return event;
}
module.exports = { track, flush };
