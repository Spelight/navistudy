const questions = require('../../utils/questions');
const store = require('../../utils/store');

function decode(value, fallback) {
  if (!value) return fallback;
  try { return decodeURIComponent(value); } catch (error) { return value; }
}

Page({
  data: {
    chapter: 'all',
    type: 'all',
    order: 'sequential',
    source: '',
    questionId: '',
    list: [],
    index: 0,
    current: {},
    currentOptions: [],
    selected: [],
    answered: false,
    correct: false,
    favorite: false,
    answerText: '',
    scopeLabel: '全部章节',
    typeLabel: '',
    progressPercent: 0,
    isFirst: true,
    isLast: false,
    paletteOpen: false,
    palette: [],
    legacyText: '',
    isMultiple: false,
    isShort: false,
    hasExplanation: false
  },

  onLoad(query = {}) {
    const chapter = decode(query.chapter, 'all');
    const type = query.type || 'all';
    const order = query.order || 'sequential';
    const source = query.source || '';
    const questionId = query.questionId || '';
    let list = questions.filterQuestions({ chapter, type });
    const learning = store.loadData();

    if (source === 'wrong') {
      list = list.filter(item => Object.prototype.hasOwnProperty.call(learning.wrongbook || {}, item.id));
    } else if (source === 'favorite') {
      list = list.filter(item => (learning.favorites || []).includes(item.id));
    }

    if (order === 'random') list = questions.shuffle(list);

    const scope = { chapter, type, order, source, questionId };
    const saved = Object.prototype.hasOwnProperty.call(query, 'index') ? null : store.getSavedProgress(scope);
    const targetId = questionId || (saved && saved.currentId) || '';
    const byId = targetId ? list.findIndex(item => item.id === targetId) : -1;
    const requested = Object.prototype.hasOwnProperty.call(query, 'index') ? Number(query.index) : Number(saved && saved.index);
    const index = byId >= 0 ? byId : (Number.isFinite(requested) ? Math.max(0, requested) : 0);
    const chapterLabel = chapter === 'all' ? '全部章节' : chapter;
    const sourceSuffix = source === 'wrong' ? ' · 错题' : (source === 'favorite' ? ' · 收藏' : '');

    this.setData({
      chapter,
      type,
      order,
      source,
      questionId,
      list,
      index: Math.min(index, Math.max(list.length - 1, 0)),
      scopeLabel: `${chapterLabel}${sourceSuffix}`
    });
    this.loadCurrent();
  },

  onHide() { this.persistProgress(); },
  onUnload() { this.persistProgress(); },

  loadCurrent() {
    const current = this.data.list[this.data.index] || {};
    const sourceOptions = current.type === 'truefalse'
      ? [{ key: '正确', text: '正确' }, { key: '错误', text: '错误' }]
      : (current.options || []);
    const currentOptions = sourceOptions.map(option => Object.assign({}, option, {
      selected: false,
      stateClass: ''
    }));
    const progressPercent = this.data.list.length
      ? Math.round(((this.data.index + 1) / this.data.list.length) * 100)
      : 0;

    this.setData({
      current,
      currentOptions,
      selected: [],
      answered: false,
      correct: false,
      favorite: current.id ? store.isFavorite(current.id) : false,
      answerText: current.id ? questions.answerText(current) : '',
      typeLabel: current.id ? questions.typeName(current.type) : '',
      progressPercent,
      isFirst: this.data.index <= 0,
      isLast: this.data.index >= this.data.list.length - 1,
      legacyText: current.legacy ? '历史题目，请留意内容时效' : '现行复习资料',
      isMultiple: current.type === 'multiple',
      isShort: current.type === 'short',
      hasExplanation: !!current.explanation,
      palette: this.buildPalette()
    });
    this.persistProgress();
  },

  buildPalette() {
    const data = store.loadData();
    return this.data.list.map((item, index) => {
      const answer = (data.answers || {})[item.id];
      let statusClass = answer ? (answer.lastCorrect ? 'done' : 'wrong') : '';
      if (index === this.data.index) statusClass = `${statusClass} current`.trim();
      return { id: item.id, number: index + 1, index, statusClass };
    });
  },

  persistProgress() {
    const current = this.data.current || {};
    if (!current.id) return;
    store.saveProgress({
      chapter: this.data.chapter,
      type: this.data.type,
      order: this.data.order,
      source: this.data.source,
      questionId: this.data.questionId,
      index: this.data.index,
      currentId: current.id,
      questionText: current.stem || ''
    });
  },

  chooseOption(event) {
    if (this.data.answered) return;
    const key = event.currentTarget.dataset.key;
    let selected = this.data.selected.slice();
    if (this.data.isMultiple) {
      selected = selected.includes(key) ? selected.filter(item => item !== key) : selected.concat(key);
    } else {
      selected = [key];
    }
    const currentOptions = this.data.currentOptions.map(option => Object.assign({}, option, {
      selected: selected.includes(option.key),
      stateClass: selected.includes(option.key) ? 'selected' : ''
    }));
    this.setData({ selected, currentOptions });
    if (!this.data.isMultiple) this.submitAnswer();
  },

  submitAnswer() {
    if (this.data.answered || !this.data.selected.length) return;
    const correct = questions.checkAnswer(this.data.current, this.data.selected);
    store.recordAnswer(this.data.current, this.data.selected, correct, this.data.current.type);
    const expected = questions.normalizeAnswer(this.data.current);
    const currentOptions = this.data.currentOptions.map(option => {
      let stateClass = '';
      if (expected.includes(option.key)) stateClass = 'correct';
      else if (this.data.selected.includes(option.key)) stateClass = 'wrong';
      return Object.assign({}, option, { stateClass });
    });
    this.setData({ answered: true, correct, currentOptions, palette: this.buildPalette() });
  },

  revealShort() {
    if (this.data.answered) return;
    this.setData({ answered: true });
  },

  assessShort(event) {
    const correct = event.currentTarget.dataset.result === 'known';
    store.recordAnswer(this.data.current, [], correct, 'short');
    this.setData({ correct, palette: this.buildPalette() });
    this.nextQuestion();
  },

  toggleFavorite() {
    if (!this.data.current.id) return;
    const favorite = store.toggleFavorite(this.data.current.id);
    this.setData({ favorite });
    wx.showToast({ title: favorite ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  prevQuestion() {
    if (this.data.isFirst) return;
    this.setData({ index: this.data.index - 1, paletteOpen: false });
    this.loadCurrent();
  },

  nextQuestion() {
    if (this.data.isLast) {
      this.persistProgress();
      wx.showModal({
        title: '本轮练习完成',
        content: '学习记录已保存在本机，可以返回首页查看进度。',
        confirmText: '返回首页',
        cancelText: '留在此处',
        success: result => { if (result.confirm) wx.switchTab({ url: '/pages/index/index' }); }
      });
      return;
    }
    this.setData({ index: this.data.index + 1, paletteOpen: false });
    this.loadCurrent();
  },

  togglePalette() {
    this.setData({ paletteOpen: !this.data.paletteOpen, palette: this.buildPalette() });
  },

  jumpQuestion(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isFinite(index)) return;
    this.setData({ index, paletteOpen: false });
    this.loadCurrent();
  }
});
