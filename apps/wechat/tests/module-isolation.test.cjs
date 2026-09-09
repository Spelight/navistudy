const assert = require('assert');
const path = require('path');

const memory = {};
global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); }
};
const globalData = { user: '', passportUser: '', apiBase: '', mtApiBase: '' };
global.getApp = () => ({ globalData });

const root = path.resolve(__dirname, '..', 'miniprogram');
const wordsData = require(path.join(root, 'words', 'utils', 'data.js'));
const wordsStore = require(path.join(root, 'words', 'utils', 'store.js'));
const mtQuestions = require(path.join(root, 'mt', 'utils', 'questions.js'));
const mtStore = require(path.join(root, 'mt', 'utils', 'store.js'));

assert.ok(wordsData.getAllWords().length > 0);
assert.ok(mtQuestions.bank.questions.length > 0);

wordsStore.setUser('NaviUser');
assert.strictEqual(mtStore.getUser(), 'NaviUser');
assert.strictEqual(memory.navi_passport_user, 'NaviUser');

const word = wordsData.getAllWords()[0];
const question = mtQuestions.bank.questions[0];
wordsStore.toggleFavorite(word);
mtStore.toggleFavorite(question.id);

assert.ok(memory.words_learning_data, 'Words data should have its own storage record');
assert.ok(memory.military_theory_learning_v1, 'MT data should have its own storage record');
assert.notStrictEqual(memory.words_learning_data, memory.military_theory_learning_v1);
assert.strictEqual(wordsStore.loadData().favs.length, 1);
assert.strictEqual(mtStore.loadData().favorites.length, 1);

mtStore.recordAnswer(question, ['invalid'], false, question.type);
assert.strictEqual(Object.keys(mtStore.loadData().wrongbook).length, 1);
assert.strictEqual(Object.keys(wordsStore.loadData().wrongbook).length, 0);

console.log('module-isolation.test: OK');
