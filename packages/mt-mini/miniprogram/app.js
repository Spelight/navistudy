App({
  globalData: {
    version: '0.1.0',
    apiBase: 'https://mt.dxir.net.cn',
    user: '',
    passportUser: ''
  },

  onLaunch() {
    const user = wx.getStorageSync('navi_passport_user') || wx.getStorageSync('words_user') || '';
    if (user) {
      wx.setStorageSync('navi_passport_user', user);
      wx.setStorageSync('words_user', user);
    }
    this.globalData.user = user;
    this.globalData.passportUser = user;
    wx.setInnerAudioOption && wx.setInnerAudioOption({ obeyMuteSwitch: true });
  }
});
