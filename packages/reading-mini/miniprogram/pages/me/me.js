const content = require('../../data/study-data');
const store = require('../../utils/store');

function resolveParagraph(key) {
  const [unitId, paragraphNumber] = String(key).split(':').map(Number);
  const unit = content.units[unitId - 1];
  const paragraph = unit && unit.paragraphs[paragraphNumber - 1];
  if (!unit || !paragraph) return null;
  return {
    key,
    unitId,
    paragraphNumber,
    title: unit.title,
    excerpt: paragraph.en.slice(0, 120),
    note: store.load().notes[key] || ''
  };
}

Page({
  data: { saved: [], syncStatus: '仅本机' },

  onShow() {
    const learning = store.load();
    const keys = Array.from(new Set(learning.bookmarks.concat(Object.keys(learning.notes))));
    this.setData({
      saved: keys.map(resolveParagraph).filter(Boolean),
      syncStatus: wx.getStorageSync('navi_sync_status_reading') || '仅本机'
    });
  },

  openParagraph(event) {
    const item = resolveParagraph(event.currentTarget.dataset.key);
    if (item) wx.navigateTo({ url: `/pages/reader/reader?unit=${item.unitId}&paragraph=${item.paragraphNumber}` });
  },

  goPassport() {
    wx.navigateTo({ url: '/pages/passport/passport?returnTo=' + encodeURIComponent('/pages/me/me') });
  }
});
