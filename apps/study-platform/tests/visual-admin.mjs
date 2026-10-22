import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const output = path.join(root, '.impeccable', 'admin-review');
fs.mkdirSync(output, { recursive: true });

const now = Math.floor(Date.now() / 1000);
const userId = 'a'.repeat(32);
const adminId = 'b'.repeat(32);
const serviceSummary = {
  words: { enabled: true, hasData: true, revision: 42, sizeBytes: 32768, updatedAt: now - 1800, usage: '186 收藏 · 820 已掌握' },
  mt: { enabled: true, hasData: true, revision: 16, sizeBytes: 18432, updatedAt: now - 7200, usage: '320 答题记录 · 21 错题' },
  reading: { enabled: true, hasData: true, revision: 8, sizeBytes: 9024, updatedAt: now - 86400, usage: '12 书签 · 7 笔记' },
  plan: { enabled: true, hasData: true, revision: 5, sizeBytes: 44120, updatedAt: now - 300, usage: '53 门课程 · 11 项要求' },
  tools: { enabled: true, hasData: true, activeSessionCount: 2, totalSessionCount: 8, responseCount: 47, usage: '2 个进行中问卷 · 47 份回答' },
};
const permissions = Object.fromEntries(Object.keys(serviceSummary).map(key => [key, { enabled: true, unrestricted: key === 'tools', updatedAt: now - 120, locked: false }]));
const audit = [
  { id: 1, requestId: 'req-2098', userId, username: '北航英语学生', event: 'login', ipPrefix: '10.24.16.0/24', details: {}, createdAt: now - 180 },
  { id: 2, requestId: 'req-2097', userId, username: '北航英语学生', event: 'admin_permission_updated', ipPrefix: '120.244.0.0/24', details: { actorUserId: adminId, services: ['tools'] }, createdAt: now - 3600 },
  { id: 3, requestId: 'req-2096', userId: null, username: null, event: 'refresh_reuse_detected', ipPrefix: '39.156.0.0/24', details: {}, createdAt: now - 7200 },
];
const users = Array.from({ length: 12 }, (_, index) => ({
  id: index === 0 ? userId : String(index + 1).padStart(32, 'c'),
  username: index === 0 ? '北航英语学生' : `测试用户${index + 1}`,
  status: index === 7 ? 'pending_delete' : 'active',
  createdAt: now - (index + 4) * 86400,
  updatedAt: now - index * 3600,
  activeSessions: index % 3,
  totalSessions: index + 1,
  lastSeenAt: now - index * 1900,
  lastIp: `120.244.${index}.18`,
  deviceNames: ['Edge on Windows'],
  services: serviceSummary,
  permissions,
}));

