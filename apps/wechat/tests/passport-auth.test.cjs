const assert = require('assert');
const path = require('path');

const memory = {};
let requestHandler = null;
let capturedRequest = null;

global.getApp = () => ({
  globalData: { passportApiBase: 'https://words.example.test/navistudy-api' }
});

global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); },
  removeStorageSync(key) { delete memory[key]; },
  onNetworkStatusChange() {},
  request(options) {
    capturedRequest = options;
    requestHandler(options);
  }
};

const passport = require(path.resolve(__dirname, '..', 'miniprogram', 'utils', 'passport.js'));

(async () => {
  requestHandler = options => options.success({
    statusCode: 200,
    data: {
      ok: true,
      account: { id: 'user-1', username: 'NaviUser', status: 'active' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      csrfToken: 'csrf-token'
    }
  });

  const result = await passport.login('NaviUser', 'correct-password');
  assert.strictEqual(capturedRequest.url, 'https://words.example.test/navistudy-api/api/v1/auth/login');
  assert.strictEqual(capturedRequest.method, 'POST');
  assert.strictEqual(capturedRequest.data.clientId, 'navistudy-wechat');
  assert.strictEqual(capturedRequest.data.transport, 'native');
  assert.strictEqual(result.account.username, 'NaviUser');
  assert.strictEqual(memory.navi_passport_session_v1.refreshToken, 'refresh-token');

  memory.navi_sync_meta_words = { revision: 9, initialized: true, userId: 'older-user' };
  memory.navi_sync_queue_words = [{ mutationId: 'mutation-from-older-user', type: 'merge_snapshot', data: { favs: [] } }];
  requestHandler = options => {
    assert.strictEqual(options.url, 'https://words.example.test/navistudy-api/api/v1/sync/words');
    assert.strictEqual(options.data.baseRevision, 0);
    assert.strictEqual(options.data.mutations.length, 1);
    assert.strictEqual(options.data.mutations[0].data.favs[0].key, 'local-word');
    assert.strictEqual(options.data.mutations[0].data.app_settings.definitionMode, 'en');
    options.success({ statusCode: 200, data: { ok: true, revision: 2, document: options.data.mutations[0].data } });
  };
  await passport.initializeProduct('words', { favs: [{ key: 'local-word', w: 'local' }], app_settings: { definitionMode: 'en' } }, { forceLocalMerge: true });
  assert.strictEqual(memory.navi_sync_meta_words.userId, 'user-1');
  assert.deepStrictEqual(memory.navi_sync_queue_words, []);
  assert.strictEqual(passport.syncInfo('words').state, 'synced');

  memory.navi_sync_queue_plan = [{ mutationId: 'blocked-plan', type: 'merge_snapshot', data: {} }];
  requestHandler = options => options.success({
    statusCode: 403,
    data: { ok: false, error: { code: 'service_disabled', message: '服务未开通' } }
  });
  await assert.rejects(passport.flush('plan'), error => error.code === 'service_disabled');
  assert.strictEqual(passport.syncInfo('plan').state, 'disabled');

  requestHandler = options => options.success({
    statusCode: 409,
    data: { ok: false, error: { code: 'legacy_registration_required', message: '请先注册' } }
  });
  await assert.rejects(
    passport.login('OldWordsUser', 'unknown-password'),
    error => error.code === 'legacy_registration_required' && error.message === '请先注册'
  );

  requestHandler = options => options.fail({ errMsg: 'request:fail url not in domain list' });
  await assert.rejects(
    passport.login('NaviUser', 'correct-password'),
    /Passport 服务域名未获微信授权/
  );

  console.log('passport-auth.test: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
