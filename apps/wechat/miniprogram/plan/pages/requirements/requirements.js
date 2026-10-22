const store = require('../../utils/store');
Page({
  behaviors: [require('../../../behaviors/theme')],
  data: { items: [], required: [], limited: [] },
  onShow() {
    const snapshot = store.load();
    const audits = snapshot && snapshot.audit && snapshot.audit.requirementAudits || [];
    const future = store.futureCourses(snapshot);
    this.setData({
      items: audits.filter(item => !item.satisfied),
      required: future.required,
      limited: future.limited
    });
  },
  openCourse(event) { wx.navigateTo({ url: `/plan/pages/course/course?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); }
});
