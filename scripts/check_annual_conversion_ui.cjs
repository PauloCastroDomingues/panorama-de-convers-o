const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const output = path.resolve(__dirname, '../output/rhythm');
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto(process.env.PANORAMA_URL || 'http://127.0.0.1:8021');
    await page.waitForFunction(() => !document.body.classList.contains('is-loading') && !!state.growthPayload);
    await page.locator('#open-filters').click();
    await page.locator('#date-start').fill('2026-01-01');
    await page.locator('#date-end').fill('2026-10-28');
    await page.locator('#compare-enabled').check();
    await page.locator('#compare-mode').selectOption('previous');
    await page.locator('#apply-filters').click();
    await page.locator('#rhythm-metric').selectOption('rate');
    assert.match(await page.locator('#rhythm-coverage').innerText(), /Periodos com taxa valida: 10 de 10/);
    const snapshot = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/ssot-commercial-channels.json'), 'utf8'));
    const source = snapshot.paid_channel_totals.rows.filter(row => row.data >= '2026-01-01' && row.data <= '2026-10-28');
    const expected = source.reduce((total, row) => ({ orders: total.orders + row.pedidos, sessions: total.sessions + row.sessoes }), { orders: 0, sessions: 0 });
    const actual = await page.evaluate(() => ({
      total: summarize(selectedPaidRows('current')),
      months: pairedPeriods(selectedPaidRows('current'), selectedPaidRows('compare'), state.selectedGranularity).map(row => ({ key: row.key, rate: row.rate, previous: row.compare?.rate })),
      groups: allChannelGroups('current').map(row => ({ key: row.key, orders: row.pedidos, sessions: row.sessoes, rate: row.rate }))
    }));
    assert.equal(actual.total.pedidos, expected.orders);
    assert.equal(actual.total.sessoes, expected.sessions);
    assert.equal(actual.total.rate, expected.orders / expected.sessions);
    assert.equal(actual.months.filter(row => Number.isFinite(row.rate)).length, 10);
    assert.equal(actual.months.filter(row => Number.isFinite(row.previous)).length, 0);
    assert.equal(actual.groups.find(row => row.key === 'Total pago (Facebook + Google)').rate, actual.total.rate);
    for (const month of actual.months) {
      const rows = source.filter(row => row.data.startsWith(month.key.slice(0, 7)));
      assert.equal(month.rate, rows.reduce((sum, row) => sum + row.pedidos, 0) / rows.reduce((sum, row) => sum + row.sessoes, 0));
    }
    await page.locator('#rhythm-coverage summary').click();
    assert.match(await page.locator('#rhythm-coverage').innerText(), /Comparacao.*sem sessoes/);
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.locator('#rhythm-chart svg').count(), 1);
      assert.equal(await page.locator('#rhythm-chart .period-bar').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.locator('#ritmo').screenshot({ path: path.join(output, `annual-conversion-${width}.png`) });
    }
    await page.locator('#rhythm-metric').selectOption('pedidos');
    assert.equal(await page.locator('#rhythm-coverage').isVisible(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, ...expected, rate: actual.total.rate, months: actual.months, viewports: 3, sourceWrites: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
