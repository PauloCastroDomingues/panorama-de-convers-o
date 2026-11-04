const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8024';
(async () => {
  // Exercise local code with the actual immutable published bundle, not fabricated metrics.
  const response = await fetch(process.env.PANORAMA_BUNDLE_URL || 'https://panorama-de-conversao.vercel.app/data/panorama-release.json');
  assert.equal(response.status, 200);
  const bundle = await response.json();
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const errors = [], writes = [];
  fs.mkdirSync('output/growth-missing-data', {recursive:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (!['GET','HEAD'].includes(request.method())) writes.push(request.method());});
    await page.route('**/assets/release-mode.js*', route => route.fulfill({contentType:'text/javascript',body:'window.PANORAMA_CLOUD_RELEASE=true;'}));
    await page.route('**/data/panorama-release.json', route => route.fulfill({json:bundle}));
    await page.route('**/data/data-refresh-status.json', route => route.fulfill({json:bundle.files['data-refresh-status.json']}));
    await page.goto(base);
    await page.waitForFunction(() => state.growthPayload?.ok && !document.body.classList.contains('is-loading'));
    await page.locator('#open-filters').click();
    await page.locator('#date-start').fill('2026-11-01');
    await page.locator('#date-end').fill('2026-11-03');
    await page.locator('#compare-mode').selectOption('custom');
    await page.locator('#compare-start').fill('2026-10-29');
    await page.locator('#compare-end').fill('2026-10-31');
    await page.locator('#apply-filters').click();
    const verified = await page.evaluate(() => {
      const records = recordsForDisplay(VIEWS.find(v=>v.key==='product')).records;
      return ['Monochrome All Black','Monochrome Caqui','Avant Whisky'].map(name => {
        const r=records.find(row=>row.dimension.includes(name));
        return {name:r.dimension,pedidos:r.pedidos,previous:r.compare.pedidos,visits:r.compare.sessoes,
          reason:r.missingContext?.label,detail:r.missingContext?.detail,periodGap:r.periodGap};
      });
    });
    assert.deepEqual(verified.map(r=>r.previous), [4,3,2]);
    assert.deepEqual(verified.map(r=>r.visits), [593,549,276]);
    for (const r of verified) {
      assert.equal(r.pedidos,null);
      assert.equal(r.reason,'Sem atribuicao paga');
      assert.match(r.detail,/Outros/);
      assert.match(r.periodGap,/02\/11\/26/);
    }
    await page.locator('#explorer-search').fill('RS8 Avant');
    await page.waitForTimeout(300);
    await page.locator('#explorer-search').press('Escape');
    assert.match(await page.locator('#explorer-coverage').innerText(), /Base carregada ate 02\/11\/26/);
    for (const width of [1440,820,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.locator('#growth-views').scrollIntoViewIfNeeded();
      const target = page.locator('#explorer-body tr').filter({hasText:'Monochrome All Black'});
      await target.scrollIntoViewIfNeeded();
      assert.match(await target.innerText(), /6\s*Outros · fora do filtro/s);
      assert.match(await target.innerText(), /780\s*Outros · fora do filtro/s);
      assert.doesNotMatch(await target.locator('td').nth(1).innerText(), /Sem registro|Anterior|Parcial/);
      assert.match(await target.innerText(), /3\.719,01/);
      assert.doesNotMatch(await target.innerText(), /Sem dado SSOT|Validar base|-100/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:`output/growth-missing-data/rows-${width}.png`});
      await page.locator('#growth-views').screenshot({path:`output/growth-missing-data/section-${width}.png`});
      const detail = target.locator('.available-outside .source-info').first();
      await detail.click();
      const popover = page.locator('#source-info-popover');
      await page.waitForFunction(() => !document.querySelector('#source-info-popover').hidden);
      assert.match(await popover.innerText(), /Anterior nos canais selecionados: 4/);
      assert.match(await popover.innerText(), /Base carregada ate 02\/11\/26/);
      assert.match(await popover.innerText(), /nao integra o total/);
      const box = await popover.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.keyboard.press('Escape');
      assert.equal(await popover.isVisible(), false);
    }
    await page.evaluate(() => {state.compareEnabled=false;renderAll();});
    assert.equal(await page.locator('#explorer-body tr').filter({hasText:'Monochrome All Black'}).count(),0);
    assert.deepEqual(errors,[]);
    assert.deepEqual(writes,[]);
    console.log(JSON.stringify({ok:true,releaseId:bundle.releaseId,mode:'local code with real published data',verified,viewports:4,errors,writes}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
