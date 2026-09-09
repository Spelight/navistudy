(function () {
  'use strict';
  const base = location.pathname.startsWith('/words/') ? '/words/' : '/';
  const redirectUri = location.origin + base + 'navistudy-callback.html';
  NaviPassport.finishLogin('words-web', redirectUri).catch(function (error) {
    document.getElementById('status').textContent = error.message || '登录失败，请返回后重试。';
  });
})();
