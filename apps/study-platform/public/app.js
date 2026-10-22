(() => {
  const api = '/api/v1';
  const state = { mode: 'login', account: null, csrf: '', currentSessionId: '', legacyUsername: '' };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const deviceId = getDeviceId();

  function getDeviceId() {
    let id = localStorage.getItem('navi_device_id');
    if (!id) {
      id = `web-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
      localStorage.setItem('navi_device_id', id);
    }
    return id;
  }

  function csrfFromCookie() {
    return decodeURIComponent((document.cookie.match(/(?:^|; )navi_csrf=([^;]*)/) || [])[1] || '');
  }

  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const csrf = state.csrf || csrfFromCookie();
    if (csrf && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      const error = new Error(body?.error?.message || `请求失败（${response.status}）`);
      error.code = body?.error?.code;
      throw error;
    }
    return body;
  }

  function setNetwork(status, text) {
    const node = $('#networkState');
    node.dataset.state = status;
    node.querySelector('span').textContent = text;
    const icon = status === 'syncing' ? 'loader-circle' : status === 'synced' ? 'cloud-check' : status === 'attention' ? 'cloud-alert' : 'cloud';
    node.querySelector('svg')?.remove();
    const holder = document.createElement('i');
    holder.dataset.lucide = icon;
    node.prepend(holder);
    window.lucide?.createIcons();
  }

  function showGuest() {
    state.account = null;
    $('#guestView').hidden = false;
    $('#accountView').hidden = true;
    $('#accountLabel').textContent = '登录';
    setNetwork('local', '仅本机');
  }

  function showAccount(account) {
    state.account = account;
    $('#guestView').hidden = true;
    $('#accountView').hidden = false;
    $('#accountName').textContent = account.username;
    $('#accountAvatar').textContent = [...account.username][0]?.toUpperCase() || 'N';
    $('#accountLabel').textContent = account.username;
    const pending = account.status === 'pending_delete';
    $('#accountStatus').textContent = pending ? '账号处于删除冻结期' : '四项学习数据已连接';
    $('#serviceAdminButton').hidden = account.username.toLowerCase() !== 'dxir';
    setNetwork(pending ? 'attention' : 'syncing', pending ? '需要处理' : '正在同步');
    if (!pending) loadContinuations();
  }

  async function bootAccount() {
    try {
      const body = await request(`${api}/account`);
      state.csrf = body.csrfToken;
      showAccount(body.account);
      const params = new URLSearchParams(location.search);
      if (params.get('returnTo')) location.assign(params.get('returnTo'));
    } catch { showGuest(); }
  }

  function switchMode(mode) {
    if (mode !== 'register') state.legacyUsername = '';
    state.mode = mode;
    $$('.auth-tab').forEach((tab) => {
      const active = tab.dataset.authTab === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const recovery = mode === 'recover';
    $('#recoveryField').hidden = !recovery;
    $('#passwordLabel').firstChild.textContent = recovery ? '新密码' : '密码';
    $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#authSubmit span').textContent = mode === 'login' ? '登录' : mode === 'register' ? '创建通行证' : '重置密码';
    const legacyRegistration = mode === 'register' && state.legacyUsername;
    $('#username').readOnly = Boolean(legacyRegistration);
    $('#authHint').dataset.kind = legacyRegistration ? 'legacy' : '';
    $('#authHint').textContent = legacyRegistration
      ? `正在认领旧版 NaviWords 用户“${state.legacyUsername}”。请创建至少 6 位密码，注册后原有云端记录会自动继承。`
      : mode === 'login' ? '登录后会自动合并本机与云端记录。' : mode === 'register' ? '密码至少 6 位；注册后恢复码只显示一次。' : '恢复码是忘记密码时唯一的找回方式。';
    $('#authError').hidden = true;
  }

  async function submitAuth(event) {
    event.preventDefault();
    const submit = $('#authSubmit');
    const errorNode = $('#authError');
    errorNode.hidden = true;
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    const username = $('#username').value.trim();
    const password = $('#password').value;
    const payload = { username, password, deviceId, deviceName: navigator.platform || '浏览器', clientId: 'study-web', transport: 'browser' };
    try {
      let result;
      if (state.mode === 'recover') result = await request(`${api}/auth/recover`, { method: 'POST', body: JSON.stringify({ username, recoveryCode: $('#recoveryCode').value, newPassword: password }) });
      else result = await request(`${api}/auth/${state.mode}`, { method: 'POST', body: JSON.stringify(payload) });
      if (state.mode === 'recover') {
        showRecovery(result.recoveryCode);
        switchMode('login');
      } else {
        state.csrf = result.csrfToken;
        showAccount(result.account);
        if (result.recoveryCode) showRecovery(result.recoveryCode, result.claimedProducts || []);
        const returnTo = new URLSearchParams(location.search).get('returnTo');
        if (returnTo) location.assign(returnTo);
      }
      $('#authForm').reset();
    } catch (error) {
      if (error.code === 'legacy_registration_required') {
        state.legacyUsername = username;
        switchMode('register');
        $('#username').value = username;
        $('#username').readOnly = true;
        $('#authHint').dataset.kind = 'legacy';
        $('#authHint').textContent = `检测到旧版 NaviWords 用户“${username}”。请创建至少 6 位密码，注册后原有云端记录会自动继承。`;
        $('#password').value = '';
        $('#password').focus();
        return;
      }
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  }

  function showRecovery(code, claimedProducts = []) {
    const claimResult = $('#claimResult');
    const claimedWords = claimedProducts.includes('words');
    claimResult.hidden = !claimedWords;
    claimResult.textContent = claimedWords ? '旧版 NaviWords 云端记录已继承，并将与当前设备记录合并。' : '';
    $('#newRecoveryCode').textContent = code;
    $('#recoveryConfirmed').checked = false;
    $('#closeRecovery').disabled = true;
    $('#recoveryDialog').showModal();
  }

  async function loadContinuations() {
    try {
      const [words, mt, plan] = await Promise.all([
        request(`${api}/sync/words`),
        request(`${api}/sync/mt`),
        request(`${api}/sync/plan`).catch(() => ({}))
      ]);
      const candidates = [];
      const wp = words.document?.last_progress;
      if (wp) candidates.push({ product: 'NaviWords', title: wp.word || wp.term || '继续背词', meta: wp.book || wp.scope || '上次词汇进度', time: parseTime(wp), href: '/words/' });
      const mp = mt.document?.lastProgress;
      if (mp) candidates.push({ product: 'NaviMT 军理通', title: mp.questionText || '继续军理练习', meta: mp.chapter || mp.scope || '上次答题进度', time: parseTime(mp), href: '/mt/' });
      const pp = plan.document;
      if (pp?.audit || Array.isArray(pp?.courses)) {
        const audits = Array.isArray(pp.audit?.requirementAudits) ? pp.audit.requirementAudits : [];
        const gaps = audits.filter((item) => !item.satisfied);
        candidates.push({
          product: 'NaviPlan',
          title: gaps.length ? `${gaps.length} 项培养要求仍有缺口` : '当前规划已覆盖培养要求',
          meta: `${Array.isArray(pp.courses) ? pp.courses.length : 0} 门课程 · 查看学分审计`,
          time: parseTime(pp),
          href: '/naviplan/'
        });
      }
      const latest = candidates.sort((a, b) => b.time - a.time)[0];
      if (latest) {
        $('#resumeLink').classList.remove('is-empty');
        $('#resumeLink').href = latest.href;
        $('#resumeTitle').textContent = latest.title;
        $('#resumeMeta').textContent = `${latest.product} · ${latest.meta}`;
      }
      setNetwork('synced', '已同步');
    } catch (error) {
      setNetwork(navigator.onLine ? 'attention' : 'offline', navigator.onLine ? '需要处理' : '等待网络');
    }
  }

  function parseTime(value) {
    for (const key of ['updatedAt', 'updated', 'timestamp', 'at']) {
      if (value?.[key]) return Number(value[key]) || Date.parse(value[key]) || 0;
    }
    return 0;
  }

  async function logout() {
    try { await request(`${api}/auth/logout`, { method: 'POST', body: '{}' }); } catch {}
    showGuest();
  }

  async function showDevices() {
    const detail = $('#accountDetail');
    detail.hidden = false;
    detail.innerHTML = '<h3>活动设备</h3><p class="field-hint">正在读取...</p>';
    try {
      const body = await request(`${api}/account/sessions`);
      state.currentSessionId = body.currentSessionId;
      detail.innerHTML = '<h3>活动设备</h3><ul class="device-list"></ul>';
      const list = detail.querySelector('ul');
      body.sessions.filter((session) => !session.revokedAt).forEach((session) => {
        const item = document.createElement('li');
        item.className = 'device-item';
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = session.deviceName + (session.id === state.currentSessionId ? '（当前）' : '');
        const meta = document.createElement('span');
        meta.textContent = `${session.clientId} · 最近活动 ${new Date(session.lastUsedAt * 1000).toLocaleString()}`;
        copy.append(title, meta);
        item.append(copy);
        if (session.id !== state.currentSessionId) {
          const button = document.createElement('button');
          button.type = 'button';
          button.title = '下线此设备';
          button.setAttribute('aria-label', `下线 ${session.deviceName}`);
          button.innerHTML = '<i data-lucide="x"></i>';
          button.addEventListener('click', async () => { await request(`${api}/account/sessions/${session.id}`, { method: 'DELETE', body: '{}' }); showDevices(); });
          item.append(button);
        }
        list.append(item);
      });
      window.lucide?.createIcons();
    } catch (error) { detail.innerHTML = `<h3>活动设备</h3><div class="form-error">${escapeHtml(error.message)}</div>`; }
  }

  function showPassword() {
    const detail = $('#accountDetail');
    detail.hidden = false;
    detail.innerHTML = '<h3>修改密码</h3><form id="passwordForm"><label>当前密码<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>新密码<input name="newPassword" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></label><small class="field-hint">至少 6 个字符</small><div class="form-error" hidden></div><button class="primary-button" type="submit"><span>更新密码</span><i data-lucide="check"></i></button></form>';
    detail.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const errorNode = form.querySelector('.form-error');
      try {
        const result = await request(`${api}/account/password`, { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        showRecovery(result.recoveryCode);
        form.reset();
      } catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
    });
    window.lucide?.createIcons();
  }

  async function showServiceAdmin() {
    const detail = $('#accountDetail');
    detail.hidden = false;
    detail.innerHTML = '<h3>服务后台</h3><p class="field-hint">正在读取用户服务状态...</p>';
    try {
      const body = await request(`${api}/admin/services`);
      renderServiceAdmin(body.users || []);
    } catch (error) {
      detail.innerHTML = `<h3>服务后台</h3><div class="form-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderServiceAdmin(users) {
    const detail = $('#accountDetail');
    const rows = users.map((user) => {
      const availability = user.services?.availability || {};
      return `
        <article class="service-user-card">
          <header>
            <div>
              <strong>${escapeHtml(user.username)}</strong>
              <span>${escapeHtml(user.status)} · ${formatTime(user.createdAt)} 注册</span>
            </div>
            <button type="button" class="copy-button service-permission-button ${availability.unrestricted ? 'is-on' : ''}" data-service-user="${escapeHtml(user.username)}" ${user.username.toLowerCase() === 'dxir' ? 'disabled' : ''}>
              ${availability.unrestricted ? 'NaviTools 不受限制' : '设为不受限制'}
            </button>
          </header>
          <div class="service-grid">
            ${serviceCell('NaviWords', user.services?.words)}
            ${serviceCell('NaviMT', user.services?.mt)}
            ${serviceCell('NaviReading', user.services?.reading)}
            ${serviceCell('NaviPlan', user.services?.plan)}
            ${availabilityCell(availability)}
          </div>
        </article>
      `;
    }).join('');
    detail.innerHTML = `
      <div class="service-admin-head">
        <div><h3>服务后台</h3><p class="field-hint">快速查看用户开通的服务、同步状态和 NaviTools 问卷权限。</p></div>
        <button class="copy-button" id="refreshServiceAdmin" type="button"><i data-lucide="refresh-cw"></i><span>刷新</span></button>
      </div>
      <div class="service-user-list">${rows || '<p class="field-hint">还没有用户。</p>'}</div>
    `;
    $('#refreshServiceAdmin')?.addEventListener('click', showServiceAdmin);
    $$('.service-permission-button').forEach((button) => {
      button.addEventListener('click', () => toggleNaviToolsPermission(button));
    });
    window.lucide?.createIcons();
  }

  function serviceCell(label, status = {}) {
    return `
      <div class="service-cell ${status.enabled ? 'is-active' : ''}">
        <strong>${label}</strong>
        <span>${escapeHtml(status.usage || '暂无云端数据')}</span>
        <small>${status.enabled ? `rev ${status.revision || 0} · ${formatTime(status.updatedAt)}` : '未开通'}</small>
      </div>
    `;
  }

  function availabilityCell(status = {}) {
    return `
      <div class="service-cell ${status.enabled ? 'is-active' : ''}">
        <strong>约时间问卷</strong>
        <span>${escapeHtml(status.usage || '0 / 3 个进行中问卷')}</span>
        <small>${status.responseCount || 0} 条提交 · 累计 ${status.totalSessionCount || 0} 个问卷</small>
      </div>
    `;
  }

  async function toggleNaviToolsPermission(button) {
    const username = button.dataset.serviceUser;
    if (!username) return;
    const unrestricted = !button.classList.contains('is-on');
    button.disabled = true;
    try {
      await request(`${api}/admin/services/navitools/users/${encodeURIComponent(username)}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ unrestricted })
      });
      await showServiceAdmin();
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  }

  function formatTime(value) {
    const numeric = Number(value || 0);
    if (!numeric) return '暂无时间';
    return new Date(numeric * 1000).toLocaleDateString();
  }

  function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

  function setupTheme() {
    const saved = localStorage.getItem('navi_theme');
    if (saved) document.documentElement.dataset.theme = saved;
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('navi_theme', next);
      $('#themeToggle').innerHTML = `<i data-lucide="${next === 'dark' ? 'sun' : 'moon'}"></i>`;
      window.lucide?.createIcons();
    });
  }

  function setupReadingGate() {
    const trigger = $('#readingGate');
    let count = 0;
    let resetTimer = null;
    trigger.addEventListener('click', () => {
      count += 1;
      clearTimeout(resetTimer);
      if (count >= 5) {
        count = 0;
        location.assign('/reading/');
        return;
      }
      resetTimer = setTimeout(() => { count = 0; }, 3000);
    });
  }

  $$('.auth-tab').forEach((tab) => tab.addEventListener('click', () => switchMode(tab.dataset.authTab)));
  $('#authForm').addEventListener('submit', submitAuth);
  $('#accountJump').addEventListener('click', () => $('#passportPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  $('#logoutButton').addEventListener('click', logout);
  $$('[data-account-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.accountAction === 'sync') loadContinuations();
    if (button.dataset.accountAction === 'devices') showDevices();
    if (button.dataset.accountAction === 'password') showPassword();
    if (button.dataset.accountAction === 'services') location.assign('/admin/');
  }));
  $('#copyRecovery').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#newRecoveryCode').textContent);
    $('#copyRecovery span').textContent = '已复制';
  });
  $('#recoveryConfirmed').addEventListener('change', (event) => { $('#closeRecovery').disabled = !event.target.checked; });
  window.addEventListener('online', () => state.account ? loadContinuations() : setNetwork('local', '仅本机'));
  window.addEventListener('offline', () => setNetwork('offline', '等待网络'));
  setupTheme();
  setupReadingGate();
  window.addEventListener('DOMContentLoaded', () => { window.lucide?.createIcons(); bootAccount(); });
})();
