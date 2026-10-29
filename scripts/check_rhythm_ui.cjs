const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = path.resolve(__dirname, '../output/rhythm');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], writes = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET','HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto(process.env.PANORAMA_URL || 'http://127.0.0.1:8021');
    await page.waitForFunction(() => !document.body.classList.contains('is-loading') && !!state.growthPayload);
    await page.evaluate(() => document.fonts.ready);
    const periods = [
      ['2026-10-28','2026-10-28','day'],
      ['2026-10-26','2026-10-28','day'],
      ['2026-10-01','2026-10-31','day'],
      ['2026-08-01','2026-10-28','week'],
      ['2026-07-01','2026-12-31','month'],
      ['2026-01-01','2026-12-31','month'],
      ['2025-01-01','2026-12-31','quarter'],
      ['2024-01-01','2026-12-31','year'],
    ];
    const setPeriod = async (start, end) => {
      await page.locator('#open-filters').click();
      await page.locator('#date-start').fill(start);
      await page.locator('#date-end').fill(end);
      await page.locator('#compare-enabled').check();
      await page.locator('#compare-mode').selectOption('previous');
      await page.locator('#apply-filters').click();
    };
    assert.equal(await page.locator('[data-granularity], #filter-granularity').count(), 0, 'Only the global period controls the chart');
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const [start, end, granularity] of periods) {
        await setPeriod(start, end);
        assert.equal(await page.locator('#rhythm-chart svg').count(), 1);
        assert.equal(await page.locator('#rhythm-chart path[data-series]').count(), 2);
        assert.equal(await page.locator('#rhythm-chart .period-bar').count(), 0);
        const actual = await page.evaluate(() => {
          const pairs = pairedPeriods(selectedPaidRows('current'),selectedPaidRows('compare'),state.selectedGranularity);
          return { start: state.start, end: state.end, granularity: state.selectedGranularity, buckets: pairs.length,
            total: sum(pairs.map(row=>row.pedidos)), expected: summarize(selectedPaidRows('current')).pedidos };
        });
        assert.equal(actual.start, start); assert.equal(actual.end, end);
        assert.equal(actual.granularity, granularity);
        assert.equal(await page.locator('#rhythm-body tr').count(), actual.buckets, 'No leading periods silently dropped');
        assert.equal(actual.total, actual.expected, 'Rhythm totals cover the same global scope');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        const controls = await page.locator('.rhythm-toolbar').evaluate(element => {
          const boxes = [...element.children].map(node => node.getBoundingClientRect());
          return boxes.every((box,i) => boxes.slice(i+1).every(other => box.right <= other.left + 1 || other.right <= box.left + 1 || box.bottom <= other.top + 1 || other.bottom <= box.top + 1));
        });
        assert.equal(controls, true, 'Period text must not overlap controls');
      }
      await setPeriod('2026-10-26','2026-10-28');
      assert.equal(await page.locator('#rhythm-body tr').count(), 3);
      assert.equal(await page.locator('#last-week-value').innerText(), '215');
      assert.match(await page.locator('#last-week-label').innerText(), /26\/10\/26 a 28\/10\/26 \(parcial\)/);
      await page.locator('#ritmo').screenshot({ path: path.join(output, `automatic-${width}.png`) });
    }
    await page.locator('#open-filters').click();
    await page.locator('#compare-enabled').uncheck();
    await page.locator('#apply-filters').click();
    assert.equal(await page.locator('#rhythm-chart path[data-series="current"]').count(), 1);
    assert.equal(await page.locator('#rhythm-chart [data-series="comparison"]').count(), 0);
    assert.equal(await page.locator('#last-week-note').innerText(), '');
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, dateWindows: periods.length, viewports: 3, automaticScale: true, sourceWrites: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
