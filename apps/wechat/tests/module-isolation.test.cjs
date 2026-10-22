const assert = require('assert');
const path = require('path');

const memory = {};
const queuedSyncs = [];
global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); }
};
const globalData = { user: '', passportUser: '', apiBase: 'https://words.example.test', mtApiBase: 'https://mt.example.test' };
global.getApp = () => ({
  globalData,
  queueSync(product, snapshot) { queuedSyncs.push({ product, snapshot }); }
});

const root = path.resolve(__dirname, '..', 'miniprogram');
const wordsData = require(path.join(root, 'words', 'utils', 'data.js'));
const wordsStore = require(path.join(root, 'words', 'utils', 'store.js'));
const mtQuestions = require(path.join(root, 'mt', 'utils', 'questions.js'));
const mtStore = require(path.join(root, 'mt', 'utils', 'store.js'));
const readingStore = require(path.join(root, 'reading', 'utils', 'store.js'));
const passport = require(path.join(root, 'utils', 'passport.js'));

assert.strictEqual(wordsData.getAllWords().length, 300);
assert.strictEqual(wordsData.getAllPhrases().length, 4);
assert.strictEqual(mtQuestions.bank.questions.length, 4);

wordsStore.setUser('NaviUser');
assert.strictEqual(mtStore.getUser(), 'NaviUser');
assert.strictEqual(memory.navi_passport_user, 'NaviUser');
mtStore.setUser('SharedUser');
assert.strictEqual(wordsStore.getUser(), 'SharedUser');
assert.strictEqual(memory.words_user, 'SharedUser');
assert.strictEqual(globalData.passportUser, 'SharedUser');

const word = wordsData.getAllWords()[0];
const question = mtQuestions.bank.questions[0];
wordsStore.toggleFavorite(word);
mtStore.toggleFavorite(question.id);
const reading = readingStore.save(Object.assign(readingStore.load(), { bookmarks: ['1:1'] }));

assert.ok(memory.words_learning_data, 'NaviWords 存储未写入');
assert.ok(memory.military_theory_learning_v1, 'NaviMT 存储未写入');
assert.ok(memory.navi_reading_learning_v1, 'NaviReading 存储未写入');
assert.notStrictEqual(memory.words_learning_data, memory.military_theory_learning_v1);
assert.strictEqual(wordsStore.loadData().favs.length, 1);
assert.strictEqual(mtStore.loadData().favorites.length, 1);
assert.deepStrictEqual(reading.bookmarks, ['1:1']);
assert.notStrictEqual(memory.navi_reading_learning_v1, memory.words_learning_data);
assert.notStrictEqual(memory.navi_reading_learning_v1, memory.military_theory_learning_v1);
assert.ok(queuedSyncs.some(item => item.product === 'words'), 'NaviWords 写入应排队 Passport 同步');
assert.ok(queuedSyncs.some(item => item.product === 'mt'), 'NaviMT 写入应排队 Passport 同步');

const emptyServerReading = passport.normalizeProductDocument('reading', {
  bookmarks: [],
  notes: [],
  settings: [],
  lastProgress: []
});
wx.setStorageSync(readingStore.STORAGE_KEY, emptyServerReading);
const readingAfterEmptySync = readingStore.load();
readingAfterEmptySync.notes['1:3'] = 'first keyed note';
readingStore.save(readingAfterEmptySync);
assert.deepStrictEqual(memory.navi_reading_learning_v1.notes, { '1:3': 'first keyed note' });
assert.deepStrictEqual(memory.navi_reading_learning_v1.settings, { lang: 'both', size: 19 });
assert.strictEqual(memory.navi_reading_learning_v1.lastProgress, null);

mtStore.recordAnswer(question, ['invalid'], false, question.type);
assert.strictEqual(Object.keys(mtStore.loadData().wrongbook).length, 1);
assert.strictEqual(Object.keys(wordsStore.loadData().wrongbook).length, 0);

console.log('module-isolation.test: OK');
