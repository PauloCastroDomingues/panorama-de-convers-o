const fs = require('node:fs');
const path = require('node:path');
const {files} = require('../../assets/release-contract.js');
const root = path.resolve(__dirname, '../..');
const sourceFiles = Object.fromEntries(files.map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'))]));
// Simulated publication metadata only. Real metrics stay untouched and are never written back.
function bundle(id = 'one', finishedAt = '2026-11-03T12:00:00-03:00') {
  const payloads = structuredClone(sourceFiles);
  for (const name of files) payloads[name].marker = id;
  for (const provider of ['rd', 'sendflow']) {
    const source = payloads[`crm-${provider}-snapshot.json`].source;
    Object.assign(source, {collectionId:id, coveredThrough:'2026-11-02'});
    if (provider === 'rd') Object.assign(source, {end:'2026-11-02', observedAt:'2026-11-03T07:00:00-03:00'});
    else { source.coverage.end = '2026-11-02'; source.extractedAt = '2026-11-03T07:00:00-03:00'; }
  }
  payloads['data-refresh-status.json'] = {status:'current', runId:id, readOnly:true,
    targetDate:'2026-11-02', startedAt:'2026-11-03T07:00:00-03:00', finishedAt,
    publicationBlockers:[], release:{id}, sources:
    ['ssot','growth','whatsapp','rd','sendflow'].map(sourceId => ({id:sourceId,label:sourceId,status:'current',latestDate:'2026-11-02',
      ...(sourceId === 'growth' ? {coveredThrough:'2026-11-02'} : {}),
      ...(['rd','sendflow'].includes(sourceId) ? {collectionId:id, coveredThrough:'2026-11-02', observedAt:'2026-11-03T07:00:00-03:00'} : {})}))};
  return {schemaVersion:1, releaseId:id, files:payloads};
}
module.exports = {bundle, names:files};
