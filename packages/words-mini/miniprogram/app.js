App({
  globalData: {
    apiBase: 'https://words.dxir.net.cn',
    version: '0.2.1',
    user: ''
  },

  onLaunch() {
    this.globalData.user = wx.getStorageSync('words_user') || '';
  }
});
