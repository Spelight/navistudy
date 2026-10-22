const { getBookIdByUnit, getItemKey, getItemsByScope } = require('./data');

const DATA_KEY = 'words_learning_data';
const USER_KEY = 'navi_passport_user';
const LEGACY_USER_KEY = 'words_user';

function defaultData() {
  return {
    favs: [],
    mastered: {},
    wrongbook: {},
    last_progress: null,
    progress_positions: {},
    study_events: [],
    app_settings: { definitionMode: 'both' }
  };
}

function loadData() {
  const stored = wx.getStorageSync(DATA_KEY);
  const data = Object.assign(defaultData(), stored || {});
  data.app_settings = Object.assign({ definitionMode: 'both' }, data.app_settings || {});
  return data;
}

function saveData(data) {
  const next = Object.assign(defaultData(), data || {});
  next.app_settings = Object.assign({ definitionMode: 'both' }, next.app_settings || {});
  wx.setStorageSync(DATA_KEY, next);
  try {
    const app = getApp();
    if (app && typeof app.queueSync === 'function') app.queueSync('words', next);
  } catch (error) {}
}

function getDefinitionMode() {
  const mode = loadData().app_settings.definitionMode;
  return ['both', 'en', 'zh'].includes(mode) ? mode : 'both';
}

function setDefinitionMode(mode) {
  const next = ['both', 'en', 'zh'].includes(mode) ? mode : 'both';
  const data = loadData();
  data.app_settings.definitionMode = next;
  saveData(data);
  return next;
}

function getUser() {
  const shared = wx.getStorageSync(USER_KEY);
  if (shared) return shared;
  const legacy = wx.getStorageSync(LEGACY_USER_KEY) || '';
  if (legacy) wx.setStorageSync(USER_KEY, legacy);
  return legacy;
}

function setUser(user) {
  const clean = String(user || '').trim();
  wx.setStorageSync(USER_KEY, clean);
  wx.setStorageSync(LEGACY_USER_KEY, clean);
  getApp().globalData.user = clean;
  getApp().globalData.passportUser = clean;
  return clean;
}

function isFavorite(item) {
  const key = getItemKey(item);
  return loadData().favs.some(fav => getItemKey(fav) === key);
}

function toggleFavorite(item) {
  const data = loadData();
  const key = getItemKey(item);
  const idx = data.favs.findIndex(fav => getItemKey(fav) === key);
  if (idx >= 0) {
    data.favs.splice(idx, 1);
  } else {
    data.favs.push(item);
  }
  saveData(data);
  return idx < 0;
}

function markWrong(item, mode) {
  const data = loadData();
  const key = getItemKey(item);
  const old = data.wrongbook[key] || { item, choice: 0, spell: 0, lastMode: mode, lastWrongAt: 0 };
  old.item = item;
  old[mode] = Number(old[mode] || 0) + 1;
  old.lastMode = mode;
  old.lastWrongAt = Date.now();
  data.wrongbook[key] = old;
  saveData(data);
}

function markKnown(item, mode = 'card') {
  const data = loadData();
  const key = getItemKey(item);
  if (!key) return;
  const old = data.mastered[key] || { item, count: 0, lastMode: mode, lastKnownAt: 0 };
  old.item = item;
  old.count = Number(old.count || 0) + 1;
  old.lastMode = mode;
  old.lastKnownAt = Date.now();
  data.mastered[key] = old;
  data.study_events = (data.study_events || []).concat([{
    type: 'known',
    key,
    mode,
    at: old.lastKnownAt
  }]).slice(-500);
  saveData(data);
}

