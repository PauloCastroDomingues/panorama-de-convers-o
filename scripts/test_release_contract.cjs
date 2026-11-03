const assert = require('node:assert/strict');
const {bundle} = require('./fixtures/cloud-release.cjs');
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
