const passport = require('../../utils/passport');

const MODE_COPY = {
  login: { title: '欢迎回来', note: '登录后，NaviWords 与 NaviMT 会分别同步学习记录。', submit: '登录通行证' },
  register: { title: '创建通行证', note: '用户名用于登录，密码至少 6 个字符。', submit: '创建通行证' },
  recover: { title: '恢复账号', note: '使用注册或上次改密时生成的恢复码。', submit: '重置密码' }
};

Page({
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
    wordsStatus: '仅本机',
    mtStatus: '仅本机'
  },

  onShow() { this.refreshAccount(); },

  refreshAccount() {
    const account = passport.account();
    this.setData({
      account,
      accountInitial: account ? String(account.username || 'N').slice(0, 1) : 'N',
      wordsStatus: passport.syncStatus('words'),
      mtStatus: passport.syncStatus('mt')
    });
  },

  setMode(event) {
    if (this.data.busy) return;
    const mode = event.currentTarget.dataset.mode;
    const copy = MODE_COPY[mode];
    if (!copy) return;
    this.setData({
      mode,
      modeTitle: copy.title,
      modeNote: copy.note,
      submitLabel: copy.submit,
      password: '',
      confirmPassword: '',
      recoveryCode: '',
      error: ''
    });
  },

  onUsername(event) { this.setData({ username: event.detail.value, error: '' }); },
  onPassword(event) { this.setData({ password: event.detail.value, error: '' }); },
  onConfirmPassword(event) { this.setData({ confirmPassword: event.detail.value, error: '' }); },
  onRecovery(event) { this.setData({ recoveryCode: event.detail.value, error: '' }); },
  togglePassword() { if (!this.data.busy) this.setData({ passwordVisible: !this.data.passwordVisible }); },

  validate() {
    const username = this.data.username.trim();
    if (!username) return '请输入用户名';
    if (this.data.mode === 'register' && (!/^[A-Za-z0-9_\-\u3400-\u9fff]{3,40}$/.test(username))) return '用户名需为 3-40 位中英文、数字、下划线或短横线';
    if (!this.data.password) return '请输入密码';
    if (this.data.mode !== 'login' && Array.from(this.data.password).length < 6) return '密码至少需要 6 个字符';
    if (this.data.mode !== 'login' && this.data.password !== this.data.confirmPassword) return '两次输入的密码不一致';
    if (this.data.mode === 'recover' && !this.data.recoveryCode.trim()) return '请输入恢复码';
    return '';
  },

  async submit() {
    if (this.data.busy) return;
    const validationError = this.validate();
    if (validationError) { this.setData({ error: validationError }); return; }
    this.setData({ busy: true, error: '' });
    try {
      const username = this.data.username.trim();
      let result;
      if (this.data.mode === 'register') result = await passport.register(username, this.data.password);
      else if (this.data.mode === 'recover') result = await passport.recover(username, this.data.recoveryCode.trim(), this.data.password);
      else result = await passport.login(username, this.data.password);

      if (result.recoveryCode) {
        this.setData({
          newRecoveryCode: result.recoveryCode,
          recoveryCopied: false,
          recoveryNextMode: this.data.mode === 'recover' ? 'login' : 'account'
        });
      }

      if (this.data.mode !== 'recover') {
        getApp().globalData.passportAccount = result.account;
        const initial = await Promise.allSettled([
          passport.initializeProduct('words', wx.getStorageSync('words_learning_data') || {}),
          passport.initializeProduct('mt', wx.getStorageSync('military_theory_learning_v1') || {})
        ]);
        this.setData({
          account: result.account,
          accountInitial: String(result.account.username || 'N').slice(0, 1),
          error: initial.some(item => item.status === 'rejected') ? '已登录，部分学习记录将在网络恢复后继续同步。' : ''
        });
      } else {
        const copy = MODE_COPY.login;
        this.setData({ mode: 'login', modeTitle: copy.title, modeNote: copy.note, submitLabel: copy.submit });
      }
      this.setData({ password: '', confirmPassword: '', recoveryCode: '' });
      this.refreshAccount();
    } catch (error) {
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
    }
  },

  async syncNow() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '', wordsStatus: '正在同步', mtStatus: '正在同步' });
    const results = await Promise.allSettled([passport.flush('words'), passport.flush('mt')]);
    this.refreshAccount();
    const failed = [];
    if (results[0].status === 'rejected') failed.push('NaviWords');
    if (results[1].status === 'rejected') failed.push('NaviMT 军理通');
    if (failed.length) this.setData({ error: `${failed.join('、')} 同步失败，请检查网络后重试。` });
    else wx.showToast({ title: '两项记录已同步', icon: 'success' });
    this.setData({ busy: false });
  },

  logout() {
    if (this.data.busy) return;
    wx.showModal({
      title: '退出 Navi Passport',
      content: '本机学习记录会保留，退出后停止跨设备同步。',
      confirmText: '退出登录',
      confirmColor: '#b6382f',
      success: async result => {
        if (!result.confirm) return;
        this.setData({ busy: true, error: '' });
        await passport.logout();
        getApp().globalData.passportAccount = null;
        this.setData({ account: null, accountInitial: 'N', password: '', busy: false });
        this.refreshAccount();
      }
    });
  }
});
