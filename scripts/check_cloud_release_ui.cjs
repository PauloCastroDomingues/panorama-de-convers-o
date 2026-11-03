const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {independentBundle: bundle, names} = require('./fixtures/cloud-release.cjs');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8024';
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  fs.mkdirSync('output/cloud-release', {recursive:true});
  const errors=[], writes=[], independentReads=[];
  let value = bundle(), reads = 0, broken = false;
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!['GET','HEAD'].includes(request.method())) writes.push(request.url());
      const name = new URL(request.url()).pathname.split('/').pop();
      if (names.includes(name) && name !== 'data-refresh-status.json') independentReads.push(name);
    });
    await page.route('**/assets/release-mode.js*', route => route.fulfill({contentType:'application/javascript', body:'window.PANORAMA_CLOUD_RELEASE = true;'}));
    await page.route('**/data/panorama-release.json', route => {
      reads++;
      return route.fulfill({contentType:'application/json', body:JSON.stringify(broken ? {schemaVersion:1} : value)});
    });
    await page.route('**/data/data-refresh-status.json', route => route.fulfill({contentType:'application/json', body:JSON.stringify(value.files['data-refresh-status.json'])}));
    await page.goto(base);
    await page.waitForFunction(() => !document.body.classList.contains('is-loading') && state.growthPayload?.marker === 'one');
    await page.locator('[data-workspace="crm"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#crm-channel-tabs button').length > 0);
    await page.locator('#crm-channel-tabs button').filter({hasText:'E-mail'}).click();
    await page.waitForFunction(() => document.querySelector('#crm-detail')?.textContent.includes('Lote publicado'));
    assert.equal(reads,1);
    await page.waitForFunction(() => document.querySelector('#base-refresh-body')?.textContent.includes('Consulta ate 02/11/2026'));
    assert.match(await page.locator('#base-refresh-body').textContent(), /Ultima ocorrencia:/);
    assert.match(await page.locator('#base-refresh-body').textContent(), /30\/09\/2026/);
    assert.match(await page.locator('#base-refresh-body').textContent(), /Atualizacao parcial/);
    for (const width of [1440,820,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:`output/cloud-release/simulated-${width}-crm.png`});
      await page.locator('#base-refresh-summary').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:`output/cloud-release/simulated-${width}-delivery.png`});
      await page.locator('#base-refresh-summary').click();
    }
    await page.locator('[data-workspace="growth"]').click();
    await page.evaluate(() => {state.start='2026-10-01';state.end='2026-10-29';document.querySelector('#period-preset').value='custom';renderAll();});
    const before = await page.evaluate(() => JSON.stringify({filters:snapshotFilters(),totals:summarize(selectedPaidRows('current'))}));
    broken = true;
    await page.evaluate(() => window.PanoramaRefresh.request());
    assert.match(await page.locator('#base-refresh-feedback').innerText(),/incompleto|invalido/);
    assert.equal(await page.evaluate(async () => (await PanoramaRelease.load()).releaseId),'one');
    value = bundle('two','2026-11-03T16:00:00-03:00'); broken = false;
    await page.evaluate(() => window.PanoramaRefresh.request());
    await page.waitForFunction(() => state.growthPayload?.marker === 'two');
    assert.equal(await page.evaluate(() => JSON.stringify({filters:snapshotFilters(),totals:summarize(selectedPaidRows('current'))})), before);
    await page.locator('[data-workspace="crm"]').click();
    assert.equal(await page.locator('#crm-channel-filter').inputValue(),'email');
    assert.deepEqual(independentReads,[]);
    assert.deepEqual(errors,[]); assert.deepEqual(writes,[]);
    console.log(JSON.stringify({ok:true,mode:'simulated release metadata; unchanged real metrics',viewports:[1440,820,390,320],reads,errors,writes,independentReads}));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
