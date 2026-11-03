const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PANORAMA_URL || 'https://panorama-de-conversao.vercel.app';
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const errors = [], writes = [];
  fs.mkdirSync('output/published-refresh', {recursive:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!['GET','HEAD'].includes(request.method())) writes.push(request.method());
    });
    const response = await page.goto(base);
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.PanoramaRelease?.enabled && state.growthPayload?.ok
      && !document.body.classList.contains('is-loading'), null, {timeout:60000});
    const result = await page.evaluate(async () => {
      const release = await PanoramaRelease.load();
      const status = release.files['data-refresh-status.json'];
      return {releaseId:release.releaseId, policy:status.publicationPolicy, target:status.targetDate,
        sources:status.sources.map(({id,status,latestDate,retained}) => ({id,status,latestDate,retained})),
        rows:state.rows.length, end:state.end};
    });
    assert.equal(result.policy, 'independent_sources');
    assert.ok(result.rows > 0);
    assert.equal(result.end, result.target);
    for (const width of [1440,820,390]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({path:`output/published-refresh/real-${width}-growth.png`});
    }
    await page.locator('#base-refresh-summary').click();
    await page.screenshot({path:'output/published-refresh/real-390-sources.png'});
    await page.locator('#base-refresh-summary').click();
    await page.locator('[data-workspace="crm"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#crm-channel-tabs button').length > 0);
    await page.locator('#crm-channel-tabs button').filter({hasText:'E-mail'}).click();
    await page.waitForFunction(() => document.querySelector('#crm-detail')?.textContent.includes('Lote publicado'));
    await page.screenshot({path:'output/published-refresh/real-390-crm.png'});
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ok:true,mode:'real published data; no interception', ...result, errors,writes}));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
