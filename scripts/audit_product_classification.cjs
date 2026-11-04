const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = process.argv[2] || path.join(root, 'output/line-audit-release/data/ssot-growth-views.json');
const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
const context = vm.createContext({ console, Intl, Date, Map, Set, document:{querySelector:()=>null} });
vm.runInContext(fs.readFileSync(path.join(root, 'assets/app.js'),'utf8'), context);
const entries = new Map();
for (const row of payload.data.find(v=>v.view==='channel_product').rows) {
  const normalized = vm.runInContext('normalizeRow('+JSON.stringify(row)+')', context);
  if (!vm.runInContext('isAnalysisRow('+JSON.stringify(normalized)+') && isMerchandiseProduct('+JSON.stringify(normalized)+')',context)) continue;
  if (!entries.has(normalized.productName)) entries.set(normalized.productName, {
    name:normalized.productName,type:normalized.productType,line:normalized.productLine,ids:[],channels:[] });
  const item=entries.get(normalized.productName);
  if(!item.ids.includes(normalized.productKey)) item.ids.push(normalized.productKey);
  if(!item.channels.includes(normalized.canal)) item.channels.push(normalized.canal);
}
const originalLines = new Set(['RS','GT','Avant','Phantom','Knit','911','Macan']);
const rows=[...entries.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
const newlyRecognized=rows.filter(r=>!originalLines.has(r.line)&&r.line!=='Sem classificacao');
const noLine=rows.filter(r=>r.line==='Sem classificacao');
const report={source:path.basename(source),scope:'All loaded dates, paid Growth channels, distinct product names',
  products:rows.length,previouslyUnclassifiedLines:newlyRecognized.length+noLine.length,
  newlyRecognized:newlyRecognized.length,remainingWithoutNamedLine:noLine.length,
  unknownTypes:rows.filter(r=>r.type==='Sem classificacao').length,
  newLines:[...new Set(newlyRecognized.map(r=>r.line))].sort(),
  remaining:noLine,rows};
fs.mkdirSync(path.join(root,'output/product-taxonomy'),{recursive:true});
fs.writeFileSync(path.join(root,'output/product-taxonomy/classification-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,rows:undefined},null,2));
