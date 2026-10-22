(() => {
  const api = '/api/v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    csrf: '', account: null, view: 'overview', selectedUser: null,
    users: { page: 1, pages: 1, total: 0 }, audit: { page: 1, pages: 1 }, analytics: null,
  };
  const services = {
    words: 'NaviWords', mt: 'NaviMT', reading: 'NaviReading', plan: 'NaviPlan', tools: 'NaviTools',
  };
  const events = {
    register: '注册账号', login: '登录', logout: '退出登录', session_revoked: '设备下线',
    password_changed: '修改密码', password_recovered: '恢复密码', deletion_requested: '申请删除账号',
    deletion_cancelled: '撤销删除账号', refresh_reuse_detected: '检测到凭据重复使用',
    admin_permission_updated: '管理员变更权限', admin_session_revoked: '管理员下线设备',
    admin_sessions_revoked: '管理员下线全部设备',
  };

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
      error.code = body?.error?.code || 'request_failed';
      error.status = response.status;
      error.requestId = body?.error?.requestId || '';
      throw error;
    }
    return body;
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  }

  function formatDate(value, includeTime = true) {
    const number = Number(value || 0);
    if (!number) return '暂无记录';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}), hour12: false,
    }).format(new Date(number * 1000));
  }

  function relativeTime(value) {
    const seconds = Math.floor(Date.now() / 1000) - Number(value || 0);
    if (!value) return '从未活动';
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} 天前`;
    return formatDate(value, false);
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  }

  function toast(message, error = false) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.toggle('is-error', error);
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  function iconify() { window.lucide?.createIcons(); }

  function showAccessState(title, message, canLogin = true) {
    $$('.view').forEach(view => view.classList.remove('is-active'));
    $('#accessTitle').textContent = title;
    $('#accessMessage').textContent = message;
    $('#loginLink').hidden = !canLogin;
    $('#accessState').hidden = false;
    $('#refreshButton').disabled = true;
    iconify();
  }

  async function boot() {
    setupTheme();
    iconify();
    try {
      const account = await request(`${api}/account`);
      state.account = account.account;
      state.csrf = account.csrfToken;
      $('#operator span').textContent = account.account.username;
      await loadOverview();
    } catch (error) {
      if (error.code === 'authentication_required') {
        showAccessState('请先登录 Navi Passport', '服务后台只对服务所有者开放。');
      } else if (error.code === 'admin_required') {
        showAccessState('当前账号没有管理权限', '请切换到服务所有者账号 Dxir。');
      } else {
        showAccessState('服务后台暂时不可用', `${error.message}${error.requestId ? `（${error.requestId}）` : ''}`, false);
      }
    }
  }

  async function loadOverview() {
    setBusy($('#refreshButton'), true);
    try {
      const data = await request(`${api}/admin/overview`);
      renderOverview(data);
      $('#userCount').textContent = data.users.total;
    } catch (error) {
      if (error.code === 'admin_required' || error.code === 'authentication_required') throw error;
      $('#metrics').innerHTML = `<div class="empty-line">${escapeHtml(error.message)}</div>`;
      toast(error.message, true);
    } finally {
      setBusy($('#refreshButton'), false);
    }
  }

  function renderOverview(data) {
    $('#generatedAt').textContent = `更新于 ${formatDate(data.generatedAt)}`;
    const metrics = [
      ['users', '全部用户', data.users.total, `${data.users.pending_delete || 0} 个待删除`],
      ['monitor-smartphone', '活动会话', data.sessions.active, `今日活跃 ${data.sessions.activeToday}`],
      ['database', '应用数据', Object.values(data.products).reduce((sum, item) => sum + item.users, 0), '按应用独立保存'],
      ['shield-alert', '24 小时安全事件', data.securityEvents24h, data.securityEvents24h ? '需要关注' : '未发现异常'],
    ];
    $('#metrics').innerHTML = metrics.map(([icon, label, value, note]) => `
      <article class="metric"><span>${escapeHtml(label)}<i data-lucide="${icon}"></i></span><strong>${value}</strong><small>${escapeHtml(note)}</small></article>
    `).join('');
    $('#productStatus').innerHTML = Object.entries(data.products).map(([key, item]) => `
      <article class="product-item">
        <header><strong>${escapeHtml(services[key])}</strong><span aria-label="服务运行中"></span></header>
        <output>${item.users}</output>
        <p>${formatBytes(item.bytes)} · ${item.disabledUsers} 个账号已停用</p>
        <small>${item.updatedAt ? `最近更新 ${relativeTime(item.updatedAt)}` : '暂无云端数据'}</small>
      </article>
    `).join('');
    renderActivity($('#recentActivity'), data.recentActivity, false);
    iconify();
  }

  function switchView(viewName) {
    state.view = viewName;
    $('#accessState').hidden = true;
    $$('.view').forEach(view => view.classList.toggle('is-active', view.id === `${viewName}View`));
    $$('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === viewName));
    if (viewName === 'overview') loadOverview();
    if (viewName === 'analytics') loadAnalytics();
    if (viewName === 'users') loadUsers();
    if (viewName === 'audit') loadAudit();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadAnalytics() {
    const range = $('#analyticsRange').value || '30d';
    const platform = $('#analyticsPlatform').value || 'all';
    const product = $('#analyticsProduct').value || 'all';
    const params = new URLSearchParams({ range, platform, product });
    $('#analyticsMetrics').innerHTML = '<div class="metric is-loading"></div><div class="metric is-loading"></div><div class="metric is-loading"></div><div class="metric is-loading"></div>';
    setBusy($('#analyticsRefresh'), true);
    try {
      const data = await request(api + '/admin/analytics/overview?' + params);
      state.analytics = data;
      renderAnalytics(data);
      await loadAnalyticsContent();
    } catch (error) {
      $('#analyticsMetrics').innerHTML = '<div class="empty-line">' + escapeHtml(error.message) + '</div>';
      toast(error.message, true);
    } finally {
      setBusy($('#analyticsRefresh'), false);
    }
  }

  function formatCount(value) {
    return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
  }

  function changeLabel(value) {
    if (value === null || value === undefined) return '<span class="metric-change is-new">本期新增</span>';
    const number = Number(value || 0);
    if (number === 0) return '<span class="metric-change is-flat">与上期持平</span>';
    const direction = number > 0 ? 'up' : 'down';
    const sign = number > 0 ? '+' : '';
    return '<span class="metric-change is-' + direction + '">' + sign + number + '% 较上期</span>';
  }

  function renderTrendChart(items) {
    if (!items.length || !items.some(item => item.visits || item.users || item.actions)) {
      return '<div class="empty-line">当前筛选范围内暂无趋势数据。</div>';
    }
    const width = 1000;
    const height = 270;
    const plot = { left: 44, right: 16, top: 18, bottom: 38 };
    const innerWidth = width - plot.left - plot.right;
    const innerHeight = height - plot.top - plot.bottom;
    const maxValue = Math.max(1, ...items.flatMap(item => [item.visits, item.users, item.actions]));
    const ceiling = Math.max(4, Math.ceil(maxValue / 4) * 4);
    const x = index => plot.left + (items.length === 1 ? innerWidth / 2 : index / (items.length - 1) * innerWidth);
    const y = value => plot.top + innerHeight - Number(value || 0) / ceiling * innerHeight;
    const series = [
      { key: 'visits', label: '访问', className: 'visits' },
      { key: 'users', label: '用户', className: 'users' },
      { key: 'actions', label: '学习行为', className: 'actions' },
    ];
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = Math.round(ceiling - ceiling * index / 4);
      const lineY = plot.top + innerHeight * index / 4;
      return '<g><line x1="' + plot.left + '" y1="' + lineY + '" x2="' + (width - plot.right) + '" y2="' + lineY + '"></line><text x="' + (plot.left - 9) + '" y="' + (lineY + 4) + '">' + value + '</text></g>';
    }).join('');
    const labelStep = Math.max(1, Math.ceil(items.length / 6));
    const labels = items.map((item, index) => (index % labelStep === 0 || index === items.length - 1)
      ? '<text class="x-label" x="' + x(index) + '" y="' + (height - 12) + '">' + escapeHtml(item.label || item.day?.slice(5) || item.bucket || '') + '</text>'
      : '').join('');
    const lines = series.map(item => {
      const points = items.map((row, index) => x(index).toFixed(1) + ',' + y(row[item.key]).toFixed(1)).join(' ');
      const dots = items.length <= 24 ? items.map((row, index) => '<circle cx="' + x(index).toFixed(1) + '" cy="' + y(row[item.key]).toFixed(1) + '" r="3"><title>' + escapeHtml((row.label || row.day || row.bucket) + ' ' + item.label + ' ' + row[item.key]) + '</title></circle>').join('') : '';
      return '<g class="chart-series is-' + item.className + '"><polyline points="' + points + '"></polyline>' + dots + '</g>';
    }).join('');
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="访问、用户和学习行为趋势"><g class="chart-grid">' + grid + '</g><g class="chart-labels">' + labels + '</g>' + lines + '</svg>';
  }

  function renderAnalytics(data) {
    const summary = data.summary || {};
    const metrics = [
      ['eye', '访问次数', summary.visits || 0, changeLabel(summary.change?.visits)],
      ['users', '活跃用户', summary.users || 0, changeLabel(summary.change?.users)],
      ['activity', '学习行为', summary.studyActions || 0, changeLabel(summary.change?.studyActions)],
      ['circle-check-big', '完成答题', summary.questions || 0, changeLabel(summary.change?.questions)],
    ];
    $('#analyticsMetrics').innerHTML = metrics.map(item => '<article class="metric"><span>' + escapeHtml(item[1]) + '<i data-lucide="' + item[0] + '"></i></span><strong>' + formatCount(item[2]) + '</strong><small>' + item[3] + '</small></article>').join('');
    const names = { study: 'NaviStudy', words: 'NaviWords', mt: 'NaviMT', reading: 'NaviReading', plan: 'NaviPlan', tools: 'NaviTools' };
    const platformNames = { all: '全平台', web: '网页', wechat: '微信小程序' };
    const filterProduct = data.filters?.product || 'all';
    $('#analyticsContext').textContent = (platformNames[data.filters?.platform] || '全平台') + ' · ' + (filterProduct === 'all' ? '全部产品' : names[filterProduct]) + ' · ' + (data.window?.label || ('近 ' + data.days + ' 天')) + ' · 更新于 ' + formatDate(data.generatedAt);
    $('#analyticsTrendNote').textContent = data.window?.bucket === 'hour' ? '近时段按小时聚合，空白小时补零。' : '长周期按日期聚合，空白日期补零。';
    const authenticatedRate = summary.users ? Math.round((summary.authenticatedUsers || 0) / summary.users * 100) : 0;
    const platformVisits = Object.values(data.platforms || {}).reduce((total, item) => total + Number(item.visits || 0), 0);
    const wechatRate = platformVisits ? Math.round(Number(data.platforms?.wechat?.visits || 0) / platformVisits * 100) : 0;
    const insights = [
      ['已登录用户', formatCount(summary.authenticatedUsers), authenticatedRate + '% 的活跃用户'],
      ['游客用户', formatCount(summary.anonymousUsers), '匿名标识仅保存哈希'],
      ['答题正确率', summary.correctRate === null ? '—' : summary.correctRate + '%', formatCount(summary.correctAnswers) + ' 对 · ' + formatCount(summary.wrongAnswers) + ' 错'],
      ['新增收藏', formatCount(summary.favoriteAdds), '微信访问占比 ' + wechatRate + '%'],
    ];
    $('#analyticsInsights').innerHTML = insights.map(item => '<article><span>' + escapeHtml(item[0]) + '</span><strong>' + item[1] + '</strong><small>' + escapeHtml(item[2]) + '</small></article>').join('');

    const productEntries = Object.entries(data.products || {});
    const maxProductActions = Math.max(1, ...productEntries.map(([, item]) => Number(item.studyActions || 0)));
    $('#analyticsProducts').innerHTML = '<div class="analytics-product-row is-heading"><span>产品</span><span>访问人数</span><span>活跃用户</span><span>学习行为</span><span>收藏 / 正确率</span></div>' + productEntries.map(([key, item]) => {
      const progress = Math.round(Number(item.studyActions || 0) / maxProductActions * 100);
      const accuracy = item.correctRate === null ? '暂无答题' : item.correctRate + '% 正确';
      return '<article class="analytics-product-row"><div class="product-name"><strong>' + escapeHtml(names[key] || key) + '</strong><span class="product-activity-bar"><i style="width:' + progress + '%"></i></span></div><span><b>' + formatCount(item.visitors) + '</b><small>人</small></span><span><b>' + formatCount(item.users) + '</b><small>人</small></span><span><b>' + formatCount(item.studyActions) + '</b><small>次</small></span><span><b>' + formatCount(item.favoriteAdds) + '</b><small>新增收藏 · ' + escapeHtml(accuracy) + '</small></span></article>';
    }).join('');

    const sourceEntries = Object.entries(data.platforms || {});
    const maxSourceVisits = Math.max(1, ...sourceEntries.map(([, item]) => Number(item.visits || 0)));
    $('#analyticsSources').innerHTML = sourceEntries.map(([key, item]) => '<article class="source-row"><div><i data-lucide="' + (key === 'wechat' ? 'message-circle' : 'monitor') + '"></i><span><strong>' + escapeHtml(platformNames[key] || key) + '</strong><small>' + formatCount(item.users) + ' 位活跃用户 · ' + formatCount(item.actions) + ' 次学习行为</small></span></div><output>' + formatCount(item.visits) + '<small>次访问</small></output><span class="ratio-bar"><i style="width:' + Math.round(Number(item.visits || 0) / maxSourceVisits * 100) + '%"></i></span></article>').join('');

    const eventNames = { page_view: '页面访问', app_open: '启动小程序', product_open: '进入产品', study_start: '开始学习', study_end: '结束学习', question_answered: '提交答案', favorite_added: '添加收藏', favorite_removed: '取消收藏', bookmark_added: '添加书签', bookmark_removed: '取消书签', note_saved: '保存笔记', plan_import: '导入教务', plan_evaluate: '培养方案审计', tool_created: '创建工具', tool_response: '提交工具回答' };
    const maxEvents = Math.max(1, ...(data.events || []).map(item => Number(item.total || 0)));
    $('#analyticsEvents').innerHTML = data.events?.length ? data.events.map(item => '<article class="event-row"><div><strong>' + escapeHtml(eventNames[item.name] || item.name) + '</strong><small>' + formatCount(item.users) + ' 位用户</small></div><span class="ratio-bar"><i style="width:' + Math.round(Number(item.total || 0) / maxEvents * 100) + '%"></i></span><output>' + formatCount(item.total) + '</output></article>').join('') : '<div class="empty-line">暂无行为事件。</div>';
    const trend = data.trend || [];
    $('#analyticsTrend').innerHTML = renderTrendChart(trend);
    iconify();
  }

  async function loadAnalyticsContent() {
    const product = $('#analyticsContentProduct').value;
    const range = $('#analyticsRange').value || '30d';
    const platform = $('#analyticsPlatform').value || 'all';
    try {
      const params = new URLSearchParams({ product, range, platform });
      const data = await request(api + '/admin/analytics/content?' + params);
      $('#analyticsContent').innerHTML = data.items?.length ? '<div class="content-row is-heading"><span>内容编号</span><span>用户</span><span>练习</span><span>正确率</span><span>答错</span><span>当前收藏（全来源）</span></div>' + data.items.map(item => '<div class="content-row"><code>' + escapeHtml(item.itemKey) + '</code><span>' + formatCount(item.users) + '</span><span>' + formatCount(item.attempts) + '</span><span>' + (item.correctRate === null ? '—' : item.correctRate + '%') + '</span><span>' + formatCount(item.wrong) + '</span><span>' + formatCount(item.activeFavorites) + '</span></div>').join('') : '<div class="empty-line">当前筛选范围内暂无内容事件。</div>';
    } catch (error) { $('#analyticsContent').innerHTML = '<div class="empty-line">' + escapeHtml(error.message) + '</div>'; }
  }

  async function loadUsers() {
    const params = new URLSearchParams({
      page: state.users.page,
      query: $('#userQuery').value.trim(),
      status: $('#statusFilter').value,
      service: $('#serviceFilter').value,
    });
    $('#userRows').innerHTML = '<tr><td colspan="6" class="table-message">正在读取用户...</td></tr>';
    try {
      const data = await request(`${api}/admin/users?${params}`);
      state.users = { page: data.page, pages: data.pages, total: data.total };
      renderUsers(data.items);
      renderUserPagination();
      $('#userCount').textContent = data.total;
    } catch (error) {
      $('#userRows').innerHTML = `<tr><td colspan="6" class="table-message">${escapeHtml(error.message)}</td></tr>`;
      toast(error.message, true);
    }
  }

  function renderUsers(items) {
    if (!items.length) {
      $('#userRows').innerHTML = '<tr><td colspan="6" class="table-message">没有符合条件的用户。</td></tr>';
      return;
    }
    $('#userRows').innerHTML = items.map(user => {
      const apps = Object.entries(user.services).map(([key, item]) => `
        <span class="service-dot ${item.hasData ? 'has-data' : ''} ${item.enabled ? '' : 'is-disabled'}" title="${escapeHtml(services[key])}：${escapeHtml(item.usage)}">${key === 'reading' ? 'NR' : key === 'words' ? 'NW' : key === 'tools' ? 'NT' : key === 'plan' ? 'NP' : 'MT'}</span>
      `).join('');
      return `<tr data-user-id="${user.id}" tabindex="0">
        <td><div class="user-cell"><span class="avatar">${escapeHtml([...user.username][0] || 'N')}</span><span><strong>${escapeHtml(user.username)}</strong><small>${user.id}</small></span></div></td>
        <td><div class="login-cell"><span>${relativeTime(user.lastSeenAt)}</span><small>${escapeHtml(user.lastIp || '暂无 IP')}${user.lastIpApproximate ? '（历史网段）' : ''}</small></div></td>
        <td>${user.activeSessions} 活动 / ${user.totalSessions} 总计</td>
        <td><div class="service-dots">${apps}</div></td>
        <td><span class="status ${user.status === 'active' ? '' : 'pending'}">${user.status === 'active' ? '正常' : '待删除'}</span></td>
        <td><button class="row-action" type="button" data-open-user="${user.id}">管理</button></td>
      </tr>`;
    }).join('');
    $$('[data-user-id]').forEach(row => {
      row.addEventListener('click', event => { if (!event.target.closest('button')) openUser(row.dataset.userId); });
      row.addEventListener('keydown', event => { if (event.key === 'Enter') openUser(row.dataset.userId); });
    });
    $$('[data-open-user]').forEach(button => button.addEventListener('click', () => openUser(button.dataset.openUser)));
    iconify();
  }

  function renderUserPagination() {
    const pagination = $('#userPagination');
    pagination.hidden = state.users.total === 0;
    $('#pageSummary').textContent = `第 ${state.users.page} / ${state.users.pages} 页 · 共 ${state.users.total} 位用户`;
    $('#prevPage').disabled = state.users.page <= 1;
    $('#nextPage').disabled = state.users.page >= state.users.pages;
  }

  async function openUser(userId) {
    state.selectedUser = userId;
    $('#detailPanel').classList.add('is-open');
    $('#detailPanel').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
    $('#detailBody').innerHTML = '<div class="empty-line">正在读取用户详情...</div>';
    iconify();
    try {
      const data = await request(`${api}/admin/users/${userId}`);
      if (state.selectedUser !== userId) return;
      renderUserDetail(data);
    } catch (error) {
      $('#detailBody').innerHTML = `<div class="empty-line">${escapeHtml(error.message)}</div>`;
    }
  }

  function closeDetail() {
    state.selectedUser = null;
    $('#detailPanel').classList.remove('is-open');
    $('#detailPanel').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true;
  }

  function renderUserDetail(data) {
    const user = data.account;
    $('#detailTitle').textContent = user.username;
    const permissionRows = Object.entries(data.permissions).map(([key, permission]) => {
      const service = data.services[key] || {};
      const extra = key === 'tools' ? `
        <span class="switch-wrap">不限额<label class="switch"><input type="checkbox" data-unrestricted="tools" ${permission.unrestricted ? 'checked' : ''} ${permission.locked ? 'disabled' : ''}><span></span></label></span>` : '';
      return `<div class="permission-row">
        <div><strong>${escapeHtml(services[key])}</strong><small>${escapeHtml(service.usage || '暂无云端数据')}</small></div>
        <div class="switch-wrap">${extra}<label><span data-toggle-label>${permission.enabled ? '已启用' : '已停用'}</span><span class="switch"><input type="checkbox" data-service-toggle="${key}" ${permission.enabled ? 'checked' : ''} ${permission.locked ? 'disabled' : ''}><span></span></span></label></div>
      </div>`;
    }).join('');
    const sessions = data.sessions.length ? data.sessions.map(session => renderDevice(user, session)).join('') : '<div class="empty-line">没有登录设备。</div>';
    $('#detailBody').innerHTML = `
      <section class="account-identity">
        <span class="avatar">${escapeHtml([...user.username][0] || 'N')}</span>
        <div><h3>${escapeHtml(user.username)}</h3><p>${user.id}</p><p>注册于 ${formatDate(user.createdAt)}</p></div>
        <span class="status ${user.status === 'active' ? '' : 'pending'}">${user.status === 'active' ? '正常' : '待删除'}</span>
      </section>
      <section class="detail-section">
        <header><h3>应用与权限</h3><span>数据互相隔离</span></header>
        <div class="permission-list">${permissionRows}</div>
        <div class="permission-actions"><button class="primary-button" id="savePermissions" type="button" ${Object.values(data.permissions).every(item => item.locked) ? 'disabled' : ''}><i data-lucide="save"></i><span>保存权限</span></button></div>
      </section>
      <section class="detail-section">
        <header><h3>登录设备与 IP</h3><button class="danger-button" id="revokeAll" type="button" ${data.sessions.some(item => item.active && !item.current) ? '' : 'disabled'}>下线全部其他设备</button></header>
        <div class="device-list">${sessions}</div>
      </section>
      <section class="detail-section">
        <header><h3>产品使用统计</h3><span>只显示行为数量与收藏状态</span></header>
        <div class="user-analytics-grid">${Object.entries(data.analytics?.products || {}).map(([key, item]) => `<article><strong>${escapeHtml(services[key] || key)}</strong><span>${item.visits || 0} 次访问 · ${item.actions || 0} 次学习行为</span><small>最近活动 ${relativeTime(item.lastAt)}</small></article>`).join('') || '<div class="empty-line">暂无统计事件。</div>'}</div>
        <div class="user-favorites-line">收藏：${Object.entries(data.analytics?.favorites || {}).map(([key, count]) => `${escapeHtml(services[key] || key)} ${count}`).join(' · ') || '暂无收藏记录'}</div>
      </section>
      <section class="detail-section detail-audit"><header><h3>该用户的最近记录</h3><span>${data.audit.length} 条</span></header><div class="audit-list" id="detailAudit"></div></section>
    `;
    renderActivity($('#detailAudit'), data.audit, true);
    $('#savePermissions')?.addEventListener('click', () => savePermissions(user.id));
    $('#revokeAll')?.addEventListener('click', () => revokeAll(user.id));
    $$('[data-revoke-session]', $('#detailBody')).forEach(button => button.addEventListener('click', () => revokeSession(user.id, button.dataset.revokeSession)));
    $$('[data-service-toggle]', $('#detailBody')).forEach(toggle => toggle.addEventListener('change', () => {
      const label = toggle.closest('label')?.querySelector('[data-toggle-label]');
      if (label) label.textContent = toggle.checked ? '已启用' : '已停用';
    }));
    iconify();
  }

  function renderDevice(user, session) {
    const agent = session.userAgent || '';
    const icon = /MicroMessenger/i.test(agent) ? 'message-circle' : /Mobile|Android|iPhone/i.test(agent) ? 'smartphone' : 'monitor';
    const ip = session.lastIp || '部署前会话，未记录完整 IP';
    return `<article class="device">
      <span class="device-icon"><i data-lucide="${icon}"></i></span>
      <div><strong>${escapeHtml(session.deviceName || '未知设备')} ${session.current ? '<span class="current-label">当前</span>' : ''}</strong>
        <p>${escapeHtml(session.clientId)} · ${session.active ? '活动' : '已失效'} · ${relativeTime(session.lastUsedAt)}</p>
        <p>IP ${escapeHtml(ip)}${session.firstIp && session.firstIp !== session.lastIp ? ` · 首次 ${escapeHtml(session.firstIp)}` : ''}</p>
        <p>${escapeHtml(agent || '旧会话未记录 User-Agent')}</p>
      </div>
      <button class="danger-button" type="button" data-revoke-session="${session.id}" ${!session.active || session.current ? 'disabled' : ''}>下线</button>
    </article>`;
  }

  async function savePermissions(userId) {
    const button = $('#savePermissions');
    const payload = { services: {} };
    $$('[data-service-toggle]', $('#detailBody')).forEach(toggle => {
      payload.services[toggle.dataset.serviceToggle] = { enabled: toggle.checked };
    });
    const unrestricted = $('[data-unrestricted="tools"]', $('#detailBody'));
    if (unrestricted) payload.services.tools.unrestricted = unrestricted.checked;
    setBusy(button, true);
    try {
      await request(`${api}/admin/users/${userId}/permissions`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast('权限已保存');
      await Promise.all([openUser(userId), loadUsers(), loadOverview()]);
    } catch (error) {
      toast(error.message, true);
      setBusy(button, false);
    }
  }

  async function revokeSession(userId, sessionId) {
    if (!confirm('确认下线这台设备？该设备需要重新登录。')) return;
    try {
      await request(`${api}/admin/users/${userId}/sessions/${sessionId}`, { method: 'DELETE' });
      toast('设备已下线');
      await openUser(userId);
    } catch (error) { toast(error.message, true); }
  }

  async function revokeAll(userId) {
    if (!confirm('确认下线该用户的全部其他设备？')) return;
    try {
      const result = await request(`${api}/admin/users/${userId}/sessions/revoke-all`, { method: 'POST', body: '{}' });
      toast(`已下线 ${result.revokedCount} 个会话`);
      await openUser(userId);
    } catch (error) { toast(error.message, true); }
  }

  async function loadAudit() {
    const params = new URLSearchParams({ page: state.audit.page, limit: 50 });
    const userId = $('#auditUser').value.trim();
    const event = $('#eventFilter').value;
    if (userId) params.set('userId', userId);
    if (event) params.set('event', event);
    $('#auditList').innerHTML = '<div class="empty-line">正在读取审计记录...</div>';
    try {
      const data = await request(`${api}/admin/audit?${params}`);
      state.audit = { page: data.page, pages: data.pages, total: data.total };
      renderActivity($('#auditList'), data.items, true);
      $('#auditPagination').hidden = data.total === 0;
      $('#auditPageSummary').textContent = `第 ${data.page} / ${data.pages} 页 · 共 ${data.total} 条`;
      $('#auditPrev').disabled = data.page <= 1;
      $('#auditNext').disabled = data.page >= data.pages;
    } catch (error) {
      $('#auditList').innerHTML = `<div class="empty-line">${escapeHtml(error.message)}</div>`;
      toast(error.message, true);
    }
  }

  function renderActivity(container, items, includeDetails) {
    if (!items?.length) { container.innerHTML = '<div class="empty-line">暂无记录。</div>'; return; }
    container.innerHTML = items.map(item => {
      const detail = includeDetails ? JSON.stringify(item.details || {}) : (item.ipPrefix || 'IP 未知');
      return `<article class="${includeDetails ? 'audit-item' : 'activity-item'}">
        <strong>${escapeHtml(events[item.event] || item.event)}</strong>
        <span>${escapeHtml(item.username || item.userId || '系统事件')}</span>
        ${includeDetails ? `<code>${escapeHtml(detail === '{}' ? item.requestId : detail)}</code>` : `<span>${escapeHtml(item.ipPrefix || 'IP 未知')}</span>`}
        <time datetime="${new Date(item.createdAt * 1000).toISOString()}">${formatDate(item.createdAt)}</time>
      </article>`;
    }).join('');
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('is-spinning', busy);
  }

  function debounce(fn, delay = 350) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  function setupTheme() {
    const saved = localStorage.getItem('navi_theme');
    if (saved) document.documentElement.dataset.theme = saved;
    const refreshIcon = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      $('#themeButton').innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
      iconify();
    };
    $('#themeButton').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('navi_theme', next);
      refreshIcon();
    });
    refreshIcon();
  }

  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.go)));
  $('#refreshButton').addEventListener('click', () => state.view === 'overview' ? loadOverview() : state.view === 'analytics' ? loadAnalytics() : state.view === 'users' ? loadUsers() : loadAudit());
  $('#analyticsRefresh').addEventListener('click', loadAnalytics);
  $('#analyticsRange').addEventListener('change', loadAnalytics);
  $('#analyticsPlatform').addEventListener('change', loadAnalytics);
  $('#analyticsProduct').addEventListener('change', loadAnalytics);
  $('#analyticsContentProduct').addEventListener('change', loadAnalyticsContent);
  $('#usersRefresh').addEventListener('click', loadUsers);
  $('#auditRefresh').addEventListener('click', loadAudit);
  $('#userQuery').addEventListener('input', debounce(() => { state.users.page = 1; loadUsers(); }));
  $('#statusFilter').addEventListener('change', () => { state.users.page = 1; loadUsers(); });
  $('#serviceFilter').addEventListener('change', () => { state.users.page = 1; loadUsers(); });
  $('#userFilters').addEventListener('submit', event => event.preventDefault());
  $('#auditUser').addEventListener('input', debounce(() => { state.audit.page = 1; loadAudit(); }));
  $('#eventFilter').addEventListener('change', () => { state.audit.page = 1; loadAudit(); });
  $('#auditFilters').addEventListener('submit', event => event.preventDefault());
  $('#prevPage').addEventListener('click', () => { state.users.page--; loadUsers(); });
  $('#nextPage').addEventListener('click', () => { state.users.page++; loadUsers(); });
  $('#auditPrev').addEventListener('click', () => { state.audit.page--; loadAudit(); });
  $('#auditNext').addEventListener('click', () => { state.audit.page++; loadAudit(); });
  $('#closeDetail').addEventListener('click', closeDetail);
  $('#scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); });
  window.addEventListener('DOMContentLoaded', boot);
})();
