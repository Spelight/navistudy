const store = require('../../utils/store');
const passport = require('../../../utils/passport');

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: { snapshot: null, summary: {}, futureRequired: [], futureLimited: [], account: null, sync: '仅本机' },
  onShow() {
    const snapshot = store.load();
    const summary = store.summary(snapshot);
    this.setData({
      snapshot,
      summary,
      futureRequired: (summary.futureRequired || []).slice(0, 5),
      futureLimited: (summary.futureLimited || []).slice(0, 5),
      account: passport.account(),
      sync: passport.syncStatus('plan')
    });
  },
  goSource() { wx.navigateTo({ url: '/plan/pages/source/source' }); },
  goRequirements() { wx.navigateTo({ url: '/plan/pages/requirements/requirements' }); },
  goPassport() { wx.navigateTo({ url: '/pages/passport/passport?returnTo=' + encodeURIComponent('/plan/pages/index/index') }); },
  openWeb() { wx.setClipboardData({ data: 'https://study.example.test/naviplan/' }); }
});
