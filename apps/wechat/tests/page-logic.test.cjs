const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..', 'miniprogram');
const memory = {};
let capturedPage = null;
let navigation = null;

global.getApp = () => ({ globalData: { version: '0.1.0', wordsVersion: '0.2.1', mtVersion: '0.1.0', apiBase: '', mtApiBase: '', user: '', passportUser: '' } });
global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); },
  removeStorageSync(key) { delete memory[key]; },
  navigateTo({ url }) { navigation = { type: 'navigateTo', url }; },
  redirectTo({ url }) { navigation = { type: 'redirectTo', url }; },
  reLaunch({ url }) { navigation = { type: 'reLaunch', url }; },
  showToast() {},
  showModal({ success }) { if (success) success({ confirm: false }); },
  showShareMenu() {},
  setClipboardData({ success }) { if (success) success(); },
  getClipboardData({ success }) { if (success) success({ data: '{}' }); }
};
global.Page = definition => { capturedPage = definition; };

function instantiate(relativePath) {
  capturedPage = null;
  const fullPath = path.join(root, relativePath);
  delete require.cache[require.resolve(fullPath)];
  require(fullPath);
  assert.ok(capturedPage, `page was not registered: ${relativePath}`);
  const page = Object.assign({}, capturedPage);
  page.data = JSON.parse(JSON.stringify(capturedPage.data || {}));
  page.setData = patch => { page.data = Object.assign(page.data, patch); };
  return page;
}

const portal = instantiate('pages/portal/portal.js');
portal.onShow();
assert.strictEqual(portal.data.continuation.available, false);
portal.enterModule({ currentTarget: { dataset: { id: 'words' } } });
assert.deepStrictEqual(navigation, { type: 'navigateTo', url: '/words/pages/index/index' });

const wordsHome = instantiate('words/pages/index/index.js');
wordsHome.onShow();
assert.ok(wordsHome.data.progressTotal > 0);
wordsHome.goBooks();
assert.deepStrictEqual(navigation, { type: 'redirectTo', url: '/words/pages/books/books' });

const mtHome = instantiate('mt/pages/index/index.js');
mtHome.onShow();
assert.ok(mtHome.data.stats.total > 0);
mtHome.goBank();
assert.deepStrictEqual(navigation, { type: 'redirectTo', url: '/mt/pages/bank/bank' });

console.log('page-logic.test: OK');
