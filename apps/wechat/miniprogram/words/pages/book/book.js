const vocab = require('../../utils/data');
const store = require('../../utils/store');

const modeMeta = [
  { id: 'card', label: '背诵', desc: '看词卡，先记再翻' },
  { id: 'choice', label: '选择', desc: '看英文选释义' },
  { id: 'spell', label: '拼写', desc: '按释义写单词' }
];

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: {
    bookId: 'b3',
    bookInfo: {},
    units: [],
    modes: modeMeta,
    activeUnit: 'all',
    activeKind: 'word',
    kindLabel: '单词',
    kindOptions: [],
    definitionMode: 'both',
    definitionModes: [
      { id: 'both', label: '双语' },
      { id: 'en', label: '英文' },
      { id: 'zh', label: '中文' }
    ],
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
    const allPhrases = vocab.getPhrasesByScope(book.id, 'all');
    this.book = book;
    this.setData({
      bookId: book.id,
      bookInfo: {
        id: book.id,
        title: book.title,
        unitCount: book.units.length,
        wordCount: allWords.length,
        phraseCount: allPhrases.length
      },
      kindOptions: [
        { id: 'word', label: '单词', count: allWords.length },
        { id: 'phrase', label: '词组', count: allPhrases.length }
      ],
      definitionMode: store.getDefinitionMode(),
      themeClass: 'theme-blue'
    });
    this.rebuildUnits('all');
    this.refreshLastProgress();
  },

  rebuildUnits(preferredUnit = this.data.activeUnit) {
    const book = this.book || vocab.getBookById(this.data.bookId);
    const kind = this.data.activeKind;
    const allItems = vocab.getItemsByScope(book.id, 'all', kind);
    const units = [
      {
        unit: 'all',
        label: '全部单元',
        count: allItems.length,
        desc: `覆盖 ${book.units.length} 个单元`
      }
    ].concat(book.units.map(unit => ({
      unit,
      label: vocab.unitShortLabel(unit).replace(/^B\d\s/, ''),
      count: vocab.getItemsByScope(book.id, unit, kind).length,
      desc: vocab.unitLabels[unit] || `Unit ${unit}`
    })));
    const activeUnit = units.some(item => String(item.unit) === String(preferredUnit)) ? preferredUnit : 'all';
    this.setData({
      units,
      activeUnit,
      selectedCount: vocab.getItemsByScope(book.id, activeUnit, kind).length,
      kindLabel: kind === 'phrase' ? '词组' : '单词'
    });
  },

  refreshLastProgress() {
    const learning = store.loadData();
    const p = learning.last_progress || {};
    if (p.book !== this.data.bookId || (p.kind || 'word') !== this.data.activeKind) {
      this.setData({ lastProgressText: '' });
      return;
    }
    const mode = modeMeta.find(item => item.id === p.mode);
    const unitText = p.unit === 'all' ? '全部单元' : (vocab.unitLabels[p.unit] || `Unit ${p.unit}`);
    this.setData({
      lastProgressText: `${unitText} · ${mode ? mode.label : '练习'} · 第 ${(Number(p.index) || 0) + 1} 个${this.data.kindLabel}`
    });
  },

  selectKind(e) {
    const activeKind = e.currentTarget.dataset.kind === 'phrase' ? 'phrase' : 'word';
    this.setData({ activeKind });
    this.rebuildUnits('all');
    this.refreshLastProgress();
  },

  selectDefinitionMode(e) {
    const definitionMode = store.setDefinitionMode(e.currentTarget.dataset.mode || 'both');
    this.setData({ definitionMode });
  },

  selectUnit(e) {
    const unit = e.currentTarget.dataset.unit || 'all';
    const selectedCount = vocab.getItemsByScope(this.data.bookId, unit, this.data.activeKind).length;
    this.setData({ activeUnit: unit, selectedCount });
  },

  selectMode(e) {
    this.setData({ activeMode: e.currentTarget.dataset.mode || 'card' });
  },

  startPractice() {
    if (!this.data.selectedCount) {
      wx.showToast({ title: `当前范围没有${this.data.kindLabel}`, icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/words/pages/practice/practice?book=${this.data.bookId}&unit=${this.data.activeUnit}&kind=${this.data.activeKind}&mode=${this.data.activeMode}`
    });
  },

  continueBook() {
    const learning = store.loadData();
    const p = learning.last_progress || {};
    if (p.book !== this.data.bookId) return;
    const params = [
      `book=${p.book}`,
      `unit=${p.unit || 'all'}`,
      `kind=${p.kind || 'word'}`,
      `mode=${p.mode || 'card'}`,
      `index=${p.index || 0}`
    ];
    if (p.source) params.push(`source=${p.source}`);
    if (p.wrongType) params.push(`type=${p.wrongType}`);
    if (p.wrongKey) params.push(`key=${encodeURIComponent(p.wrongKey)}`);
    wx.navigateTo({ url: `/words/pages/practice/practice?${params.join('&')}` });
  }
});
