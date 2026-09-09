const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const report = {};
  const viewports = [
    { name: "desktop", width: 1440, height: 960 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
    { name: "user-320", width: 320, height: 720 },
  ];

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173/", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    const dashboard = {
      title: await page.locator("h1").first().textContent(),
      modes: await page.locator(".mode-card").count(),
      navItems: await page.locator(viewport.width <= 900 ? ".mobile-nav button" : ".sidebar nav button").count(),
      overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
    await page.screenshot({ path: `.impeccable/review/${viewport.name}.png`, fullPage: true });

    await page.getByRole("button", { name: /生成练习/ }).click();
    await page.waitForSelector(".question-stage");
    const practice = {
      question: await page.locator(".question-stage h1").textContent(),
      answers: await page.locator(".answer-options button").count(),
      overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
    const answerCount = await page.locator(".answer-options button").count();
    if (answerCount) {
      await page.locator(".answer-options button").first().click();
      await page.getByRole("button", { name: "提交答案" }).click();
      practice.answerShown = await page.locator(".answer-context:visible").first().isVisible();
      practice.result = (await page.locator(".result-banner").first().textContent()).trim();
    } else {
      await page.getByRole("button", { name: /查看参考答案/ }).click();
      await page.waitForTimeout(100);
      practice.answerShown = await page.locator(".answer-context:visible").first().isVisible();
    }
    await page.screenshot({ path: `.impeccable/review/practice-${viewport.name}.png` });
    report[viewport.name] = { dashboard, practice, pageErrors, consoleErrors };
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
