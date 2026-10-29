const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = path.resolve(__dirname, '../output/crm-sticky');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], writes = [], measurements = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto((process.env.PANORAMA_URL || 'http://127.0.0.1:8021') + '/#crm');
    await page.waitForFunction(() => document.querySelector('#crm-open-filters')?.disabled === false && !document.body.classList.contains('is-loading'));
    await page.evaluate(() => document.fonts.ready);
    for (const width of [2560, 1920, 1440, 820, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('[data-workspace="crm"]').click();
      await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
      await page.waitForFunction(() => {
        const bar = document.querySelector('#crm-analysis-bar').getBoundingClientRect();
        const nav = document.querySelector('.workspace-tabs').getBoundingClientRect();
        return Math.abs(bar.top) < 2 && nav.bottom < 0;
      });
      const measure = await page.evaluate(() => {
        const bar = document.querySelector('#crm-analysis-bar').getBoundingClientRect();
        const button = document.querySelector('#crm-open-filters').getBoundingClientRect();
        const tabs = document.querySelector('#crm-channel-tabs').getBoundingClientRect();
        const hit = document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2);
        return { width: innerWidth, top: bar.top, height: bar.height, overflow: document.documentElement.scrollWidth > innerWidth + 1,
          aligned: Math.abs((button.top + button.height / 2) - (tabs.top + tabs.height / 2)) < 8,
          clickable: !!hit.closest('#crm-open-filters') };
      });
      assert.equal(measure.overflow, false); assert.equal(measure.aligned, true); assert.equal(measure.clickable, true);
      assert.ok(measure.height < 125, 'Sticky controls stay compact'); measurements.push(measure);
      const filters = page.locator('#crm-open-filters');
      await filters.click();
      await page.locator('#crm-channel-filter').selectOption('email');
      await page.locator('#crm-apply-filters').click();
      assert.equal(await page.locator('[data-crm-tab="email"]').getAttribute('aria-selected'), 'true');
      await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
      await page.locator('[data-crm-tab="email"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-crm-tab="whatsapp-organico"]').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('[data-crm-tab="whatsapp-organico"]').evaluate(el => el === document.activeElement), true);
      assert.ok(await page.evaluate(() => scrollY > 250), 'Channel switch must not require scrolling to top');
      await page.locator('[data-crm-tab="whatsapp-oficial"]').click();
      assert.equal(await page.locator('#crm-channel-filter').inputValue(), 'whatsapp-oficial');
      assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(), 1);
      await filters.click();
      await page.locator('#crm-compare-enabled').uncheck();
      await page.locator('#crm-apply-filters').click();
      assert.equal(await page.locator('#crm-filter-summary-comparison').textContent(), 'Sem comparacao');
      await filters.click();
      await page.locator('#crm-compare-enabled').check();
      await page.locator('#crm-apply-filters').click();
      await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
      await page.screenshot({ path: path.join(output, `scrolled-${width}.png`) });
      await page.locator('[data-workspace="growth"]').click();
      assert.equal(await page.locator('#crm-analysis-bar').isVisible(), false);
      await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
      await page.waitForFunction(() => {
        const bar = document.querySelector('#growth-workspace > .unified-filterbar').getBoundingClientRect();
        const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--analysis-bar-height'));
        return Math.abs(bar.top) < 2 && Math.abs(bar.height - offset) < 2 && document.querySelector('.workspace-tabs').getBoundingClientRect().bottom < 0;
      });
      await page.locator('#open-filters').click();
      await page.locator('#global-channel-filter').selectOption('group-google');
      await page.locator('#apply-filters').click();
      assert.match(await page.locator('#filter-summary-scope').textContent(), /Google/);
      assert.ok(await page.evaluate(() => scrollY > 250), 'Growth filters work without returning to the header');
      await page.screenshot({ path: path.join(output, `growth-scrolled-${width}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ok: true, measurements, keyboard: true, filtersAtScroll: true, sourceWrites: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
