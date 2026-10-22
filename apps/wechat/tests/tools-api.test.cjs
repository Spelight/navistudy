const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'tools', 'miniprogram', 'tools', 'utils', 'api.js'), 'utf8');
let current = { accessToken: 'tools-test-token', refreshToken: 'tools-refresh-token' };
let handler;
let refreshed = 0;
const calls = [];
const passport = {
  session: () => current,
  async request() { refreshed++; current = { accessToken: 'tools-new-token', refreshToken: 'tools-next-refresh' }; },
};
const moduleValue = { exports: {} };
vm.runInNewContext(source, {
  module: moduleValue,
  require(name) { assert.equal(name, '../../utils/passport'); return passport; },
  getApp: () => ({ globalData: {} }),
  wx: { request(options) { calls.push(options); handler(options); } },
});
const api = moduleValue.exports;

async function main() {
  assert.equal(api.base(), 'https://words.example.test/navitools/api/availability');
  handler = options => options.success({ statusCode: 200, data: { id: 'session-1' } });
  assert.equal((await api.request('/sessions/session-1')).id, 'session-1');
  assert.equal(calls[0].url, 'https://words.example.test/navitools/api/availability/sessions/session-1');
  await api.request('/admin/me', {}, 'GET', true);
  assert.equal(calls[1].header.Authorization, 'Bearer tools-test-token');

  handler = options => options.header.Authorization === 'Bearer tools-test-token'
    ? options.success({ statusCode: 401, data: { code: 'passport_required' } })
    : options.success({ statusCode: 200, data: { username: 'Test' } });
  assert.equal((await api.request('/admin/me', {}, 'GET', true)).username, 'Test');
  assert.equal(refreshed, 1);

  handler = options => options.fail({ errMsg: 'request:fail url not in domain list' });
  await assert.rejects(api.request('/sessions/session-1'), error => error.code === 'request_domain_not_allowed' && error.message.includes('https://words.example.test'));
  handler = options => options.fail({ errMsg: 'request:fail timeout' });
  await assert.rejects(api.request('/sessions/session-1'), /超时/);
  current = null;
  const count = calls.length;
  await assert.rejects(api.request('/admin/me', {}, 'GET', true), /请先登录/);
  assert.equal(calls.length, count);
  console.log('tools-api.test: OK');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
