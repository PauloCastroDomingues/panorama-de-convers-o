const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const pilot = require('./fixtures/rd-pilot-20261028.json');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const output = path.resolve(__dirname, '../output/rd-bridge-qa');
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  let mode = 'live';
  // Only the clock and transport are test fixtures; campaign counters are the real pilot.
  const live = { ...pilot, source: { ...pilot.source, mode: 'auxiliary_sheet', observedAt: '2026-10-28T19:21:41Z' } };
  const setup = async (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/data/crm-rd-config.json', (route) => route.fulfill({ json: { endpoint: '/api/crm-rd', accountId: '832517' } }));
    await page.route('**/api/crm-rd', (route) => {
      if (mode === 'offline') return route.fulfill({ status: 502, json: { ok: false } });
      if (mode === 'wrong-account') return route.fulfill({ json: { ...live, source: { ...live.source, accountId: 'other-account' } } });
      if (mode === 'older') return route.fulfill({ json: { ...live, source: { ...live.source, observedAt: '2026-10-28T10:00:00Z' } } });
      return route.fulfill({ json: live });
    });
  };
  const ready = async (page) => {
    await page.locator('.crm-rd-report').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.body.classList.contains('is-loading'), { timeout: 30000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#data-loader')).visibility === 'hidden');
    await page.evaluate(() => document.fonts.ready);
  };
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setup(page);
    await page.goto('http://127.0.0.1:8020/?crmChannel=email#crm', { waitUntil: 'domcontentloaded' });
    await ready(page);
    assert.match(await page.locator('.crm-sendflow-source').innerText(), /Base auxiliar conectada/);
    assert.deepEqual(await page.locator('.crm-rd-report .kpi strong').allTextContents(), ['25', '20', '5', '1.765']);
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.locator('.crm-rd-report').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no page overflow`);
      await page.locator('.crm-rd-report').screenshot({ path: path.join(output, `live-${name}.png`) });
    }
    for (const failure of ['offline', 'older', 'wrong-account']) {
      mode = failure;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready(page);
      assert.match(await page.locator('.crm-sendflow-source').innerText(), /Ultima leitura valida/);
      assert.match(await page.locator('.crm-rd-read-warning').innerText(), /sem atualizacao confirmada/);
      assert.match(await page.locator('.crm-sendflow-source').innerText(), /16:21/);
      assert.equal(await page.locator('.crm-rd-report .kpi strong').first().innerText(), '25');
    }
    await page.locator('.crm-rd-report').screenshot({ path: path.join(output, 'cached-mobile.png') });
    await context.close();
    const freshContext = await browser.newContext();
    const fresh = await freshContext.newPage();
    await setup(fresh);
    await fresh.goto('http://127.0.0.1:8020/?crmChannel=email#crm', { waitUntil: 'domcontentloaded' });
    await ready(fresh);
    assert.match(await fresh.locator('.crm-sendflow-source').innerText(), /Snapshot local/);
    assert.match(await fresh.locator('.crm-rd-read-warning').innerText(), /Conta RD diferente/);
    mode = 'older';
    await fresh.reload({ waitUntil: 'domcontentloaded' });
    await ready(fresh);
    assert.match(await fresh.locator('.crm-sendflow-source').innerText(), /Snapshot local/);
    assert.match(await fresh.locator('.crm-rd-read-warning').innerText(), /nao substitui/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', realCampaigns: 25, bridge: 'mock transport only', viewports: ['desktop', 'tablet', 'mobile'], checks: ['live read', 'offline cache', 'no clock rollback', 'account mismatch', 'packaged fallback'], errors }));
    await freshContext.close();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