function getWrongList(filters = {}) {
  const data = loadData();
  const bookId = filters.bookId || 'all';
  const type = filters.type || 'all';
  const key = filters.key || '';
  return Object.keys(data.wrongbook || {}).map(id => {
    const entry = data.wrongbook[id] || {};
    const item = entry.item || {};
    return Object.assign({}, entry, {
      key: id,
      item,
      bookId: getBookIdByUnit(item.u),
      total: Number(entry.choice || 0) + Number(entry.spell || 0)
    });
  }).filter(entry => {
    if (key && entry.key !== key) return false;
    if (bookId !== 'all' && entry.bookId !== bookId) return false;
    if (filters.kind && filters.kind !== 'all') {
      const kind = entry.item.t === 'trans' ? 'phrase' : 'word';
      if (kind !== filters.kind) return false;
    }
    if (type !== 'all' && Number(entry[type] || 0) <= 0) return false;
    return true;
  }).sort((a, b) => Number(b.lastWrongAt || 0) - Number(a.lastWrongAt || 0));
}

function removeWrong(key) {
  const data = loadData();
  delete data.wrongbook[key];
  saveData(data);
}

function clearWrong(filters = {}) {
  const data = loadData();
  const list = getWrongList(filters);
  list.forEach(entry => {
    if (filters.type && filters.type !== 'all') {
      data.wrongbook[entry.key][filters.type] = 0;
      const choice = Number(data.wrongbook[entry.key].choice || 0);
      const spell = Number(data.wrongbook[entry.key].spell || 0);
      if (choice + spell > 0) return;
    }
    delete data.wrongbook[entry.key];
  });
  saveData(data);
}

function progressKey(progress = {}) {
  return JSON.stringify([
    progress.book || 'b3',
    String(progress.unit || 'all'),
    progress.kind === 'phrase' ? 'phrase' : 'word',
    progress.mode || 'card',
    progress.source || '',
    progress.wrongType || 'all',
    progress.wrongKey || ''
  ]);
}

function legacyProgressKey(progress = {}) {
  return JSON.stringify([
    progress.book || 'b3',
    String(progress.unit || 'all'),
    progress.mode || 'card',
    progress.source || '',
    progress.wrongType || 'all',
    progress.wrongKey || ''
  ]);
}

function saveProgress(progress) {
  if (!progress || !progress.book) return;
  const data = loadData();
  const saved = Object.assign({}, progress, { updatedAt: Date.now() });
  data.last_progress = saved;
  data.progress_positions = Object.assign({}, data.progress_positions || {});
  data.progress_positions[progressKey(saved)] = saved;
  saveData(data);
}

function getSavedProgress(scope) {
  const data = loadData();
  const key = progressKey(scope);
  const exact = (data.progress_positions || {})[key];
  if (exact) return exact;
  if ((scope.kind || 'word') === 'word') {
    const previous = (data.progress_positions || {})[legacyProgressKey(scope)];
    if (previous) return Object.assign({ kind: 'word' }, previous);
  }
  const legacy = data.last_progress || null;
  return legacy && progressKey(legacy) === key ? legacy : null;
}

function getProgressStats(bookId, unit = 'all', kind = 'word') {
  const data = loadData();
  const scopeWords = getItemsByScope(bookId, unit, kind);
  const keys = new Set(scopeWords.map(item => getItemKey(item)));
  const masteredCount = Object.keys(data.mastered || {}).filter(key => keys.has(key)).length;
  const wrongCount = Object.keys(data.wrongbook || {}).filter(key => keys.has(key)).length;
  const favCount = (data.favs || []).filter(item => keys.has(getItemKey(item))).length;
  const saved = getSavedProgress({ book: bookId, unit, kind, mode: 'card' });
  const legacy = data.last_progress || {};
  const last = saved || (progressKey(legacy) === progressKey({ book: bookId, unit, kind, mode: 'card' }) ? legacy : {});
  const currentIndex = Number(last.index || 0);
  return {
    total: scopeWords.length,
    masteredCount,
    wrongCount,
    favCount,
    currentIndex,
    percent: scopeWords.length ? Math.round((masteredCount / scopeWords.length) * 100) : 0
  };
}

module.exports = {
  defaultData,
  loadData,
  saveData,
  getDefinitionMode,
  setDefinitionMode,
  getUser,
  setUser,
  isFavorite,
  toggleFavorite,
  markKnown,
  markWrong,
  getWrongList,
  removeWrong,
  clearWrong,
  saveProgress,
  getSavedProgress,
  getProgressStats
};
