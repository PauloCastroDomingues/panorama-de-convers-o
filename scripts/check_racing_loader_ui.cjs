const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8023';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  fs.mkdirSync('output/racing-loader', { recursive: true });
  try {
    for (const width of [1440, 820, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      await page.route('**/data/*.json*', async route => { await pending; await route.continue(); });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => [...document.querySelectorAll('#data-loader img')].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await page.locator('#data-loader').isVisible(), true);
      const car = page.locator('.reise-loader-car');
      const road = page.locator('.reise-loader-road');
      const carBefore = await car.boundingBox();
      const before = await road.evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(300);
      assert.notEqual(await road.evaluate(el => getComputedStyle(el).transform), before);
      assert.deepEqual(await car.boundingBox(), carBefore, 'Car stays fixed while the road moves');
      assert.equal(await car.evaluate(el => el.getAnimations().length), 0);
      await road.evaluate(el => { for (const animation of el.getAnimations()) { animation.pause(); animation.currentTime = 240; } });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.reise-loader-wordmark').getAttribute('aria-label'), 'Reise');
      assert.equal(await page.locator('#data-loader-message').evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)');
      await page.screenshot({ path: `output/racing-loader/loading-${width}.png` });
      release();
      await page.waitForFunction(() => document.querySelector('#data-loader').classList.contains('is-complete'));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#data-loader')).visibility === 'hidden');
      assert.equal(await road.evaluate(el => el.getAnimations().length), 0);
      await page.evaluate(() => showLoadingScreen());
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#data-loader')).visibility === 'visible');
      assert.equal(await road.evaluate(el => el.getAnimations().length), 1);
      await page.evaluate(() => hideLoadingScreen());
      assert.deepEqual(errors, []);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(base);
    await page.waitForFunction(() => !document.body.classList.contains('is-loading') && !!state.growthPayload);
    await page.evaluate(() => showLoadingScreen());
    assert.equal(await page.locator('.reise-loader-road').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.screenshot({ path: 'output/racing-loader/reduced-motion.png' });
    await page.evaluate(() => hideLoadingScreen());
    console.log('Pixel loader: real initial loading, stationary top-down car, moving track, 4 widths, completion, replay and reduced motion passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
