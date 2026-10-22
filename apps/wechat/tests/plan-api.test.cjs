const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', 'miniprogram', 'plan');
const { formatUpdatedAt } = require(path.join(root, 'utils/date'));
let current = { accessToken: 'test-old-token', refreshToken: 'test-refresh-token' };
let refreshed = 0;
let handler;
const calls = [];
const passport = {
  session: () => current,
  account: () => ({ username: 'Test' }),
  async refresh() { refreshed++; current = { accessToken: 'test-new-token', refreshToken: 'test-next-refresh' }; },
};
const moduleValue = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/api.js'), 'utf8'), {
  module: moduleValue,
  require: name => { assert.equal(name, '../../utils/passport'); return passport; },
  getApp: () => ({ globalData: {} }),
  wx: { request(options) { calls.push(options); handler(options); } },
});
const api = moduleValue.exports;

async function main() {
  const stamp = new Date(2026, 8, 17, 9, 22).getTime();
  assert.equal(formatUpdatedAt(stamp), '2026-09-17 09:22');
  assert.equal(formatUpdatedAt(stamp / 1000), formatUpdatedAt(stamp));
  assert.equal(formatUpdatedAt(String(stamp)), formatUpdatedAt(stamp));
  assert.equal(formatUpdatedAt(new Date(stamp).toISOString()), formatUpdatedAt(stamp));
  for (const invalid of [undefined, null, '', 0, -1, 'bad-date']) assert.equal(formatUpdatedAt(invalid), '时间未知');

  handler = options => options.success({ statusCode: 200, data: { clientId: 'prepared' } });
  await api.preload();
  assert.equal(calls[0].url, 'https://words.example.test/naviplan/api/import/preload');
  assert.equal(calls[0].header.Authorization, 'Bearer test-old-token');
  assert.equal(api.serviceDomain(), 'https://words.example.test');
  await api.importPlan({ username: 'sample-student', password: 'test-only-password' });
  assert.equal(calls.at(-1).timeout, 120000);

  handler = options => options.header.Authorization.endsWith('old-token')
    ? options.success({ statusCode: 401, data: { error: { code: 'authentication_required' } } })
    : options.success({ statusCode: 200, data: { clientId: 'refreshed' } });
  assert.equal((await api.preload()).clientId, 'refreshed');
  assert.equal(refreshed, 1);
  handler = options => options.success({ statusCode: 401, data: { error: { code: 'buaa_auth_error', message: '北航认证失败' } } });
  await assert.rejects(api.importPlan({}), error => error.code === 'buaa_auth_error');
  assert.equal(refreshed, 1, 'Beihang credential failure must not refresh/retry');
  current.refreshToken = 'test-refresh';
  handler = options => options.success({ statusCode: 401, data: { error: { code: 'authentication_required' } } });
  const before = calls.length;
  await assert.rejects(api.preload());
  assert.equal(calls.length - before, 2, 'Expired token retry must be bounded');

  handler = options => options.success({ statusCode: 422, data: { clientId: 'captcha-challenge' } });
  await assert.rejects(api.preload(), error => error.challenge.clientId === 'captcha-challenge');
  handler = options => options.fail({ errMsg: 'request:fail url not in domain list' });
  await assert.rejects(api.preload(), error => error.code === 'request_domain_not_allowed' && error.message.includes('https://words.example.test'));
  handler = options => options.fail({ errMsg: 'request:fail timeout' });
  await assert.rejects(api.preload(), /超时/);
  current = null;
  const guestCalls = calls.length;
  await assert.rejects(api.preload(), /请先登录/);
  assert.equal(calls.length, guestCalls);

  let definition;
  let copied;
  const snapshot = { student: { major: '测试专业' }, courses: [], updatedAt: stamp };
  const pageApi = {
    serviceDomain: api.serviceDomain,
    async preload() { const error = new Error('请添加 request 合法域名'); error.code = 'request_domain_not_allowed'; throw error; },
    async pull() { return snapshot; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/source/source.js'), 'utf8'), {
    Page: value => { definition = value; },
    getApp: () => ({}),
    require: name => {
      if (name.includes('behaviors/theme')) return {};
      if (name.includes('passport')) return passport;
      if (name.includes('/api')) return pageApi;
      if (name.includes('/store')) return { load: () => snapshot, replace() {} };
      if (name.includes('/date')) return { formatUpdatedAt };
      throw new Error('Unexpected dependency ' + name);
    },
    wx: { showToast() {}, showLoading() {}, hideLoading() {}, setClipboardData({ data }) { copied = data; } },
  });
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  page.onShow();
  assert.equal(page.data.updatedAtText, '2026-09-17 09:22');
  page.data.username = 'sample-student';
  page.data.password = 'test-only-password';
  await page.importData();
  assert.equal(page.data.password, '', 'Password must clear after failed import');
  assert.equal(page.data.importing, false);
  assert.equal(page.data.snapshot, snapshot, 'Failed import must preserve existing snapshot');
  assert.equal(page.data.domainError, true);
  page.copyServiceDomain();
  assert.equal(copied, 'https://words.example.test');
  await page.pull();
  assert.equal(page.data.errorMessage, '');
  assert.equal(page.data.updatedAtText, '2026-09-17 09:22');
  console.log('plan-api.test: OK');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
