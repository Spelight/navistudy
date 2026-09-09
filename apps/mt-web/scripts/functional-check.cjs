const { chromium } = require("playwright");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  console.log("dashboard loaded");
  assert((await page.locator(".progress-summary strong").textContent()).includes("541"), "active question total is incorrect");

  await page.getByPlaceholder("搜索题目、章节或来源").fill("我国武装力量的主体是");
  await page.locator(".filter-bar select").nth(1).selectOption("single");
  await page.waitForSelector(".question-list > button");
  await page.locator(".question-list > button").first().click();
  await page.getByRole("button", { name: /^B/ }).click();
  await page.getByRole("button", { name: "提交答案" }).click();
  assert((await page.locator(".result-banner:visible").textContent()).includes("还需复习"), "wrong answer was not recorded");
  await page.locator(".practice-footer button").nth(1).click();
  await page.getByTitle("退出练习").click();
  await page.getByRole("button", { name: "错题本" }).click();
  assert((await page.locator(".question-list > button").count()) >= 1, "wrong-answer list is empty");
  await page.getByRole("button", { name: "收藏夹" }).click();
  assert((await page.locator(".question-list > button").count()) >= 1, "favorites list is empty");
  console.log("answer state verified");

  await page.getByRole("button", { name: "资料来源" }).click();
  assert((await page.locator(".source-row").count()) === 19, "source inventory count is incorrect");
  await page.getByTitle("切换夜间模式").click();
  assert((await page.locator("html").getAttribute("data-theme")) === "dark", "dark mode did not activate");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出记录" }).click();
  await downloadPromise;
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not json") });
  await page.waitForSelector(".data-message");
  assert((await page.locator(".data-message").textContent()).includes("无法识别"), "invalid import error is unclear");

  const mobile = await browser.newPage({ viewport: { width: 320, height: 720 } });
  mobile.setDefaultTimeout(6000);
  await mobile.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await mobile.getByRole("button", { name: /生成练习/ }).click();
  await mobile.getByRole("button", { name: "题号" }).click();
  assert(await mobile.locator(".question-rail").evaluate((element) => element.classList.contains("mobile-open")), "mobile question index did not open");
  assert((await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, "mobile practice overflows horizontally");

  await mobile.close();
  await page.close();
  await browser.close();
  assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    activeQuestions: 541,
    sources: 19,
    wrongBook: "ok",
    favorites: "ok",
    darkMode: "ok",
    exportImport: "ok",
    mobileQuestionIndex: "ok",
    browserErrors: 0,
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
