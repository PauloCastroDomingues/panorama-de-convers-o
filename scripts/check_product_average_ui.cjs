const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    fs.mkdirSync('output/product-average',{recursive:true});
    await page.goto('http://127.0.0.1:8025/');
    await page.waitForFunction(()=>state.growthPayload?.ok&&!document.body.classList.contains('is-loading'), null, {timeout:60000});
    await page.locator('#open-filters').click();
    await page.locator('#date-start').fill('2026-10-26');
    await page.locator('#date-end').fill('2026-10-29');
    await page.locator('#compare-mode').selectOption('custom');
    await page.locator('#compare-start').fill('2026-10-22');
    await page.locator('#compare-end').fill('2026-10-25');
    await page.locator('#apply-filters').click();
    const ref=await page.evaluate(()=>{
      const id='_enis_asual_ranco_8_vant';
      const history=state.growthViewMap.get('channel_product').rows.filter(r=>r.product_id===id&&r.data<='2026-10-29'&&['Meta Ads','Google Ads'].includes(r.canal));
      const calc=rows=>{
        if(!rows.length||!rows.every(r=>r.pedidos!=null&&r.sessoes!=null))throw Error('Incomplete reference');
        return rows.reduce((n,r)=>n+Number(r.pedidos),0)/rows.reduce((n,r)=>n+Number(r.sessoes),0);
      };
      return {name:history[0].produto,general:calc(history),current:calc(history.filter(r=>r.data>='2026-10-26')),
        meta:calc(history.filter(r=>r.canal==='Meta Ads')),google:calc(history.filter(r=>r.canal==='Google Ads'))};
    });
    const fmt=value=>new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
    for (const width of [1440, 900, 390, 320]) {
      await page.setViewportSize({width,height:1000});
      await page.locator('#growth-views').scrollIntoViewIfNeeded();
      await page.locator('#growth-views').evaluate(el=>window.scrollTo(0,el.offsetTop-110));
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const controls=await page.locator('#growth-views .explorer-toolbar').evaluate(el=>{
        const items=[...el.querySelectorAll('input,select,a')].map(item=>item.getBoundingClientRect());
        return items.every((a,i)=>items.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
      });
      assert.ok(controls,'Explorer controls must not overlap');
      if (width >= 900) {
        assert.ok(await page.locator('#growth-views > .table-scroll').evaluate(el=>
          el.querySelector('th[data-column="averageRate"]').getBoundingClientRect().right <= el.getBoundingClientRect().right + 1),
        'The average column must be visible beside conversion on desktop');
      }
      await page.screenshot({path:`output/product-average/dense-${width}.png`});
    }
    await page.locator('.product-filter-shortcut').click();
    assert.equal(await page.locator('#growth-filter-dialog').isVisible(),true);
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:1440,height:1000});
    const row=()=>page.locator('#explorer-body tr').filter({hasText:ref.name});
    async function search(){
      await page.locator('#explorer-search').fill(ref.name);
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
    }
    await search();
    const headers=await page.locator('#explorer-head th').allTextContents();
    const conversion=headers.findIndex(v=>v.startsWith('Conversao'));
    assert.ok(headers[conversion+1].startsWith('Média de conversão'));
    assert.equal(await row().count(),1);
    assert.equal(await row().locator('.product-average-value strong').innerText(),fmt(ref.general));
    assert.ok((await row().locator('td').nth(conversion).innerText()).startsWith(fmt(ref.current)));
    assert.notEqual(fmt(ref.general),fmt(ref.current));
    assert.equal(await row().locator('.average-kpi.bad').count(),1);
    assert.match(await row().locator('.average-kpi .semaphore').innerText(),/Abaixo da media/);
    assert.match(await row().locator('.average-gap').innerText(),/-0,22 p.p./);
    assert.equal(await page.locator('#product-conversion-overview').count(),0);
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1000});
      await row().locator('.product-average-cell').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`output/product-average/general-${width}.png`});
    }
    await row().locator('.product-average-cell .source-info').click();
    assert.match(await page.locator('#source-info-popover').innerText(),/inicio do filtro nao limita/);
    assert.ok(await page.evaluate(() => {
      const panel = document.querySelector('#source-info-popover').getBoundingClientRect();
      const trigger = document.querySelector('.source-info[aria-expanded="true"]').getBoundingClientRect();
      return panel.bottom <= trigger.top || panel.top >= trigger.bottom || panel.right <= trigger.left || panel.left >= trigger.right;
    }), 'Long source explanations must not cover the disclosure button');
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#explorer-level').selectOption('channel_product');
    assert.equal(await row().count(),2);
    assert.equal(await row().filter({hasText:'Facebook (1 + 2)'}).locator('.product-average-value strong').innerText(),fmt(ref.meta));
    assert.equal(await row().filter({hasText:'Google Ads'}).locator('.product-average-value strong').innerText(),fmt(ref.google));
    await row().first().scrollIntoViewIfNeeded();
    await page.screenshot({path:'output/product-average/by-channel.png'});
    await page.locator('#explorer-level').selectOption('product');
    await page.locator('#open-filters').click();
    await page.locator('#global-channel-filter').selectOption('group-google');
    await page.locator('#compare-enabled').uncheck();
    await page.locator('#apply-filters').click();
    await search();
    assert.equal(await page.locator('#explorer-level').inputValue(),'product');
    assert.equal(await row().count(),1);
    assert.equal(await row().locator('.product-average-value strong').innerText(),fmt(ref.google));
    assert.equal(await row().locator('.average-kpi.warn').count(),1,'Benchmark remains active with temporal comparison off');
    assert.doesNotMatch(await row().innerText(),/Anterior/);
    await page.locator('[data-explorer-sort="averageRate"]').click();
    assert.equal(await page.locator('#explorer-sort').inputValue(),'averageRate');
    assert.equal(await page.locator('[data-explorer-sort="averageRate"]').getAttribute('class'),'table-sort active');
    await page.locator('#explorer-level').selectOption('campaign');
    assert.equal(await page.locator('.product-average-cell').count(),0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,column:'Media de conversao',reference:ref,viewports:3,errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
