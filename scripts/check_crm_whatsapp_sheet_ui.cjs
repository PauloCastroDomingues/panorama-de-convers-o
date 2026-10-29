const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sourceUrl = require('../assets/crm-whatsapp.js').url;
const csv = [
  'Tema,Categoria,Data,Público,Total Entregue,Aberturas,Total de cliques,Sessões,Pedidos,Receita',
  'A,Utilidade,26/10,100,90,50,20,-,-,-',
  ',,,20,18,10,3,3,1,100',
  'B,Marketing,26/10,0,0,0,0,0,0,0',
  'C,Marketing,27/10,10,9,5,1,5,1,100',
  'D,Marketing,27/10,30,20,10,2,10,1,200',
].join('\n');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const output = path.resolve(__dirname, '../output/crm-artifact-qa');
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], methods = [];
    let failSheet = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('reise-crm-tracking-v2-whatsapp-oficial', JSON.stringify({ '2026-10-27:0': { Publico: 9999, Cliques: 9999 } })));
    await page.route('**/spreadsheets/d/1vlkkrA52FBGk79k0ou3vch1XqM-AdHVDj42IXO7hIZo/export?*', (route) => {
      methods.push(route.request().method());
      return route.fulfill({ status: failSheet ? 503 : 200, contentType: 'text/csv', body: failSheet ? '' : csv });
    });
    await page.goto('http://127.0.0.1:8020/#crm', { waitUntil: 'networkidle' });
    await page.locator('#data-loader').waitFor({ state: 'hidden' });
    await page.locator('[data-tracking-origin="sheet"]').waitFor();
    const baseline = await page.locator('#crm-summary-kpis .kpi strong').allTextContents();
    assert.equal(baseline[0], '945', 'Commercial SSOT is not replaced by spreadsheet sessions');
    const marketing = page.locator('[data-sheet-category="Marketing"][data-sheet-date="2026-10-27"]');
    assert.equal(await marketing.locator('[data-sheet-field="Publico"] .crm-sheet-value').innerText(), '40');
    assert.equal(await marketing.locator('[data-sheet-field="Cliques"] .crm-sheet-value').innerText(), '3');
    assert.equal(await page.locator('[data-sheet-total]').innerText(), '3');
    assert.equal(await page.locator('[data-artifact-track]').count(), 0);
    assert.equal(await page.locator('[data-artifact-action="reset"]').count(), 0);
    assert.equal(await page.locator('.crm-tracking-actions a').getAttribute('href'), sourceUrl);
    assert.match(await page.locator('[data-sheet-category="Utilidade"]').innerText(), /Sem registro/);
    await page.locator('[data-tracking-source="local"]').click();
    assert.equal(await page.locator('[data-artifact-track="Publico"]').first().inputValue(), '9999');
    await page.locator('[data-tracking-source="sheet"]').click();
    assert.equal(await page.locator('[data-sheet-total]').innerText(), '3', 'Local values never bleed into the sheet');
    await page.locator('#crm-open-filters').click();
    await page.locator('#crm-date-start').fill('2026-10-26');
    await page.locator('#crm-date-end').fill('2026-10-27');
    await page.locator('#crm-apply-filters').click();
    await page.locator('[data-tracking-select="2026-10-26"]').click();
    assert.equal(await page.locator('[data-sheet-category="Utilidade"] [data-sheet-field="Publico"] .crm-sheet-value').innerText(), '100');
    assert.equal(await page.locator('[data-sheet-category="Utilidade"] [data-sheet-field="Cliques"] .crm-sheet-value').innerText(), '20');
    assert.equal(await page.locator('[data-sheet-category="Marketing"] [data-sheet-field="Cliques"] .crm-sheet-value').innerText(), '0');
    await page.locator('.crm-sheet-details summary').click();
    assert.match(await page.locator('.crm-sheet-lines').innerText(), /Vinculada a 2/);
    await page.locator('[data-tracking-mode="period"]').click();
    assert.equal(await page.locator('[data-sheet-date]').count(), 4);
    await page.locator('[data-tracking-mode="day"]').click();
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('[data-tracking-origin="sheet"]').screenshot({ path: path.join(output, `sheet-fixture-${width}.png`) });
    }
    failSheet = true;
    await page.locator('#crm-refresh').click();
    await page.waitForFunction(() => !document.querySelector('#crm-refresh').disabled);
    assert.match(await page.locator('.crm-sheet-status').innerText(), /Leitura anterior da planilha preservada/);
    assert.equal(await page.locator('[data-sheet-category="Utilidade"] [data-sheet-field="Cliques"] .crm-sheet-value').innerText(), '20');
    assert.deepEqual(errors, []);
    assert.ok(methods.length >= 2 && methods.every((method) => method === 'GET'));
    console.log(JSON.stringify({ status: 'passed', source: 'read-only spreadsheet', methods, localIsolation: true, parentChildSeparation: true, lastGood: true, viewports: [1440, 820, 390, 320] }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
