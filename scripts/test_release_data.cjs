const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('assets/release-data.js', 'utf8');
const {bundle, independentBundle, names} = require('./fixtures/cloud-release.cjs');
const contract = require('../assets/release-contract.js');
(async () => {
  let value = bundle(), calls = 0;
  const window = { PANORAMA_CLOUD_RELEASE:true, PanoramaReleaseContract:contract };
  vm.runInNewContext(code, {window, AbortSignal, fetch:async () => {
    calls++; return {ok:true,json:async () => structuredClone(value)};
  }});
  const api = window.PanoramaRelease;
  await Promise.all(names.map(name => api.read(name)));
  assert.equal(calls,1);
  assert.equal((await api.read(names[0])).marker, 'one');
  value = bundle('broken'); delete value.files[names[2]];
  await assert.rejects(api.refresh(), /incompleto/);
  assert.equal((await api.read(names[0])).marker,'one');
  value = bundle('two','2026-11-03T16:00:00-03:00');
  await api.refresh();
  for (const name of names.slice(0,-1)) assert.equal((await api.read(name)).marker,'two');
  value = bundle('old');
  await assert.rejects(api.refresh(), /anterior/);
  assert.equal((await api.load()).releaseId,'two');
  for (const mutate of [
    b => b.files['ssot-commercial-channels.json'].rows[0].sessoes = 'invalid',
    b => b.files['ssot-growth-views.json'].data[0].rows[0].pedidos = 'invalid',
    b => b.files['crm-rd-snapshot.json'].source.accountId = null,
    b => b.files['crm-sendflow-snapshot.json'].actions = null,
    b => b.files['crm-whatsapp-snapshot.json'].rows = [],
    b => b.files['data-refresh-status.json'].sources[4] = b.files['data-refresh-status.json'].sources[0],
    b => b.files['data-refresh-status.json'].sources[4].collectionId = 'another',
    b => b.files['data-refresh-status.json'].sources[4].coveredThrough = '2026-11-01',
    b => b.files['crm-sendflow-snapshot.json'].source.extractedAt = '2026-11-02T20:00:00-03:00',
  ]) {
    value = bundle('corrupt','2026-11-03T18:00:00-03:00'); mutate(value);
    await assert.rejects(api.refresh());
    assert.equal((await api.load()).releaseId,'two');
  }
  await assert.rejects(api.read('private.json'), /fora/);
  const noEvents = bundle();
  noEvents.files['data-refresh-status.json'].sources[4].latestDate = null;
  contract.validate(noEvents);
  value = independentBundle('partial','2026-11-03T19:00:00-03:00');
  await api.refresh();
  assert.equal((await api.load()).releaseId, 'partial');
  assert.equal((await api.read('data-refresh-status.json')).sources[4].latestDate,'2026-09-30');
  console.log('Cloud bundle: shared fetch, all-source validation, atomic replacement and failure preservation passed.');
})().catch(error => {console.error(error);process.exitCode=1;});
