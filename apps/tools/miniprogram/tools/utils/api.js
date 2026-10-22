const passport = require('../../utils/passport');

function base() {
  return String(getApp().globalData.toolsApiBase || 'https://words.example.test/navitools/api/availability').replace(/\/+$/, '');
}

function request(path, data = {}, method = 'GET', authenticated = false, retry = true) {
  const current = passport.session();
  if (authenticated && (!current || !current.accessToken)) return Promise.reject(new Error('请先登录 NaviPassport'));
  return new Promise((resolve, reject) => wx.request({
    url: `${base()}${path}`,
    method,
    data,
    timeout: 15000,
    header: Object.assign(
      { Accept: 'application/json', 'content-type': 'application/json' },
      authenticated ? { Authorization: `Bearer ${current.accessToken}` } : {}
    ),
    async success(response) {
      const body = response.data && typeof response.data === 'object' ? response.data : {};
      if (response.statusCode >= 200 && response.statusCode < 300) return resolve(body);
      if (authenticated && retry && response.statusCode === 401) {
        try {
          await passport.request('/account');
          return resolve(await request(path, data, method, authenticated, false));
        } catch (error) {}
      }
      const error = new Error(body.message || (body.error && body.error.message) || `请求失败（${response.statusCode}）`);
      error.code = body.code || (body.error && body.error.code);
      error.statusCode = response.statusCode;
      reject(error);
    },
    fail(error) {
      const message = String(error && error.errMsg || '网络连接失败');
      const failure = new Error(/domain list|合法域名/i.test(message)
        ? '微信未授权 NaviTools 请求域名，请确认已添加 https://words.example.test 并重新编译'
        : (/timeout/i.test(message) ? '连接 NaviTools 超时，请稍后重试' : message.replace(/^request:fail\s*/i, '') || '网络连接失败'));
      failure.code = /domain list|合法域名/i.test(message) ? 'request_domain_not_allowed' : 'network_error';
      reject(failure);
    }
  }));
}

module.exports = { request, base };
