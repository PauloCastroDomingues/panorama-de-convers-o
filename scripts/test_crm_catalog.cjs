const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, 'CrmSsotCatalogDiagnostic.gs'), 'utf8');
const queries = [], logs = [];
const row = { f: [{ v: 'mart_growth_us' }, { v: 'fixture_rd_email' }, { v: '1' }, { v: JSON.stringify([{ column_name: 'campaign_id', data_type: 'STRING' }]) }] };
const context = vm.createContext({ Date, JSON, Number, String, Error,
  Logger: { log: (value) => logs.push(JSON.parse(value)) }, Utilities: { sleep() {} },
  BigQuery: { Jobs: { query(options, project) {
    queries.push({ options, project });
    if (options.location === 'southamerica-east1') throw new Error('Fixture permission denied');
    return { jobComplete: true, rows: [row] };
  } } },
});
vm.runInContext(script, context);
const result = vm.runInContext('SSOT_inspectCrmSourceCatalog()', context);
assert.equal(result.ok, true);
assert.equal(result.complete, false);
assert.equal(result.regions[0].tables[0].columns[0].column_name, 'campaign_id');
assert.match(result.regions[1].error, /permission denied/);
assert.equal(queries.length, 2);
for (const { options, project } of queries) {
  assert.equal(project, 'reise-ssot');
  assert.equal(options.maximumBytesBilled, '1073741824');
  assert.match(options.query, /INFORMATION_SCHEMA\.COLUMNS/);
  assert.match(options.query, /STARTS_WITH\(table_schema, 'mart_'\)/);
  assert.doesNotMatch(options.query, /\b(CREATE|ALTER|INSERT|UPDATE|DELETE|MERGE|DROP|EXPORT)\b/i);
}
assert.ok(logs.some((entry) => entry.candidate));
assert.throws(() => vm.runInContext("SSOT_CRM_metadataSql_('arbitrary-region')", context), /Invalid metadata region/);
context.BigQuery.Jobs.query = () => ({ jobComplete: true, rows: Array(31).fill(row) });
const capped = vm.runInContext('SSOT_inspectCrmSourceCatalog()', context);
assert.equal(capped.complete, false);
assert.equal(capped.regions[0].moreCandidates, true);
assert.equal(capped.regions[0].tables.length, 30);
let polls = 0;
context.BigQuery.Jobs.query = () => ({ jobComplete: false, jobReference: { jobId: 'fixture-job' } });
context.BigQuery.Jobs.getQueryResults = () => { polls++; return { jobComplete: true, rows: [row] }; };
assert.equal(vm.runInContext('SSOT_inspectCrmSourceCatalog()', context).complete, true);
assert.equal(polls, 2);
console.log('CRM catalog: read-only metadata, separate regions, cost cap, partial errors, truncation and polling passed (mock only).');
