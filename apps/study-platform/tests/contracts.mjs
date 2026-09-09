import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const router = read('public/index.php');
const migration = read('migrations/001_initial.sql');
const product = read('migrations/002_product.sql');
const openapi = read('spec/openapi.yaml');
const schema = JSON.parse(read('spec/sync-request.schema.json'));

for (const route of ['/auth/register','/auth/login','/auth/refresh','/auth/recover','/auth/logout','/account/password','/account/sessions','/account/deletion','/sync/(words|mt)']) assert.ok(router.includes(route), `Missing route ${route}`);
for (const table of ['users','sessions','access_tokens','used_refresh_tokens','oauth_codes','legacy_claims','login_attempts','audit_log']) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
for (const table of ['documents','mutations','snapshots']) assert.match(product, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.equal(schema.properties.mutations.maxItems, 500);
assert.match(openapi, /words:read|sync\/{product\}|Navi Passport API/);
for (const cookie of ['navi_words_access', 'navi_words_refresh', 'navi_words_csrf', 'navi_mt_access', 'navi_mt_refresh', 'navi_mt_csrf']) {
  assert.ok(router.includes(cookie), `Missing isolated product cookie ${cookie}`);
}
assert.ok(router.includes('/words/navistudy-api') && router.includes('/mt/navistudy-api'), 'Study product API prefixes are not routed');
assert.match(read('src/AuthService.php'), /study\.dxir\.net\.cn\/words\/navistudy-callback\.html/);
assert.match(read('src/AuthService.php'), /study\.dxir\.net\.cn\/mt\/navistudy-callback\.html/);
assert.match(read('src/AuthService.php'), /\$length < 6/);
for (const source of [migration, read('src/AuthService.php'), read('src/SyncService.php'), read('src/LegacyImporter.php')]) {
  assert.doesNotMatch(source, /ON CONFLICT\s*\(/i, 'SQLite 3.7-incompatible UPSERT syntax found');
}
assert.doesNotMatch(migration, /CREATE\s+(?:UNIQUE\s+)?INDEX[^;]+\sWHERE\s/i, 'SQLite 3.7-incompatible partial index found');
assert.doesNotMatch(read('src/AuthService.php'), /error_log\([^\n]*(password|recovery|token)/i, 'Sensitive credential may be logged');
assert.ok(fs.existsSync(path.join(root, 'public/assets/lucide.min.js')));
console.log('contracts: OK');
