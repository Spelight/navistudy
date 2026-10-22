(() => {
  'use strict';
  const base = location.pathname.startsWith('/reading/') ? '/reading/' : '/';
  const redirectUri = location.origin + base + 'navistudy-callback.html';
  NaviPassport.finishLogin('reading-web', redirectUri).catch((error) => {
    document.getElementById('status').textContent = error.message || '登录失败，请返回后重试。';
  });
})();
