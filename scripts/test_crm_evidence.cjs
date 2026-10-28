const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, 'CrmSsotChannelEvidence.gs'), 'utf8');
const calls = [];
const sourceNames = ['dashboard_gerencial_channels_daily_live_v', 'shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_v'];
const response = (fields, values) => ({ jobComplete: true, schema: { fields: fields.map((name) => ({ name })) }, rows: values.map((row) => ({ f: row.map((v) => ({ v })) })) });
let tooExpensive = false;
const context = vm.createContext({ Date, JSON, Number, String, Error, Object,
  Logger: { log() {} }, Utilities: { sleep() {} }, BigQuery: { Jobs: { query(options) {
    calls.push(options);
    if (options.dryRun) return { totalBytesProcessed: tooExpensive ? '2147483648' : '100' };
    if (options.query.includes('INFORMATION_SCHEMA.COLUMNS')) return response(['table_name', 'column_count', 'columns_json'], sourceNames.map((name) => [name, '6', JSON.stringify(['data', 'canal', 'tipo', 'sessoes', 'pedidos', 'vendas'].map((column_name) => ({ column_name, data_type: 'fixture' })))]));
    if (options.query.includes('INFORMATION_SCHEMA.VIEWS')) return response(['table_name', 'view_definition'], [[sourceNames[0], 'SELECT * FROM `reise-ssot.mart_growth_us.fixture_proxy`']]);
    return response(['data', 'canal', 'tipo', 'source_rows', 'sessoes_recebidas'], [['2026-10-21', 'E-mail', 'email', '1', null]]);
  } } },
});
vm.runInContext(script, context);
const result = vm.runInContext('SSOT_inspectCrmChannelEvidence()', context);
assert.equal(result.complete, true);
assert.equal(result.tables.length, 2);
assert.equal(result.profiles[0].rows[0].sessoes_recebidas, null);
assert.equal(result.lineage[0].proportionalSignals, true);
assert.equal(result.lineage[0].references[0], 'reise-ssot.mart_growth_us.fixture_proxy');
assert.equal(calls.filter((options) => options.dryRun).length, 2);
for (const options of calls) {
  assert.equal(options.maximumBytesBilled, '1073741824');
  assert.doesNotMatch(options.query, /\b(CREATE|ALTER|INSERT|UPDATE|DELETE|MERGE|DROP|EXPORT)\b/i);
  assert.doesNotMatch(options.query, /SELECT\s+\*/i);
  if (options.query.includes('@start_date')) {
    assert.equal(options.queryParameters[0].parameterValue.value, '2026-10-21');
    assert.match(options.query, /COUNTIF\(sessoes IS NULL\)/);
    assert.doesNotMatch(options.query, /COALESCE|IFNULL/i);
  }
}
tooExpensive = true;
const previousCalls = calls.length;
const expensive = vm.runInContext('SSOT_inspectCrmChannelEvidence()', context);
assert.equal(expensive.complete, false);
assert.match(expensive.profiles[0].reason, /Read skipped/);
assert.equal(calls.length - previousCalls, 4, 'Only metadata and dry runs execute above the cost cap');
assert.throws(() => vm.runInContext("SSOT_CRM_E_profileSql_('shopify_channels_daily_v')", context), /not allowed/);
console.log('CRM evidence: focused metadata, aggregate-only data, date parameters, null diagnostics and cost preflight passed (mock only).');
