const STORAGE_KEY = 'navi_reading_learning_v1';

const EMPTY = {
  bookmarks: [],
  notes: {},
  lastProgress: null,
  settings: { lang: 'both', size: 19 },
  updatedAt: 0
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalize(value) {
  const source = isPlainObject(value) ? value : {};
  return Object.assign({}, EMPTY, source, {
    bookmarks: Array.isArray(source.bookmarks) ? source.bookmarks : [],
    notes: isPlainObject(source.notes) ? source.notes : {},
    lastProgress: isPlainObject(source.lastProgress) ? source.lastProgress : null,
    settings: Object.assign({}, EMPTY.settings, isPlainObject(source.settings) ? source.settings : {})
  });
}

function load() {
  return normalize(wx.getStorageSync(STORAGE_KEY));
}

function save(data) {
  const next = Object.assign(normalize(data), { updatedAt: Date.now() });
  wx.setStorageSync(STORAGE_KEY, next);
  const app = getApp();
  if (app && typeof app.queueSync === 'function') app.queueSync('reading', next);
  return next;
}

function paragraphKey(unit, paragraph) {
  return `${Number(unit)}:${Number(paragraph)}`;
}

module.exports = { STORAGE_KEY, load, save, paragraphKey, normalize };
