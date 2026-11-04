const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({console, Intl, Date, Map, Set, setTimeout, clearTimeout,
  document:{querySelector:()=>null}});
const run = code => vm.runInContext(code, context);
run(fs.readFileSync(path.join(root,'assets/app.js'),'utf8'));
const analysis=fs.readFileSync(path.join(root,'assets/growth-analysis.js'),'utf8');
run(analysis.slice(0,analysis.lastIndexOf('setupEvents();')));
run(`
  state.start=state.end='2026-10-29'; state.compareStart=state.compareEnd='2026-10-28';
  state.growthPayload={};
  state.growthViewMap=new Map([['channel_product',{rows:[
    {data:'2026-10-29',canal:'Google ADS',product_id:'a',produto:'Tenis RS8 Avant',pedidos:2,sessoes:100,receita:200},
    {data:'2026-10-29',canal:'Google ADS',product_id:'b',produto:'Tenis RS6 Avant',pedidos:8,sessoes:100,receita:800},
    {data:'2026-10-29',canal:'Meta Ads 1',product_id:'a',produto:'Tenis RS8 Avant',pedidos:1,sessoes:50,receita:100},
    {data:'2026-10-28',canal:'Google ADS',product_id:'a',produto:'Tenis RS8 Avant',pedidos:1,sessoes:100,receita:100},
    {data:'2026-10-29',canal:'Google ADS',product_id:'gt',produto:'Tenis RS7 GT',pedidos:1,sessoes:20,receita:100},
    {data:'2026-10-29',canal:'Google ADS',product_id:'unknown',produto:'Sneaker Bag',pedidos:1,sessoes:25,receita:100},
    {data:'2026-10-29',canal:'Outros',product_id:'a',produto:'Tenis RS8 Avant',pedidos:99,sessoes:200,receita:9900},
    {data:'2026-10-28',canal:'Google ADS',product_id:'old',produto:'Tenis Macan',pedidos:1,sessoes:20,receita:100},
    {data:'2026-10-30',canal:'Google ADS',product_id:'a',produto:'Tenis RS8 Avant',pedidos:50,sessoes:100,receita:5000}
  ]}]]);
  const lineView=VIEWS.find(v=>v.key==='line');
  const channelLineView=VIEWS.find(v=>v.key==='channel_line');
`);
assert.equal(run('sourceKeyForView("line")'),'channel_product');
assert.equal(run('viewAvailability("channel_line").available'),true);
assert.equal(run('VIEWS.find(v=>v.key==="line").number'),'10');
assert.equal(run('VIEWS.find(v=>v.key==="channel_line").number'),'11');
assert.equal(run('groups(lineView,"current").length'),2);
for (const key of ['line','channel_line']) {
  assert.equal(run(`recordsForDisplay(VIEWS.find(v=>v.key==='${key}')).records.some(r=>r.key.includes('Sem classificacao'))`),false);
  assert.equal(run(`entityCatalog('${key}').some(r=>r.key.includes('Sem classificacao'))`),false);
  assert.equal(run(`[...productConversionHistory(VIEWS.find(v=>v.key==='${key}')).keys()].some(k=>k.includes('Sem classificacao'))`),false);
}
assert.equal(run('groups(VIEWS.find(v=>v.key==="product"),"current").find(r=>r.key==="unknown").pedidos'),1);
assert.equal(run('groups(VIEWS.find(v=>v.key==="channel_product"),"current").find(r=>r.key==="Google ADS|unknown").pedidos'),1);
run('state.selectedProductLine="Sem classificacao"');
assert.equal(run('summarize(selectedPaidRows("current")).pedidos'),1, 'Global totals still include unclassified products');
assert.equal(run('groups(lineView,"current").length'),0);
run('state.selectedProductLine=""');
assert.equal(run('groups(lineView,"current").find(r=>r.key==="Avant").pedidos'),11);
assert.equal(run('groups(lineView,"current").find(r=>r.key==="Avant").rate'),11/250);
assert.equal(run('groups(channelLineView,"current").find(r=>r.key==="Google ADS|Avant").rate'),10/200);
assert.equal(run('groups(channelLineView,"current").find(r=>r.key==="Meta Ads 1|Avant").rate'),1/50);
assert.equal(run('recordsForDisplay(lineView).records.find(r=>r.key==="Macan").pedidos'),null);
assert.equal(run('recordsForDisplay(lineView).records.find(r=>r.key==="Macan").compare.pedidos'),1);
assert.equal(run('productConversionHistory(lineView).get("Avant").rate'),12/350);
assert.equal(run('productConversionHistory(channelLineView).get("Google ADS|Avant").rate'),11/300);
assert.equal(run('explorerColumns(channelLineView)[0][1]'),'line');
assert.equal(run('explorerColumns(channelLineView)[1][1]'),'channel');
run('state.selectedChannel="group-google"');
assert.equal(run('groups(lineView,"current").find(r=>r.key==="Avant").pedidos'),10);
run('state.selectedProductLine="GT"');
assert.equal(run('groups(lineView,"current").length'),1);
run('entityState.a={view:"line",key:"Avant",query:""}');
assert.equal(run('entitySelection("a").pedidos'),null);
run('entityState.scope="independent"');
assert.equal(run('entitySelection("a").pedidos'),11);
assert.equal(run('entitySelection("a").aggregate'),true);
run('entityState.a={view:"channel_line",key:"Google ADS|Avant",query:""}');
assert.equal(run('entitySelection("a").pedidos'),10);
run('state.selectedProductLine=""; state.selectedProductType="Mochilas"');
assert.equal(run('groups(lineView,"current").length'),0);
run('state.selectedProductType=""; state.compareEnabled=false');
assert.equal(run('recordsForDisplay(lineView).records.some(r=>r.key==="Macan")'),false);
run(`
  state.growthViewMap.get('channel_product').rows.push({data:'2026-10-29',canal:'Google ADS',
    product_id:'partial',produto:'Tenis RS8 Avant Cinza',pedidos:2,sessoes:null,receita:200});
  state.normalizedViewRows.clear();
`);
assert.equal(run('groups(lineView,"current").find(r=>r.key==="Avant").pedidos'),12);
assert.equal(run('groups(lineView,"current").find(r=>r.key==="Avant").rate'),null);
console.log('Line views passed: grouping, channel split, weighted rates, history, filters, A/B, unknowns and nulls.');
