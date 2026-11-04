const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Intl, Date, Map, Set, setTimeout, clearTimeout,
  document: { querySelector: () => null } });
const run = code => vm.runInContext(code, context);
run(fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8'));
const analysis = fs.readFileSync(path.join(root, 'assets/growth-analysis.js'), 'utf8');
run(analysis.slice(0, analysis.lastIndexOf('setupEvents();')));
const classify = name => JSON.parse(run('JSON.stringify(productClassification(' + JSON.stringify(name) + '))'));
for (const [name, line] of [
  ['T\u00eanis RS8 Avant', 'Avant'], ['Tenis RS8 Avant GT', 'GT'],
  ['Tenis RS7 GT', 'GT'], ['Tenis RS Knit GT', 'GT'], ['Tenis 911 GT', 'GT'],
  ['Tenis RS8', 'RS'], ['Tenis RSX', 'RS'], ['Tenis RS Knit', 'Knit'],
  ['Tenis Phantom Knit', 'Phantom'], ['Tenis Phantom Slip-On', 'Phantom'],
  ['Tenis 911', '911'], ['Tenis 911 Carrera', '911'], ['Tenis Macan I', 'Macan'],
  ['Tenis Surpresa', 'Sem classificacao'], ['Tenis 9110', 'Sem classificacao'],
  ['Mochila Munich', 'Munich'], ['Mochila Manhattan', 'Manhattan'], ['Carteira NYC', 'NYC'],
  ['Desk Pad Workplace', 'Workplace'], ['Calca Brooklyn', 'Brooklyn'], ['Perfume Alcantara', 'Alcantara'],
  ['Tenis RS5 Ambition', 'RS'], ['Chinelo R8', 'R8']
]) assert.equal(classify(name).productLine, line, name);
for (const [name, type] of [
  ['T\u00eanis RS8', 'Tenis'], ['Mochila Couro Preta Munich', 'Mochilas'],
  ['Sneaker Bag', 'Acessorios'], ['Carteira de Couro', 'Acessorios'],
  ['\u00d3culos de Sol', 'Acessorios'], ['Kit 2 Pares de Meia', 'Acessorios'],
  ['Camiseta Algodao', 'Vestuario'], ['Kit Executivo Reise', 'Kits'],
  ['Perfume Alcantara', 'Perfumes'], ['Chinelo Slide R8', 'Chinelos'],
  ['Novo produto', 'Sem classificacao'], ['', 'Sem classificacao']
]) assert.equal(classify(name).productType, type, name);
run(`
  state.start = state.end = '2026-10-29';
  state.compareStart = state.compareEnd = '2026-10-28';
  state.growthPayload = {};
  const fixtures = [
    ['a','Tenis RS8 Avant',4,100], ['b','Tenis RS7 GT',2,200],
    ['c','Mochila Munich',1,50], ['d','Sneaker Bag',3,150], ['e','Produto sem identificacao',1,10]
  ];
  const source = fixtures.flatMap(([id,name,orders,sessions]) => ['2026-10-29','2026-10-28'].map(data => ({
    data, canal:'Google ADS', product_id:id, produto:name, pedidos:orders, sessoes:sessions,
    receita:orders*100, campaign_id:'campaign1', ad_group_id:'group1', ad_id:'ad1'
  })));
  state.growthViewMap = new Map(['channel_product','campaign_product','ad_group_product','ad_product']
    .map(view => [view, { rows:source }]));
  state.rows = normalizedRows([{data:'2026-10-29',canal:'Google ADS',pedidos:99,sessoes:1000,receita:9900}]);
  state.selectedProductType = 'Tenis';
  state.selectedProductLine = 'Avant';
  entityState.a = { view:'product', key:'b', query:'' };
`);
assert.equal(run('productFilterActive()'), true);
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'), 4);
assert.equal(run('summarize(selectedPaidRows("compare")).pedidos'), 4);
assert.equal(run('summarize(selectedPaidRows("current")).rate'), .04);
assert.equal(run('groups(VIEWS.find(v=>v.key==="channel"), "current").find(r=>r.key==="Google ADS").pedidos'), 4);
assert.equal(run('groups(VIEWS.find(v=>v.key==="channel"), "compare").find(r=>r.key==="Google ADS").pedidos'), 4);
for (const key of ['product','channel_product','campaign','ad_group','ad','campaign_product','ad_group_product','ad_product']) {
  assert.equal(run(`groups(VIEWS.find(v=>v.key==='${key}'), 'current').reduce((sum,r)=>sum+r.pedidos,0)`), 4, key);
  assert.equal(run(`groups(VIEWS.find(v=>v.key==='${key}'), 'compare').reduce((sum,r)=>sum+r.pedidos,0)`), 4, key+' comparison');
}
assert.equal(run('entitySelection("a").pedidos'), null, 'Global A/B respects taxonomy');
run('entityState.scope = "independent"');
assert.equal(run('entitySelection("a").pedidos'), 2, 'Independent A/B stays independent');
assert.match(run('analysisScopeLabel()'), /Tipo: Tenis.*Linha: Avant/);
run('state.selectedProductLine = "GT"');
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'), 2, 'Changing line invalidates scope cache');
run('state.selectedProductType = "Mochilas"; state.selectedProductLine = ""');
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'), 1, 'Changing type invalidates scope cache');
run('state.selectedProductLine = "GT"');
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'), null, 'Empty intersection is not zero');
run('state.selectedProductType = ""; state.selectedProductLine = ""');
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'), 99, 'Clearing restores channel grain');
run('state.selectedProductType = "Acessorios"; state.selectedProduct = "a"');
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'), null, 'Never replaces an incompatible exact product');
run('state.selectedProduct = ""; state.selectedProductType = "Sem classificacao"');
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'), 1, 'Unknown products remain accessible');
run('state.growthViewMap.delete("ad_product"); state.normalizedViewRows.delete("ad_product")');
assert.equal(run('viewAvailability("ad").available'), false, 'No fabricated unsupported join');
console.log('Product taxonomy passed: precedence, unknowns, all 9 views, current/previous, cache, A/B and missingness.');
