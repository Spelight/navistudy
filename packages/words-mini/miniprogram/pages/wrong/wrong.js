const vocab = require('../../utils/data');
const store = require('../../utils/store');

const typeTabs = [
  { id: 'all', label: '全部' },
  { id: 'choice', label: '选择错' },
  { id: 'spell', label: '拼写错' }
];

function formatTime(ts) {
  if (!ts) return '暂无时间';
  const date = new Date(Number(ts));
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${m}-${d} ${hh}:${mm}`;
}

Page({
  data: {
    books: [],
    typeTabs,
    activeBook: 'all',
    activeKind: 'word',
    kindTabs: [{ id: 'word', label: '单词' }, { id: 'phrase', label: '词组' }],
    activeType: 'all',
    wrongList: [],
    batchMode: false,
    selectedKeys: [],
    selectedCount: 0,
    allSelected: false,
    totalCount: 0,
    choiceCount: 0,
    spellCount: 0
  },

  onLoad(query) {
    if (query && query.book) {
      this.setData({ activeBook: query.book });
    }
    if (query && query.kind === 'phrase') this.setData({ activeKind: 'phrase' });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const books = [{ id: 'all', title: '全部教材' }].concat(vocab.bookStats());
    const all = store.getWrongList({ kind: this.data.activeKind });
    const wrongList = store.getWrongList({
      bookId: this.data.activeBook,
      type: this.data.activeType,
      kind: this.data.activeKind
    }).map(entry => {
      const item = vocab.normalizeItem(entry.item);
      return Object.assign({}, item, {
        key: entry.key,
        selected: this.data.selectedKeys.includes(entry.key),
        word: entry.item.w,
        phonetic: entry.item.p,
        cn: item.definitionZh,
        en: item.definitionEn,
        unitLabel: vocab.unitLabels[entry.item.u] || `Unit ${entry.item.u}`,
        choice: Number(entry.choice || 0),
        spell: Number(entry.spell || 0),
        total: entry.total,
        lastWrongText: formatTime(entry.lastWrongAt)
      });
    });
    this.setData({
      books,
      wrongList,
      selectedCount: wrongList.filter(item => item.selected).length,
      allSelected: wrongList.length > 0 && wrongList.every(item => item.selected),
      totalCount: all.length,
      choiceCount: all.reduce((sum, item) => sum + Number(item.choice || 0), 0),
      spellCount: all.reduce((sum, item) => sum + Number(item.spell || 0), 0)
    });
  },

  selectBook(e) {
    this.setData({ activeBook: e.currentTarget.dataset.book || 'all', selectedKeys: [], selectedCount: 0, allSelected: false });
    this.refresh();
  },

  selectType(e) {
    this.setData({ activeType: e.currentTarget.dataset.type || 'all', selectedKeys: [], selectedCount: 0, allSelected: false });
    this.refresh();
  },

  selectKind(e) {
    this.setData({ activeKind: e.currentTarget.dataset.kind === 'phrase' ? 'phrase' : 'word', selectedKeys: [], selectedCount: 0, allSelected: false });
    this.refresh();
  },

  practiceCard() {
    this.startPractice('card');
  },

  practiceChoice() {
    this.startPractice('choice');
  },

  practiceSpell() {
    this.startPractice('spell');
  },

  startPractice(mode, key) {
    if (!this.data.wrongList.length) {
      wx.showToast({ title: '当前没有错题', icon: 'none' });
      return;
    }
    const params = [
      'source=wrong',
      `book=${this.data.activeBook}`,
      `kind=${this.data.activeKind}`,
      `type=${this.data.activeType}`,
      `mode=${mode}`
    ];
    if (key) params.push(`key=${encodeURIComponent(key)}`);
    wx.navigateTo({ url: `/pages/practice/practice?${params.join('&')}` });
  },

  practiceOne(e) {
    if (this.data.batchMode) {
      this.toggleSelect(e);
      return;
    }
    this.startPractice('card', e.currentTarget.dataset.key);
  },

  toggleBatch() {
    this.setData({
      batchMode: !this.data.batchMode,
      selectedKeys: [],
      selectedCount: 0,
      allSelected: false
    });
    this.refresh();
  },

  toggleSelect(e) {
    const key = e.currentTarget.dataset.key;
    let selectedKeys = this.data.selectedKeys.slice();
    if (selectedKeys.includes(key)) {
      selectedKeys = selectedKeys.filter(item => item !== key);
    } else {
      selectedKeys.push(key);
    }
    this.setData({ selectedKeys });
    this.refresh();
  },

  selectAll() {
    const selectedKeys = this.data.allSelected ? [] : this.data.wrongList.map(item => item.key);
    this.setData({ selectedKeys });
    this.refresh();
  },

  deleteSelected() {
    if (!this.data.selectedKeys.length) {
      wx.showToast({ title: '请先选择错题', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除已选错题',
      content: `将从错题本删除 ${this.data.selectedKeys.length} 个词，不影响教材原词库。`,
      confirmColor: '#d93f32',
      success: res => {
        if (!res.confirm) return;
        this.data.selectedKeys.forEach(key => store.removeWrong(key));
        this.setData({
          selectedKeys: [],
          selectedCount: 0,
          allSelected: false,
          batchMode: false
        });
        this.refresh();
      }
    });
  },

  removeOne(e) {
    const key = e.currentTarget.dataset.key;
    wx.showModal({
      title: '移出错题',
      content: '这个词会从错题本移出，不影响教材原词库。',
      confirmColor: '#d93f32',
      success: res => {
        if (!res.confirm) return;
        store.removeWrong(key);
        this.setData({ selectedKeys: this.data.selectedKeys.filter(item => item !== key) });
        this.refresh();
      }
    });
  },

  clearCurrent() {
    if (!this.data.wrongList.length) return;
    wx.showModal({
      title: '清空当前筛选',
      content: '只清空当前教材和类型下的错题记录。',
      confirmColor: '#d93f32',
      success: res => {
        if (!res.confirm) return;
        store.clearWrong({
          bookId: this.data.activeBook,
          type: this.data.activeType,
          kind: this.data.activeKind
        });
        this.refresh();
      }
    });
  }
});
