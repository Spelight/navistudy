App({
  globalData: {
    apiBase: 'https://words.example.test',
    version: '0.3.0',
    user: ''
  },

  onLaunch() {
    this.globalData.user = wx.getStorageSync('words_user') || '';
  }
});
