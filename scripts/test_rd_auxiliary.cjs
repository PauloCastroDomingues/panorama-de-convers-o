const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Rd = require('../assets/crm-rd.js');
const { bundle } = require('./prepare_rd_auxiliary.cjs');
const pilot = require('./fixtures/rd-pilot-20261028.json');
const before = JSON.stringify(pilot);
const prepared = bundle(pilot);
assert.equal(JSON.stringify(pilot), before);
assert.deepEqual(bundle(pilot), prepared, 'Retry of the same extraction has the same collection ID');
assert.equal(prepared.campaigns.rows.length, 26);
assert.equal(prepared.collections.committed[5], 26);
assert.equal(prepared.quality.countIssueRows, 5);
assert.ok(prepared.campaigns.rows.every((row) => typeof row[1] === 'string' && typeof row[2] === 'string'));

const code = fs.readFileSync(path.join(__dirname, 'RdAuxiliaryReadOnly.gs'), 'utf8');
assert.doesNotMatch(code, /\.(setValues?|appendRow|deleteRows?|insertSheet|clear|createTrigger)\s*\(/);
let opened = 0, formulas = false;
const properties = { RD_AUX_SHEET_ID: 'dedicated-auxiliary-fixture', RD_ACCOUNT_ID: '832517', RD_SHEETS_READ_TOKEN: 'server-only-test-token' };
const tables = {
  RD_COLETAS: [prepared.collections.headers, prepared.collections.committed.slice()],
  RD_CAMPANHAS: [prepared.campaigns.headers, ...prepared.campaigns.rows.map((row) => row.slice())],
};
const context = vm.createContext({ Date, JSON, Number, String, Error, Object, Boolean,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] }) },
  ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (value) => ({ value, setMimeType() { return this; } }) },
  Utilities: { formatDate: (date) => {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } },
  SpreadsheetApp: { openById: () => { opened += 1; return { getSheetByName: (name) => ({ getLastRow: () => tables[name].length,
    getRange: () => ({ getValues: () => tables[name].map((row) => row.slice()), getFormulas: () => tables[name].map((row) => row.map(() => formulas ? '=1' : '')) }) }) }; } },
});
vm.runInContext(code, context);
const unauthorized = JSON.parse(vm.runInContext('doGet({parameter:{token:"bad"}})', context).value);
assert.equal(unauthorized.error, 'unauthorized');
assert.equal(opened, 0, 'Unauthorized calls cannot read even sheet metadata');
const fromSheet = JSON.parse(vm.runInContext('doGet({parameter:{token:"server-only-test-token"}})', context).value);
assert.equal(fromSheet.source.mode, 'auxiliary_sheet');
assert.equal(Rd.normalizeSnapshot(fromSheet).records.length, 25);
assert.equal(Rd.normalizeSnapshot(fromSheet).outsidePeriod.length, 1);
assert.equal(Rd.normalizeSnapshot(fromSheet).countIssueRows, 5);
assert.equal(Rd.normalizeSnapshot(fromSheet).scopeComplete, false);
assert.equal(fromSheet.source.sourceUpdatedAt, null);
assert.equal(fromSheet.campaigns.find((row) => row.campaign_id === '20441002').email_delivered_count, 0);
tables.RD_COLETAS.push(['new-pending', '832517', '2026-10-29T12:00:00Z', '2026-10-21', '2026-10-28', 10, 'pending']);
assert.equal(vm.runInContext('RD_AUX_snapshot_(PropertiesService.getScriptProperties())', context).campaigns.length, 25);
tables.RD_COLETAS.at(-1)[6] = 'committed';
assert.throws(() => vm.runInContext('RD_AUX_snapshot_(PropertiesService.getScriptProperties())', context), /incomplete_collection/);
tables.RD_COLETAS.pop();
formulas = true;
assert.throws(() => vm.runInContext('RD_AUX_snapshot_(PropertiesService.getScriptProperties())', context), /formulas_not_allowed/);
formulas = false;
tables.RD_CAMPANHAS.push(tables.RD_CAMPANHAS[1].slice());
tables.RD_COLETAS[1][5] = 27;
assert.throws(() => vm.runInContext('RD_AUX_snapshot_(PropertiesService.getScriptProperties())', context), /duplicate_campaign_observation/);
tables.RD_CAMPANHAS.pop();
tables.RD_COLETAS[1][5] = 26;
tables.RD_CAMPANHAS[1][2] = Number.MAX_SAFE_INTEGER + 1;
assert.throws(() => vm.runInContext('RD_AUX_snapshot_(PropertiesService.getScriptProperties())', context), /requires_text/);
tables.RD_CAMPANHAS[1] = prepared.campaigns.rows[0].slice();
const source = Rd.sanitizeSnapshot({ ...pilot, private_token: 'never-public', campaigns: pilot.campaigns.map((row) => ({ ...row, contact_email: 'private@example.test' })) });
assert.doesNotMatch(JSON.stringify(source), /private_token|contact_email|private@example/);
assert.throws(() => Rd.sanitizeSnapshot({ ...pilot, campaigns: [pilot.campaigns[0], ...pilot.campaigns] }), /duplicate_rd/);

