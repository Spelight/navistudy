const questions = require('./questions');

const DATA_KEY = 'military_theory_learning_v1';
const USER_KEY = 'navi_passport_user';
const LEGACY_USER_KEY = 'words_user';

function defaultData() {
  return {
    favorites: [],
    answers: {},
    wrongbook: {},
    mastered: {},
    lastProgress: null,
    progressPositions: {},
    studyEvents: []
  };
}

function loadData() {
  const stored = wx.getStorageSync(DATA_KEY);
  return Object.assign(defaultData(), stored || {});
}

function saveData(data) {
  wx.setStorageSync(DATA_KEY, Object.assign(defaultData(), data || {}));
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

function scopeKey(scope = {}) {
  return JSON.stringify([
    scope.chapter || 'all',
    scope.type || 'all',
    scope.order || 'sequential',
    scope.source || '',
    scope.questionId || ''
  ]);
}

function saveProgress(progress) {
  if (!progress || !progress.currentId) return;
  const data = loadData();
  const saved = Object.assign({}, progress, { updatedAt: Date.now() });
  data.lastProgress = saved;
  data.progressPositions = Object.assign({}, data.progressPositions || {});
  data.progressPositions[scopeKey(saved)] = saved;
  saveData(data);
}

function getSavedProgress(scope) {
  const data = loadData();
  return (data.progressPositions || {})[scopeKey(scope)] || null;
}

function recordAnswer(question, selected, correct, mode) {
  if (!question || !question.id) return;
  const data = loadData();
  const previous = data.answers[question.id] || { attempts: 0, correct: 0 };
  data.answers[question.id] = {
    selected: selected || [],
    attempts: Number(previous.attempts || 0) + 1,
    correct: Number(previous.correct || 0) + (correct ? 1 : 0),
    lastCorrect: !!correct,
    lastAt: Date.now(),
    mode: mode || question.type
  };
  if (correct) {
    data.mastered[question.id] = true;
    delete data.wrongbook[question.id];
  } else {
    const wrong = data.wrongbook[question.id] || { attempts: 0, firstWrongAt: Date.now() };
    data.wrongbook[question.id] = {
      attempts: Number(wrong.attempts || 0) + 1,
      selected: selected || [],
      firstWrongAt: wrong.firstWrongAt,
      lastWrongAt: Date.now()
    };
  }
  data.studyEvents = (data.studyEvents || []).concat([{
    id: question.id,
    correct: !!correct,
    at: Date.now()
  }]).slice(-1000);
  saveData(data);
}

function toggleFavorite(id) {
  const data = loadData();
  const index = data.favorites.indexOf(id);
  if (index >= 0) data.favorites.splice(index, 1);
  else data.favorites.push(id);
  saveData(data);
  return index < 0;
}

function isFavorite(id) {
  return loadData().favorites.includes(id);
}

function getWrongQuestions(filters = {}) {
  const data = loadData();
  const ids = Object.keys(data.wrongbook || {});
  return questions.filterQuestions(filters)
    .filter(question => ids.includes(question.id))
    .sort((a, b) => Number(data.wrongbook[b.id].lastWrongAt || 0) - Number(data.wrongbook[a.id].lastWrongAt || 0));
}

function removeWrong(id) {
  const data = loadData();
  delete data.wrongbook[id];
  saveData(data);
}

function clearWrong(filters = {}) {
  getWrongQuestions(filters).forEach(question => removeWrong(question.id));
}

function getStats(filters = {}) {
  const data = loadData();
  const scoped = questions.filterQuestions(filters);
  const ids = new Set(scoped.map(item => item.id));
  const answered = Object.keys(data.answers || {}).filter(id => ids.has(id));
  const wrong = Object.keys(data.wrongbook || {}).filter(id => ids.has(id));
  const favorites = (data.favorites || []).filter(id => ids.has(id));
  const mastered = Object.keys(data.mastered || {}).filter(id => ids.has(id));
  const attempts = answered.reduce((sum, id) => sum + Number(data.answers[id].attempts || 0), 0);
  const correct = answered.reduce((sum, id) => sum + Number(data.answers[id].correct || 0), 0);
  return {
    total: scoped.length,
    answered: answered.length,
    wrong: wrong.length,
    favorites: favorites.length,
    mastered: mastered.length,
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    percent: scoped.length ? Math.round((answered.length / scoped.length) * 100) : 0
  };
}

module.exports = {
  DATA_KEY,
  defaultData,
  loadData,
  saveData,
  getUser,
  setUser,
  scopeKey,
  saveProgress,
  getSavedProgress,
  recordAnswer,
  toggleFavorite,
  isFavorite,
  getWrongQuestions,
  removeWrong,
  clearWrong,
  getStats
};
