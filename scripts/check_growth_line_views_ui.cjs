const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=path.resolve(__dirname,'../output/growth-line-views');
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const errors=[],writes=[];
  try {
    const page=await browser.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())) writes.push(r.url());});
    await page.goto(process.env.PANORAMA_URL||'http://127.0.0.1:8025');
    await page.waitForFunction(()=>!document.body.classList.contains('is-loading')&&!!state.growthPayload);
    await page.evaluate(()=>{
      state.start='2026-10-01';state.end='2026-10-29';
      state.compareStart='2026-09-02';state.compareEnd='2026-09-30';
      state.compareMode='custom';renderAll();
    });
    for(const width of [1440,820,390]){
      await page.setViewportSize({width,height:1000});
      for(const key of ['line','channel_line']){
        await page.locator('#explorer-level').selectOption(key);
        assert.match(await page.locator('#explorer-head').innerText(),/Linha/);
        assert.match(await page.locator('#explorer-body').innerText(),/Avant/);
        assert.match(await page.locator('#explorer-head').innerText(),/M.dia de convers.o/);
        const result=await page.evaluate(()=>{
          const view=VIEWS.find(v=>v.key===state.selectedView);
          const rows=viewRows(view,'current');
          const records=groups(view,'current');
          return {source:rows.reduce((s,r)=>s+(r.pedidos||0),0),
            grouped:records.reduce((s,r)=>s+(r.pedidos||0),0),
            unique:new Set(records.map(r=>r.key)).size===records.length,
            columns:explorerColumns(view).map(c=>c[1]),
            sourceRows:rows.length};
        });
        assert.ok(result.sourceRows>0);
        assert.equal(result.grouped,result.source);
        assert.equal(result.unique,true);
        assert.equal(result.columns.includes('channel'),key==='channel_line');
        await page.locator('#growth-views').screenshot({path:path.join(output,key+'-'+width+'.png')});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      }
      console.log('Line views UI: '+width+'px');
    }
    await page.setViewportSize({width:1440,height:1000});
    const unknown=page.locator('#explorer-body tr').filter({hasText:'Sem linha no nome'}).first();
    await unknown.locator('.line-products summary').click();
    assert.ok(await unknown.locator('.line-products li').count()>0);
    assert.match(await unknown.locator('.line-products ul').innerText(),/Sneaker Bag|Cadar|Limpador|Surpresa/);
    await unknown.screenshot({path:path.join(output,'unidentified-products.png')});
    await page.locator('#open-filters').click();
    assert.equal(await page.locator('#filter-view').inputValue(),'channel_line');
    await page.locator('#filter-view').selectOption('line');
    await page.locator('#product-line-filter').selectOption('Avant');
    await page.locator('#global-channel-filter').selectOption('group-google');
    await page.locator('#apply-filters').click();
    assert.equal(await page.locator('#explorer-level').inputValue(),'line');
    assert.equal(await page.locator('#explorer-body tr').count(),1);
    assert.match(await page.locator('#explorer-body').innerText(),/Avant/);
    await page.locator('#explorer-search').fill('avant');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#explorer-body tr').count(),1);
    await page.locator('#explorer-search').fill('');
    await page.waitForTimeout(300);
    assert.deepEqual(errors,[]);
    assert.deepEqual(writes,[]);
    console.log(JSON.stringify({ok:true,viewports:3,sourceWrites:0,checks:'selector, grouping, totals, column labels, mean, filters, search and layout'}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
