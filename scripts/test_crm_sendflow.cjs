const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const api = require('../assets/crm-sendflow.js');
const snapshot = require('../data/crm-sendflow-snapshot.json');
const root = path.resolve(__dirname, '..');
const clone = () => JSON.parse(JSON.stringify(snapshot));
api.validate(snapshot);
const summary = api.summarize(snapshot, '2026-09-01', '2026-09-30');
assert.equal(summary.actions, 90);
assert.equal(summary.messages, 197);
assert.equal(summary.recipients, 745541);
assert.equal(summary.delivered, 356608);
assert.equal(summary.read, 514861);
assert.equal(summary.inconsistentReceipts, 194);
assert.equal(summary.readRate, null, 'Divergent receipts never produce a funnel rate');
assert.equal(summary.movement.add.subtotal, 371);
assert.equal(summary.movement.add.knownDays, 24);
assert.equal(summary.movement.remove.subtotal, 726);
assert.equal(summary.movement.clicks.subtotal, null, 'All-blank clicks are not zero');
assert.equal(summary.daily.find((row) => row.date === '2026-09-08').actions, 0, 'A covered day without actions is an observed zero');
assert.equal(api.summarize(snapshot, '2026-08-01', '2026-08-31').actions, null);
assert.equal(api.summarize(snapshot, '2026-08-31', '2026-09-02').complete, false);
const bad = clone(); bad.messages.push(bad.messages[0]);
assert.throws(() => api.validate(bad), /duplicada/);
const orphan = clone(); orphan.messages[0].actionId = 'unknown';
assert.throws(() => api.validate(orphan), /orfa/);
const mismatch = clone(); mismatch.actions[0].recipients += 1;
assert.throws(() => api.validate(mismatch), /reconciliados/);
assert.equal(/content_json|media_url|button_urls|userId|account_id|segmento_inferido/.test(JSON.stringify(snapshot)), false, 'Raw content and inferred segments never reach the client');
const payload = { generatedAt: '2026-10-28T12:00:00Z', data: [{ view: 'channel', source: 'SSOT', rows: [
  { data: '2026-09-01', canal: 'WhatsApp Organico', sessoes: 100, pedidos: 2, receita: '100.50' },
  { data: '2026-09-02', canal: 'WhatsApp Nao Oficial', sessoes: 400, pedidos: 3, receita: 200 },
  { data: '2026-09-01', canal: 'WhatsApp Oficial', sessoes: 20, pedidos: 1, receita: 50 },
  { data: '2026-09-03', canal: 'WhatsApp Organico', sessoes: null, pedidos: 4, receita: 10 },
] }] };
const commercial = api.commercial(payload, 'whatsapp-organico', '2026-09-01', '2026-09-02');
assert.equal(commercial.sessions, 500);
assert.equal(commercial.orders, 5);
assert.equal(commercial.revenue, 300.5);
assert.equal(commercial.rate, .01, 'SSOT conversion is weighted by sessions');
assert.equal(api.commercial(payload, 'whatsapp-organico', '2026-09-01', '2026-09-03').rate, null);
assert.equal(api.commercial(payload, 'whatsapp-organico', '2026-09-01', '2026-09-04').complete, false);
assert.equal(api.commercial(payload, 'whatsapp-oficial', '2026-09-01', '2026-09-01').sessions, 20);
assert.equal(api.hasChannel({ rows: [{ canal: 'Whatsapp' }, { canal: 'sendflow' }] }, 'whatsapp-organico'), false, 'Raw referrers cannot be mapped to a CRM channel by guesswork');
assert.equal(api.hasChannel({ rows: [{ canal: 'Whatsapp' }] }, 'whatsapp-oficial'), false);
const channel = api.buildChannel(snapshot, { id: 'whatsapp-organico' }, payload, '2026-09-01', '2026-09-02', '2026-08-30', '2026-08-31');
assert.equal(channel.metrics.find((row) => row.key === 'orders').actual, 5);
assert.equal(channel.metrics.find((row) => row.key === 'orders').comparison, null);
assert.equal(channel.sendflow.activity.actions, 4);
assert.equal(channel.segments.length, 0, 'Inferred segments do not become official funnels');

