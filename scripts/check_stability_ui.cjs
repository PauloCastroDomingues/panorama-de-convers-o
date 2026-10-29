const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const commercial = require('../data/ssot-commercial-channels.json');
const ssot = require('../assets/crm-sendflow.js');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8021';
const output = path.resolve(__dirname, '../output/stability');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], writes = [], timing = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#crm-open-filters')?.disabled === false && !document.body.classList.contains('is-loading'));
    await page.evaluate(() => document.fonts.ready);
    const last = ssot.availableDates(commercial).at(-1);
    for (const channel of ['email', 'whatsapp-oficial', 'whatsapp-organico']) {
      await page.locator('[data-workspace="crm"]').click();
      await page.locator(`[data-crm-tab="${channel}"]`).click();
      await page.locator('#crm-open-filters').click();
      await page.locator('#crm-date-start').fill(last);
      await page.locator('#crm-date-end').fill(last);
      await page.locator('#crm-apply-filters').click();
      const actual = await page.locator('#crm-summary-kpis .kpi > strong').allTextContents();
      const expected = ssot.commercial(commercial, channel, last, last);
      assert.ok(actual.includes(new Intl.NumberFormat('pt-BR').format(expected.sessions)), `${channel}: sessions must match SSOT`);
      assert.ok(actual.includes(new Intl.NumberFormat('pt-BR').format(expected.orders)), `${channel}: orders must match SSOT`);
      assert.ok(actual.includes(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expected.revenue).replace(/\s/g, ' ')) || actual.some(value => value.replace(/\s/g, '') === new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expected.revenue).replace(/\s/g, '')));
    }
    await page.locator('[data-workspace="growth"]').click();
    const scope = await page.evaluate(() => {
      const sample = productCatalog().find(product => normalizedViewRows('channel_product').some(row => row.productKey === product.productKey && row.data === state.end && row.pedidos > 0));
      state.selectedProduct = sample.productKey;
      const start = performance.now(); renderAll();
      const actual = summarize(selectedPaidRows('current'));
      const expected = summarize(normalizedViewRows('channel_product').filter(row => row.productKey === sample.productKey && inPeriod(row, 'current') && isAnalysisRow(row)));
      return { actual, expected, milliseconds: Math.round(performance.now() - start) };
    });
    assert.deepEqual(scope.actual, scope.expected);
    timing.push({ productFilterMs: scope.milliseconds });
    const stableMetrics = await page.locator('#resumo .kpi > strong').allTextContents();
    let growthReads = 0;
    page.on('request', request => { if (request.url().includes('data/ssot-growth-views.json')) growthReads++; });
    const shared = await page.evaluate(async () => {
      const one = loadData({ background: true }), two = loadData({ background: true });
      const same = one === two;
      await Promise.all([one, two]);
      return same;
    });
    assert.equal(shared, true, 'Concurrent updates share one read');
    assert.equal(growthReads, 1);
    assert.deepEqual(await page.locator('#resumo .kpi > strong').allTextContents(), stableMetrics);
    await page.route('**/data/ssot-growth-views.json', route => route.abort());
    await page.route('**/data/ssot-commercial-channels.json', route => route.abort());
    await page.route('https://script.google.com/**', route => route.abort());
    await page.evaluate(() => loadData({ background: true }));
    assert.deepEqual(await page.locator('#resumo .kpi > strong').allTextContents(), stableMetrics, 'A failed reload cannot erase the current product data');
    assert.equal(await page.evaluate(() => !!state.growthPayload), true);
    await page.unroute('**/data/ssot-growth-views.json');
    await page.unroute('**/data/ssot-commercial-channels.json');
    await page.evaluate(() => { state.selectedProduct = ''; renderAll(); });
    await page.locator('#open-filters').click();
    await page.locator('#date-start').fill('2026-10-26');
    const beforeDraftRefresh = growthReads;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('panorama:data-refreshed')));
    await page.waitForTimeout(200);
    assert.equal(growthReads, beforeDraftRefresh, 'Refresh waits while the filter draft is open');
    assert.equal(await page.locator('#date-start').inputValue(), '2026-10-26');
    await page.locator('#cancel-filters').click();
    await page.waitForFunction(() => growthLoadPromise === null);
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const workspace of ['growth', 'crm']) {
        await page.locator(`[data-workspace="${workspace}"]`).click();
        await page.locator(`#${workspace}-workspace`).waitFor({ state: 'visible' });
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({ path: path.join(output, `${workspace}-${width}.png`) });
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, crmChannels: 3, sourceWrites: writes.length, viewports: 3, timing, checks: ['SSOT totals', 'product scope', 'concurrent refresh', 'offline retention', 'draft preservation'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
