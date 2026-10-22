const passport = require('../../../utils/passport');
const api = require('../../utils/api');

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: { account: null, profile: null, sessions: [], loading: false, error: '' },
  async onShow() {
    await this.load();
    this.resumeIntent();
  },
  async load() {
    const account = passport.account();
    this.setData({ account, error: '' });
    if (!account) return this.setData({ profile: null, sessions: [] });
    this.setData({ loading: true });
    try {
      const [profile, sessions] = await Promise.all([api.request('/admin/me', {}, 'GET', true), api.request('/sessions', {}, 'GET', true)]);
      this.setData({ profile, sessions });
    } catch (error) { this.setData({ error: error.message || '读取问卷失败' }); }
    finally { this.setData({ loading: false }); }
  },
  goPassport(intent = '') {
    const returnTo = '/tools/pages/index/index';
    if (intent) wx.setStorageSync('navi_passport_intent', { type: intent, returnTo, expiresAt: Date.now() + 5 * 60 * 1000 });
    wx.navigateTo({ url: `/pages/passport/passport?returnTo=${encodeURIComponent(returnTo)}` });
  },
  create() {
    if (!this.data.account) return this.goPassport('tools-create');
    wx.navigateTo({ url: '/tools/pages/availability/availability' });
  },
  resumeIntent() {
    const intent = wx.getStorageSync('navi_passport_intent');
    if (!intent || intent.type !== 'tools-create' || intent.returnTo !== '/tools/pages/index/index') return;
    wx.removeStorageSync('navi_passport_intent');
    if (Number(intent.expiresAt || 0) < Date.now() || !this.data.account) return;
    wx.navigateTo({ url: '/tools/pages/availability/availability' });
  },
  openStats(event) {
    const id = event.currentTarget.dataset.id;
    const session = this.data.sessions.find(item => item.id === id);
    wx.setStorageSync('navistudy_tools_continuation', {
      path: `/tools/pages/stats/stats?id=${encodeURIComponent(id)}`,
      title: session ? session.title : '最近管理的问卷',
      meta: session ? `${session.totalResponses || 0} 人已提交` : '查看问卷统计',
      updatedAt: Date.now()
    });
    wx.navigateTo({ url: `/tools/pages/stats/stats?id=${encodeURIComponent(id)}` });
  },
  goHome() { wx.reLaunch({ url: '/pages/portal/portal' }); },
  copyWeb() {
    wx.setClipboardData({
      data: 'https://study.example.test/tools/',
      success: () => wx.showToast({ title: '已复制 NaviTools 网页链接', icon: 'none' })
    });
  },
  onShareAppMessage() { return { title: 'NaviTools · 实用工具箱', path: '/tools/pages/index/index' }; }
});
