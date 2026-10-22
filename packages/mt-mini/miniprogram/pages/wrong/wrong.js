const questions = require('../../utils/questions');
const store = require('../../utils/store');

function formatTime(timestamp) {
  if (!timestamp) return '暂无时间';
  const date = new Date(Number(timestamp));
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    chapters: [],
    activeChapter: 'all',
    rows: [],
    total: 0,
    totalAttempts: 0,
    hideLegacy: false
  },

  onLoad(query = {}) {
    if (query.chapter) {
      try { this.setData({ activeChapter: decodeURIComponent(query.chapter) }); } catch (error) { /* keep default */ }
    }
  },

  onShow() { this.refresh(); },

  refresh() {
    const chapters = [{ id: 'all', title: '全部' }].concat(
      questions.bank.chapters.map(title => ({ id: title, title }))
    );
    const learning = store.loadData();
    const hideLegacy = store.getHideLegacy();
    const rows = store.getWrongQuestions({ chapter: this.data.activeChapter, hideLegacy }).map(question => {
      const entry = learning.wrongbook[question.id] || {};
      return Object.assign({}, question, {
        typeText: questions.typeName(question.type),
        attempts: Number(entry.attempts || 0),
        timeText: formatTime(entry.lastWrongAt)
      });
    });
    this.setData({
      chapters,
      rows,
      hideLegacy,
      total: rows.length,
      totalAttempts: rows.reduce((sum, item) => sum + item.attempts, 0)
    });
  },

  selectChapter(event) {
    this.setData({ activeChapter: event.currentTarget.dataset.chapter || 'all' });
    this.refresh();
  },

  changeHideLegacy(event) {
    store.setHideLegacy(event.detail.value);
    this.refresh();
  },

  startPractice() {
    if (!this.data.rows.length) {
      wx.showToast({ title: '当前没有错题', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/practice/practice?chapter=${encodeURIComponent(this.data.activeChapter)}&type=all&source=wrong&order=sequential` });
  },

  openQuestion(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/practice/practice?chapter=${encodeURIComponent(this.data.activeChapter)}&type=all&source=wrong&order=sequential&questionId=${id}` });
  },

  removeOne(event) {
    store.removeWrong(event.currentTarget.dataset.id);
    this.refresh();
  },

  clearCurrent() {
    if (!this.data.rows.length) return;
    wx.showModal({
      title: '清空当前错题',
      content: `将移出当前筛选下的 ${this.data.rows.length} 道错题，不删除作答历史。`,
      confirmColor: '#d93f32',
      success: result => {
        if (!result.confirm) return;
        store.clearWrong({ chapter: this.data.activeChapter, hideLegacy: this.data.hideLegacy });
        this.refresh();
      }
    });
  }
});
