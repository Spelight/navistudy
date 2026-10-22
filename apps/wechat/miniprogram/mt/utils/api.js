function apiBase() {
  const globalData = getApp().globalData;
  return globalData.mtApiBase || globalData.apiBase || 'https://mt.example.test';
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
      header: { 'content-type': 'application/json' },
      success(response) {
        let body;
        try {
          body = parseResponse(response.data);
        } catch (error) {
          reject(error);
          return;
        }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(body);
        else reject(new Error((body && body.error) || `HTTP ${response.statusCode}`));
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || '网络请求失败'));
      }
    });
  });
}

function loadUser(user) {
  return request('/userdata.php', { action: 'load', user });
}

function saveUser(user, data) {
  return request('/userdata.php?action=save', { user, data }, 'POST');
}

module.exports = { parseResponse, loadUser, saveUser };
