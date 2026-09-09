const passport = require('./utils/passport');

App({
  globalData: {
    version: '0.1.0',
    wordsVersion: '0.2.1',
    mtVersion: '0.1.0',
    apiBase: 'https://words.dxir.net.cn',
    mtApiBase: 'https://mt.dxir.net.cn',
    passportApiBase: 'https://study.dxir.net.cn',
    user: '',
    passportUser: '',
    passportAccount: null
  },

  onLaunch() {
    const user = wx.getStorageSync('navi_passport_user') || wx.getStorageSync('words_user') || '';
    if (user) {
      wx.setStorageSync('navi_passport_user', user);
      wx.setStorageSync('words_user', user);
    }
    this.globalData.user = user;
    this.globalData.passportUser = user;
    this.globalData.passportAccount = passport.account();
    if (wx.setInnerAudioOption) wx.setInnerAudioOption({ obeyMuteSwitch: true });
    if (this.globalData.passportAccount) {
      passport.initializeProduct('words', wx.getStorageSync('words_learning_data') || {});
      passport.initializeProduct('mt', wx.getStorageSync('military_theory_learning_v1') || {});
    }
  },

  onHide() {
    passport.flush('words').catch(() => {});
    passport.flush('mt').catch(() => {});
  },

  queueSync(product, data) {
    passport.queueSync(product, data);
  }
});