const crossPayload = { rows: [...payload.data[0].rows,
  { data: '2026-09-01', canal: 'E-mail', sessoes: 80, pedidos: 8, receita: 800 },
  { data: '2026-09-02', canal: 'E-mail', sessoes: 20, pedidos: 0, receita: 0 },
  { data: '2026-08-31', canal: 'WhatsApp Organico', sessoes: null, pedidos: 1, receita: 50 },
  { data: '2026-10-01', canal: 'WhatsApp Organico', sessoes: 100, pedidos: 5, receita: 500 },
] };
const noActivation = { id: 'email', name: 'E-mail', metrics: [], segments: [], activation: { segments: [] } };
assert.ok(api.availableDates(crossPayload).includes('2026-10-01'), 'Commercial date filters include dates without SendFlow messages');
const email = api.withCommercial(noActivation, noActivation, crossPayload, '2026-09-01', '2026-09-02', '2026-08-30', '2026-08-31');
assert.equal(email.metrics.find((row) => row.key === 'orders').actual, 8, 'No RD activation does not erase SSOT email orders');
assert.equal(email.metrics.find((row) => row.key === 'rate').actual, .08);
assert.equal(email.daily.length, 2);
const official = api.withCommercial({ id: 'whatsapp-oficial', metrics: [{ key: 'orders', actual: 9999, format: 'int' }] }, { id: 'whatsapp-oficial', name: 'WhatsApp Oficial' }, crossPayload, '2026-09-01', '2026-09-01', '2026-08-31', '2026-08-31');
assert.equal(official.metrics.find((row) => row.key === 'orders').actual, 1, 'Operational totals never replace SSOT commercial totals');
assert.equal(official.operationalMetrics[0].actual, 9999, 'Discrepancies stay available for reconciliation, not addition');
const october = api.buildChannel(snapshot, { id: 'whatsapp-organico' }, crossPayload, '2026-10-01', '2026-10-01', '2026-09-30', '2026-09-30');
assert.equal(october.sendflow.activity.actions, null);
assert.equal(october.metrics.find((row) => row.key === 'orders').actual, 5, 'SSOT commercial data survives outside SendFlow coverage');
const partial = api.buildChannel(snapshot, { id: 'whatsapp-organico' }, crossPayload, '2026-09-01', '2026-09-03', '2026-08-29', '2026-08-31');
assert.equal(api.aggregateCommercial([partial]).find((row) => row.key === 'rate').actual, null, 'Summary cannot manufacture conversion from partial session sums');
const independentCoverage = api.buildChannel(snapshot, { id: 'whatsapp-organico' }, crossPayload, '2026-09-01', '2026-09-01', '2026-08-31', '2026-08-31');
assert.equal(independentCoverage.metrics.find((row) => row.key === 'revenue').comparison, 50, 'Revenue comparison does not depend on complete session coverage');
assert.equal(independentCoverage.metrics.find((row) => row.key === 'rate').comparison, null);
assert.equal(api.aggregateCommercial([email, official]).find((row) => row.key === 'orders').actual, 9, 'Channel results are counted once, never joined at message grain');

// Run the bridge with a minimal Apps Script harness against the same sanitized data.
const context = vm.createContext({ console, Date, JSON, isFinite,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'private-test-token' }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  Utilities: { newBlob: (value) => ({ getBytes: () => Buffer.from(value) }), formatDate: (value) => value.toISOString().slice(0, 10) },
});
vm.runInContext(fs.readFileSync(path.join(root, 'scripts/SendFlowReadOnly.gs'), 'utf8'), context);
assert.equal(JSON.parse(vm.runInContext('doGet({parameter:{token:"wrong"}}).text', context)).error, 'unauthorized');
assert.equal(vm.runInContext('SF_number_("")', context), null);
assert.equal(vm.runInContext('SF_number_(0)', context), 0);
assert.throws(() => vm.runInContext('SF_number_("not a number")', context));
assert.equal(vm.runInContext('SF_date_("2026-09-01")', context), '2026-09-01');
assert.throws(() => vm.runInContext('SF_date_(46266)', context), /requires_validation/);

