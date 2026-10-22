const store = require('../../utils/store');
const api = require('../../utils/api');
const statuses = ['COMPLETED','IN_PROGRESS','PLANNED','FAILED','EXEMPTED','IGNORED','CANDIDATE'];
const categories = ['REQUIRED','MAJOR_ELECTIVE','LIMITED_ELECTIVE','GENERAL','AESTHETIC','LABOR','PRACTICE','FREE_ELECTIVE'];
function track(name, data = {}) { const app = getApp(); if (app && typeof app.trackAnalytics === 'function') app.trackAnalytics(name, Object.assign({ product: 'plan' }, data)); }
Page({
  data: { course: null, statusIndex: 0, categoryIndex: 0, statuses, categories, credits: '', note: '', saving: false },
  onLoad(options) { const snapshot = store.load(); const id = decodeURIComponent(options.id || ''); track('page_view', { itemId: id || undefined }); const courses = (snapshot && snapshot.coursePool || []).concat(snapshot && snapshot.courses || []); const course = courses.find(item => item.id === id); if (!course) return; this.snapshot = snapshot; this.setData({ course, statusIndex: Math.max(0,statuses.indexOf(course.status)), categoryIndex: Math.max(0,categories.indexOf(course.manualCategory || course.category)), credits: String(course.credits), note: course.manualNote || '' }); },
  changeStatus(e) { this.setData({ statusIndex: Number(e.detail.value) }); }, changeCategory(e) { this.setData({ categoryIndex: Number(e.detail.value) }); }, changeCredits(e) { this.setData({ credits: e.detail.value }); }, changeNote(e) { this.setData({ note: e.detail.value }); },
  async save() { if (!this.snapshot || !this.data.course) return; this.setData({ saving: true }); try { const corrections = Object.assign({}, this.snapshot.manualCorrections || {}, { [this.data.course.id]: { status: statuses[this.data.statusIndex], manualCategory: categories[this.data.categoryIndex], credits: Number(this.data.credits), manualNote: this.data.note } }); const next = await api.evaluate(this.snapshot, corrections); await api.save(next); track('plan_evaluate', { itemId: this.data.course.id }); wx.showToast({ title: '已保存并同步' }); this.snapshot = next; } catch (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); } finally { this.setData({ saving: false }); } }
});