function json(route, body, status = 200) {
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function apiResponse(route) {
  const url = new URL(route.request().url());
  const pathname = url.pathname;
  if (pathname === '/api/v1/account') return json(route, { ok: true, account: { id: adminId, username: 'Dxir', status: 'active' }, csrfToken: 'visual-csrf' });
  if (pathname === '/api/v1/admin/overview') return json(route, {
    ok: true, generatedAt: now, users: { total: 27, active: 26, pending_delete: 1 },
    sessions: { active: 19, total: 44, activeToday: 12 }, securityEvents24h: 1,
    products: {
      words: { users: 22, bytes: 720000, updatedAt: now - 180, disabledUsers: 0 },
      mt: { users: 17, bytes: 410000, updatedAt: now - 600, disabledUsers: 1 },
      reading: { users: 6, bytes: 87000, updatedAt: now - 3600, disabledUsers: 0 },
      plan: { users: 9, bytes: 380000, updatedAt: now - 240, disabledUsers: 0 },
      tools: { users: 8, bytes: 26000, updatedAt: now - 900, disabledUsers: 0 },
    }, recentActivity: audit,
  });
  if (pathname === '/api/v1/admin/analytics/overview') {
    const range = url.searchParams.get('range') || '30d';
    const hourly = ['4h', '8h', '24h', 'today'].includes(range);
    return json(route, {
    ok: true, days: range.endsWith('d') ? Number(range.slice(0, -1)) : 1,
    window: { key: range, label: range === 'today' ? '今天' : range.endsWith('h') ? `近 ${range.slice(0, -1)} 小时` : `近 ${range.slice(0, -1)} 天`, bucket: hourly ? 'hour' : 'day', from: now - 86400, to: now + 1 },
    generatedAt: now,
    filters: { platform: url.searchParams.get('platform') || 'all', product: url.searchParams.get('product') || 'all' },
    summary: { events: 1984, users: 126, authenticatedUsers: 68, anonymousUsers: 58, visits: 442, studyActions: 1392, questions: 1040, correctAnswers: 811, wrongAnswers: 229, correctRate: 78, favoriteAdds: 152, activeDays: 12, change: { visits: 18.4, users: 9.2, studyActions: 31.6, questions: 24.1, favoriteAdds: 6.4 } },
    previousSummary: { events: 1420, users: 115, authenticatedUsers: 61, anonymousUsers: 54, visits: 373, studyActions: 1058, questions: 838, correctAnswers: 646, wrongAnswers: 192, correctRate: 77.1, favoriteAdds: 143, activeDays: 12 },
    products: {
      study: { events: 210, users: 101, visitors: 101, studyActions: 0, favoriteAdds: 0, questions: 0, correctRate: null },
      words: { events: 820, users: 82, visitors: 61, studyActions: 716, favoriteAdds: 93, questions: 550, correctRate: 82.4 },
      mt: { events: 540, users: 59, visitors: 43, studyActions: 461, favoriteAdds: 28, questions: 420, correctRate: 71.2 },
      reading: { events: 188, users: 27, visitors: 24, studyActions: 142, favoriteAdds: 31, questions: 70, correctRate: 88.6 },
      plan: { events: 96, users: 19, visitors: 17, studyActions: 53, favoriteAdds: 0, questions: 0, correctRate: null },
      tools: { events: 130, users: 34, visitors: 30, studyActions: 20, favoriteAdds: 0, questions: 0, correctRate: null },
    },
    platforms: { web: { events: 1190, users: 88, visits: 286, actions: 792 }, wechat: { events: 794, users: 64, visits: 156, actions: 600 } },
    events: [
      { name: 'question_answered', total: 1040, users: 91 }, { name: 'product_open', total: 302, users: 112 },
      { name: 'favorite_added', total: 152, users: 52 }, { name: 'page_view', total: 140, users: 63 },
      { name: 'app_open', total: 96, users: 47 }, { name: 'study_start', total: 82, users: 38 },
    ],
    trend: Array.from({ length: hourly ? 8 : 12 }, (_, index) => hourly
      ? ({ bucket: `2026-09-20 ${String(10 + index).padStart(2, '0')}:00`, label: `${String(10 + index).padStart(2, '0')}:00`, events: 80 + index * 7, users: 14 + index, visits: 22 + index * 2, actions: 52 + index * 5 })
      : ({ day: `2026-09-${String(index + 1).padStart(2, '0')}`, label: `09-${String(index + 1).padStart(2, '0')}`, events: 80 + index * 7, users: 14 + index, visits: 22 + index * 2, actions: 52 + index * 5 })),
  });
  }
  if (pathname === '/api/v1/admin/analytics/content') return json(route, {
    ok: true, product: url.searchParams.get('product') || 'words',
    items: Array.from({ length: 8 }, (_, index) => ({ itemKey: `content-key-${index + 1}`, users: 18 - index, attempts: 72 - index * 4, favoriteAdds: 11 - index, activeFavorites: 15 - index, wrong: 9 - index, correctRate: 78 + index })),
  });
  if (pathname === '/api/v1/admin/users') return json(route, { ok: true, items: users, page: 1, pages: 3, limit: 30, total: 72 });
  if (pathname === `/api/v1/admin/users/${userId}`) return json(route, {
    ok: true,
    account: { id: userId, username: '北航英语学生', status: 'active', createdAt: now - 864000, updatedAt: now - 100 },
    services: serviceSummary, permissions,
    analytics: {
      products: { words: { visits: 12, actions: 174, lastAt: now - 120 }, mt: { visits: 5, actions: 89, lastAt: now - 3600 }, reading: { visits: 3, actions: 21, lastAt: now - 86400 } },
      favorites: { words: 18, mt: 7, reading: 4 },
    },
    sessions: [
      { id: '1'.repeat(32), deviceId: 'edge-device', deviceName: 'Edge on Windows', clientId: 'study-web', scopes: ['account'], createdAt: now - 500000, lastUsedAt: now - 120, expiresAt: now + 200000, revokedAt: null, active: true, current: false, firstIp: '120.244.1.12', lastIp: '120.244.1.18', userAgent: 'Mozilla/5.0 Windows NT 10.0 Edg/140', firstSeenAt: now - 500000, lastSeenAt: now - 120 },
      { id: '2'.repeat(32), deviceId: 'wechat-device', deviceName: '微信小程序', clientId: 'navistudy-wechat', scopes: ['words:read', 'mt:read'], createdAt: now - 300000, lastUsedAt: now - 7200, expiresAt: now + 100000, revokedAt: null, active: true, current: false, firstIp: '39.156.2.30', lastIp: '39.156.2.30', userAgent: 'MicroMessenger/8.0 miniProgram', firstSeenAt: now - 300000, lastSeenAt: now - 7200 },
    ], audit,
  });
  if (pathname === '/api/v1/admin/audit') return json(route, { ok: true, items: audit, page: 1, pages: 1, limit: 50, total: audit.length });
  return json(route, { ok: false, error: { code: 'not_found', message: 'Not found' } }, 404);
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(publicDir, relative.endsWith('/') ? path.join(relative, 'index.html') : relative);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(4181, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
const viewports = [
  { name: 'mobile-320', width: 320, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 },
];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/**', apiResponse);
    await page.goto('http://127.0.0.1:4181/admin/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const overview = await page.evaluate(() => ({
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      metrics: document.querySelectorAll('#metrics .metric').length,
      products: document.querySelectorAll('.product-item').length,
      overlaps: [...document.querySelectorAll('button, a')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim()),
      wideElements: [...document.querySelectorAll('body *')].map(node => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, className: node.className, width: Math.round(rect.width), right: Math.round(rect.right) };
      }).filter(item => item.width > innerWidth + 1 || item.right > innerWidth + 1).slice(0, 12),
    }));
    if (overview.scrollWidth > overview.innerWidth || overview.metrics !== 4 || overview.products !== 5 || overview.overlaps.length || errors.length) throw new Error(`${viewport.name}: ${JSON.stringify({ overview, errors })}`);
    await page.screenshot({ path: path.join(output, `${viewport.name}-overview.png`), fullPage: true });
    await page.click('[data-view="analytics"]');
    await page.waitForSelector('#analyticsProducts article.analytics-product-row');
    const analytics = await page.evaluate(() => ({
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      metrics: document.querySelectorAll('#analyticsMetrics .metric').length,
      products: document.querySelectorAll('#analyticsProducts article.analytics-product-row').length,
      content: document.querySelectorAll('#analyticsContent .content-row:not(.is-heading)').length,
      overlaps: [...document.querySelectorAll('#analyticsView button, #analyticsView select')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim()),
      wideElements: [...document.querySelectorAll('#analyticsView *')].map(node => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, className: node.className, width: Math.round(rect.width), left: Math.round(rect.left), right: Math.round(rect.right) };
      }).filter(item => item.width > innerWidth + 1 || item.left < -1 || item.right > innerWidth + 1).slice(0, 12),
    }));
    if (analytics.scrollWidth > analytics.innerWidth || analytics.metrics !== 4 || analytics.products !== 6 || analytics.content !== 8 || analytics.overlaps.length || errors.length) throw new Error(`${viewport.name} analytics: ${JSON.stringify({ analytics, errors })}`);
    await page.screenshot({ path: path.join(output, `${viewport.name}-analytics.png`), fullPage: true });
    await page.click('[data-view="users"]');
    await page.waitForSelector('[data-open-user]');
    await page.click(`[data-open-user="${userId}"]`);
    await page.waitForSelector('.detail-panel.is-open .device');
    const detail = await page.evaluate(() => ({
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      permissionRows: document.querySelectorAll('.permission-row').length,
      devices: document.querySelectorAll('.device').length,
      panelWidth: document.querySelector('.detail-panel').getBoundingClientRect().width,
      wideElements: [...document.querySelectorAll('body *')].map(node => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, className: node.className, width: Math.round(rect.width), right: Math.round(rect.right) };
      }).filter(item => item.width > innerWidth + 1 || item.right > innerWidth + 1).slice(0, 12),
    }));
    if (detail.scrollWidth > detail.innerWidth || detail.permissionRows !== 5 || detail.devices !== 2 || detail.panelWidth > detail.innerWidth || errors.length) throw new Error(`${viewport.name} detail: ${JSON.stringify({ detail, errors })}`);
    await page.screenshot({ path: path.join(output, `${viewport.name}-detail.png`), fullPage: false });
    await page.close();
  }
  console.log('admin-visual: OK');
} finally {
  await browser.close();
  server.close();
}
