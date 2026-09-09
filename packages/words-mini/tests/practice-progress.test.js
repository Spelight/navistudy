const assert = require('assert');

const storage = new Map();
global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  showToast() {}
};
global.getApp = () => ({ globalData: {} });

const vocab = require('../miniprogram/utils/data');
const store = require('../miniprogram/utils/store');

const words = vocab.getWordsByScope('example', 'all');
assert.ok(words.length > 0, 'public fixture should contain words');
assert.strictEqual(vocab.getBookIdByUnit(501), 'example');

store.saveProgress({ book: 'example', unit: 'all', mode: 'card', index: 1, word: words[1].w });
assert.strictEqual(store.getSavedProgress({ book: 'example', unit: 'all', mode: 'card' }).index, 1);

store.toggleFavorite(vocab.getItemKey(words[0]));
assert.strictEqual(store.isFavorite(vocab.getItemKey(words[0])), true);

console.log('practice progress tests passed');
