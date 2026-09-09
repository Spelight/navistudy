const vocab = require('../../utils/data');
const store = require('../../utils/store');

const modeMeta = [
  { id: 'card', label: '背诵', desc: '看词卡，先记再翻' },
  { id: 'choice', label: '选择', desc: '看英文选释义' },
  { id: 'spell', label: '拼写', desc: '按释义写单词' }
];

Page({
  data: {
    bookId: 'b3',
    bookInfo: {},
    units: [],
    modes: modeMeta,
    activeUnit: 'all',
    activeMode: 'card',
    selectedCount: 0,
    lastProgressText: '',
    themeClass: 'theme-blue'
  },

  onLoad(query) {
    this.prepare(query.book || 'b3');
  },

  onShow() {
    this.refreshLastProgress();
  },

  prepare(bookId) {
    const book = vocab.getBookById(bookId);
    const allWords = vocab.getWordsByScope(book.id, 'all');
    const units = [
      {
        unit: 'all',
        label: '全部单元',
        count: allWords.length,
        desc: `覆盖 ${book.units.length} 个单元`
      }
    ].concat(book.units.map(unit => ({
      unit,
      label: vocab.unitShortLabel(unit).replace(/^B\d\s/, ''),
      count: vocab.getWordsByScope(book.id, unit).length,
      desc: vocab.unitLabels[unit] || `Unit ${unit}`
    })));

    this.setData({
      bookId: book.id,
      bookInfo: {
        id: book.id,
        title: book.title,
        unitCount: book.units.length,
        wordCount: allWords.length
      },
      units,
      activeUnit: 'all',
      selectedCount: allWords.length,
      themeClass: 'theme-blue'
    });
    this.refreshLastProgress();
  },

  refreshLastProgress() {
    const learning = store.loadData();
    const p = learning.last_progress || {};
    if (p.book !== this.data.bookId) {
      this.setData({ lastProgressText: '' });
      return;
    }
    const mode = modeMeta.find(item => item.id === p.mode);
    const unitText = p.unit === 'all' ? '全部单元' : (vocab.unitLabels[p.unit] || `Unit ${p.unit}`);
    this.setData({
      lastProgressText: `${unitText} · ${mode ? mode.label : '练习'} · 第 ${(Number(p.index) || 0) + 1} 词`
    });
  },

  selectUnit(e) {
    const unit = e.currentTarget.dataset.unit || 'all';
    const selectedCount = vocab.getWordsByScope(this.data.bookId, unit).length;
    this.setData({ activeUnit: unit, selectedCount });
  },

  selectMode(e) {
    this.setData({ activeMode: e.currentTarget.dataset.mode || 'card' });
  },

  startPractice() {
    wx.navigateTo({
      url: `/pages/practice/practice?book=${this.data.bookId}&unit=${this.data.activeUnit}&mode=${this.data.activeMode}`
    });
  },

  continueBook() {
    const learning = store.loadData();
    const p = learning.last_progress || {};
    if (p.book !== this.data.bookId) return;
    const params = [
      `book=${p.book}`,
      `unit=${p.unit || 'all'}`,
      `mode=${p.mode || 'card'}`,
      `index=${p.index || 0}`
    ];
    if (p.source) params.push(`source=${p.source}`);
    if (p.wrongType) params.push(`type=${p.wrongType}`);
    if (p.wrongKey) params.push(`key=${encodeURIComponent(p.wrongKey)}`);
    wx.navigateTo({ url: `/pages/practice/practice?${params.join('&')}` });
  }
});
