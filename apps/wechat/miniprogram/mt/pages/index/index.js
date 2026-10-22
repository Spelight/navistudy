const questions = require('../../utils/questions');
const store = require('../../utils/store');

const modeCards = [
  { id: 'sequential', title: '章节顺序练习', desc: '从当前章节上次位置继续', className: 'route', primary: true },
  { id: 'random', title: '随机客观题', desc: '打乱单选、多选和判断题', className: 'random' },
  { id: 'wrong', title: '错题攻坚', desc: '集中处理仍未答对的题目', className: 'wrong' },
  { id: 'favorite', title: '收藏复习', desc: '只练习标记过的重点题', className: 'favorite' },
  { id: 'short', title: '简答自测', desc: '先回忆，再对照参考答案', className: 'short' }
];

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: {
    chapters: [],
    chapterNames: [],
    chapterIndex: 0,
    activeChapter: 'all',
    activeChapterText: '全部章节',
    modeCards,
    stats: {},
    progressPercent: 0,
    remaining: 0,
    lastProgress: null,
    lastProgressText: '',
    hideLegacy: false,
    noticeHidden: false
  },

  onShow() {
    this.prepare();
  },

  prepare() {
    const chapters = [{ id: 'all', title: '全部章节' }].concat(
      questions.bank.chapters.map(title => ({ id: title, title }))
    );
    const savedChapter = wx.getStorageSync('military_active_chapter') || 'all';
    const chapterIndex = Math.max(chapters.findIndex(item => item.id === savedChapter), 0);
    const chapter = chapters[chapterIndex] || chapters[0];
    const hideLegacy = store.getHideLegacy();
    const stats = store.getStats({ chapter: chapter.id, hideLegacy });
    const learning = store.loadData();
    const savedProgress = learning.lastProgress;
    const last = savedProgress && Boolean(savedProgress.hideLegacy) === hideLegacy ? savedProgress : null;
    const lastQuestion = last ? questions.getQuestion(last.currentId) : null;
    const lastProgressText = lastQuestion
      ? `${lastQuestion.chapter} · ${questions.typeName(lastQuestion.type)} · 第 ${Number(last.index || 0) + 1} 题`
      : '';

    this.setData({
      chapters,
      chapterNames: chapters.map(item => `${item.title} (${questions.filterQuestions({ chapter: item.id, hideLegacy }).length})`),
      chapterIndex,
      activeChapter: chapter.id,
      activeChapterText: chapter.title,
      stats,
      progressPercent: stats.percent,
      remaining: Math.max(stats.total - stats.answered, 0),
      lastProgress: last || null,
      lastProgressText,
      hideLegacy,
      noticeHidden: !!wx.getStorageSync('military_notice_hidden')
    });
  },

  changeChapter(event) {
    const chapterIndex = Number(event.detail.value || 0);
    const chapter = this.data.chapters[chapterIndex] || this.data.chapters[0];
    wx.setStorageSync('military_active_chapter', chapter.id);
    this.prepare();
  },

  changeHideLegacy(event) {
    store.setHideLegacy(event.detail.value);
    this.prepare();
  },

  dismissNotice() {
    wx.setStorageSync('military_notice_hidden', true);
    this.setData({ noticeHidden: true });
  },

  startMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === 'wrong') {
      wx.navigateTo({ url: `/mt/pages/wrong/wrong?chapter=${encodeURIComponent(this.data.activeChapter)}` });
      return;
    }
    const params = [`chapter=${encodeURIComponent(this.data.activeChapter)}`];
    if (mode === 'random') params.push('type=objective', 'order=random');
    if (mode === 'favorite') params.push('source=favorite', 'order=sequential');
    if (mode === 'short') params.push('type=short', 'order=sequential');
    if (mode === 'sequential') params.push('type=all', 'order=sequential');
    wx.navigateTo({ url: `/mt/pages/practice/practice?${params.join('&')}` });
  },

  continuePractice() {
    const progress = this.data.lastProgress;
    if (!progress) {
      wx.navigateTo({ url: `/mt/pages/practice/practice?chapter=${encodeURIComponent(this.data.activeChapter)}&type=all&order=sequential` });
      return;
    }
    const params = [
      `chapter=${encodeURIComponent(progress.chapter || 'all')}`,
      `type=${progress.type || 'all'}`,
      `order=${progress.order || 'sequential'}`,
      `index=${Number(progress.index || 0)}`
    ];
    if (progress.source) params.push(`source=${progress.source}`);
    if (progress.questionId) params.push(`questionId=${progress.questionId}`);
    wx.navigateTo({ url: `/mt/pages/practice/practice?${params.join('&')}` });
  },

  goBank() {
    wx.redirectTo({ url: '/mt/pages/bank/bank' });
  },

  goMaterials() {
    wx.navigateTo({ url: '/mt/pages/materials/materials' });
  },

  goWrong() {
    wx.navigateTo({ url: `/mt/pages/wrong/wrong?chapter=${encodeURIComponent(this.data.activeChapter)}` });
  },

  goStudy() { wx.reLaunch({ url: '/pa' + 'ges/portal/portal' }); }
});
