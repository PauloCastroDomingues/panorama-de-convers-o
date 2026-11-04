const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({console,Intl,Date,Map,Set,setTimeout,clearTimeout,document:{querySelector:()=>null}});
for(const file of ['app.js','performance-delta.js','growth-analysis.js']){
  let code=fs.readFileSync(path.join(__dirname,'..','assets',file),'utf8');
  if(file==='growth-analysis.js')code=code.slice(0,code.lastIndexOf('setupEvents();'));
  vm.runInContext(code,context);
}
const run=code=>vm.runInContext(code,context);
function signal(current, average, extra = {}) {
  return JSON.parse(run(`JSON.stringify(productAverageSignal(${JSON.stringify({rate:current, averageRate:average, ...extra})}))`));
}
assert.equal(signal(.012, .01).tone, 'good');
assert.equal(signal(.008, .01).tone, 'bad');
assert.equal(signal(.011, .01).tone, 'warn');
assert.equal(signal(0, 0).tone, 'warn');
assert.equal(signal(0, .01).tone, 'bad');
assert.equal(signal(null, .01).tone, 'neutral');
assert.equal(signal(.01, null).tone, 'neutral');
assert.equal(signal(.02, .01, {periodGap:'Data not loaded'}).tone, 'neutral');
assert.equal(signal(.02, .01, {missingContext:{detail:'Outside filter'}}).tone, 'neutral');
assert.equal(signal(.02, .01, {provenance:{partialLinkage:true}}).tone, 'neutral');
assert.equal(signal(.02, .01, {conversionHistory:{provenance:{partialLinkage:true}}}).tone, 'neutral');
assert.equal(signal(.02, .01, {compare:{periodGap:'Previous period missing'}}).tone, 'good');
run(`
  state.start='2026-10-02';state.end='2026-10-02';state.compareEnabled=false;
  const product=VIEWS.find(v=>v.key==='product'),channel=VIEWS.find(v=>v.key==='channel_product');
  const row=(id,canal,pedidos,sessoes,data)=>({product_id:id,produto:'Tenis '+id,canal,pedidos,sessoes,receita:100,data});
  function load(rows){
    state.growthPayload={};
    state.growthViewMap=new Map([['channel_product',{rows}]]);
    state.normalizedViewRows.clear();
  }
  const base=[row('A','Meta Ads',1,10,'2026-09-01'),row('A','Meta Ads',9,990,'2026-10-02'),
    row('A','Google Ads',4,100,'2026-09-02'),row('A','Google Ads',2,100,'2026-10-02'),
    row('B','Meta Ads',50,100,'2026-10-02'),row('A','Outros',1000,1000,'2026-09-01'),
    row('A','Meta Ads',500,1000,'2026-10-03')];
  load(base);
`);
assert.equal(run("productConversionHistory(product).get('A').rate"),16/1200);
assert.equal(run("productConversionHistory(product).get('B').rate"),0.5);
assert.equal(run("recordsForDisplay(product).records.find(r=>r.key==='A').rate"),11/1090,'Current conversion is not replaced');
assert.equal(run("productConversionHistory(channel).get('Facebook (1 + 2)|A').rate"),0.01);
assert.equal(run("productConversionHistory(channel).get('Google ADS|A').rate"),0.03);
assert.equal(run("explorerColumns(product).findIndex(c=>c[1]==='averageRate')"),run("explorerColumns(product).findIndex(c=>c[1]==='rate')")+1);
assert.equal(run("explorerColumns(VIEWS.find(v=>v.key==='campaign')).some(c=>c[1]==='averageRate')"),false);
run("state.selectedChannel='group-google'");
assert.equal(run("productConversionHistory(product).get('A').rate"),0.03);
assert.equal(run("productConversionHistory(product).has('B')"),false);
run("state.selectedChannel='';state.start='2026-09-30'");
assert.equal(run("productConversionHistory(product).get('A').rate"),16/1200);
run("state.selectedProduct='A'");
assert.equal(run("productConversionHistory(product).size"),1);
run("state.selectedProduct='';load([row('A','Meta Ads',1,null,'2026-10-02'),row('A','Google Ads',2,100,'2026-10-02')])");
assert.equal(run("productConversionHistory(product).get('A').rate"),null);
run("load([row('A','Meta Ads',0,100,'2026-10-02')])");
assert.equal(run("productConversionHistory(product).get('A').rate"),0);
run("load([row('A','Meta Ads',0,0,'2026-10-02')])");
assert.equal(run("productConversionHistory(product).get('A').rate"),null);
run("load([row('A','Outros',10,100,'2026-10-02')])");
assert.equal(run("productConversionHistory(product).size"),0);
console.log('Product historical average passed: separate column, per-product/channel weighting, cutoff, filters, missingness and real zero.');
