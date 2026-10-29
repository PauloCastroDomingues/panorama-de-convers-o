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
