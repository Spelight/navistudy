function apiBase() {
  return getApp().globalData.apiBase;
}

function parseResponse(data) {
  if (typeof data !== 'string') return data;
  const clean = data.replace(/^\uFEFF/, '').trim();
  if (!clean) return {};
  try {
    return JSON.parse(clean);
  } catch (error) {
    throw new Error('服务器返回了无法识别的数据');
  }
}

function request(path, data, method = 'GET') {
  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBase() + path,
      data,
      method,
      timeout: 12000,
      header: {
        'content-type': method === 'GET' ? 'application/json' : 'application/json'
      },
      success(res) {
        let response;
        try {
          response = parseResponse(res.data);
        } catch (error) {
          reject(error);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(response);
        else reject(new Error((response && response.error) || `HTTP ${res.statusCode}`));
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

function loadUser(user) {
  return request('/userdata.php', { action: 'load', user });
}

function saveUser(user, data) {
  return request('/userdata.php?action=save', Object.assign({}, data, { user }), 'POST');
}

module.exports = {
  parseResponse,
  loadUser,
  saveUser
};
