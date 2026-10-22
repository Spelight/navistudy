const store = require('../../utils/store');

const statusLabels = {
  PLANNED: '已规划', IN_PROGRESS: '在修', COMPLETED: '已修', FAILED: '未通过',
  EXEMPTED: '免修', IGNORED: '不计入', CANDIDATE: '未修读'
};

Page({
  data: { groups: [], total: 0, visible: 0, query: '' },
  onShow() {
    const snapshot = store.load();
    const byId = {};
    (snapshot && snapshot.coursePool || []).forEach(course => { byId[course.id] = course; });
    (snapshot && snapshot.courses || []).forEach(course => { byId[course.id] = Object.assign({}, byId[course.id] || {}, course); });
    this.courses = Object.keys(byId).map(id => Object.assign({}, byId[id], {
      statusLabel: statusLabels[byId[id].status] || byId[id].status,
      groupLabel: byId[id].requirementGroupName || '未标明课程组'
    }));
    this.renderCourses('');
  },
  onSearch(event) {
    const query = event.detail.value || '';
    this.setData({ query });
    this.renderCourses(query);
  },
  renderCourses(query) {
    const keyword = query.trim().toLowerCase();
    const filtered = (this.courses || []).filter(course => !keyword || [
      course.courseName, course.courseCode, course.courseNature, course.groupLabel, course.plannedTermName
    ].join(' ').toLowerCase().includes(keyword));
    const grouped = {};
    filtered.forEach(course => { (grouped[course.groupLabel] ||= []).push(course); });
    const groups = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'zh-CN')).map(label => ({
      label,
      courses: grouped[label].sort((a, b) => (a.plannedTermCode || '').localeCompare(b.plannedTermCode || '') || a.courseName.localeCompare(b.courseName, 'zh-CN'))
    }));
    this.setData({ groups, total: (this.courses || []).length, visible: filtered.length });
  },
  openCourse(event) {
    wx.navigateTo({ url: `/plan/pages/course/course?id=${encodeURIComponent(event.currentTarget.dataset.id)}` });
  }
});
