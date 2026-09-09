const store = require('../../utils/store');

Page({
  data: {
    displayUser: '游客模式',
    version: '',
    favCount: 0,
    wrongCount: 0,
    masteredCount: 0,
    passportSummary: 'NaviWords · 当前记录仅保存在本机',
    passportAction: '登录 Navi Passport',
    syncStatus: '仅本机'
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const data = store.loadData();
    const app = getApp();
    const account = app.globalData.passportAccount || null;
    const integrated = Object.prototype.hasOwnProperty.call(app.globalData, 'passportAccount');
    this.setData({
      displayUser: account ? account.username : '游客模式',
      passportSummary: account ? 'NaviWords · 词汇数据独立自动同步' : 'NaviWords · 当前记录仅保存在本机',
      passportAction: account ? '管理 Navi Passport' : (integrated ? '登录 Navi Passport' : '前往 NaviStudy 登录'),
      syncStatus: account ? (wx.getStorageSync('navi_sync_status_words') || '正在同步') : '仅本机',
      version: app.globalData.wordsVersion || app.globalData.version,
      favCount: (data.favs || []).length,
      wrongCount: Object.keys(data.wrongbook || {}).length,
      masteredCount: Object.keys(data.mastered || {}).length
    });
  },

  goPassport() {
    const app = getApp();
    if (Object.prototype.hasOwnProperty.call(app.globalData, 'passportAccount')) {
      wx.navigateTo({ url: '/pa' + 'ges/passport/passport' });
      return;
    }
    wx.showModal({
      title: '请从 NaviStudy 登录',
      content: 'Navi Passport 由 NaviStudy 主小程序统一管理，登录后 NaviWords 与 NaviMT 分别同步数据。',
      showCancel: false
    });
  },

  goWrong() {
    wx.navigateTo({ url: '/words/pages/wrong/wrong' });
  },

  goBooks() {
    wx.redirectTo({ url: '/words/pages/books/books' });
  },

  copyWeb() {
    wx.setClipboardData({
      data: 'https://study.dxir.net.cn/words/',
      success: () => wx.showToast({ title: '已复制网页链接', icon: 'none' })
    });
  },

  shareApp() {
    wx.showShareMenu({ withShareTicket: false });
    wx.showToast({ title: '请使用右上角分享', icon: 'none' });
  },

  onShareAppMessage() {
    return {
      title: 'NaviWords 词背通',
      path: '/words/pages/index/index'
    };
  },

  reopenNotice() {
    wx.removeStorageSync('naviwords_notice_hidden');
    wx.showToast({ title: '公告已恢复', icon: 'none' });
  },

  exportData() {
    wx.setClipboardData({
      data: JSON.stringify(store.loadData(), null, 2),
      success: () => wx.showToast({ title: '已复制学习数据', icon: 'none' })
    });
  },

  importData() {
    wx.getClipboardData({
      success: res => {
        try {
          const parsed = JSON.parse(res.data || '{}');
          store.saveData(Object.assign(store.loadData(), parsed));
          this.refresh();
          wx.showToast({ title: '已导入剪贴板数据', icon: 'none' });
        } catch (err) {
          wx.showToast({ title: '剪贴板不是有效 JSON', icon: 'none' });
        }
      }
    });
  },

  clearLocal() {
    wx.showModal({
      title: '清空本地数据',
      content: '会清空本机收藏、错题和练习进度，不影响远端数据。',
      confirmColor: '#d93f32',
      success: res => {
        if (!res.confirm) return;
        store.saveData(store.defaultData());
        this.refresh();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  }
});
