(function () {
  'use strict';
  const base = location.pathname.startsWith('/mt/') ? '/mt/' : '/';
  const redirectUri = location.origin + base + 'navistudy-callback.html';
  NaviPassport.finishLogin('mt-web', redirectUri).catch(function (error) {
    document.getElementById('status').textContent = error.message || '登录失败，请返回后重试。';
  });
})();
