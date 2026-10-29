const assert = require('node:assert/strict');
const api = require('../assets/crm-sendflow.js');
const snapshot = require('../data/ssot-commercial-channels.json');
const source = (date, extracted, sessions = 100) => ({ ...snapshot, extracted_at: extracted, rows: [
  { data: date, canal: 'E-mail', canal_detalhe: 'E-mail', sessoes: sessions, pedidos: 2, receita: '1000' },
] });
const old = source('2026-10-22', '2026-10-28T20:00:00Z');
const fresh = source('2026-10-27', '2026-10-28T15:00:00Z');
const now = new Date('2026-10-28T16:00:00Z');
assert.equal(api.latestCommercialSource([old, fresh], 'email'), fresh, 'Newest observation is not necessarily newest data');
assert.equal(api.latestCommercialSource([null, old], 'whatsapp-oficial'), null);
assert.equal(api.freshness(fresh, 'email', now).status, 'current');
assert.equal(api.freshness(old, 'email', now).status, 'stale');
assert.equal(api.freshness(source('2026-10-27', fresh.extracted_at, null), 'email', now).status, 'partial');
assert.equal(api.freshness(source('2026-10-27', fresh.extracted_at, 0), 'email', now).status, 'current', 'Recorded zero is not missing');
assert.equal(api.freshness(null, 'email', now).status, 'missing');
assert.equal(api.freshness(fresh, 'email', new Date('2026-10-28T01:00:00Z')).target, '2026-10-26', 'Business day follows Sao Paulo');
assert.equal(api.validateCommercialSnapshot(fresh), fresh);
assert.throws(() => api.validateCommercialSnapshot({ ...fresh, rows: [] }));
assert.throws(() => api.validateCommercialSnapshot({ ...fresh, source: 'untrusted' }));
assert.throws(() => api.validateCommercialSnapshot(source('2026-02-30', fresh.extracted_at)));
assert.throws(() => api.validateCommercialSnapshot(source('2026-10-27', fresh.extracted_at, 'unavailable')));
assert.equal(api.validateCommercialSnapshot(snapshot), snapshot);
console.log('CRM freshness: D-1, timezone, source selection, contract, partial coverage and recorded zeros passed.');
