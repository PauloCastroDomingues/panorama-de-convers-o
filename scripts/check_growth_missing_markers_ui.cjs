const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  fs.mkdirSync('output/growth-missing-data', {recursive:true});
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const errors = [], writes = [];
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (!['GET','HEAD'].includes(request.method())) writes.push(request.url());});
    await page.goto(process.env.PANORAMA_URL || 'http://127.0.0.1:8031');
    await page.waitForFunction(() => state.growthPayload?.ok && !document.body.classList.contains('is-loading'));
    await page.evaluate(() => {
      state.start='2026-11-03'; state.end='2026-11-03';
      state.compareStart='2026-11-02'; state.compareEnd='2026-11-02';
      state.compareMode='custom'; state.compareEnabled=true;
      state.selectedView='product'; renderAll();
    });
    await page.locator('#explorer-search').fill('Munich');
    await page.waitForTimeout(350);
    await page.locator('#explorer-search').press('Escape');
    const row=page.locator('#explorer-body tr').filter({hasText:'Munich'}).first();
    assert.match(await row.innerText(), /943/);
    assert.match(await row.innerText(), /2\.804,97/);
    assert.doesNotMatch(await row.innerText(), /Sem registro neste filtro|Nao calculavel|-100/);
    assert.ok(await row.locator('.metric-unavailable').count() >= 4);
    for (const width of [1440,820,390]) {
      await page.setViewportSize({width,height:1000});
      await row.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1),true);
      await page.screenshot({path:`output/growth-missing-data/compact-${width}.png`});
      await row.locator('.metric-unavailable .source-info').first().click();
      const popup=page.locator('#source-info-popover');
      await page.waitForFunction(() => !document.querySelector('#source-info-popover').hidden);
      assert.match(await popup.innerText(), /03\/11\/26/);
      assert.match(await popup.innerText(), /zero/);
      const box=await popup.boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width+1);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(writes,[]);
    console.log(JSON.stringify({ok:true,dates:['2026-11-03','2026-11-02'],viewports:[1440,820,390],errors,writes}));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
