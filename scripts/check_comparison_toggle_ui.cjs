const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8021';
const output = path.resolve(__dirname, '../output/comparison-toggle');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], writes = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET','HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#crm-open-filters')?.disabled === false && !document.body.classList.contains('is-loading'));
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('[data-workspace="growth"]').click();
      const original = await page.locator('#resumo .kpi > strong').allTextContents();
      await page.locator('#open-filters').click();
      await page.locator('#compare-enabled').uncheck();
      assert.equal(await page.locator('#compare-mode').isDisabled(), true);
      await page.screenshot({ path: path.join(output, `filters-${width}.png`) });
      await page.locator('#apply-filters').click();
      assert.equal(await page.locator('#growth-workspace [data-series="comparison"]').count(), 0);
      assert.equal(await page.locator('#growth-workspace .performance-delta:visible').count(), 0);
      assert.doesNotMatch(await page.locator('#rhythm-body').innerText(), /Anterior|Comparado:/);
      assert.deepEqual(await page.locator('#resumo .kpi > strong').allTextContents(), original);
      await page.locator('#open-filters').click();
      await page.locator('#compare-enabled').check();
      await page.locator('#cancel-filters').click();
      assert.equal(await page.locator('#growth-workspace [data-series="comparison"]').count(), 0, 'Cancel retains applied off state');
      await page.locator('#open-filters').click();
      await page.locator('#compare-enabled').check();
      await page.locator('#apply-filters').click();
      assert.ok(await page.locator('#growth-workspace [data-series="comparison"]').count());
      assert.ok(await page.locator('#resumo .performance-delta').count());
      await page.locator('#canais').screenshot({ path: path.join(output, `channels-${width}.png`) });
      await page.locator('[data-workspace="crm"]').click();
      for (const channel of ['whatsapp-oficial','email','whatsapp-organico','all']) {
        await page.locator(`[data-crm-tab="${channel}"]`).click();
        const current = await page.locator('#crm-summary-kpis .kpi > strong').allTextContents();
        await page.locator('#crm-open-filters').click();
        await page.locator('#crm-compare-enabled').uncheck();
        await page.locator('#crm-apply-filters').click();
        assert.equal(await page.locator('#crm-workspace .performance-delta:visible').count(), 0);
        assert.doesNotMatch(await page.locator('#crm-detail').innerText(), /Anterior:|Anterior \d|Comparativo observado|Comparacao fora/);
        assert.doesNotMatch(await page.locator('.crm-reconciliation-table thead').textContent(), /comparacao|Variacao/);
        assert.deepEqual(await page.locator('#crm-summary-kpis .kpi > strong').allTextContents(), current);
        await page.locator('#crm-open-filters').click();
        await page.locator('#crm-compare-enabled').check();
        await page.locator('#crm-apply-filters').click();
        assert.ok(await page.locator('#crm-summary-kpis .performance-delta').count());
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.locator('#crm-summary-kpis').screenshot({ path: path.join(output, `crm-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, viewports: 3, crmChannels: 4, comparison: 'off/on/cancel', sourceWrites: writes.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
