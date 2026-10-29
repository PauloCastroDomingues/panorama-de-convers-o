const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const output = path.resolve(__dirname, '../output/crm-decision'); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], writes = [], readings = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto('http://127.0.0.1:8021/#crm');
    await page.waitForFunction(() => document.querySelector('#crm-open-filters')?.disabled === false && !document.body.classList.contains('is-loading'));
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const channel of ['email', 'whatsapp-organico', 'whatsapp-oficial', 'all']) {
        await page.locator(`[data-crm-tab="${channel}"]`).click();
        const reading = page.locator('#crm-priority-list');
        assert.equal(await reading.locator('[data-decision-status="ready"]').count(), channel === 'all' ? 3 : 1);
        assert.ok(await reading.evaluate(el => el.getBoundingClientRect().top < document.querySelector('#crm-detail').getBoundingClientRect().top));
        if (width === 1440) readings.push({ channel, text: await reading.innerText() });
        await reading.screenshot({ path: path.join(output, `${channel}-${width}.png`) });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        if (channel !== 'all') {
          for (const key of ['conversion', 'pacing', 'tracking', 'provider']) {
            const detail = page.locator(`[data-detail-key="${key}"]`);
            if (!await detail.count()) continue;
            assert.equal(await detail.getAttribute('open'), null);
            await detail.locator(':scope > summary').click();
            assert.equal(await detail.evaluate(el => el.open), true);
            if (key === 'pacing') {
              await page.locator('button[data-activation-mode="plan"]').click();
              assert.equal(await detail.evaluate(el => el.open), true, 'Disclosure survives render');
              await page.locator('button[data-activation-mode="actual"]').click();
            }
            await detail.locator(':scope > summary').click();
          }
        }
      }
    }
    await page.locator('#crm-open-filters').click();
    await page.locator('#crm-compare-enabled').uncheck();
    await page.locator('#crm-apply-filters').click();
    assert.equal(await page.locator('[data-decision-status="off"]').count(), 3);
    assert.equal(await page.locator('.crm-decision-drivers').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    fs.writeFileSync(path.join(output, 'readings.json'), JSON.stringify(readings, null, 2));
    console.log(JSON.stringify({ ok: true, viewports: 4, channels: 4, decisions: readings, sourceWrites: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
