const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({console, Intl, Date, Map, Set, setTimeout, clearTimeout,
  document: {querySelector: () => null}});
for (const file of ['app.js', 'performance-delta.js', 'growth-analysis.js']) {
  let code = fs.readFileSync(path.join(root, 'assets', file), 'utf8');
  if (file === 'growth-analysis.js') code = code.slice(0, code.lastIndexOf('setupEvents();'));
  vm.runInContext(code, context);
}
const run = code => vm.runInContext(code, context);
run(`
  state.start = '2026-11-01'; state.end = '2026-11-03';
  state.compareStart = '2026-10-29'; state.compareEnd = '2026-10-31';
  const sourceRows = [
    {data:'2026-10-30',canal:'Meta Ads',product_id:'black',produto:'RS8 Black',pedidos:4,sessoes:593,receita:2094.01},
    {data:'2026-11-01',canal:'Outros',product_id:'black',produto:'RS8 Black',pedidos:5,sessoes:679,receita:3071.91,
      metodo_rateio:'fallback sem quebra real por canal'},
    {data:'2026-10-30',canal:'Meta Ads',product_id:'absent',produto:'RS8 Absent',pedidos:3,sessoes:100,receita:100},
    {data:'2026-10-30',canal:'Meta Ads',product_id:'zero',produto:'RS8 Zero',pedidos:2,sessoes:100,receita:100},
    {data:'2026-11-02',canal:'Meta Ads',product_id:'zero',produto:'RS8 Zero',pedidos:0,sessoes:20,receita:0},
    {data:'2026-11-02',canal:'Meta Ads',product_id:'null',produto:'RS8 Null',pedidos:1,sessoes:null,receita:10},
    {data:'2026-11-02',canal:'Meta Ads',product_id:'denominator',produto:'RS8 Denominator',pedidos:0,sessoes:0,receita:0},
    {data:'2026-11-02',canal:'Meta Ads',product_id:'current',produto:'RS8 Current',pedidos:1,sessoes:10,receita:10}
  ];
  state.growthPayload = {refresh:{views:[{id:'channel_product',coveredThrough:'2026-11-02'}]}};
  state.growthViewMap = new Map([['channel_product',{rows:sourceRows}]]);
  const productView = VIEWS.find(v=>v.key==='product');
  const getRecord = key => recordsForDisplay(productView).records.find(r=>r.key===key);
`);
assert.equal(run("getRecord('black').pedidos"), null);
assert.equal(run("getRecord('black').compare.pedidos"), 4);
assert.equal(run("getRecord('black').compare.sessoes"), 593);
assert.equal(run("getRecord('black').missingContext.label"), 'Sem atribuicao paga');
assert.match(run("getRecord('black').missingContext.detail"), /Outros.*sem quebra|Outros.*falta de quebra/);
assert.doesNotMatch(run("metricComparisonCell(getRecord('black'),'pedidos')"), /Sem registro neste filtro|<small>Anterior:/);
assert.match(run("metricComparisonCell(getRecord('black'),'pedidos')"), /class="outside-value">5<button/);
assert.match(run("metricComparisonCell(getRecord('black'),'pedidos')"), /Outros &middot; fora do filtro/);
assert.match(run("metricComparisonCell(getRecord('black'),'pedidos')"), /Anterior nos canais selecionados: 4/);
assert.match(run("metricComparisonCell(getRecord('black'),'pedidos')"), /data-source-note=.*Base carregada/si);
assert.match(run("metricComparisonCell(getRecord('black'),'sessoes')"), /class="outside-value">679<button/);
assert.match(run("metricComparisonCell(getRecord('black'),'receita')"), /3\.071,91/);
assert.doesNotMatch(run("metricComparisonCell(getRecord('black'),'rate')"), /available-outside/);
assert.equal(run("getRecord('black').deltaPedidos"), null, 'Outside values never become paid growth or decline');
assert.equal(run("getRecord('black').missingContext.available[0].pedidos"), 5);
run(`const knownOutsideZero = {...summarize([]), missingContext:{detail:'Outside source',available:[{channel:'Outros',pedidos:0,sessoes:null,receita:0}]}};`);
assert.match(run("metricComparisonCell(knownOutsideZero,'pedidos')"), /class="outside-value">0<button/);
assert.doesNotMatch(run("metricComparisonCell(knownOutsideZero,'sessoes')"), /outside-value/);
assert.doesNotMatch(run("metricComparisonCell(getRecord('black'),'pedidos')"), /Sem dado SSOT|100,00%/);
assert.equal(run("getRecord('absent').missingContext.label"), 'Periodo incompleto');
assert.match(run("metricComparisonCell(getRecord('absent'),'pedidos')"), /metric-unavailable.*&ndash;/s);
assert.match(run("metricComparisonCell(getRecord('absent'),'pedidos')"), /data-source-note=.*Base carregada/s);
assert.doesNotMatch(run("metricComparisonCell(getRecord('absent'),'rate')"), />Nao calculavel</);
assert.equal(run("recordSemaphore(getRecord('black')).label"), 'Periodo incompleto', 'Coverage takes priority over attribution');
assert.equal(run("nextIndicator(getRecord('black'))"), 'Conferir atualizacao e cobertura');
assert.match(run("viewPeriodGap(productView,'current')"), /02\/11\/26.*03\/11\/26/);
assert.equal(run("getRecord('zero').pedidos"), 0);
assert.equal(run("getRecord('zero').rate"), 0);
assert.equal(run("getRecord('zero').deltaPedidos"), null);
assert.match(run("metricComparisonCell(getRecord('zero'),'pedidos')"), /Parcial no periodo/);
assert.doesNotMatch(run("metricComparisonCell(getRecord('zero'),'pedidos')"), /100,00%/);
assert.match(run("metricComparisonCell(getRecord('null'),'sessoes')"), /Nao informado na fonte/);
assert.match(run("metricComparisonCell(getRecord('denominator'),'rate')"), /Sem visitas \(base zero\)/);
assert.equal(run("getRecord('denominator').rate"), null);
run("state.end='2026-11-02'; state.compareStart='2026-10-30'");
assert.equal(run("viewPeriodGap(productView,'current')"), '');
assert.equal(run("getRecord('absent').missingContext.label"), 'Sem registros no recorte');
assert.match(run("metricComparisonCell(getRecord('absent'),'pedidos')"), /Anterior: 3/);
assert.doesNotMatch(run("metricComparisonCell(getRecord('absent'),'pedidos')"), />Sem registro neste filtro</);
assert.equal(run("getRecord('zero').deltaPedidos"), -1);
assert.match(run("metricComparisonCell(getRecord('zero'),'pedidos')"), /100,00%/);
assert.equal(run("getRecord('current').compare.missingContext.label"), 'Sem registros no recorte');
run("state.selectedChannel='group-google'");
assert.equal(run("missingRecordContext(productView,'key',new Map([['key',[{canal:'Facebook (1 + 2)'}]]]),'').label"), 'Fora do canal selecionado');
run("state.compareEnabled=false; state.selectedChannel=''");
assert.equal(run("viewPeriodGap(productView,'compare')"), '');
assert.equal(run("getRecord('absent')"), undefined);
assert.doesNotMatch(run("metricComparisonCell(getRecord('zero'),'pedidos')"), /Anterior|100,00%/);
assert.equal(run("missingRecordContext({key:'ad'},'',new Map(),'').label"), 'Fonte indisponivel');
run(`state.start=state.end='2026-11-03';
  state.growthPayload.refresh.views.push({id:'channel',coveredThrough:'2026-11-02'});
  state.rows=[{data:'2026-11-03',canal:'Google ADS',pedidos:1,sessoes:10,receita:10}];`);
assert.equal(run("viewPeriodGap({key:'channel'},'current')"), '', 'Newer commercial observations are not masked by an older Growth extraction');
console.log('Missingness: filter attribution, unloaded dates, absent rows, null fields, real zeros and comparison safety passed.');
