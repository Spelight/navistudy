const content = require('../../data/study-data');
const store = require('../../utils/store');

function track(name, data = {}) {
  const app = getApp();
  if (app && typeof app.trackAnalytics === 'function') app.trackAnalytics(name, Object.assign({ product: 'reading' }, data));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || minimum));
}

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: {
    unitId: 1,
    paragraphNumber: 1,
    paragraphCount: 1,
    title: '',
    titleZh: '',
    author: '',
    paragraph: null,
    textbookNotes: [],
    analyses: [],
    vocabulary: [],
    language: 'both',
    bookmarked: false,
    personalNote: '',
    scanUrl: '',
    progressLabel: ''
  },

  onLoad(options) {
    this.unitId = clamp(options.unit, 1, content.units.length);
    const unit = content.units[this.unitId - 1];
    this.paragraphNumber = clamp(options.paragraph, 1, unit.paragraphs.length);
    this.refresh();
    track('page_view');
    track('study_start', { itemId: store.paragraphKey(this.unitId, this.paragraphNumber), metadata: { unit: this.unitId } });
  },

  refresh() {
    const unit = content.units[this.unitId - 1];
    const paragraph = unit.paragraphs[this.paragraphNumber - 1];
    const learning = store.load();
    const key = store.paragraphKey(this.unitId, this.paragraphNumber);
    const scanUrl = `https://study.example.test/reading/assets/reading/pages/pdf-${String(paragraph.page).padStart(3, '0')}.jpg`;
    learning.lastProgress = {
      unit: this.unitId,
      paragraph: this.paragraphNumber,
      title: unit.title,
      titleZh: unit.titleZh,
      updatedAt: Date.now()
    };
    store.save(learning);
    this.setData({
      unitId: this.unitId,
      paragraphNumber: this.paragraphNumber,
      paragraphCount: unit.paragraphs.length,
      title: unit.title,
      titleZh: unit.titleZh,
      author: unit.author,
      paragraph,
      textbookNotes: unit.textbookNotes.filter(note => note.p === paragraph.n || (note.also || []).includes(paragraph.n)),
      analyses: unit.notes.filter(note => note[0] === paragraph.n).map(note => ({ title: note[1], quote: note[2], en: note[3], zh: note[4] })),
      vocabulary: unit.vocabulary.filter(item => item.p === paragraph.n),
      language: learning.settings.lang || 'both',
      bookmarked: learning.bookmarks.includes(key),
      personalNote: learning.notes[key] || '',
      scanUrl,
      progressLabel: `${this.paragraphNumber} / ${unit.paragraphs.length}`
    });
    wx.setNavigationBarTitle({ title: `Unit ${this.unitId} · §${this.paragraphNumber}` });
  },

  previous() {
    if (this.paragraphNumber > 1) this.paragraphNumber -= 1;
    else if (this.unitId > 1) {
      this.unitId -= 1;
      this.paragraphNumber = content.units[this.unitId - 1].paragraphs.length;
    } else return;
    this.refresh();
  },

  next() {
    const unit = content.units[this.unitId - 1];
    if (this.paragraphNumber < unit.paragraphs.length) this.paragraphNumber += 1;
    else if (this.unitId < content.units.length) {
      this.unitId += 1;
      this.paragraphNumber = 1;
    } else return;
    this.refresh();
  },

  setLanguage(event) {
    const language = event.currentTarget.dataset.language;
    const learning = store.load();
    learning.settings.lang = language;
    store.save(learning);
    this.setData({ language });
  },

  toggleBookmark() {
    const learning = store.load();
    const key = store.paragraphKey(this.unitId, this.paragraphNumber);
    learning.bookmarks = learning.bookmarks.includes(key)
      ? learning.bookmarks.filter(item => item !== key)
      : learning.bookmarks.concat(key);
    store.save(learning);
    const bookmarked = learning.bookmarks.includes(key);
    this.setData({ bookmarked });
    track(bookmarked ? 'bookmark_added' : 'bookmark_removed', { itemId: key });
  },

  onNoteInput(event) {
    this.setData({ personalNote: event.detail.value });
  },

  saveNote() {
    const learning = store.load();
    const key = store.paragraphKey(this.unitId, this.paragraphNumber);
    const note = this.data.personalNote.trim();
    if (note) learning.notes[key] = note;
    else delete learning.notes[key];
    store.save(learning);
    track('note_saved', { itemId: key, value: note ? 1 : 0 });
    wx.showToast({ title: note ? '批注已保存' : '批注已删除', icon: 'success' });
  },

  previewScan() {
    wx.previewImage({ current: this.data.scanUrl, urls: [this.data.scanUrl] });
  }
});
