const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/reise/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const commercial = require('../assets/crm-sendflow.js');
const source = require('../data/ssot-commercial-channels.json');
const base = process.env.PANORAMA_URL || 'http://127.0.0.1:8021';
const output = path.resolve(__dirname, '../output/reise-ui');
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function checkLayout(page, label) {
  const errors = await page.evaluate(() => {
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page overflow');
    for (const element of document.querySelectorAll('dialog[open], .kpi > strong, .filter-dialog-footer, .workspace-tabs')) {
      if (!element.checkVisibility()) continue;
      if (element.scrollWidth > element.clientWidth + 2) problems.push(element.id || element.className);
    }
    for (const element of document.querySelectorAll('img')) {
      if (element.checkVisibility() && (!element.complete || !element.naturalWidth)) problems.push('missing image: ' + element.getAttribute('src'));
    }
    return problems;
  });
  assert.deepEqual(errors, [], label);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], missing = [], writes = [], checks = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(base + '/assets/') && response.status() >= 400) missing.push(response.url());
    });
    page.on('request', request => {
      if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
    });
    await page.goto(base + '/#growth', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('is-loading') && getComputedStyle(document.querySelector('#data-loader')).visibility === 'hidden');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('16px Aalto') && document.fonts.check('20px Formula1')), true);
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(29, 29, 27)');
    const originalGrowth = await page.locator('#resumo .kpi > strong').allTextContents();
    for (const [width, height] of [[1920, 1080], [1440, 1000], [820, 1180], [390, 844], [320, 740]]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-workspace="growth"]').click();
      await page.evaluate(() => scrollTo(0, 0));
      await checkLayout(page, `growth/${width}`);
      assert.deepEqual(await page.locator('#resumo .kpi > strong').allTextContents(), originalGrowth);
      await page.screenshot({ path: path.join(output, `growth-${width}.png`) });
      await page.locator('#open-filters').click();
      assert.ok(await page.locator('#growth-filter-dialog').isVisible());
      await checkLayout(page, `growth-filters/${width}`);
      await page.screenshot({ path: path.join(output, `growth-filters-${width}.png`) });
      await page.locator('#close-filters').click();
      assert.deepEqual(await page.locator('#resumo .kpi > strong').allTextContents(), originalGrowth);
      if (width <= 390) {
        const scroll = await page.locator('#growth-views > .table-scroll').evaluate(element => {
          const first = element.querySelector('tbody td');
          const before = first.getBoundingClientRect().left;
          element.scrollLeft = 140;
          const after = first.getBoundingClientRect().left;
          const second = element.querySelector('tbody td:nth-child(2)').getBoundingClientRect();
          const container = element.getBoundingClientRect();
          const visible = second.left >= container.left && second.right <= container.right;
          element.scrollLeft = 0;
          return { moved: before - after, visible };
        });
        assert.ok(scroll.moved > 100 && scroll.visible, 'mobile table must scroll without a pinned name obscuring its metrics');
      }
      if (width === 1440 || width === 390) {
        await page.locator('#growth-views').screenshot({ path: path.join(output, `products-${width}.png`) });
        await page.locator('#ritmo').screenshot({ path: path.join(output, `rhythm-${width}.png`) });
      }
      await page.locator('[data-workspace="crm"]').click();
      for (const channel of ['whatsapp-oficial', 'email', 'whatsapp-organico', 'all']) {
        await page.locator(`[data-crm-tab="${channel}"]`).click();
        await page.evaluate(() => scrollTo(0, 0));
        await checkLayout(page, `crm/${channel}/${width}`);
        if (channel !== 'all') {
          assert.deepEqual(await page.locator('[data-crm-view]').evaluateAll(nodes => nodes.map(node => node.dataset.crmView)), ['conversion', 'pacing', 'activation', 'tracking']);
          const start = await page.locator('#crm-date-start').inputValue();
          const end = await page.locator('#crm-date-end').inputValue();
          const expected = commercial.commercial(source, channel, start, end);
          const ticket = expected.ordersKnownDays === expected.expectedDays && expected.revenueKnownDays === expected.expectedDays && expected.orders > 0 && expected.revenue !== null ? expected.revenue / expected.orders : null;
          const values = [[expected.sessions, integer], [expected.orders, integer], [expected.revenue, money], [expected.rate, percent], [ticket, money]]
            .map(([value, formatter]) => value === null ? 'Indisponivel' : formatter.format(value));
          assert.deepEqual(await page.locator('#crm-summary-kpis .kpi > strong').allTextContents(), values, `${channel}: SSOT unchanged`);
          assert.equal(await page.locator('.crm-funnel-rate strong').innerText(), values[3]);
          if (width === 1440 || width === 390) {
            await page.locator('[data-crm-view="conversion"]').screenshot({ path: path.join(output, `${channel}-funnel-${width}.png`) });
            await page.locator('[data-crm-view="tracking"]').screenshot({ path: path.join(output, `${channel}-tracking-${width}.png`) });
            await page.evaluate(() => scrollTo(0, 0));
          }
        }
        await page.screenshot({ path: path.join(output, `crm-${channel}-${width}.png`) });
        checks.push(`${channel}/${width}`);
      }
      await page.locator('#crm-open-filters').click();
      await checkLayout(page, `crm-filters/${width}`);
      await page.screenshot({ path: path.join(output, `crm-filters-${width}.png`) });
      await page.locator('#crm-cancel-filters').click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-workspace="growth"]').click();
    const sort = page.locator('#explorer-head .table-sort').first();
    const key = await sort.getAttribute('data-explorer-sort');
    assert.ok(key);
    await sort.click();
    const direction = await page.locator(`#explorer-head [data-explorer-sort="${key}"]`).locator('..').getAttribute('aria-sort');
    await page.locator(`#explorer-head [data-explorer-sort="${key}"]`).click();
    assert.notEqual(await page.locator(`#explorer-head [data-explorer-sort="${key}"]`).locator('..').getAttribute('aria-sort'), direction);
    await page.locator('#open-filters').click();
    await page.locator('#period-preset').selectOption('week');
    await page.locator('#apply-filters').click();
    assert.ok((await page.locator('#filter-summary-comparison').innerText()).length > 0);
    await checkLayout(page, 'growth weekly comparison');
    await page.locator('#ritmo').screenshot({ path: path.join(output, 'growth-weekly-rhythm.png') });
    await page.locator('#canais').screenshot({ path: path.join(output, 'growth-weekly-channels.png') });
    await page.locator('#evolucao').screenshot({ path: path.join(output, 'growth-weekly-evolution.png') });
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    assert.deepEqual(writes, [], 'UI review must not write to sources or trigger refreshes');
    console.log(JSON.stringify({ ok: true, viewports: 5, crmChecks: checks.length, fonts: 'loaded', assets: 'loaded', data: 'SSOT values unchanged', filters: 'Growth and CRM open/close; weekly comparison applied', sorting: 'both directions', sourceWrites: 0, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
