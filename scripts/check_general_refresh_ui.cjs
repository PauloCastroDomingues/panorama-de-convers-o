const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8021';
const liveManifest = require('../data/data-refresh-status.json');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [];
  try {
    const api = await browser.newContext();
    assert.equal((await api.request.get(base + '/')).status(), 200);
    assert.equal((await api.request.get(base + '/.local/reauth_google.py')).status(), 404);
    assert.equal((await api.request.get(base + '/assets/%2e%2e/scripts/serve_local.py')).status(), 404);
    assert.equal((await api.request.post(base + '/api/local-refresh', { headers: { Origin: 'https://example.com', 'X-Panorama-Refresh': '1' } })).status(), 403);
    fs.mkdirSync('output/general-refresh', { recursive: true });
    for (const width of [1440, 820, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base + '/#crm', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#crm-date-start').value && !document.body.classList.contains('is-loading') && getComputedStyle(document.querySelector('#data-loader')).visibility === 'hidden');
      await page.locator('#base-refresh-summary').click();
      assert.equal(await page.locator('#base-refresh-body tr').count(), 5);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No page-level horizontal overflow');
      await page.screenshot({ path: `output/general-refresh/crm-${width}.png` });
      await page.locator('[data-workspace="growth"]').click();
      await page.screenshot({ path: `output/general-refresh/growth-${width}.png` });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let reads = 0, posts = 0, current = structuredClone(liveManifest);
    const response = (route, value) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    await page.route('**/data/data-refresh-status.json', (route) => response(route, current));
    await page.route('**/api/local-refresh', (route) => {
      if (route.request().method() === 'POST') {
        posts++;
        current = { ...current, runId: 'test-new-run', finishedAt: new Date().toISOString() };
      }
      return response(route, { available: true, started: true, running: false });
    });
    page.on('request', (request) => { if (request.url().includes('/data/ssot-commercial-channels.json')) reads++; });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/#crm', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#crm-date-start').value && !document.body.classList.contains('is-loading'));
    await page.locator('#crm-open-filters').click();
    await page.locator('#crm-date-start').fill('2026-10-26');
    await page.locator('#crm-date-end').fill('2026-10-27');
    await page.locator('#crm-apply-filters').click();
    await page.evaluate(() => {
      document.querySelector('#period-preset').value = 'custom';
      state.start = '2026-10-25'; state.end = '2026-10-27';
      state.compareMode = 'custom'; state.compareStart = '2026-10-20'; state.compareEnd = '2026-10-22';
    });
    const before = reads;
    await page.locator('#crm-refresh').click();
    await page.waitForFunction(() => !document.querySelector('#crm-refresh').disabled && !document.body.classList.contains('is-loading'));
    await page.waitForTimeout(1000);
    assert.equal(posts, 1, 'CRM button triggers the shared refresh');
    assert.ok(reads >= before + 2, 'Both Growth and CRM reread commercial snapshot');
    assert.equal(await page.locator('#crm-date-start').inputValue(), '2026-10-26');
    assert.equal(await page.evaluate(() => state.start), '2026-10-25');
    assert.equal(await page.evaluate(() => state.compareStart), '2026-10-20');
    assert.deepEqual(errors, []);
    console.log('General refresh: live desktop/tablet/mobile screenshots; same-origin guard; private files blocked; mocked shared refresh and filter preservation passed.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
