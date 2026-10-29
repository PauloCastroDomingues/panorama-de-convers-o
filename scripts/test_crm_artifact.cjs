const assert = require('node:assert/strict');
const ssot = require('../assets/crm-sendflow.js');
const artifact = require('../assets/crm-artifact.js');
const snapshot = require('../data/ssot-commercial-channels.json');
const reference = require('../data/crm-weekly-reference.json');

// Fixed unit input: the production snapshot legitimately changes after a refresh.
const source = { kind: snapshot.kind, source: snapshot.source, metadata: snapshot.metadata, rows: [
  { data: '2026-10-22', canal: 'WhatsApp Oficial', sessoes: 279, pedidos: 4, receita: 1315.56 },
] };

const result = ssot.commercial(source, 'whatsapp-oficial', '2026-10-22', '2026-10-22');
assert.equal(result.sessions, 279);
assert.equal(result.orders, 4);
assert.equal(result.revenue, 1315.56);
assert.equal(result.rate, 4 / 279);
assert.equal(result.complete, true);
const knownLayout = { kind: source.kind, source: source.source, metadata: source.metadata, rows: [
  { data: '2026-10-22T00:00:00', canal: 'WhatsApp Oficial', sessoes: null, pedidos: 2, receita: 10 },
  { data: '2026-10-22', canal: 'WhatsApp Oficial', sessoes: 100, pedidos: 0, receita: 0 },
] };
assert.equal(ssot.commercial(knownLayout, 'whatsapp-oficial', '2026-10-22', '2026-10-22').rate, .02);
assert.deepEqual(ssot.availableDates(knownLayout, 'whatsapp-oficial'), ['2026-10-22']);
const unknown = { rows: knownLayout.rows };
assert.equal(ssot.commercial(unknown, 'whatsapp-oficial', '2026-10-22', '2026-10-22').sessions, null, 'Unknown source layouts retain strict missingness');
assert.equal(ssot.commercial({ ...knownLayout, rows: [knownLayout.rows[0]] }, 'whatsapp-oficial', '2026-10-22', '2026-10-22').sessions, null, 'All-null sessions cannot turn into zero');
const missingOrder = { ...knownLayout, rows: [{ data: '2026-10-22', canal: 'WhatsApp Oficial', sessoes: 100, pedidos: null, receita: null }] };
assert.equal(ssot.commercial(missingOrder, 'whatsapp-oficial', '2026-10-22', '2026-10-22').orders, null);
assert.equal(ssot.commercial(missingOrder, 'whatsapp-oficial', '2026-10-22', '2026-10-22').revenue, null);
assert.equal(ssot.commercial(source, 'whatsapp-oficial', '2026-10-27', '2026-10-27').rate, null, 'Future source gaps are not filled');
const english = { rows: [{ date: '2026-10-22', canal: 'E-mail', sessions: 20, orders: 2, revenue: 100 }] };
assert.equal(ssot.commercial(english, 'email', '2026-10-22', '2026-10-22').rate, .1);
assert.equal(ssot.commercial({ rows: [{ data: '2026-10-22', canal: 'E-mail', vendas: 100, pedidos: 2 }] }, 'email', '2026-10-22', '2026-10-22').sessions, null, 'Revenue can never become sessions');
assert.equal(artifact.dates('2026-10-19', '2026-10-25').length, 7);
assert.deepEqual(artifact.outputs('whatsapp-organico', { 'Vis. Club': 12, 'Vis. Membership': 8, Sessoes: 0 }), [20, 0]);
assert.deepEqual(artifact.outputs('whatsapp-organico', { 'Vis. Club': 12 }), [null, null]);
assert.deepEqual(artifact.outputs('whatsapp-oficial', { Publico: 100, Entregues: 0, Leitura: 0, Cliques: 0 }), [0, null, null]);
assert.deepEqual(artifact.outputs('email', { Leads: 100, Entregues: 90, Abertura: 30, Cliques: 3 }), [.9, 1/3, .1]);
assert.equal(artifact.outputs('email', { Leads: 10, Entregues: 20 })[0], null, 'Impossible observed rates are not reported');
const email = reference.channels.find((channel) => channel.id === 'email');
const cfg = email.activation.tracking;
assert.equal(artifact.dayCoverage(cfg, '2026-10-22', {}).state, 'empty');
const zeroRecord = { '2026-10-22:0': { Cliques: 0 } };
assert.equal(artifact.dayCoverage(cfg, '2026-10-22', zeroRecord).state, 'partial');
assert.equal(artifact.dayCoverage(cfg, '2026-10-22', zeroRecord).filled, 1, 'Recorded zero is filled, not missing');
assert.equal(artifact.dayStatus(cfg, '2026-10-22', {}, null), 'Sem registro');
assert.equal(artifact.dayStatus(cfg, '2026-10-22', { '2026-10-22:0': { Leads: 20 } }, null), 'Parcial');
assert.equal(artifact.dayStatus(cfg, '2026-10-22', zeroRecord, 0), '0 cliques');
const completeDay = Object.fromEntries(cfg.slots.map((_, index) => [`2026-10-22:${index}`, Object.fromEntries(cfg.inputs.map((field) => [field, 0]))]));
assert.equal(artifact.dayCoverage(cfg, '2026-10-22', completeDay).state, 'complete');
const calendar = artifact.dates('2026-10-16', '2026-10-28');
assert.deepEqual(artifact.trackingWindow(calendar, {}).displayed, ['2026-10-16']);
assert.deepEqual(artifact.trackingWindow(calendar, { trackingDate: '2026-10-20' }).displayed, ['2026-10-20']);
assert.deepEqual(artifact.trackingWindow(calendar, { trackingDate: '2026-10-20', trackingPage: 1 }).displayed, ['2026-10-23']);
assert.equal(artifact.trackingWindow(calendar, { trackingMode: 'period' }).displayed.length, 7);
assert.equal(artifact.trackingWindow(calendar, { trackingMode: 'period', trackingPage: 100 }).displayed.length, 6);
assert.deepEqual(artifact.trackingWindow([], { trackingDate: '2026-10-22' }).displayed, []);
const input = { version: 2, channel: 'email', rows: { '2026-10-22:0': { Cliques: 0 } } };
assert.equal(artifact.validateTracking(input, 'email', cfg)['2026-10-22:0'].Cliques, 0);
assert.throws(() => artifact.validateTracking(input, 'whatsapp-oficial', cfg));
assert.throws(() => artifact.validateTracking({ ...input, rows: { '2026-02-31:0': { Cliques: 10 } } }, 'email', cfg));
assert.throws(() => artifact.validateTracking({ ...input, rows: { '2026-10-22:0': { Cliques: -1 } } }, 'email', cfg));
assert.throws(() => artifact.validateTracking({ ...input, rows: { '2026-10-22:0': { Cliques: '10' } } }, 'email', cfg));
const totals = artifact.trackingTotals('email', cfg, ['2026-10-22', '2026-10-23'], input.rows);
assert.deepEqual(totals.map((day) => day.total), [0, null], 'Zero and missing dates stay distinct');
const options = { start: '2026-10-22', end: '2026-10-22', compareStart: '2026-10-21', compareEnd: '2026-10-21', referencePeriod: reference.period, mode: 'actual' };
const html = artifact.pacing({ daily: result.daily, ssotComparison: { daily: [] } }, email, options);
assert.match(html, /279/);
assert.match(html, /Anterior 21\/10/);
const withoutComparison = artifact.pacing({ daily: result.daily, ssotComparison: { daily: [] } }, email, { ...options, compareEnabled: false });
assert.doesNotMatch(withoutComparison, /Anterior|Comparacao:|performance-delta/);
assert.match(artifact.pacing({ daily: [] }, email, { ...options, mode: 'plan' }), /Nao sao resultados realizados/);
const recorded = { '2026-10-22:0': { Cliques: 3 } };
assert.equal(artifact.trackingSummary('email', email, options, recorded).goal, 2093, 'Click goal comes from planned clicks, not 2121 SSOT sessions');
assert.equal(artifact.trackingSummary('email', email, options, recorded).progress, null, 'Weekly plan is not applied to other date windows');
assert.equal(artifact.trackingSummary('email', email, { ...options, start: '2026-10-19', end: '2026-10-25' }, recorded).progress, 3 / 2093);
console.log('CRM artifact checks passed: structural SSOT nulls, immutable source gaps, daily comparisons, tracking isolation, CTOR and zero semantics.');
