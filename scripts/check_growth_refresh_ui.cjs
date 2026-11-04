const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  fs.mkdirSync('output/growth-refresh',{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const errors=[],posts=[];
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>errors.push(error.message));
    let configured=false, polls=0, conclusion='success', cooldown=false;
    // Simulated dispatch only: no GitHub mutation or real SSOT query.
    await page.route('**/api/growth-refresh*',async route=>{
      const request=route.request();
      if (!configured) return route.fulfill({status:503,json:{error:'refresh_not_configured'}});
      if(request.method()==='POST') {
        posts.push(request.headers());
        if(cooldown) return route.fulfill({json:{started:false,cooldown:true,retryAfter:120}});
        return route.fulfill({status:202,json:{started:true,run:{id:42,status:'queued'}}});
      }
      if(request.url().includes('runId=')) {
        polls++;
        return route.fulfill({json:{run:{id:42,status:polls===1?'in_progress':'completed',conclusion:polls===1?null:conclusion}}});
      }
      return route.fulfill({json:{available:true}});
    });
    await page.goto('http://127.0.0.1:8031');
    await page.waitForFunction(()=>state.growthPayload?.ok&&!document.body.classList.contains('is-loading'));
    await page.locator('#explorer-level').selectOption('product');
    const stamp=await page.evaluate(()=>viewEntry('channel_product').generatedAt);
    const expected=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(stamp));
    assert.ok((await page.locator('#growth-updated-at').innerText()).includes(expected));
    await page.locator('#reload-data').click();
    await page.waitForFunction(()=>!document.querySelector('#reload-data').disabled);
    assert.match(await page.locator('#growth-refresh-feedback').innerText(),/nao configurada/);
    for(const width of [1440,820,390]) {
      await page.setViewportSize({width,height:900});
      await page.locator('.top').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await page.screenshot({path:`output/growth-refresh/header-${width}.png`});
    }
    configured=true;
    await page.locator('#reload-data').click();
    await page.waitForFunction(()=>document.querySelector('#growth-refresh-feedback').textContent.includes('solicitada'));
    assert.equal(await page.locator('#reload-data').isDisabled(),true);
    assert.equal(posts.length,1);
    assert.equal(posts[0]['x-panorama-refresh'],'1');
    assert.equal(posts[0]['x-panorama-refresh-key'],undefined);
    assert.equal(await page.locator('#growth-refresh-key').count(),0);
    await page.waitForFunction(()=>!document.querySelector('#reload-data').disabled,{},{timeout:30000});
    assert.match(await page.locator('#growth-refresh-feedback').innerText(),/Sem nova coleta valida/);
    assert.ok((await page.locator('#growth-updated-at').innerText()).includes(expected));
    polls=1; conclusion='failure';
    await page.locator('#reload-data').click();
    await page.waitForFunction(()=>!document.querySelector('#reload-data').disabled,{},{timeout:30000});
    assert.match(await page.locator('#growth-refresh-feedback').innerText(),/nao concluiu com sucesso/);
    cooldown=true;
    await page.locator('#reload-data').click();
    await page.waitForFunction(()=>!document.querySelector('#reload-data').disabled,{},{timeout:30000});
    assert.match(await page.locator('#growth-refresh-feedback').innerText(),/Nova coleta disponivel em 2 min/);
    await page.locator('#explorer-level').selectOption('ad_group');
    const retained=await page.evaluate(()=>viewEntry('ad_group').generatedAt);
    assert.ok((await page.locator('#growth-updated-at').innerText()).includes(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(retained))));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,stamp,retained,viewports:3,dispatch:'simulated',posts:posts.length,errors}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
