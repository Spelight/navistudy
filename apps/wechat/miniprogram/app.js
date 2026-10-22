const passport = require('./utils/passport');
const analytics = require('./utils/analytics');

App({
  globalData: {
    version: '4.0.2',
    wordsVersion: '0.3.0',
    mtVersion: '0.1.2',
    readingVersion: '0.1.1',
    planVersion: '0.2.1',
    toolsVersion: '0.1.0',
    apiBase: 'https://words.example.test',
    mtApiBase: 'https://mt.example.test',
    planWebBase: 'https://study.example.test/naviplan/',
    planApiBase: 'https://words.example.test/naviplan/api',
    toolsWebBase: 'https://study.example.test/tools/',
    toolsApiBase: 'https://words.example.test/navitools/api/availability',
    passportApiBase: 'https://words.example.test/navistudy-api',
    user: '',
    passportUser: '',
    passportAccount: null,
    navistudyTheme: 'dark'
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
    this.globalData.navistudyTheme = wx.getStorageSync('navistudy_portal_theme') === 'light' ? 'light' : 'dark';
    analytics.track('app_open', { product: 'study', metadata: { version: this.globalData.version } });
    if (wx.setInnerAudioOption) wx.setInnerAudioOption({ obeyMuteSwitch: true });
    if (this.globalData.passportAccount) {
      passport.initializeProduct('words', wx.getStorageSync('words_learning_data') || {});
      passport.initializeProduct('mt', wx.getStorageSync('military_theory_learning_v1') || {});
      passport.initializeProduct('reading', wx.getStorageSync('navi_reading_learning_v1') || {});
      passport.initializeProduct('plan', wx.getStorageSync('naviplan_data_v1') || {});
    }
  },

  onHide() {
    passport.flush('words').catch(() => {});
    passport.flush('mt').catch(() => {});
    passport.flush('reading').catch(() => {});
    passport.flush('plan').catch(() => {});
    analytics.flush();
  },

  queueSync(product, data) {
    passport.queueSync(product, data);
  },

  trackAnalytics(name, data) {
    analytics.track(name, data);
  }
});
