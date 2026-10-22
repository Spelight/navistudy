const vocab = require('../../utils/data');
const store = require('../../utils/store');

function buildUnits(book, kind = 'word') {
  const allWords = vocab.getItemsByScope(book.id, 'all', kind);
  return [{
    unit: 'all',
    label: '全部',
    count: allWords.length
  }].concat(book.units.map(unit => ({
    unit,
    label: vocab.unitShortLabel(unit).replace(/^B\d\s/, ''),
    count: vocab.getItemsByScope(book.id, unit, kind).length
  })));
}

function summarize(list, favKeys, wrongKeys, masteredKeys) {
  const total = list.length;
  let mastered = 0;
  let wrong = 0;
  let fav = 0;
  list.forEach(item => {
    const key = vocab.getItemKey(item);
    if (masteredKeys.has(key)) mastered += 1;
    if (wrongKeys.has(key)) wrong += 1;
    if (favKeys.has(key)) fav += 1;
  });
  const todo = Math.max(total - mastered, 0);
  const percent = total ? Math.round((mastered / total) * 100) : 0;
  return {
    total,
    mastered,
    wrong,
    fav,
    todo,
    percent,
    masteredWidth: `${percent}%`,
    wrongWidth: `${total ? Math.round((wrong / total) * 100) : 0}%`,
    favWidth: `${total ? Math.round((fav / total) * 100) : 0}%`,
    todoWidth: `${total ? Math.max(0, 100 - percent) : 0}%`
  };
}

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: {
    books: [],
    bookNames: [],
    bookIndex: 0,
    activeBook: 'b5',
    activeBookTitle: '',
    units: [],
    unitNames: [],
    unitIndex: 0,
    activeUnit: 'all',
    activeUnitTitle: '全部',
    activeKind: 'word',
    kindLabel: '单词',
    kindOptions: [
      { id: 'word', label: '单词' },
      { id: 'phrase', label: '词组' }
    ],
    query: '',
    activeView: 'unit',
    viewModes: [
      { key: 'unit', label: 'Unit' },
      { key: 'overview', label: '概览' },
      { key: 'map', label: '词图' },
      { key: 'list', label: '列表' }
    ],
    showUnitView: true,
    showOverviewView: false,
    showMapView: false,
    showListView: false,
    hasQuery: false,
    progress: {},
    progressMastered: 0,
    progressTotal: 0,
    progressPercent: 0,
    overviewStats: [],
    unitRows: [],
    words: [],
    visibleWords: []
  },

  onLoad() {
    const savedBook = wx.getStorageSync('naviwords_active_book') || 'b5';
    const savedUnit = wx.getStorageSync('naviwords_active_unit') || 'all';
    const savedView = wx.getStorageSync('naviwords_books_view') || 'unit';
    const savedKind = wx.getStorageSync('naviwords_content_kind') === 'phrase' ? 'phrase' : 'word';
    this.setData({ activeKind: savedKind, kindLabel: savedKind === 'phrase' ? '词组' : '单词' });
    this.setViewState(savedView);
    this.prepare(savedBook, savedUnit);
  },

  onShow() {
    this.refresh();
  },

  prepare(bookId, unit) {
    const books = vocab.bookStats();
    const bookIndex = Math.max(books.findIndex(item => item.id === bookId), 0);
    const book = books[bookIndex] || books[0];
    const units = buildUnits(book, this.data.activeKind);
    const unitIndex = Math.max(units.findIndex(item => String(item.unit) === String(unit)), 0);
    const activeUnit = (units[unitIndex] || units[0]).unit;
    wx.setStorageSync('naviwords_active_book', book.id);
    wx.setStorageSync('naviwords_active_unit', activeUnit);
    this.setData({
      books,
      bookNames: books.map(item => item.title),
      bookIndex,
      activeBook: book.id,
      activeBookTitle: book.title,
      units,
      unitNames: units.map(item => `${item.label} (${item.count})`),
      unitIndex,
      activeUnit,
      activeUnitTitle: (units[unitIndex] || units[0]).label
    });
    this.refresh();
  },

  refresh() {
    const learning = store.loadData();
    const favKeys = new Set((learning.favs || []).map(item => vocab.getItemKey(item)));
    const wrongKeys = new Set(Object.keys(learning.wrongbook || {}));
    const masteredKeys = new Set(Object.keys(learning.mastered || {}));
    const base = vocab.getItemsByScope(this.data.activeBook, this.data.activeUnit, this.data.activeKind);
    const progress = store.getProgressStats(this.data.activeBook, this.data.activeUnit, this.data.activeKind);
    const q = String(this.data.query || '').trim().toLowerCase();
    const summary = summarize(base, favKeys, wrongKeys, masteredKeys);
    const words = base.map((item, index) => {
      const key = vocab.getItemKey(item);
      const view = vocab.normalizeItem(item);
      let statusClass = 'todo';
      let statusText = '未练';
      if (masteredKeys.has(key)) {
        statusClass = 'done';
        statusText = '掌握';
      }
      if (wrongKeys.has(key)) {
        statusClass = 'wrong';
        statusText = '错题';
      }
      if (favKeys.has(key)) {
        statusClass += ' fav';
        statusText += ' 收藏';
      }
      return Object.assign({}, item, {
        key,
        number: index + 1,
        wordIndex: index,
        statusClass,
        statusText,
        definitionPrimary: view.kind === 'phrase' ? view.definitionZh : view.definitionEn,
        definitionSecondary: view.kind === 'phrase' ? '' : view.definitionZh,
        unitLabel: vocab.unitLabels[item.u] || `Unit ${item.u}`
      });
    });
    const visibleWords = (q ? words.filter(item =>
      String(item.w || '').toLowerCase().includes(q) ||
      String(item.c || '').toLowerCase().includes(q) ||
      String(item.e || '').toLowerCase().includes(q)
    ) : words).slice(0, 120);
    const unitRows = this.data.units.filter(item => item.unit !== 'all').map(unit => {
      const unitWords = vocab.getItemsByScope(this.data.activeBook, unit.unit, this.data.activeKind);
      const unitSummary = summarize(unitWords, favKeys, wrongKeys, masteredKeys);
      return Object.assign({}, unit, unitSummary, {
        active: String(unit.unit) === String(this.data.activeUnit)
      });
    });
    const overviewStats = [
      { key: 'mastered', label: '已掌握', value: summary.mastered, note: `${summary.percent}%`, className: 'done' },
      { key: 'todo', label: '待推进', value: summary.todo, note: '继续完成', className: 'todo' },
      { key: 'wrong', label: '错题', value: summary.wrong, note: '优先复习', className: 'wrong' },
      { key: 'fav', label: '收藏', value: summary.fav, note: '重点关注', className: 'fav' }
    ];
    this.setData({
      words,
      visibleWords,
      hasQuery: Boolean(q),
      overviewStats,
      unitRows,
      progress,
      progressMastered: Number(progress.masteredCount || 0),
      progressTotal: Number(progress.total || 0),
      progressPercent: Number(progress.percent || 0)
    });
  },

  setViewState(view) {
    const activeView = ['unit', 'list'].includes(view) ? view : 'unit';
    wx.setStorageSync('naviwords_books_view', activeView);
    this.setData({
      activeView,
      showUnitView: activeView === 'unit',
      showOverviewView: activeView === 'overview',
      showMapView: activeView === 'map',
      showListView: activeView === 'list'
    });
  },

  changeView(e) {
    this.setViewState(e.currentTarget.dataset.view || 'unit');
  },

  selectKind(e) {
    const activeKind = e.currentTarget.dataset.kind === 'phrase' ? 'phrase' : 'word';
    wx.setStorageSync('naviwords_content_kind', activeKind);
    this.setData({ activeKind, kindLabel: activeKind === 'phrase' ? '词组' : '单词', query: '' });
    this.prepare(this.data.activeBook, 'all');
  },

  changeBook(e) {
    const book = this.data.books[Number(e.detail.value || 0)] || this.data.books[0];
    this.setData({ query: '' });
    this.prepare(book.id, 'all');
  },

  changeUnit(e) {
    const unit = this.data.units[Number(e.detail.value || 0)] || this.data.units[0];
    wx.setStorageSync('naviwords_active_unit', unit.unit);
    this.setData({ query: '' });
    this.prepare(this.data.activeBook, unit.unit);
  },

  selectUnit(e) {
    this.prepare(this.data.activeBook, e.currentTarget.dataset.unit || 'all');
  },

  onSearch(e) {
    this.setData({ query: e.detail.value || '' });
    this.refresh();
  },

  startCurrent() {
    if (!this.data.progressTotal) return wx.showToast({ title: `当前范围没有${this.data.kindLabel}`, icon: 'none' });
    wx.navigateTo({ url: `/words/pages/practice/practice?book=${this.data.activeBook}&unit=${this.data.activeUnit}&kind=${this.data.activeKind}&mode=card` });
  },

  startUnit(e) {
    const unit = e.currentTarget.dataset.unit || 'all';
    wx.setStorageSync('naviwords_active_unit', unit);
    wx.navigateTo({ url: `/words/pages/practice/practice?book=${this.data.activeBook}&unit=${unit}&kind=${this.data.activeKind}&mode=card` });
  },

  startFromWord(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    wx.navigateTo({ url: `/words/pages/practice/practice?book=${this.data.activeBook}&unit=${this.data.activeUnit}&kind=${this.data.activeKind}&mode=card&index=${index}` });
  }
});