async function testProxy() {
  const handler = require('../api/crm-rd.js');
  const originalFetch = global.fetch;
  const keys = ['RD_SHEETS_API_URL', 'RD_SHEETS_READ_TOKEN', 'RD_ACCOUNT_ID'];
  const originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let calls = 0;
  const call = async (method) => {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method }, response);
    return response;
  };
  try {
    keys.forEach((key) => delete process.env[key]);
    assert.equal((await call('GET')).code, 503);
    assert.equal((await call('POST')).code, 405);
    process.env.RD_SHEETS_API_URL = 'https://script.google.com/macros/s/test-deployment/exec?other=ignored';
    process.env.RD_SHEETS_READ_TOKEN = 'test-token';
    process.env.RD_ACCOUNT_ID = '832517';
    global.fetch = async (url) => {
      calls += 1;
      assert.equal(url.searchParams.get('token'), 'test-token');
      assert.equal(url.searchParams.has('other'), false);
      return new Response(JSON.stringify({ ...fromSheet, access_token: 'private' }), { status: 200 });
    };
    const result = await call('GET');
    assert.equal(result.code, 200);
    assert.equal(result.headers['Cache-Control'], 'private, no-store');
    assert.equal(result.body.campaigns.length, 25);
    assert.doesNotMatch(JSON.stringify(result.body), /private|token/);
    process.env.RD_ACCOUNT_ID = 'other-account';
    assert.equal((await call('GET')).code, 502);
    process.env.RD_ACCOUNT_ID = '832517';
    global.fetch = async () => new Response('x'.repeat(3000001));
    assert.equal((await call('GET')).code, 502, 'Streaming body limit works without Content-Length');
    global.fetch = async () => new Response(JSON.stringify(fromSheet), { headers: { 'content-length': '3000001' } });
    assert.equal((await call('GET')).code, 502);
    global.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'unauthorized' }));
    assert.equal((await call('GET')).code, 502);
    const previousCalls = calls;
    process.env.RD_SHEETS_API_URL = 'https://invalid.example.test/macros/s/test/exec';
    assert.equal((await call('GET')).code, 502);
    assert.equal(calls, previousCalls);
    assert.doesNotMatch(JSON.stringify((await call('GET')).body), /test-token|invalid.example/);
  } finally {
    global.fetch = originalFetch;
    keys.forEach((key) => originalEnv[key] === undefined ? delete process.env[key] : process.env[key] = originalEnv[key]);
  }
}

testProxy().then(() => console.log('RD auxiliary: deterministic 26-row bundle; read-only Apps Script; commit barrier; zero preservation; ID safety; account isolation; private-field filtering; bounded proxy passed (mock upstream).')).catch((error) => { console.error(error); process.exitCode = 1; });
