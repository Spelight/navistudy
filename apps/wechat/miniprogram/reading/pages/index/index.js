const content = require('../../data/study-data');
const store = require('../../utils/store');

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: {
    units: [],
    bookmarkCount: 0,
    noteCount: 0,
    continuation: null
  },

  onShow() {
    const learning = store.load();
    this.setData({
      units: content.units.map(unit => ({
        id: unit.id,
        title: unit.title,
        titleZh: unit.titleZh,
        author: unit.author,
        paragraphs: unit.paragraphs.length,
        notes: unit.textbookNotes.length,
        cover: `https://study.example.test/reading/assets/unit${unit.id}.jpg`
      })),
      bookmarkCount: learning.bookmarks.length,
      noteCount: Object.keys(learning.notes).length,
      continuation: learning.lastProgress
    });
  },

  openUnit(event) {
    const unit = Number(event.currentTarget.dataset.unit || 1);
    wx.navigateTo({ url: `/reading/pages/reader/reader?unit=${unit}&paragraph=1` });
  },

  continueReading() {
    const progress = this.data.continuation;
    if (!progress) return;
    wx.navigateTo({ url: `/reading/pages/reader/reader?unit=${progress.unit}&paragraph=${progress.paragraph || 1}` });
  },

  openSaved() {
    wx.redirectTo({ url: '/reading/pages/me/me' });
  }
});
