const questions = require('../../utils/questions');
const store = require('../../utils/store');

Page({
  data: {
    version: '',
    total: 0,
    answered: 0,
    mastered: 0,
    wrong: 0,
    favorites: 0,
    accuracy: 0,
    sourceCount: 0,
    legacyCount: 0,
    displayUser: '游客模式',
    passportSummary: 'NaviMT 军理通 · 当前记录仅保存在本机',
    passportAction: '登录 Navi Passport',
    syncStatus: '仅本机'
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const stats = store.getStats();
    const app = getApp();
    const account = app.globalData.passportAccount || null;
    const integrated = Object.prototype.hasOwnProperty.call(app.globalData, 'passportAccount');
    this.setData({
      version: getApp().globalData.version,
      total: stats.total,
      answered: stats.answered,
      mastered: stats.mastered,
      wrong: stats.wrong,
      favorites: stats.favorites,
      accuracy: stats.accuracy,
      sourceCount: questions.bank.sources.length,
      legacyCount: questions.bank.stats.legacy,
      displayUser: account ? account.username : '游客模式',
      passportSummary: account ? 'NaviMT 军理通 · 军理数据独立自动同步' : 'NaviMT 军理通 · 当前记录仅保存在本机',
      passportAction: account ? '管理 Navi Passport' : (integrated ? '登录 Navi Passport' : '前往 NaviStudy 登录'),
      syncStatus: account ? (wx.getStorageSync('navi_sync_status_mt') || '正在同步') : '仅本机'
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
    wx.navigateTo({ url: '/pages/wrong/wrong' });
  },

  goFavorites() {
    if (!this.data.favorites) {
      wx.showToast({ title: '还没有收藏题目', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/practice/practice?chapter=all&type=all&source=favorite&order=sequential' });
  },

  goBank() {
    wx.switchTab({ url: '/pages/bank/bank' });
  },

  copyWeb() {
    wx.setClipboardData({
      data: 'https://study.dxir.net.cn/mt/',
      success: () => wx.showToast({ title: '已复制网页版链接', icon: 'none' })
    });
  },

  exportData() {
    const payload = {
      app: 'military-theory-wechat-miniprogram',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: store.loadData()
    };
    wx.setClipboardData({
      data: JSON.stringify(payload),
      success: () => wx.showToast({ title: '学习数据已复制', icon: 'none' })
    });
  },

  importData() {
    wx.getClipboardData({
      success: result => {
        try {
          const payload = JSON.parse(result.data || '{}');
          const imported = payload.app === 'military-theory-wechat-miniprogram' ? payload.data : payload;
          if (!imported || typeof imported !== 'object' || Array.isArray(imported)) throw new Error('invalid');
          store.saveData(Object.assign(store.loadData(), imported));
          this.refresh();
          wx.showToast({ title: '学习数据已导入', icon: 'none' });
        } catch (error) {
          wx.showToast({ title: '剪贴板不是有效学习数据', icon: 'none' });
        }
      }
    });
  },

  reopenNotice() {
    wx.removeStorageSync('military_notice_hidden');
    wx.showToast({ title: '首页提示已恢复', icon: 'none' });
  },

  clearLocal() {
    wx.showModal({
      title: '清空本地学习数据',
      content: '会清空本机作答、错题、收藏和练习进度，题库内容不会删除。',
      confirmColor: '#d93f32',
      success: result => {
        if (!result.confirm) return;
        store.saveData(store.defaultData());
        this.refresh();
        wx.showToast({ title: '本地数据已清空', icon: 'none' });
      }
    });
  },

  shareApp() {
    wx.showShareMenu({ withShareTicket: false });
    wx.showToast({ title: '请使用右上角分享', icon: 'none' });
  },

  onShareAppMessage() {
    return {
      title: 'NaviMT 军理通 · 随时练习与错题复习',
      path: '/pages/index/index'
    };
  }
});
