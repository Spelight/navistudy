const data = require('../../utils/data');
const store = require('../../utils/store');

const modeCards = [
  { id: 'card', title: '顺序背词', desc: '按当前教材和 Unit 继续推进', icon: 'list-mark', primary: true },
  { id: 'choice', title: '选择巩固', desc: '看英文选释义，适合快速检测', icon: 'choice-mark' },
  { id: 'spell', title: '拼写训练', desc: '按释义写单词，暴露薄弱拼写', icon: 'spell-mark' },
  { id: 'wrong-card', title: '错题攻坚', desc: '集中处理选择和拼写错题', icon: 'wrong-mark' },
  { id: 'fav-card', title: '收藏复习', desc: '只看自己标记的重点词', icon: 'fav-mark' }
];

function unitOptions(book) {
  const allWords = data.getWordsByScope(book.id, 'all');
  return [{
    unit: 'all',
    label: '全部 Unit',
    count: allWords.length
  }].concat(book.units.map(unit => ({
    unit,
    label: data.unitShortLabel(unit).replace(/^B\d\s/, ''),
    count: data.getWordsByScope(book.id, unit).length
  })));
}

Page({
  data: {
    books: [],
    bookNames: [],
    bookIndex: 0,
    activeBook: 'b5',
    activeBookTitle: '',
    units: [],
    unitNames: [],
    unitIndex: 0,
    activeUnitText: '',
    activeUnit: 'all',
    progress: {},
    progressMastered: 0,
    progressTotal: 0,
    progressPercent: 0,
    remainingCount: 0,
    lastProgress: null,
    lastProgressText: '',
    noticeHidden: false,
    modeCards,
    favCount: 0,
    wrongCount: 0
  },

  onShow() {
    this.prepare();
  },

  prepare() {
    const learning = store.loadData();
    const books = data.bookStats();
    const savedBook = wx.getStorageSync('naviwords_active_book');
    const savedUnit = wx.getStorageSync('naviwords_active_unit') || 'all';
    const activeBook = savedBook || (learning.last_progress && learning.last_progress.book) || 'b5';
    const bookIndex = Math.max(books.findIndex(book => book.id === activeBook), 0);
    const book = books[bookIndex] || books[0];
    const units = unitOptions(book);
    const unitIndex = Math.max(units.findIndex(item => String(item.unit) === String(savedUnit)), 0);
    const unit = units[unitIndex] || units[0];
    const progress = store.getProgressStats(book.id, unit.unit);
    const p = learning.last_progress;
    const lastProgressText = p
      ? `${data.getBookById(p.book || book.id).title} · ${p.unit === 'all' ? '全部 Unit' : data.unitShortLabel(p.unit)} · 第 ${(Number(p.index) || 0) + 1} 个`
      : '';

    this.setData({
      books,
      bookNames: books.map(item => item.title),
      bookIndex,
      activeBook: book.id,
      activeBookTitle: book.title,
      units,
      unitNames: units.map(item => `${item.label} (${item.count})`),
      unitIndex,
      activeUnit: unit.unit,
      activeUnitText: `${unit.label} (${unit.count})`,
      progress,
      progressMastered: Number(progress.masteredCount || 0),
      progressTotal: Number(progress.total || 0),
      progressPercent: Number(progress.percent || 0),
      remainingCount: Math.max(Number(progress.total || 0) - Number(progress.masteredCount || 0), 0),
      lastProgress: p || null,
      lastProgressText,
      noticeHidden: !!wx.getStorageSync('naviwords_notice_hidden'),
      favCount: progress.favCount,
      wrongCount: progress.wrongCount
    });
  },

  changeBook(e) {
    const bookIndex = Number(e.detail.value || 0);
    const book = this.data.books[bookIndex] || this.data.books[0];
    wx.setStorageSync('naviwords_active_book', book.id);
    wx.setStorageSync('naviwords_active_unit', 'all');
    this.prepare();
  },

  changeUnit(e) {
    const unitIndex = Number(e.detail.value || 0);
    const unit = this.data.units[unitIndex] || this.data.units[0];
    wx.setStorageSync('naviwords_active_unit', unit.unit);
    this.prepare();
  },

  dismissNotice() {
    wx.setStorageSync('naviwords_notice_hidden', true);
    this.setData({ noticeHidden: true });
  },

  startMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === 'wrong-card') {
      wx.navigateTo({ url: `/words/pages/wrong/wrong?book=${this.data.activeBook}` });
      return;
    }
    if (mode === 'fav-card') {
      wx.navigateTo({ url: `/words/pages/practice/practice?source=fav&book=${this.data.activeBook}&unit=${this.data.activeUnit}&mode=card` });
      return;
    }
    wx.navigateTo({
      url: `/words/pages/practice/practice?book=${this.data.activeBook}&unit=${this.data.activeUnit}&mode=${mode}`
    });
  },

  continuePractice() {
    const p = this.data.lastProgress;
    if (!p) {
      this.startDefault();
      return;
    }
    const params = [
      `book=${p.book || this.data.activeBook}`,
      `unit=${p.unit || 'all'}`,
      `mode=${p.mode || 'card'}`,
      `index=${p.index || 0}`
    ];
    if (p.source) params.push(`source=${p.source}`);
    if (p.wrongType) params.push(`type=${p.wrongType}`);
    if (p.wrongKey) params.push(`key=${encodeURIComponent(p.wrongKey)}`);
    wx.navigateTo({ url: `/words/pages/practice/practice?${params.join('&')}` });
  },

  startDefault() {
    wx.navigateTo({
      url: `/words/pages/practice/practice?book=${this.data.activeBook}&unit=${this.data.activeUnit}&mode=card`
    });
  },

  goBooks() {
    wx.redirectTo({ url: '/words/pages/books/books' });
  },

  goWrong() {
    wx.navigateTo({ url: `/words/pages/wrong/wrong?book=${this.data.activeBook}` });
  }
});
