const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const memory = {};
let capturedPage = null;
let lastNavigation = '';
let downloadedUrl = '';
let openedFile = '';

global.getApp = () => ({ globalData: { version: '0.1.0' } });
global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); },
  removeStorageSync(key) { delete memory[key]; },
  navigateTo({ url }) { lastNavigation = url; },
  switchTab({ url }) { lastNavigation = url; },
  showToast() {},
  showModal({ success }) { if (success) success({ confirm: false }); },
  showLoading() {},
  hideLoading() {},
  downloadFile({ url, success, complete }) {
    downloadedUrl = url;
    if (success) success({ statusCode: 200, tempFilePath: 'temp-reference.pdf' });
    if (complete) complete();
  },
  openDocument({ filePath }) { openedFile = filePath; },
  setClipboardData({ success }) { if (success) success(); },
  getClipboardData({ success }) { if (success) success({ data: '{}' }); },
  showShareMenu() {}
};
global.Page = definition => { capturedPage = definition; };

function instantiate(relativePath) {
  capturedPage = null;
  const fullPath = path.join(root, 'miniprogram', 'pages', relativePath);
  delete require.cache[require.resolve(fullPath)];
  require(fullPath);
  assert.ok(capturedPage, `Page was not registered: ${relativePath}`);
  const page = {};
  Object.keys(capturedPage).forEach(key => { page[key] = capturedPage[key]; });
  page.data = JSON.parse(JSON.stringify(capturedPage.data || {}));
  page.setData = patch => { page.data = Object.assign(page.data, patch); };
  return page;
}

const index = instantiate('index/index.js');
index.onShow();
assert.strictEqual(index.data.stats.total, 4);
index.goMaterials();
assert.strictEqual(lastNavigation, '/pages/materials/materials');
const legacyCount = require(path.join(root, 'miniprogram', 'utils', 'questions.js')).bank.questions.filter(item => item.legacy).length;
index.changeHideLegacy({ detail: { value: true } });
assert.strictEqual(index.data.stats.total, 4 - legacyCount);
index.startMode({ currentTarget: { dataset: { mode: 'random' } } });
assert.ok(lastNavigation.includes('type=objective'));

const bank = instantiate('bank/bank.js');
bank.onShow();
assert.strictEqual(bank.data.total, 4 - legacyCount);
assert.ok(bank.data.rows.every(item => !item.legacy));
bank.changeHideLegacy({ detail: { value: false } });
assert.strictEqual(bank.data.total, 4);
assert.strictEqual(bank.data.rows.length, 4);
bank.loadMore();
assert.strictEqual(bank.data.rows.length, 4);

const practice = instantiate('practice/practice.js');
practice.onLoad({ chapter: encodeURIComponent('学习方法'), type: 'single', order: 'sequential' });
assert.ok(practice.data.list.length > 0);
const correctKey = practice.data.current.answer[0];
practice.chooseOption({ currentTarget: { dataset: { key: correctKey } } });
assert.strictEqual(practice.data.answered, true);
assert.strictEqual(practice.data.correct, true);

memory.military_hide_legacy = true;
const currentPractice = instantiate('practice/practice.js');
currentPractice.onLoad({ chapter: 'all', type: 'all', order: 'sequential' });
assert.ok(currentPractice.data.list.every(item => !item.legacy));
memory.military_hide_legacy = false;

const multiple = instantiate('practice/practice.js');
multiple.onLoad({ chapter: 'all', type: 'multiple', order: 'sequential' });
multiple.data.current.answer.forEach(key => multiple.chooseOption({ currentTarget: { dataset: { key } } }));
multiple.submitAnswer();
assert.strictEqual(multiple.data.correct, true);

const short = instantiate('practice/practice.js');
short.onLoad({ chapter: 'all', type: 'short', order: 'sequential' });
short.revealShort();
assert.strictEqual(short.data.answered, true);
assert.ok(short.data.answerText.length > 0);

const wrong = instantiate('wrong/wrong.js');
wrong.onShow();
assert.ok(Array.isArray(wrong.data.rows));

const me = instantiate('me/me.js');
me.onShow();
assert.strictEqual(me.data.total, 4);

const materials = instantiate('materials/materials.js');
assert.strictEqual(materials.data.total, 0);
assert.ok(materials.data.groups.every(group => group.items.length === 0), 'Public demo must not expose private reference files');

console.log('page-logic.test: OK');
