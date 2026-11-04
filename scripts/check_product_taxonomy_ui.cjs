const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8025';
const output = path.resolve(__dirname, '../output/product-taxonomy');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  const errors = [], writes = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!['GET','HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto(base);
    await page.waitForFunction(() => !document.body.classList.contains('is-loading') && !!state.growthPayload);
    await page.evaluate(() => {
      state.start='2026-10-01'; state.end='2026-10-29';
      state.compareStart='2026-09-02'; state.compareEnd='2026-09-30';
      state.compareMode='custom'; state.selectedView='product';
      renderAll();
    });
    for (const width of [1440,820,390]) {
      await page.setViewportSize({width,height:1000});
      await page.locator('#open-filters').click();
      await page.locator('#product-type-filter').selectOption('Tenis');
      await page.locator('#product-line-filter').selectOption('GT');
      await page.locator('#global-channel-filter').selectOption('group-google');
      await page.locator('#product-type-filter').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,'filters-'+width+'.png')});
      assert.equal(await page.locator('#growth-filter-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
      assert.equal(await page.locator('#product-type-filter').evaluate(el=>el.getBoundingClientRect().width>100),true);
      assert.equal(await page.evaluate(()=>state.selectedProductType), width === 1440 ? '' : 'Tenis', 'Draft does not apply prematurely');
      await page.locator('#apply-filters').click();
      const applied = await page.evaluate(()=>{
        const rows=selectedPaidRows('current');
        const records=recordsForDisplay(VIEWS.find(v=>v.key==='product')).records;
        return { count:rows.length, valid:rows.every(r=>r.productType==='Tenis'&&r.productLine==='GT'&&r.canal==='Google ADS'),
          total:summarize(rows).pedidos, table:records.reduce((s,r)=>s+(r.pedidos||0),0),
          snapshot:JSON.stringify(snapshotFilters()) };
      });
      assert.ok(applied.count>0);
      assert.equal(applied.valid,true);
      assert.equal(applied.total,applied.table);
      assert.match(await page.locator('#filter-summary-scope').innerText(),/Tipo: Tenis.*Linha: GT.*Google/);
      await page.locator('#growth-views').screenshot({path:path.join(output,'products-'+width+'.png')});
      await page.locator('#open-filters').click();
      await page.locator('#product-line-filter').selectOption('Avant');
      await page.locator('#cancel-filters').click();
      assert.equal(await page.evaluate(()=>JSON.stringify(snapshotFilters())),applied.snapshot);
      await page.locator('#open-filters').click();
      await page.locator('#product-line-filter').selectOption('');
      await page.locator('#product-type-filter').selectOption('Mochilas');
      assert.equal(await page.locator('#product-line-filter option[value="GT"]').isDisabled(),true);
      await page.locator('#apply-filters').click();
      assert.equal(await page.evaluate(()=>selectedPaidRows('current').every(r=>r.productType==='Mochilas')),true);
      await page.locator('#open-filters').click();
      await page.locator('#product-type-filter').selectOption('Tenis');
      await page.locator('#apply-filters').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      console.log('Taxonomy UI passed at '+width+'px');
    }
    await page.locator('#open-filters').click();
    await page.locator('#clear-filters').click();
    assert.deepEqual(await page.evaluate(()=>[filterDraft.values.selectedProductType,filterDraft.values.selectedProductLine]),['','']);
    await page.locator('#cancel-filters').click();
    assert.equal(await page.evaluate(()=>state.selectedProductType),'Tenis');
    assert.deepEqual(errors,[]);
    assert.deepEqual(writes,[]);
    console.log(JSON.stringify({ok:true,viewports:3,sourceWrites:0,checks:'real data, shared totals, draft/apply/cancel/clear, dependent options, layout'}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
