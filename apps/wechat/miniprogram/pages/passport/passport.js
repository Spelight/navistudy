const passport = require('../../utils/passport');
const services = require('../../data/services');

const RETURN_ROUTE = /^\/(words|mt|reading|plan|tools)\/pages\/[a-z0-9_\-/]+$/i;

const MODE_COPY = {
  login: { title: '欢迎回来', note: '登录后，四项学习记录分别同步，并连接 NaviTools 管理权限。', submit: '登录通行证' },
  register: { title: '创建通行证', note: '用户名用于登录，密码至少 6 个字符。', submit: '创建通行证' },
  recover: { title: '恢复账号', note: '使用注册或上次改密时生成的恢复码。', submit: '重置密码' }
};

function formatSyncTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  behaviors: [require('../../behaviors/theme')],
  data: {
    mode: 'login',
    modeTitle: MODE_COPY.login.title,
    modeNote: MODE_COPY.login.note,
    submitLabel: MODE_COPY.login.submit,
    account: null,
    accountInitial: 'N',
    username: '',
    password: '',
    confirmPassword: '',
    recoveryCode: '',
    passwordVisible: false,
    busy: false,
    error: '',
    newRecoveryCode: '',
    recoveryCopied: false,
    recoveryNextMode: 'account',
    legacyRegistration: false,
    legacyUsername: '',
    legacyHint: '',
    inheritanceMessage: '',
    returnTo: '',
    services: [],
    toolsStatus: '登录后可用',
    toolsDetail: '问卷所有权与管理权限',
    wordsStatus: '仅本机',
    mtStatus: '仅本机',
    readingStatus: '仅本机',
    planStatus: '仅本机'
  },

  onLoad(query = {}) {
    const requested = query.returnTo ? decodeURIComponent(query.returnTo) : '';
    this.setData({ returnTo: RETURN_ROUTE.test(requested) ? requested : '' });
  },

  onShow() {
    this.refreshAccount();
    if (!passport.account()) {
      const legacyUsername = String(wx.getStorageSync('words_user') || '').trim();
      if (legacyUsername) this.setData({ legacyUsername, username: this.data.username || legacyUsername, legacyHint: `旧版 NaviWords 用户“${legacyUsername}”首次使用 NaviPassport 时需要注册，原有记录会自动继承。` });
    }
  },

  refreshAccount() {
    const account = passport.account();
    const rows = services.map(service => {
      if (service.serviceMode === 'account') {
        const toolsState = this.data.toolsStatus === '已授权' ? 'authorized' : (this.data.toolsStatus === '服务未开通' ? 'disabled' : 'attention');
        return Object.assign({}, service, { status: this.data.toolsStatus, state: toolsState, detail: this.data.toolsDetail, syncTime: '' });
      }
      const info = passport.syncInfo(service.id);
      return Object.assign({}, service, {
        status: info.status,
        state: info.state,
        detail: service.visibility === 'hidden' ? `${service.description} · 入口暂隐藏` : service.description,
        lastSyncedAt: info.lastSyncedAt,
        syncTime: info.lastSyncedAt ? `上次 ${formatSyncTime(info.lastSyncedAt)}` : ''
      });
    });
    this.setData({
      account,
      accountInitial: account ? String(account.username || 'N').slice(0, 1) : 'N',
      wordsStatus: passport.syncStatus('words'),
      mtStatus: passport.syncStatus('mt'),
      readingStatus: passport.syncStatus('reading'),
      planStatus: passport.syncStatus('plan'),
      services: rows
    });
  },

  setMode(event) {
    if (this.data.busy) return;
    const mode = event.currentTarget.dataset.mode;
    const copy = MODE_COPY[mode];
    if (!copy) return;
    const legacyRegistration = mode === 'register' && Boolean(this.data.legacyUsername);
    this.setData({
      mode,
      modeTitle: copy.title,
      modeNote: legacyRegistration ? `正在认领旧版 NaviWords 用户“${this.data.legacyUsername}”。请创建密码，注册后原有云端和本机记录会自动合并。` : copy.note,
      submitLabel: copy.submit,
      password: '',
      confirmPassword: '',
      recoveryCode: '',
      error: '',
      legacyRegistration,
      username: legacyRegistration ? this.data.legacyUsername : this.data.username
    });
  },

  startLegacyRegistration(username = this.data.legacyUsername) {
    const value = String(username || '').trim();
    if (!value) return;
    const copy = MODE_COPY.register;
    this.setData({
      mode: 'register',
      modeTitle: copy.title,
      modeNote: `正在认领旧版 NaviWords 用户“${value}”。请创建密码，注册后原有云端和本机记录会自动合并。`,
      submitLabel: copy.submit,
      username: value,
      legacyUsername: value,
      legacyRegistration: true,
      password: '',
      confirmPassword: '',
      error: ''
    });
  },

  chooseLegacyRegistration() { this.startLegacyRegistration(); },

  onUsername(event) { this.setData({ username: event.detail.value, error: '' }); },
  onPassword(event) { this.setData({ password: event.detail.value, error: '' }); },
  onConfirmPassword(event) { this.setData({ confirmPassword: event.detail.value, error: '' }); },
  onRecovery(event) { this.setData({ recoveryCode: event.detail.value, error: '' }); },
  togglePassword() {
    if (!this.data.busy) this.setData({ passwordVisible: !this.data.passwordVisible });
  },

  validate() {
    const username = this.data.username.trim();
    if (!username) return '请输入用户名';
    const usernamePattern = this.data.legacyRegistration ? /^[A-Za-z0-9_\-\u3400-\u9fff]{1,40}$/ : /^[A-Za-z0-9_\-\u3400-\u9fff]{3,40}$/;
    if (this.data.mode === 'register' && !usernamePattern.test(username)) return this.data.legacyRegistration ? '请保留原有 NaviWords 用户名' : '用户名需要 3-40 位中英文、数字、下划线或短横线';
    if (!this.data.password) return '请输入密码';
    if (this.data.mode !== 'login' && Array.from(this.data.password).length < 6) return '密码至少需要 6 个字符';
    if (this.data.mode !== 'login' && this.data.password !== this.data.confirmPassword) return '两次输入的密码不一致';
    if (this.data.mode === 'recover' && !this.data.recoveryCode.trim()) return '请输入恢复码';
    return '';
  },

  async initializeProducts(forceLocalMerge = false) {
    const initial = await Promise.allSettled([
      passport.initializeProduct('words', wx.getStorageSync('words_learning_data') || {}, { forceLocalMerge }),
      passport.initializeProduct('mt', wx.getStorageSync('military_theory_learning_v1') || {}, { forceLocalMerge }),
      passport.initializeProduct('reading', wx.getStorageSync('navi_reading_learning_v1') || {}, { forceLocalMerge }),
      passport.initializeProduct('plan', wx.getStorageSync('naviplan_data_v1') || {}, { forceLocalMerge })
    ]);
    this.refreshAccount();
    if (initial.some(item => item.status === 'rejected')) {
      this.setData({ error: '已登录，部分记录会在网络恢复后继续同步。' });
    }
    await this.refreshToolsProfile();
    return initial;
  },

  async refreshToolsProfile() {
    if (!passport.account()) return;
    try {
      const profile = await passport.toolsProfile();
      const count = Number(profile.activeSessionCount || 0);
      const limit = profile.unrestricted ? '不限数量' : `${count} / ${Number(profile.sessionLimit || 3)} 个问卷`;
      this.setData({ toolsStatus: '已授权', toolsDetail: limit });
    } catch (error) {
      const disabled = error.code === 'service_disabled';
      this.setData({
        toolsStatus: disabled ? '服务未开通' : '需要处理',
        toolsDetail: disabled ? '请联系管理员开通 NaviTools' : '无法读取问卷权限，请稍后重试'
      });
    }
    this.refreshAccount();
  },

  finishReturn() {
    if (!this.data.returnTo) return;
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.redirectTo({ url: this.data.returnTo });
  },

  async submit() {
    if (this.data.busy) return;
    const validationError = this.validate();
    if (validationError) {
      this.setData({ error: validationError });
      return;
    }
    this.setData({ busy: true, error: '' });
    try {
      const username = this.data.username.trim();
      let result;
      const submittedMode = this.data.mode;
      if (submittedMode === 'register') result = await passport.register(username, this.data.password);
      else if (this.data.mode === 'recover') result = await passport.recover(username, this.data.recoveryCode.trim(), this.data.password);
      else result = await passport.login(username, this.data.password);

      if (result.recoveryCode) {
        const claimedProducts = Array.isArray(result.claimedProducts) ? result.claimedProducts : [];
        this.setData({
          newRecoveryCode: result.recoveryCode,
          recoveryCopied: false,
          recoveryNextMode: submittedMode === 'recover' ? 'login' : 'account',
          inheritanceMessage: claimedProducts.includes('words') ? '旧版 NaviWords 云端记录已继承，并将与本机记录合并。' : ''
        });
      }

      if (submittedMode !== 'recover') {
        getApp().globalData.passportAccount = result.account;
        this.setData({
          account: result.account,
          accountInitial: String(result.account.username || 'N').slice(0, 1)
        });
        await this.initializeProducts(submittedMode === 'register');
        if (submittedMode === 'login') {
          wx.showToast({ title: '登录成功', icon: 'success' });
          this.finishReturn();
        }
      } else {
        const copy = MODE_COPY.login;
        this.setData({ mode: 'login', modeTitle: copy.title, modeNote: copy.note, submitLabel: copy.submit });
      }
      this.setData({ password: '', confirmPassword: '', recoveryCode: '' });
      this.refreshAccount();
    } catch (error) {
      if (error.code === 'legacy_registration_required') {
        this.startLegacyRegistration(this.data.username);
        return;
      }
      this.setData({ error: error.message || '操作失败，请检查网络后重试' });
    } finally {
      this.setData({ busy: false });
    }
  },

  copyRecovery() {
    wx.setClipboardData({
      data: this.data.newRecoveryCode,
      success: () => this.setData({ recoveryCopied: true })
    });
  },

  finishRecovery() {
    if (!this.data.recoveryCopied) return;
    const account = this.data.account;
    this.setData({ newRecoveryCode: '', recoveryCopied: false });
    if (!account || this.data.recoveryNextMode === 'login') {
      const copy = MODE_COPY.login;
      this.setData({ mode: 'login', modeTitle: copy.title, modeNote: copy.note, submitLabel: copy.submit });
    } else {
      this.finishReturn();
    }
  },

  async retryService(event) {
    if (this.data.busy) return;
    const product = event.currentTarget.dataset.product;
    if (product === 'tools') return this.refreshToolsProfile();
    if (!['words', 'mt', 'reading', 'plan'].includes(product)) return;
    this.setData({ busy: true, error: '' });
    try {
      await passport.flush(product);
      wx.showToast({ title: '同步完成', icon: 'success' });
    } catch (error) {
      this.setData({ error: `${services.find(item => item.id === product).name} 同步失败，请稍后重试。` });
    } finally {
      this.setData({ busy: false });
      this.refreshAccount();
    }
  },

  async syncNow() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '', wordsStatus: '正在同步', mtStatus: '正在同步', readingStatus: '正在同步', planStatus: '正在同步' });
    const results = await Promise.allSettled([passport.flush('words'), passport.flush('mt'), passport.flush('reading'), passport.flush('plan')]);
    await this.refreshToolsProfile();
    this.refreshAccount();
    const failed = [];
    if (results[0].status === 'rejected') failed.push('NaviWords');
    if (results[1].status === 'rejected') failed.push('NaviMT');
    if (results[2].status === 'rejected') failed.push('NaviReading');
    if (results[3].status === 'rejected') failed.push('NaviPlan');
    if (failed.length) this.setData({ error: `${failed.join('、')} 同步失败，请检查网络后重试。` });
    else wx.showToast({ title: '学习数据已同步', icon: 'success' });
    this.setData({ busy: false });
  },

  logout() {
    if (this.data.busy) return;
    wx.showModal({
      title: '退出 NaviPassport',
      content: '本机学习与规划记录会保留，退出后停止跨设备同步。',
      confirmText: '退出登录',
      confirmColor: '#b6382f',
      success: async result => {
        if (!result.confirm) return;
        this.setData({ busy: true, error: '' });
        await passport.logout();
        wx.removeStorageSync('navi_passport_intent');
        getApp().globalData.passportAccount = null;
        this.setData({ account: null, accountInitial: 'N', password: '', busy: false });
        this.refreshAccount();
      }
    });
  }
});
