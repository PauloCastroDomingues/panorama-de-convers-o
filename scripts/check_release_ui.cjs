const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const base = process.env.PANORAMA_BASE_URL || 'http://127.0.0.1:8020';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const output = path.resolve(__dirname, '../output/release-qa', new URL(base).hostname);
  fs.mkdirSync(output, { recursive: true });
  const errors = [], brokenAssets = [], reports = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.url().startsWith(base + '/assets/') && response.status() >= 400) brokenAssets.push({ url: response.url(), status: response.status() }); });
    const ready = async () => {
      await page.waitForFunction(() => !document.body.classList.contains('is-loading'), { timeout: 45000 });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#data-loader')).visibility === 'hidden');
      await page.evaluate(() => document.fonts.ready);
    };
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await ready();
    assert.equal(await page.title(), 'Reise | Performance comercial');
    assert.ok(await page.locator('#filter-summary-period').innerText());
    const growthSource = await page.locator('#source-status').innerText();
    await page.locator('#open-filters').click();
    assert.equal(await page.locator('#growth-filter-dialog').evaluate((dialog) => dialog.open), true);
    assert.equal(await page.locator('#product-filter').count(), 1);
    assert.ok(await page.locator('#date-start').inputValue());
    await page.locator('#cancel-filters').click();
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Growth ${name}: overflow`);
      await page.screenshot({ path: path.join(output, `growth-${name}.png`) });
      reports.push({ workspace: 'growth', viewport: name });
    }
    await page.goto(base + '/?crmChannel=email#crm', { waitUntil: 'domcontentloaded' });
    await page.locator('.crm-rd-report').waitFor({ timeout: 45000 });
    await ready();
    assert.deepEqual(await page.locator('.crm-rd-report .kpi strong').allTextContents(), ['72', '67', '5', '6.269']);
    assert.match(await page.locator('.crm-rd-report .crm-sendflow-source').innerText(), /Snapshot local/);
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.locator('.crm-rd-report').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `CRM ${name}: overflow`);
      await page.locator('.crm-rd-report').screenshot({ path: path.join(output, `rd-${name}.png`) });
      reports.push({ workspace: 'crm', viewport: name });
    }
    await page.locator('#crm-open-filters').click();
    await page.locator('#crm-date-start').fill('2026-10-21');
    await page.locator('#crm-date-end').fill('2026-10-27');
    await page.locator('#crm-apply-filters').click();
    assert.match(await page.locator('.crm-rd-comparison').innerText(), /Comparativo observado/);
    assert.deepEqual(errors, []);
    assert.deepEqual(brokenAssets, []);
    console.log(JSON.stringify({ status: 'passed', base, growthSource, campaigns: 72, comparisons: '21-27 Oct vs 14-20 Oct observed', reports, errors, brokenAssets }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
