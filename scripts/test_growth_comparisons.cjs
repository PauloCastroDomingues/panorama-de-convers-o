const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Intl, Date, Map, Set, setTimeout, clearTimeout, document: { querySelector: () => null } });
vm.runInContext(fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8'), context);
const comparisonCode = fs.readFileSync(path.join(root, 'assets/growth-analysis.js'), 'utf8');
vm.runInContext(comparisonCode.slice(0, comparisonCode.lastIndexOf('setupEvents();')), context);
const evaluate = (code) => vm.runInContext(code, context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/performance-delta.js'), 'utf8'), context);
evaluate(`
  state.start = '2026-10-26'; state.end = '2026-10-28';
  state.compareStart = '2026-10-23'; state.compareEnd = '2026-10-25';
  const fixture = [
    {data:'2026-10-26', canal:'Google Ads',product_id:'gray',produto:'Tenis RS8 Avant Cinza',sessoes:100,pedidos:4,receita:400,period:'current'},
    {data:'2026-10-23', canal:'Google Ads',product_id:'gray',produto:'Tenis RS8 Avant Cinza',sessoes:200,pedidos:2,receita:200,period:'current'},
    {data:'2026-10-28', canal:'Google Ads',product_id:'white',produto:'Tenis RS8 Avant Branco',sessoes:100,pedidos:1,receita:150,period:'current'},
    {data:'2026-10-25', canal:'Google Ads',product_id:'white',produto:'Tenis RS8 Avant Branco',sessoes:100,pedidos:2,receita:300,period:'current'},
    {data:'2026-10-23', canal:'Google Ads',product_id:'old',produto:'Mochila Descontinuada',sessoes:10,pedidos:1,receita:90,period:'current'}
  ];
  state.growthPayload = { data: [] };
  state.growthViewMap = new Map([['channel_product',{rows:fixture}]]);
`);
assert.equal(evaluate("groups(VIEWS.find(v=>v.key==='product'),'compare').length"), 3, 'Dates must win over the extraction period label');
assert.equal(evaluate("recordsForDisplay(VIEWS.find(v=>v.key==='product')).records.find(r=>r.key==='old').pedidos"), null, 'Comparison-only products stay null, not zero');
assert.equal(evaluate("recordsForDisplay(VIEWS.find(v=>v.key==='product')).records.find(r=>r.key==='gray').deltaRate"), .03);
assert.equal(evaluate("recordsForDisplay(VIEWS.find(v=>v.key==='product')).records.find(r=>r.key==='gray').comparisonSessoes"), 200);
evaluate("state.selectedProduct='gray'");
assert.equal(evaluate("summarize(selectedPaidRows('current')).pedidos"), 4, 'Global product filter changes summary source');
assert.equal(evaluate("summarize(scopeRows(PAID_CHANNELS[2],'compare')).sessoes"), 200, 'Channel charts share the product scope');
assert.equal(evaluate("groups(VIEWS.find(v=>v.key==='campaign'),'current').length"), 0, 'A product cannot inherit an unrelated campaign total');
assert.equal(evaluate("summarize([{pedidos:1,sessoes:100,receita:10},{pedidos:2,sessoes:null,receita:20}]).rate"), null, 'Incomplete denominators never produce an official rate');
assert.equal(evaluate("summarize([{pedidos:0,sessoes:100,receita:0}]).rate"), 0, 'Observed zeros remain valid');
assert.equal(evaluate("summarize([{pedidos:4,sessoes:100},{pedidos:1,sessoes:400}]).rate"), .01, 'Rates are computed from sums');
evaluate("state.selectedProduct=''; const pairs=pairedPeriods(normalizedViewRows('channel_product').filter(r=>inPeriod(r,'current')),normalizedViewRows('channel_product').filter(r=>inPeriod(r,'compare')),'day')");
assert.equal(evaluate("pairs.find(p=>p.key==='2026-10-28').compare.pedidos"), 2, 'Missing intermediate dates must not shift the reference');
assert.equal(evaluate("pairs.find(p=>p.key==='2026-10-26').compare.pedidos"), 3);
evaluate("globalThis.window = {}; const chartBox = { clientWidth: 800 }; drawPeriodChart(chartBox, periodSeries(pairs, 'Pedidos', '#fb5d06'), 'pedidos')");
assert.match(evaluate('chartBox.innerHTML'), /<text[^>]+>26\/10\/26<\/text>/, 'Shared chart axis keeps current dates');
assert.doesNotMatch(evaluate('chartBox.innerHTML'), /<text[^>]+>23\/10\/26 a 23\/10\/26<\/text>/, 'Comparison dates must not replace current axis labels');
assert.match(evaluate('chartBox.innerHTML'), /<title>Pedidos \/ Comparado \/ 23\/10\/26 a 23\/10\/26/, 'Comparison tooltip retains its own original dates');
assert.equal(evaluate("pairedPeriods([], [{data:'2026-10-24',pedidos:2,sessoes:100}], 'day')[0].label"), '27/10/26', 'Comparison-only points also use projected current-axis dates');
evaluate("entityState.a.view='product'; entityState.a.key='gray'; entityState.b.view='product'; entityState.b.key='white'");
assert.equal(evaluate("entitySelection('a').pedidos"), 4);
assert.equal(evaluate("entitySelection('b').pedidos"), 1);
assert.equal(evaluate("entitySelection('a').compare.pedidos"), 2);
assert.equal(evaluate("canonicalChannel({canal:'Meta Ads'})"), 'Facebook (1 + 2)', 'Product-level Meta data stays aggregated instead of disappearing or being assigned to a specific account');
assert.equal(evaluate("recordSemaphore({rate:.05,compare:{rate:.06}}).tone"), 'bad');
assert.equal(evaluate("recordSemaphore({rate:.05,compare:null}).tone"), 'neutral');
assert.equal(evaluate("nextIndicator({rate:.04,sessoes:100,compare:{rate:.05,sessoes:90}})"), 'Investigar carrinho, checkout e oferta');
evaluate('state.compareEnabled = false');
assert.equal(evaluate("groups(VIEWS.find(v=>v.key==='product'),'compare').length"), 0);
assert.equal(evaluate("recordsForDisplay(VIEWS.find(v=>v.key==='product')).records.some(r=>r.key==='old')"), false);
assert.equal(evaluate("pairedPeriods([], [{data:'2026-10-24',pedidos:2,sessoes:100}], 'day').length"), 0);
assert.equal(evaluate("periodSeries(pairs, 'Pedidos', '#fb5d06').length"), 1);
assert.doesNotMatch(evaluate("metricComparisonCell({pedidos:10,compare:{pedidos:5}},'pedidos')"), /Anterior|performance-delta/);
assert.equal(evaluate("entitySelection('a').pedidos"), 4, 'Independent A/B selection keeps working without period comparison');
evaluate('state.compareEnabled = true');
assert.equal(evaluate("entitySelection('a').compare.pedidos"), 2);
console.log('Growth comparison checks passed, including comparison off/on.');

assert.match(evaluate("conversionCoverageMarkup([{rate:null,compare:{rate:null}},{rate:.006,compare:{rate:null}}], [{data:'2026-01-01',canal:'Meta Ads 1',pedidos:2,sessoes:null}], [])"), /Periodos com taxa valida: 1 de 2\. Comparacao: 0 de 2/);
assert.match(evaluate("conversionCoverageMarkup([{rate:null}], [{data:'2026-01-01',canal:'Meta Ads 1',pedidos:2,sessoes:null}], [])"), /Meta Ads 1<\/strong>: 1 dia\(s\) sem sessoes/);
assert.equal(evaluate("conversionCoverageMarkup([{rate:0,compare:{rate:.01}}], [], [])"), '', 'Observed zero conversion is a valid rate');
evaluate('state.compareEnabled = false');
assert.equal(evaluate("conversionCoverageMarkup([{rate:.01}], [], [])"), '', 'Disabled comparison creates no coverage warning');
assert.doesNotMatch(evaluate("conversionCoverageMarkup([{rate:null}], [], [])"), /Comparacao:/);
evaluate('state.compareEnabled = true');

assert.equal(evaluate("summarize([{pedidos:2,sessoes:100},{sessoes:100}]).rate"), null, 'Missing orders cannot silently become zero in conversion');
assert.equal(evaluate("summarize([{pedidos:2,sessoes:100},{pedidos:NaN,sessoes:100}]).complete"), false);
evaluate(`
  state.start = state.end = '2026-10-28';
  state.compareStart = '2026-10-23'; state.compareEnd = '2026-10-25';
`);
assert.equal(evaluate("pairedPeriods([], [{data:'2026-10-23',pedidos:2,sessoes:100},{data:'2026-10-25',pedidos:3,sessoes:100}], 'day').length"), 1, 'Custom comparison must not create points outside the current window');
evaluate(`
  state.start = '2026-10-26'; state.end = '2026-10-28';
  state.selectedProduct = 'gray';
  const cachedProductRows = analysisSourceRows('current');
`);
assert.equal(evaluate("analysisSourceRows('current') === cachedProductRows"), true, 'Repeated views reuse the filtered product rows');
evaluate("state.selectedProduct='white'");
assert.equal(evaluate("analysisSourceRows('current')[0].productKey"), 'white', 'A new product invalidates the scope cache');
evaluate("state.selectedProduct=''; state.channelRowsCache.clear(); state.normalizedViewRows.clear(); state.growthPayload={generatedAt:'2026-10-29T08:00:00Z'}; state.commercial={extracted_at:'2026-10-29T10:00:00Z'};");
evaluate(`
  state.growthViewMap = new Map([['channel', {rows: [
    {data:'2026-10-26',canal:'Google Ads',sessoes:100,pedidos:1,receita:10},
    {data:'2026-10-27',canal:'Google Ads',sessoes:null,pedidos:3,receita:30}
  ]}]]);
  state.rows = normalizedRows([
    {data:'2026-10-26',canal:'Google Ads',sessoes:110,pedidos:2,receita:20},
    {data:'2026-10-28',canal:'Google Ads',sessoes:200,pedidos:4,receita:40}
  ]);
`);
assert.equal(evaluate("channelSourceRows('current').length"), 3, 'A newer day in the commercial extract remains visible');
assert.equal(evaluate("summarize(channelSourceRows('current')).pedidos"), 9, 'Overlapping extracts are not added twice');
assert.equal(evaluate("channelSourceRows('current').find(row=>row.data==='2026-10-26').sessoes"), 110, 'The latest observation wins');
assert.equal(evaluate("channelSourceRows('current').find(row=>row.data==='2026-10-27').pedidos"), 3, 'Orders survive an absent session denominator');
assert.equal(evaluate("summarize(channelSourceRows('current')).rate"), null);
evaluate("state.rows=[]; state.channelRowsCache.clear(); state.start=state.end='2026-10-27'");
assert.equal(evaluate("summarize(channelSourceRows('current')).receita"), 30, 'An all-null session slice must not erase revenue');
evaluate("state.start='2026-10-25'; state.end='2026-10-26'; state.channelRowsCache.clear()");
assert.equal(evaluate("channelSourceRows('current').find(row=>row.data==='2026-10-25').sessoes"), null, 'Missing calendar days remain unknown');
assert.equal(evaluate("summarize(channelSourceRows('current')).pedidos"), 1, 'Known orders remain visible in an incomplete period');
assert.equal(evaluate("summarize(channelSourceRows('current')).rate"), null, 'One available day cannot imply full period coverage');
console.log('Growth resilience checks passed: source freshness, missingness, product cache and comparison bounds.');

evaluate(`
  state.start='2026-10-26'; state.end='2026-10-28'; state.compareStart='2026-10-23'; state.compareEnd='2026-10-25';
  state.compareEnabled=true;
  const rhythmCurrent = [{data:'2026-10-26',pedidos:62,sessoes:100},{data:'2026-10-27',pedidos:62,sessoes:100},{data:'2026-10-28',pedidos:91,sessoes:100}];
  const rhythmPrevious = [{data:'2026-10-23',pedidos:65,sessoes:100},{data:'2026-10-24',pedidos:67,sessoes:100},{data:'2026-10-25',pedidos:65,sessoes:100}];
`);
for (const granularity of ['week', 'month', 'quarter', 'semester', 'year']) {
  evaluate(`globalThis.clipped = pairedPeriods(rhythmCurrent,rhythmPrevious,'${granularity}'); drawPeriodChart(chartBox,periodSeries(clipped,'Pedidos','#fb5d06'),'pedidos')`);
  assert.equal(evaluate('clipped.length'), 1);
  assert.equal(evaluate('clipped[0].pedidos'), 215);
  assert.equal(evaluate('clipped[0].compare.pedidos'), 197);
  assert.equal(evaluate('clipped[0].label'), '26/10/26 a 28/10/26 (parcial)', `${granularity}: do not imply a full calendar period`);
  assert.equal(evaluate('clipped[0].compare.label'), '23/10/26 a 25/10/26');
  assert.match(evaluate('chartBox.innerHTML'), /<path data-series="current"/);
  assert.match(evaluate('chartBox.innerHTML'), /215<\/title>/);
  assert.match(evaluate('chartBox.innerHTML'), /<circle/);
  assert.doesNotMatch(evaluate('chartBox.innerHTML'), /period-bar|single-period-chart/);
}
assert.equal(evaluate("aggregatePeriods(rhythmCurrent,'week',{start:'2026-10-26',end:'2026-11-01'})[0].partial"), false);
assert.equal(evaluate("aggregatePeriods(rhythmCurrent,'month',{start:'2026-10-01',end:'2026-10-31'})[0].label"), 'out/26');
evaluate("state.compareEnabled=false; drawPeriodChart(chartBox,periodSeries(pairedPeriods(rhythmCurrent, rhythmPrevious,'week'),'Pedidos','#fb5d06'),'pedidos')");
assert.doesNotMatch(evaluate('chartBox.innerHTML'), /data-series="comparison"/);
evaluate("drawPeriodChart(chartBox,[{label:'Pedidos',color:'#fb5d06',periods:[{key:'zero',label:'28/10/26',pedidos:0}]}],'pedidos')");
assert.match(evaluate('chartBox.innerHTML'), /<circle/);
assert.match(evaluate('chartBox.innerHTML'), /Pedidos \/ 28\/10\/26 \/ 0<\/title>/);
evaluate("drawPeriodChart(chartBox,[{label:'Pedidos',color:'#fb5d06',periods:[{key:'missing',label:'28/10/26',pedidos:null}]}],'pedidos')");
assert.match(evaluate('chartBox.innerHTML'), /Sem base valida/);
console.log('Rhythm chart: clipped calendar labels, original line chart, comparison toggle and zero values passed.');
for (const [start,end,expected] of [
  ['2026-10-28','2026-10-28','day'], ['2026-10-26','2026-10-28','day'],
  ['2026-10-01','2026-10-31','day'], ['2026-08-01','2026-10-28','week'],
  ['2026-07-01','2026-12-31','month'], ['2026-01-01','2026-12-31','month'],
  ['2025-01-01','2026-12-31','quarter'], ['2024-01-01','2026-12-31','year'],
]) {
  evaluate(`state.start='${start}';state.end='${end}';state.hourlyAvailable=false;state.selectedGranularity='year';renderTemporalControls()`);
  assert.equal(evaluate('state.selectedGranularity'), expected, 'Chart scale derives from global dates, not an earlier manual choice');
}
evaluate("state.start=state.end='2026-10-28';state.hourlyAvailable=true;renderTemporalControls()");
assert.equal(evaluate('state.selectedGranularity'), 'hour');

evaluate(`
  state.start=state.end='2026-01-01'; state.compareStart=state.compareEnd='2025-01-01';
  state.compareEnabled=true; state.selectedChannel=''; state.selectedProduct='';
  state.channelRowsCache.clear(); state.normalizedViewRows.clear();
  state.growthViewMap = new Map();
  state.rows=normalizedRows([
    {data:'2026-01-01',canal:'Meta Ads 1',sessoes:null,pedidos:90,receita:900},
    {data:'2026-01-01',canal:'Meta Ads 2',sessoes:null,pedidos:10,receita:100},
    {data:'2026-01-01',canal:'Google ADS',sessoes:50,pedidos:7,receita:70}
  ]);
  state.commercial={paid_channel_totals:{source:'reise-ssot.mart_growth_us.aquisicao_por_canal8_daily',rows:[
    {data:'2026-01-01',canal:'Meta ADS',sessoes:100,pedidos:3,receita:300},
    {data:'2026-01-01',canal:'Google ADS',sessoes:50,pedidos:2,receita:200}
  ]}};
`);
assert.equal(evaluate("summarize(selectedPaidRows('current')).pedidos"), 5, 'No double count: aggregate replaces account grain for paid total');
assert.equal(evaluate("summarize(selectedPaidRows('current')).rate"), 5/150, 'Numerator and denominator use the same consolidated contract');
assert.equal(evaluate("scopeRows(PAID_CHANNELS[0],'current')[0].sessoes"), null, 'Consolidated sessions are never allocated to account 1');
assert.equal(evaluate("scopeRows(PAID_CHANNELS[0],'current')[0].pedidos"), 90, 'Account-level rows remain intact');
evaluate("state.selectedChannel='group-meta'");
assert.equal(evaluate("summarize(selectedPaidRows('current')).rate"), .03);
evaluate("state.selectedChannel='group-google'");
assert.equal(evaluate("summarize(selectedPaidRows('current')).pedidos"), 2);
evaluate("state.selectedChannel='Meta Ads 1'");
assert.equal(evaluate("summarize(selectedPaidRows('current')).rate"), null);
evaluate("state.selectedChannel=''");
assert.equal(evaluate("summarize(selectedPaidRows('compare')).rate"), null, 'No comparison data is invented');
evaluate("state.start='2025-12-31'; state.channelRowsCache.clear()");
assert.equal(evaluate("summarize(selectedPaidRows('current')).rate"), null, 'Unavailable historical calendar days remain null');
evaluate(`
  state.start='2026-01-01'; state.selectedProduct='fixture';
  state.growthViewMap=new Map([['channel_product',{rows:[
    {data:'2026-01-01',canal:'Google ADS',product_id:'fixture',produto:'Tenis',pedidos:1,sessoes:10,receita:10}
  ]}]]); state.normalizedViewRows.clear();
`);
assert.equal(evaluate("summarize(selectedPaidRows('current')).rate"), .1, 'Product filters never inherit channel totals');
console.log('Paid historical coverage: consolidated grain, no duplication, account isolation, missing dates and product filters passed.');

evaluate(`state.compareEnabled=true; const partialMeta=summarize([
  {data:'2026-09-01',sessoes:null,pedidos:null,receita:null},
  {data:'2026-09-02',sessoes:8529,pedidos:56,receita:43550.21}
]);`);
assert.equal(evaluate('partialMeta.rate'), null, 'Partial observations never become the official full-window rate');
assert.equal(evaluate('partialMeta.observedRate'), 56/8529);
assert.match(evaluate("metricComparisonCell(partialMeta,'rate')"), /0,66%/);
assert.match(evaluate("metricComparisonCell(partialMeta,'rate')"), /Parcial: 1\/2 dias completos/);
assert.equal(evaluate('recordSemaphore(partialMeta).tone'), 'warn');
assert.equal(evaluate("summarize([{data:'2026-09-01',sessoes:null,pedidos:3},{data:'2026-09-02',sessoes:100,pedidos:2}]).observedRate"), null, 'Known orders without sessions must not disappear from a partial rate');
