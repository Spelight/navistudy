const passport = require('../../utils/passport');
const DEFAULT_API_BASE = 'https://words.example.test/naviplan/api';

function apiBase() {
  try {
    const configured = getApp().globalData.planApiBase;
    if (configured) return String(configured).replace(/\/$/, '');
  } catch (error) {}
  return DEFAULT_API_BASE;
}

function serviceDomain() { return apiBase().replace(/^(https:\/\/[^/]+).*$/, '$1'); }

function send(path, data, method, token) {
  return new Promise((resolve, reject) => wx.request({
    url: `${apiBase()}${path}`,
    method: method || 'POST',
    data: data || {},
    timeout: path === '/import/run' ? 120000 : 30000,
    header: { 'content-type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    success(response) {
      const body = typeof response.data === 'object' ? response.data : {};
      if (response.statusCode >= 200 && response.statusCode < 300 && body.ok !== false) return resolve(body);
      const error = new Error((body.error && body.error.message) || body.message || `请求失败：${response.statusCode}`);
      error.statusCode = response.statusCode;
      error.code = body.error && body.error.code;
      error.challenge = response.statusCode === 422 ? body : null;
      reject(error);
    },
    fail(error) {
      const message = String(error && error.errMsg || '网络连接失败');
      const failure = new Error(/timeout/i.test(message) ? '连接教务导入服务超时，请稍后重试' : '无法连接教务导入服务，请检查网络后重试');
      if (/url not in domain list|合法域名/i.test(message)) {
        failure.code = 'request_domain_not_allowed';
        failure.message = `微信未授权请求 ${serviceDomain()}，请在小程序后台添加该 request 合法域名，再刷新域名配置并重新编译`;
      }
      reject(failure);
    }
  }));
}

async function request(path, data, method) {
  const session = passport.session();
  if (!session || !session.accessToken) throw new Error('请先登录 NaviPassport');
  try {
    return await send(path, data, method, session.accessToken);
  } catch (error) {
    // Authentication is checked before any import work; never retry a rejected Beihang password.
    if (error.statusCode !== 401 || error.code !== 'authentication_required' || !session.refreshToken) throw error;
    await passport.refresh();
    return send(path, data, method, passport.session().accessToken);
  }
}

async function pull() { return passport.pull('plan'); }
async function save(snapshot) { wx.setStorageSync('naviplan_data_v1', snapshot); passport.queueSync('plan', snapshot); await passport.flush('plan'); return snapshot; }
module.exports = {
  serviceDomain,
  preload: () => request('/import/preload'),
  importPlan: credentials => request('/import/run', credentials),
  evaluate: (snapshot, manualCorrections) => request('/evaluate', { snapshot, manualCorrections }),
  pull,
  save
};
