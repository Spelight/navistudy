const assert = require('assert');
const path = require('path');

const memory = {};
global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); }
};

const root = path.resolve(__dirname, '..');
const questions = require(path.join(root, 'miniprogram', 'utils', 'questions.js'));
const store = require(path.join(root, 'miniprogram', 'utils', 'store.js'));
const sample = questions.bank.questions.find(item => item.type === 'single');

assert.deepStrictEqual(store.loadData().favorites, []);
assert.strictEqual(store.toggleFavorite(sample.id), true);
assert.strictEqual(store.isFavorite(sample.id), true);
assert.strictEqual(store.toggleFavorite(sample.id), false);

store.recordAnswer(sample, ['Z'], false, 'single');
assert.strictEqual(store.getWrongQuestions().length, 1);
assert.strictEqual(store.getStats().wrong, 1);
store.recordAnswer(sample, sample.answer, true, 'single');
assert.strictEqual(store.getWrongQuestions().length, 0, '答对后应移出错题本');
assert.strictEqual(store.getStats().mastered, 1);

const progress = { chapter: 'all', type: 'all', order: 'sequential', source: '', questionId: '', index: 3, currentId: sample.id };
store.saveProgress(progress);
assert.strictEqual(store.getSavedProgress(progress).currentId, sample.id);

console.log('study-store.test: OK');

