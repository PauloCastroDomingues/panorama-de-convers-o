const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = path.resolve(__dirname, '../output/crm-funnel');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], writes = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto('http://127.0.0.1:8021/#crm');
    await page.waitForFunction(() => document.querySelector('#crm-open-filters')?.disabled === false && !document.body.classList.contains('is-loading'));
    await page.evaluate(() => document.fonts.ready);
    const area = page.locator('[data-crm-view="activation"]');
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const channel of ['whatsapp-oficial', 'email', 'whatsapp-organico']) {
        await page.locator(`[data-crm-tab="${channel}"]`).click();
        await area.locator('button[data-activation-mode="actual"]').click();
        const expected = await page.locator('#crm-summary-kpis .kpi > strong').allTextContents();
        assert.equal(await area.locator('[data-funnel-commercial="sessions"] strong').textContent(), expected[0]);
        assert.equal(await area.locator('[data-funnel-commercial="orders"] strong').textContent(), expected[1]);
        for (const mode of ['actual', 'plan']) {
          await area.locator(`button[data-activation-mode="${mode}"]`).click();
          assert.equal(await area.getAttribute('data-activation-mode'), mode);
          assert.equal(await area.locator('[data-funnel-commercial="sessions"]').count(), 1);
          assert.equal(await area.locator('[data-funnel-commercial="orders"]').count(), 1);
          if (mode === 'plan' && channel === 'whatsapp-oficial') {
            assert.equal(await area.locator('.crm-step-column').count(), 2);
            assert.equal(await area.locator('[data-funnel-stage]').count(), 8);
            assert.equal(await area.locator('.crm-sliced-funnel').count(), 3);
            assert.equal(await area.locator('[data-funnel-band]').count(), 10);
            assert.equal(await area.locator('[data-funnel-commercial="orders"] strong').textContent(), '119');
          }
          const overflow = await area.evaluate(element => [...element.querySelectorAll('.crm-funnel-step, .crm-step-title, .crm-step-value, .crm-funnel-band, button')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className));
          assert.deepEqual(overflow, [], `${width}/${channel}/${mode}: text must fit`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          await area.screenshot({ path: path.join(output, `${channel}-${mode}-${width}.png`) });
        }
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, viewports: 4, channels: 3, modes: 2, sourceWrites: 0, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
