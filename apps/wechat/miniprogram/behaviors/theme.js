const THEME_KEY = 'navistudy_portal_theme';

function currentTheme() {
  return wx.getStorageSync(THEME_KEY) === 'light' ? 'light' : 'dark';
}

function applyNavigation(theme) {
  if (wx.setNavigationBarColor) {
    wx.setNavigationBarColor({
      frontColor: theme === 'light' ? '#000000' : '#ffffff',
      backgroundColor: theme === 'light' ? '#eef4fb' : '#050608'
    });
  }
  if (wx.setBackgroundColor) {
    wx.setBackgroundColor({
      backgroundColor: theme === 'light' ? '#eef4fb' : '#050608',
      backgroundColorTop: theme === 'light' ? '#eef4fb' : '#050608',
      backgroundColorBottom: theme === 'light' ? '#eef4fb' : '#050608'
    });
  }
}

const createBehavior = typeof Behavior === 'function' ? Behavior : definition => definition;

module.exports = createBehavior({
  data: { naviTheme: 'dark' },
  lifetimes: {
    attached() { this.applyNaviTheme(); }
  },
  pageLifetimes: {
    show() { this.applyNaviTheme(); }
  },
  methods: {
    applyNaviTheme() {
      const naviTheme = currentTheme();
      this.setData({ naviTheme });
      applyNavigation(naviTheme);
    }
  }
});
