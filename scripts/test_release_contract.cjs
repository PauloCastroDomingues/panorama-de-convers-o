const assert = require('node:assert/strict');
const {bundle, independentBundle} = require('./fixtures/cloud-release.cjs');
const contract = require('../assets/release-contract.js');

const noEvents = bundle();
noEvents.files['data-refresh-status.json'].sources[1].latestDate = '2026-10-29';
contract.validate(noEvents);
for (const coveredThrough of [null, '', '2026-11-01', 'invalid']) {
  const stale = structuredClone(noEvents);
  stale.files['data-refresh-status.json'].sources[1].coveredThrough = coveredThrough;
  assert.throws(() => contract.validate(stale), /incompleto/);
}
const blocked = bundle();
blocked.files['data-refresh-status.json'].publicationBlockers = ['catalog_missing'];
assert.throws(() => contract.validate(blocked), /incompleto/);
console.log('Release contract: Growth coverage required; event date alone cannot certify freshness.');
contract.validate(independentBundle());
for (const mutate of [
  b => b.files['data-refresh-status.json'].sources[4].status = 'current',
  b => b.files['data-refresh-status.json'].acceptedSources.push('sendflow'),
  b => b.files['data-refresh-status.json'].status = 'current',
  b => b.files['data-refresh-status.json'].sources[1].views[0].coveredThrough = '2026-10-29',
  b => b.files['data-refresh-status.json'].sources[3].coveredThrough = '2026-10-29',
  b => b.files['crm-sendflow-snapshot.json'].messages = null,
]) {
  const invalid = independentBundle(); mutate(invalid);
  assert.throws(() => contract.validate(invalid));
}
console.log('Independent release: old SendFlow retained explicitly; fresh sources and partial Growth accepted.');
