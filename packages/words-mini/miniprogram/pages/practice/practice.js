const vocab = require('../../utils/data');
const store = require('../../utils/store');

Page({
  data: {
    book: 'b3',
    unit: 'all',
    mode: 'card',
    source: '',
    wrongType: 'all',
    wrongKey: '',
    words: [],
    index: 0,
    current: {},
    displayTitle: '背诵',
    scopeLabel: '',
    flipped: false,
    favorite: false,
    options: [],
    answered: false,
    selectedKey: '',
    spellInput: '',
    spellCorrect: false,
    answerText: '',
    isFirst: true,
    isLast: false,
    wordSizeClass: ''
  },

  onLoad(query = {}) {
    const book = query.book || 'b3';
    const unit = query.unit || 'all';
    const mode = query.mode || 'card';
    const source = query.source || '';
    const wrongType = query.type || 'all';
    const wrongKey = query.key ? decodeURIComponent(query.key) : '';
    const requestedWordKey = query.wordKey ? decodeURIComponent(query.wordKey) : '';
    const hasIndex = Object.prototype.hasOwnProperty.call(query, 'index');
    let words = vocab.getWordsByScope(book, unit);
    let scopeLabel = unit === 'all' ? vocab.getBookById(book).title : vocab.unitLabels[unit];
    if (source === 'wrong') {
      const wrongEntries = store.getWrongList({ bookId: book, type: wrongType, key: wrongKey });
      words = wrongEntries.map(entry => entry.item).filter(item => item && item.w);
      scopeLabel = book === 'all' ? '全部错题' : `${vocab.getBookById(book).title} 错题`;
    } else if (source === 'fav') {
      const scopeKeys = new Set(vocab.getWordsByScope(book, unit).map(item => vocab.getItemKey(item)));
      words = (store.loadData().favs || []).filter(item => scopeKeys.has(vocab.getItemKey(item)));
      scopeLabel = `${unit === 'all' ? vocab.getBookById(book).title : vocab.unitLabels[unit]} 收藏`;
    }
    const saved = hasIndex ? null : store.getSavedProgress({ book, unit, mode, source, wrongType, wrongKey });
    const matchedIndex = requestedWordKey
      ? words.findIndex(item => vocab.getItemKey(item) === requestedWordKey)
      : -1;
    const requestedIndex = matchedIndex >= 0
      ? matchedIndex
      : (hasIndex ? Number(query.index) : this.resolveSavedIndex(words, saved));
    const safeIndex = Number.isFinite(requestedIndex) ? Math.max(0, requestedIndex) : 0;
    this.setData({ book, unit, mode, source, wrongType, wrongKey, words, scopeLabel, index: Math.min(safeIndex, Math.max(words.length - 1, 0)) });
    this.loadCurrent();
  },

  onHide() {
    this.persistProgress();
  },

  onUnload() {
    this.persistProgress();
  },

  resolveSavedIndex(words, saved) {
    if (!saved || !words.length) return 0;
    const savedKey = saved.wordKey || '';
    const byKey = savedKey ? words.findIndex(item => vocab.getItemKey(item) === savedKey) : -1;
    if (byKey >= 0) return byKey;
    const byWord = saved.word ? words.findIndex(item => item.w === saved.word) : -1;
    return byWord >= 0 ? byWord : Number(saved.index || 0);
  },

  loadCurrent() {
    const current = this.data.words[this.data.index] || {};
    const displayTitleMap = {
      card: '顺序背词',
      choice: '看词选义',
      spell: '拼写练习'
    };
    const wordLength = String(current.w || '').length;
    this.setData({
      current,
      displayTitle: displayTitleMap[this.data.mode] || '练习',
      flipped: false,
      favorite: store.isFavorite(current),
      answered: false,
      selectedKey: '',
      spellInput: '',
      spellCorrect: false,
      answerText: '',
      isFirst: this.data.index <= 0,
      isLast: this.data.index >= this.data.words.length - 1,
      wordSizeClass: wordLength > 20 ? 'word-xlong' : (wordLength > 12 ? 'word-long' : '')
    });
    if (this.data.mode === 'choice') this.makeChoice();
    this.persistProgress();
  },

  persistProgress() {
    const current = this.data.current || {};
    if (!this.data.words.length || !current.w) return;
    store.saveProgress({
      book: this.data.book,
      unit: this.data.unit,
      mode: this.data.mode,
      source: this.data.source,
      wrongType: this.data.wrongType,
      wrongKey: this.data.wrongKey,
      index: this.data.index,
      wordKey: vocab.getItemKey(current),
      word: current.w,
      cn: current.c
    });
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode || 'card';
    if (mode === this.data.mode) return;
    const saved = store.getSavedProgress({
      book: this.data.book,
      unit: this.data.unit,
      mode,
      source: this.data.source,
      wrongType: this.data.wrongType,
      wrongKey: this.data.wrongKey
    });
    const index = saved ? this.resolveSavedIndex(this.data.words, saved) : this.data.index;
    this.setData({ mode, index: Math.min(Math.max(index, 0), Math.max(this.data.words.length - 1, 0)) });
    this.loadCurrent();
  },

  flipCard() {
    this.setData({ flipped: !this.data.flipped });
  },

  nextWord() {
    if (!this.data.words.length) return;
    const next = Math.min(this.data.index + 1, this.data.words.length - 1);
    if (next === this.data.index) {
      wx.showToast({ title: '本范围已到末尾', icon: 'none' });
      return;
    }
    this.setData({ index: next });
    this.loadCurrent();
  },

  nextQuestion() {
    if (this.data.isLast) {
      this.persistProgress();
      wx.showToast({ title: '本轮已完成', icon: 'success' });
      return;
    }
    this.nextWord();
  },

  prevWord() {
    if (!this.data.words.length) return;
    const prev = Math.max(this.data.index - 1, 0);
    this.setData({ index: prev });
    this.loadCurrent();
  },

  toggleFav() {
    if (!this.data.current.w) return;
    const added = store.toggleFavorite(this.data.current);
    this.setData({ favorite: added });
    wx.showToast({ title: added ? '已收藏' : '已取消', icon: 'none' });
  },

  forgetWord() {
    if (!this.data.current.w) return;
    store.markWrong(this.data.current, this.data.mode === 'spell' ? 'spell' : 'choice');
    this.advanceAfterAssessment();
  },

  knowWord() {
    if (!this.data.current.w) return;
    store.markKnown(this.data.current, this.data.mode);
    this.advanceAfterAssessment();
  },

  advanceAfterAssessment() {
    if (this.data.isLast) {
      this.persistProgress();
      wx.showToast({ title: '本轮已完成', icon: 'success' });
      return;
    }
    this.nextWord();
  },

  makeChoice() {
    const current = this.data.words[this.data.index];
    if (!current) return;
    const fallback = this.data.source === 'wrong'
      ? (this.data.book === 'all' ? vocab.getAllWords() : vocab.getWordsByScope(this.data.book, 'all'))
      : this.data.words;
    const source = this.data.words.length >= 4 ? this.data.words : fallback;
    const pool = vocab.shuffle(source.filter(item => item.key !== current.key)).slice(0, 3);
    const options = vocab.shuffle([current].concat(pool)).map(item => Object.assign({}, item, {
      optionText: item.e || item.c || item.w
    }));
    this.setData({ options });
  },

  chooseOption(e) {
    if (this.data.answered) return;
    const selectedKey = e.currentTarget.dataset.key;
    const ok = selectedKey === this.data.current.key;
    if (ok) store.markKnown(this.data.current, 'choice');
    else store.markWrong(this.data.current, 'choice');
    this.setData({
      answered: true,
      selectedKey,
      answerText: ok ? '回答正确' : `正确答案：${this.data.current.c}`
    });
  },

  onSpellInput(e) {
    this.setData({ spellInput: e.detail.value || '' });
  },

  checkSpell() {
    if (this.data.answered) return;
    const answer = String(this.data.current.w || '').trim().toLowerCase();
    const input = String(this.data.spellInput || '').trim().toLowerCase();
    const ok = answer === input;
    if (ok) store.markKnown(this.data.current, 'spell');
    else store.markWrong(this.data.current, 'spell');
    this.setData({ answered: true, spellCorrect: ok, answerText: ok ? '拼写正确' : `答案：${this.data.current.w}` });
  }
});