const table = (headers, records) => [headers, ...records.map((row) => headers.map((header) => row[header] ?? ''))];
const messageHeaders = ['release_id', 'action_id', 'sent_at_utc', 'sent_at_brasilia', 'data_brasilia', 'hora_brasilia', 'segmento_inferido', 'message_key', 'message_index', 'type', 'title', 'text', 'caption', 'footer', 'button_urls', 'button_labels', 'media_url', 'mention_all', 'recipients', 'delivered', 'read', 'played', 'generated_at_utc'];
const actionHeaders = ['release_id', 'action_id', 'sent_at_utc', 'sent_at_brasilia', 'data_brasilia', 'hora_brasilia', 'segmento_inferido', 'account_id', 'type', 'processed', 'success', 'error', 'created_at_utc', 'scheduled_to_utc', 'started_at_utc', 'finished_at_utc', 'groups', 'message_count', 'recipients', 'delivered', 'read', 'played', 'generated_at_utc'];
const nativeRows = (records) => records.map((row) => ({ release_id: row.releaseId, action_id: row.actionId,
  sent_at_utc: row.sentAt, data_brasilia: new Date(`${row.date}T03:00:00Z`), message_key: row.messageKey,
  message_index: row.messageIndex, type: row.type, success: row.success, groups: row.groups, message_count: row.messageCount,
  recipients: row.recipients, delivered: row.delivered, read: row.read, played: row.played, generated_at_utc: row.generatedAt,
}));
const grids = { Mensagens: table(messageHeaders, nativeRows(snapshot.messages)), Acoes: table(actionHeaders, nativeRows(snapshot.actions)),
  Movimento_diario: table(['release_id', 'data_brasilia', 'date_key_original', 'add', 'remove', 'clicks'], snapshot.movement.map((row) => ({ release_id: row.releaseId, data_brasilia: new Date(`${row.date}T03:00:00Z`), date_key_original: row.originalDateKey, add: row.add, remove: row.remove, clicks: row.clicks }))) };
context.SpreadsheetApp = { openById: (id) => {
  assert.equal(id, snapshot.source.spreadsheetId);
  return { getName: () => 'SendFlow test source', getSheetByName: (name) => ({ getLastRow: () => grids[name].length,
    getRange: (start, column, length, width) => ({ getValues: () => grids[name].slice(start - 1, start - 1 + length).map((row) => row.slice(column - 1, column - 1 + width)) }) }) };
} };
const bridged = JSON.parse(vm.runInContext('doGet({parameter:{token:"private-test-token"}}).text', context));
api.validate(bridged);
assert.equal(bridged.source.mode, 'live_sheet');
assert.equal(api.summarize(bridged, '2026-09-01', '2026-09-30').read, 514861);
assert.equal(bridged.movement[0].add, null);

(async () => {
  const handler = require('../api/crm-sendflow.js');
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method: 'POST' }, response);
  assert.equal(response.code, 405);
  const oldUrl = process.env.SENDFLOW_SHEETS_API_URL;
  const oldToken = process.env.SENDFLOW_SHEETS_READ_TOKEN;
  const oldFetch = global.fetch;
  delete process.env.SENDFLOW_SHEETS_API_URL; delete process.env.SENDFLOW_SHEETS_READ_TOKEN;
  await handler({ method: 'GET' }, response);
  assert.equal(response.code, 503);
  process.env.SENDFLOW_SHEETS_API_URL = 'https://script.google.com/macros/s/test/exec';
  process.env.SENDFLOW_SHEETS_READ_TOKEN = 'private-test-token';
  const upstream = clone(); upstream.messages[0].content_json = 'must-not-reach-browser'; upstream.source.coverage.private = 'must-not-reach-browser';
  global.fetch = async (url) => {
    assert.equal(new URL(url).searchParams.get('token'), 'private-test-token');
    return { ok: true, json: async () => upstream };
  };
  await handler({ method: 'GET' }, response);
  assert.equal(response.code, 200);
  assert.equal(JSON.stringify(response.body).includes('must-not-reach-browser'), false);
  api.validate(response.body);
  global.fetch = oldFetch;
  delete process.env.SENDFLOW_SHEETS_API_URL; delete process.env.SENDFLOW_SHEETS_READ_TOKEN;
  if (oldUrl !== undefined) process.env.SENDFLOW_SHEETS_API_URL = oldUrl;
  if (oldToken !== undefined) process.env.SENDFLOW_SHEETS_READ_TOKEN = oldToken;
  console.log('CRM SendFlow checks passed: source reconciliation, missingness, privacy, dates, channel isolation, comparisons and bridge guards.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
