import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.impeccable', 'review');
const baseUrl = process.env.NAVISTUDY_VISUAL_URL || 'http://127.0.0.1:4180/';
fs.mkdirSync(output, { recursive: true });

const viewports = [
  { name: 'mobile-320', width: 320, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
});
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    if (!process.env.NAVISTUDY_VISUAL_URL) {
      await page.route('**/api/v1/account', (route) => route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'authentication_required', message: '请先登录 Navi Passport。', requestId: 'visual' } }),
      }));
    }
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => ({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      h1Visible: !!document.querySelector('h1')?.getClientRects().length,
      passportVisible: !!document.querySelector('#passportPanel')?.getClientRects().length,
      overflows: [...document.querySelectorAll('button, a')]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.id || element.className || element.textContent.trim().slice(0, 30)),
    }));
    if (layout.scrollWidth > layout.innerWidth || !layout.h1Visible || !layout.passportVisible || layout.overflows.length) {
      throw new Error(`${viewport.name} layout failed: ${JSON.stringify(layout)}`);
    }
    if (browserErrors.length) throw new Error(`${viewport.name} browser errors: ${browserErrors.join('; ')}`);
    await page.screenshot({ path: path.join(output, `${viewport.name}.png`), fullPage: true });
    if (viewport.name === 'mobile') {
      await page.click('#themeToggle');
      await page.screenshot({ path: path.join(output, 'mobile-dark.png'), fullPage: true });
    }
    await page.close();
  }
  console.log('visual: OK');
} finally {
  await browser.close();
}
