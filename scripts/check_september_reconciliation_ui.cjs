const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const output = path.resolve(__dirname, '../output/reconciliation');
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto(process.env.PANORAMA_URL || 'http://127.0.0.1:8023');
    await page.waitForFunction(() => !document.body.classList.contains('is-loading') && !!state.growthPayload);
    await page.locator('#open-filters').click();
    await page.locator('#date-start').fill('2026-09-01');
    await page.locator('#date-end').fill('2026-09-30');
    await page.locator('#compare-enabled').check();
    await page.locator('#apply-filters').click();
    const rows = await page.evaluate(() => allChannelGroups('current'));
    const expected = {
      'Meta Ads 1': [830, 150268, 688024.08],
      'Meta Ads 2': [56, 8529, 43550.21],
      'Facebook (1 + 2)': [886, 158797, 731574.29],
      'Google ADS': [769, 79248, 502469.58],
      'Total pago (Facebook + Google)': [1655, 238045, 1234043.87],
    };
    for (const row of rows) {
      const [orders, sessions, revenue] = expected[row.key];
      assert.equal(row.pedidos, orders, row.key);
      assert.equal(row.sessoes, sessions, row.key);
      assert.ok(Math.abs(row.receita - revenue) < .00001, row.key);
    }
    const meta = rows.find(row => row.key === 'Meta Ads 2');
    assert.equal(meta.rate, null);
    assert.equal(meta.observedRate, 56 / 8529);
    assert.equal(meta.observedDays, 29);
    assert.equal(meta.expectedDays, 30);
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      const row = page.locator('#channel-body tr').filter({ has: page.locator('[data-channel="Meta Ads 2"]') });
      assert.match(await row.innerText(), /0,66%/);
      assert.match(await row.innerText(), /Parcial: 29\/30 dias completos/);
      assert.match(await row.innerText(), /Validar base/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.locator('#canais').screenshot({ path: path.join(output, `september-${width}.png`) });
    }
    await page.locator('#open-filters').click();
    await page.locator('#compare-enabled').uncheck();
    await page.locator('#apply-filters').click();
    assert.match(await page.locator('#channel-body').innerText(), /Parcial: 29\/30 dias completos/);
    assert.doesNotMatch(await page.locator('#channel-body').innerText(), /Anterior:/);
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, expected, partialMetaRate: meta.observedRate, viewports: 3, writes: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
