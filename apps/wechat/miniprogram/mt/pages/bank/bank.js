const questions = require('../../utils/questions');
const store = require('../../utils/store');

const typeTabs = [
  { id: 'all', title: '全部题型' },
  { id: 'single', title: '单选题' },
  { id: 'multiple', title: '多选题' },
  { id: 'truefalse', title: '判断题' },
  { id: 'short', title: '简答题' }
];

Page({
  data: {
    chapters: [],
    activeChapter: 'all',
    typeTabs,
    activeType: 'all',
    query: '',
    rows: [],
    total: 0,
    limit: 40,
    hasMore: false,
    stats: {}
  },

  onLoad(query = {}) {
    if (query.chapter) {
      try { this.setData({ activeChapter: decodeURIComponent(query.chapter) }); } catch (error) { /* keep raw value */ }
    }
  },

  onShow() {
    this.refresh(true);
  },

  refresh(resetLimit) {
    const chapters = [{ id: 'all', title: '全部' }].concat(
      questions.bank.chapters.map(title => ({ id: title, title }))
    );
    const allRows = questions.filterQuestions({
      chapter: this.data.activeChapter,
      type: this.data.activeType,
      query: this.data.query
    });
    const limit = resetLimit ? 40 : this.data.limit;
    const learning = store.loadData();
    const rows = allRows.slice(0, limit).map(question => {
      const answer = (learning.answers || {})[question.id];
      let statusText = '未作答';
      let statusClass = '';
      if (answer) {
        statusText = answer.lastCorrect ? '已答对' : '待复习';
        statusClass = answer.lastCorrect ? 'done' : 'wrong';
      }
      return Object.assign({}, question, {
        typeText: questions.typeName(question.type),
        statusText,
        statusClass,
        favorite: (learning.favorites || []).includes(question.id)
      });
    });
    this.setData({
      chapters,
      rows,
      total: allRows.length,
      limit,
      hasMore: allRows.length > limit,
      stats: store.getStats({ chapter: this.data.activeChapter, type: this.data.activeType })
    });
  },

  selectChapter(event) {
    this.setData({ activeChapter: event.currentTarget.dataset.chapter || 'all', limit: 40 });
    this.refresh(true);
  },

  selectType(event) {
    this.setData({ activeType: event.currentTarget.dataset.type || 'all', limit: 40 });
    this.refresh(true);
  },

  onSearch(event) {
    this.setData({ query: event.detail.value || '', limit: 40 });
    this.refresh(true);
  },

  loadMore() {
    this.setData({ limit: this.data.limit + 40 });
    this.refresh(false);
  },

  startPractice() {
    wx.navigateTo({
      url: `/mt/pages/practice/practice?chapter=${encodeURIComponent(this.data.activeChapter)}&type=${this.data.activeType}&order=sequential`
    });
  },

  openQuestion(event) {
    const id = event.currentTarget.dataset.id;
    const question = questions.getQuestion(id);
    if (!question) return;
    wx.navigateTo({
      url: `/mt/pages/practice/practice?chapter=${encodeURIComponent(this.data.activeChapter)}&type=${this.data.activeType}&order=sequential&questionId=${id}`
    });
  }
});

