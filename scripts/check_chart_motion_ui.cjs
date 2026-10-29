const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8021';
const output = path.resolve(__dirname, '../output/chart-motion');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], writes = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/data/ssot-*.json', async route => { await gate; await route.continue(); });
    assert.equal((await page.goto(base + '/#growth', { waitUntil: 'domcontentloaded' })).status(), 200);
    const loader = page.locator('#data-loader');
    assert.ok(await loader.isVisible());
    await page.evaluate(() => document.fonts.ready);
    const firstTransform = await page.locator('.data-loader-track span').evaluate(n => getComputedStyle(n).transform);
    await page.waitForTimeout(150);
    assert.notEqual(await page.locator('.data-loader-track span').evaluate(n => getComputedStyle(n).transform), firstTransform, 'activity line moves during an actual pending read');
    assert.equal(await page.locator('.data-loader-panel').evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: path.join(output, 'loader-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'loader-mobile.png') });
    release();
    await loader.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const kpis = await page.locator('#resumo .kpi > strong').allTextContents();
    await page.locator('#open-filters').click();
    assert.equal(await page.locator('#growth-filter-dialog').evaluate(n => getComputedStyle(n).animationName), 'reise-drawer-in');
    await page.locator('#period-preset').selectOption('week');
    await page.locator('#apply-filters').click();
    assert.equal(await page.locator('#rhythm-chart svg').evaluate(n => getComputedStyle(n).animationName), 'reise-chart-in');
    const points = page.locator('#rhythm-chart [data-chart-label]');
    assert.ok(await points.count() > 2);
    assert.equal(await page.locator('#rhythm-chart [tabindex="0"]').count(), 1, 'one Tab stop per chart');
    await points.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await points.last().hover();
    assert.equal(await page.locator('#chart-tooltip').innerText(), await points.last().getAttribute('aria-label'));
    await points.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await points.nth(1).evaluate(n => n === document.activeElement), true);
    assert.equal(await page.locator('#chart-tooltip').innerText(), await points.nth(1).getAttribute('aria-label'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#chart-tooltip').isVisible(), false);
    await points.first().focus();
    await page.evaluate(() => renderRhythm());
    await page.waitForFunction(() => document.querySelector('#chart-tooltip').hidden);
    await page.locator('#ritmo').screenshot({ path: path.join(output, 'growth-rhythm.png'), animations: 'disabled' });
    await page.locator('#evolucao').screenshot({ path: path.join(output, 'growth-evolution.png'), animations: 'disabled' });

    await page.locator('[data-workspace="crm"]').click();
    for (const channel of ['email', 'whatsapp-oficial', 'whatsapp-organico']) {
      await page.locator(`[data-crm-tab="${channel}"]`).click();
      const values = await page.locator('#crm-summary-kpis .kpi > strong').allTextContents();
      for (const width of [1440, 820, 390, 320]) {
        await page.setViewportSize({ width, height: width > 400 ? 1000 : 844 });
        assert.equal(await page.locator('.crm-funnel-rate').evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await page.locator('.crm-funnel-rate strong').innerText(), values[3]);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.locator('[data-crm-view="conversion"]').screenshot({ path: path.join(output, `funnel-${channel}-${width}.png`), animations: 'disabled' });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const crmPoint = page.locator('.crm-artifact-chart [data-chart-label]').first();
      await crmPoint.scrollIntoViewIfNeeded();
      await crmPoint.focus();
      assert.equal(await page.locator('#chart-tooltip').innerText(), await crmPoint.getAttribute('aria-label'));
      await page.keyboard.press('Escape');
      await page.locator('[data-crm-view="pacing"]').screenshot({ path: path.join(output, `pacing-${channel}.png`), animations: 'disabled' });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-workspace="growth"]').click();
    assert.equal(await page.locator('#growth-workspace').evaluate(n => getComputedStyle(n).animationName), 'none');
    assert.equal(await page.locator('#rhythm-chart svg').evaluate(n => getComputedStyle(n).animationName), 'none');
    await page.locator('#open-filters').click();
    assert.equal(await page.locator('#growth-filter-dialog').evaluate(n => getComputedStyle(n).animationName), 'none');
    await page.locator('#period-preset').selectOption('current-day');
    await page.locator('#apply-filters').click();
    assert.deepEqual(await page.locator('#resumo .kpi > strong').allTextContents(), kpis, 'values do not animate or change with visual settings');
    await page.evaluate(() => showLoadingScreen());
    assert.equal(await page.locator('.data-loader-track span').evaluate(n => getComputedStyle(n).animationName), 'none');
    assert.equal(await page.evaluate(() => { hideLoadingScreen(); return !document.body.classList.contains('is-loading'); }), true, 'no artificial completion timer');

    const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    touch.on('pageerror', error => errors.push(error.message));
    await touch.goto(base + '/#crm', { waitUntil: 'domcontentloaded' });
    await touch.locator('#data-loader').waitFor({ state: 'hidden' });
    await touch.locator('[data-crm-tab="email"]').click();
    const bar = touch.locator('.crm-artifact-chart [data-chart-label]').first();
    await bar.scrollIntoViewIfNeeded();
    await bar.tap();
    assert.equal(await touch.locator('#chart-tooltip').innerText(), await bar.getAttribute('aria-label'));
    const box = await touch.locator('#chart-tooltip').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, 'touch tooltip remains in the viewport');
    await touch.screenshot({ path: path.join(output, 'chart-touch.png'), animations: 'disabled' });
    await touch.locator('#crm-workspace h1').tap();
    assert.equal(await touch.locator('#chart-tooltip').isVisible(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, funnel: 'transparent label, three channels and four widths', motion: 'short transitions, reduced-motion respected', loader: 'pending read verified, no added completion delay', charts: 'hover, keyboard, touch, dismissal, no extra Tab stops', sourceWrites: 0, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
