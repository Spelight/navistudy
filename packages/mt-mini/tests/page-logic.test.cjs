const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const memory = {};
let capturedPage = null;
let lastNavigation = '';

global.getApp = () => ({ globalData: { version: '0.1.0' } });
global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); },
  removeStorageSync(key) { delete memory[key]; },
  navigateTo({ url }) { lastNavigation = url; },
  switchTab({ url }) { lastNavigation = url; },
  showToast() {},
  showModal({ success }) { if (success) success({ confirm: false }); },
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
  assert.ok(capturedPage, `page was not registered: ${relativePath}`);
  const page = Object.assign({}, capturedPage);
  page.data = JSON.parse(JSON.stringify(capturedPage.data || {}));
  page.setData = patch => { page.data = Object.assign(page.data, patch); };
  return page;
}

const index = instantiate('index/index.js');
index.onShow();
assert.ok(index.data.stats.total > 0);
index.startMode({ currentTarget: { dataset: { mode: 'random' } } });
assert.ok(lastNavigation.includes('type=objective'));

const bank = instantiate('bank/bank.js');
bank.onShow();
assert.ok(bank.data.total > 0);
assert.ok(bank.data.rows.length > 0);

const practice = instantiate('practice/practice.js');
practice.onLoad({ chapter: 'all', type: 'single', order: 'sequential' });
assert.ok(practice.data.list.length > 0);
const correctKey = practice.data.current.answer[0];
practice.chooseOption({ currentTarget: { dataset: { key: correctKey } } });
assert.strictEqual(practice.data.correct, true);

const wrong = instantiate('wrong/wrong.js');
wrong.onShow();
assert.ok(Array.isArray(wrong.data.rows));

console.log('page-logic.test: OK');
