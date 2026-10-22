const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.location = { pathname: '/reading/' };
global.document = { cookie: '' };
global.localStorage = { getItem() { return null; }, setItem() {} };
global.navigator = { onLine: true };
global.addEventListener = () => {};

require(path.join(__dirname, 'passport-sync.js'));

const normalized = global.NaviPassport.normalizeProductDocument('reading', {
  bookmarks: {},
  notes: [],
  settings: [],
  lastProgress: []
});

assert.deepEqual(normalized.bookmarks, []);
assert.deepEqual(normalized.notes, {});
assert.deepEqual(normalized.settings, {});
assert.equal(normalized.lastProgress, null);
console.log('reading-web-passport-sync: OK');
