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
function independentBundle(id = 'one', finishedAt) {
  const value = bundle(id, finishedAt);
  const status = value.files['data-refresh-status.json'];
  Object.assign(status, {status:'partial', publicationPolicy:'independent_sources',
    acceptedSources:['ssot','growth','whatsapp','rd'], sourceWarnings:['sendflow:before_target','growth:ad_group:not_current']});
  status.release.mode = 'independent_sources';
  for (const source of status.sources) source.retained = source.id === 'sendflow';
  Object.assign(status.sources[4], {status:'stale',latestDate:'2026-09-30',collectionId:null,coveredThrough:null,observedAt:null});
  value.files['crm-sendflow-snapshot.json'].source = structuredClone(sourceFiles['crm-sendflow-snapshot.json'].source);
  Object.assign(status.sources[1], {status:'partial',coveredThrough:'2026-10-29',views:
    ['channel','campaign','ad_group','channel_product','campaign_product','ad_group_product'].map(id => ({id,label:id,
      status:id.includes('group') ? 'error' : 'current',retained:id.includes('group'),
      coveredThrough:id.includes('group') ? '2026-10-29' : '2026-11-02'}))});
  return value;
}
module.exports = {bundle, independentBundle, names:files};
