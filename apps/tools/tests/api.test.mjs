import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const phpCheck = spawnSync('php', ['-v'], { stdio: 'ignore' });
if (phpCheck.error?.code === 'ENOENT') {
  console.log('tools-api.test: SKIP (PHP is not installed in this local environment)');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = await mkdtemp(path.join(tmpdir(), 'navitools-test-'));
const passportPort = 18931;
const apiPort = 18932;
const passport = http.createServer((request, response) => {
  const disabled = request.headers.authorization === 'Bearer disabled-token';
  const authenticated = disabled || request.headers.authorization === 'Bearer test-token' || request.headers.cookie === 'navi_plan_access=test-cookie';
  response.writeHead(authenticated ? 200 : 401, { 'content-type': 'application/json' });
  response.end(JSON.stringify(authenticated ? {
    account: { id: 'user-1', username: 'alice', displayName: 'Alice' },
    serviceAccess: { tools: { enabled: !disabled, unrestricted: !disabled } },
  } : { error: { code: 'authentication_required' } }));
});
await new Promise(resolve => passport.listen(passportPort, '127.0.0.1', resolve));

const php = spawn('php', ['-S', `127.0.0.1:${apiPort}`, path.join(root, 'api', 'index.php')], {
  cwd: root,
  env: { ...process.env, NAVITOOLS_DATA_DIR: dataDir, NAVIPASSPORT_ACCOUNT_URL: `http://127.0.0.1:${passportPort}/account` },
  stdio: ['ignore', 'pipe', 'pipe']
});
let stderr = '';
php.stderr.on('data', chunk => { stderr += chunk; });

const base = `http://127.0.0.1:${apiPort}/tools/api/availability`;
const aliasBase = `http://127.0.0.1:${apiPort}/navitools/api/availability`;
async function requestAt(baseUrl, route, options = {}, expected = 200) {
  const { status, body } = await new Promise((resolve, reject) => {
    const outgoing = http.request(`${baseUrl}${route}`, {
      method: options.method ?? 'GET',
      headers: options.headers ?? {}
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(raw) });
        } catch {
          reject(new Error(`${route}: invalid JSON response: ${raw.slice(0, 300)}`));
        }
      });
    });
    outgoing.on('error', reject);
    if (options.body) outgoing.write(options.body);
    outgoing.end();
  });
  assert.equal(status, expected, `${route}: ${JSON.stringify(body)}`);
  return body;
}
async function request(route, options = {}, expected = 200) {
  return requestAt(base, route, options, expected);
}

try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await request('/missing', {}, 404); break; }
    catch (error) { if (attempt === 29) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }

  await requestAt(aliasBase, '/missing', {}, 404);

  await request('/admin/me', {}, 401);
  const bearer = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
  const cookie = { Cookie: 'navi_plan_access=test-cookie', 'Content-Type': 'application/json' };
  const profile = await request('/admin/me', { headers: bearer });
  assert.equal(profile.username, 'alice');
  assert.equal(profile.unrestricted, true);
  await request('/admin/me', { headers: { Authorization: 'Bearer disabled-token' } }, 403);

  const now = new Date();
  const closes = new Date(now.getTime() + 86400000);
  const date = value => value.toISOString().slice(0, 10);
  const session = await request('/sessions', {
    method: 'POST', headers: bearer,
    body: JSON.stringify({ title: 'Test availability', termLabel: 'Group', weekLabel: 'Meeting', nameRequired: true, opensAt: now.toISOString(), closesAt: closes.toISOString(), dateStart: date(now), dateEnd: date(closes) })
  }, 201);
  assert.ok(session.id.startsWith('availability-'));

  const sessions = await request('/sessions', { headers: cookie });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].ownerUsername, 'alice');

  const slot = `${session.days[0].id}-${session.periods[0].id}`;
  const submission = await request(`/sessions/${session.id}/responses`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respondentName: 'Bob', slots: [slot] })
  });
  assert.ok(submission.responseToken);

  const publicStats = await request(`/sessions/${session.id}/public-stats`);
  assert.equal(publicStats.cells.find(cell => cell.slotId === slot).count, 1);
  const privateStats = await request(`/sessions/${session.id}/stats`, { headers: bearer });
  assert.deepEqual(privateStats.cells.find(cell => cell.slotId === slot).names, ['Bob']);
  const responses = await request(`/sessions/${session.id}/responses`, { headers: bearer });
  assert.equal(responses[0].respondentName, 'Bob');

  await request(`/sessions/${session.id}`, { method: 'DELETE', headers: bearer });
  await request(`/sessions/${session.id}`, {}, 404);

  const stored = JSON.parse(await readFile(path.join(dataDir, 'availability.json'), 'utf8'));
  assert.equal(Object.keys(stored.sessions).length, 0);
  assert.equal(stored.servicePermissions?.naviagenda, undefined);
  console.log('navitools api.test: OK');
} finally {
  php.kill();
  passport.close();
  await rm(dataDir, { recursive: true, force: true });
}
