const passport = require('../../../utils/passport');
const api = require('../../utils/api');
const store = require('../../utils/store');
const { formatUpdatedAt } = require('../../utils/date');
function track(name, data = {}) { const app = getApp(); if (app && typeof app.trackAnalytics === 'function') app.trackAnalytics(name, Object.assign({ product: 'plan' }, data)); }
Page({
  data: { account: null, username: '', password: '', captcha: '', clientId: '', execution: '', captchaImage: '', importing: false, snapshot: null, updatedAtText: '', errorMessage: '', domainError: false },
  onLoad() { track('page_view'); },
  onShow() { this.setData({ account: passport.account() }); this.showSnapshot(store.load()); },
  showSnapshot(snapshot) { this.setData({ snapshot, updatedAtText: snapshot ? formatUpdatedAt(snapshot.updatedAt) : '' }); },
  showError(error) { this.setData({ errorMessage: error.message || '操作失败，请稍后重试', domainError: error.code === 'request_domain_not_allowed' }); },
  copyServiceDomain() { wx.setClipboardData({ data: api.serviceDomain() }); },
  inputUsername(e){this.setData({username:e.detail.value});}, inputPassword(e){this.setData({password:e.detail.value});}, inputCaptcha(e){this.setData({captcha:e.detail.value});},
  goPassport(){wx.navigateTo({url:'/pages/passport/passport?returnTo='+encodeURIComponent('/plan/pages/source/source')});},
  async pull() {
    if (!passport.account()) return this.goPassport();
    this.setData({ errorMessage: '', domainError: false });
    wx.showLoading({ title: '读取快照' });
    try {
      const doc = await api.pull();
      store.replace(doc);
      this.showSnapshot(doc);
      wx.showToast({ title: '已读取' });
    } catch (error) { this.showError(error); }
    finally { wx.hideLoading(); }
  },
  async importData() {
    if (this.data.importing) return;
    if (!passport.account()) return this.goPassport();
    if (!this.data.username || !this.data.password) return wx.showToast({ title: '请输入学号和密码', icon: 'none' });
    this.setData({ importing: true, errorMessage: '', domainError: false });
    try {
      const preload = this.data.clientId ? null : await api.preload();
      const next = await api.importPlan({
        username: this.data.username,
        password: this.data.password,
        captcha: this.data.captcha || null,
        clientId: this.data.clientId || (preload && preload.clientId),
        execution: this.data.execution || (preload && preload.execution)
      });
      await api.save(next);
      this.showSnapshot(next);
      this.setData({ captcha: '', clientId: '', execution: '', captchaImage: '' });
      track('plan_import', { metadata: { courses: (next.courses || []).length, requirements: (next.requirements || []).length } });
      wx.showToast({ title: '导入完成' });
    } catch (error) {
      const challenge = error.challenge;
      if (challenge && challenge.clientId) this.setData({ clientId: challenge.clientId, execution: challenge.execution || '', captchaImage: challenge.captcha && challenge.captcha.imageUrl || '' });
      this.showError(error);
    } finally { this.setData({ password: '', importing: false }); }
  }
});
