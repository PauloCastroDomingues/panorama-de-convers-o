const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const rd = require('../assets/crm-rd.js');

function prepare(source) {
  const extraction = source.extraction;
  assert.equal(extraction?.tool, 'emails_by_campaign_analytics', 'Unexpected RD source tool');
  assert.ok(typeof extraction.account_id === 'string' || Number.isSafeInteger(extraction.account_id), 'Campaign account ID must not lose precision');
  const fields = ['campaign_id', 'campaign_name', 'send_at', 'contacts_count', 'email_delivered_count', 'email_opened_count', 'email_clicked_count',
    'email_bounced_count', 'email_dropped_count', 'email_unsubscribed_count', 'email_spam_reported_count'];
  const clean = (row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
  const snapshot = { schemaVersion: 1, source: { name: 'RD Station Marketing', tool: extraction.tool,
    accountId: String(extraction.account_id), observedAt: extraction.collectedAt, sourceUpdatedAt: null,
    start: extraction.query_parameters.start_date, end: extraction.query_parameters.end_date, timeZone: 'America/Sao_Paulo',
    mode: 'pilot_snapshot', scopeComplete: false, coverageEvidence: null, uniqueCountsConfirmed: false, uniqueCountsEvidence: null,
    coverageNote: 'MCP pagination and maximum response count are not documented; field passthrough is not verified.' },
    campaigns: source.campaigns_inside_period.map(clean), outsideCampaigns: source.campaigns_outside_period.map(clean) };
  const result = rd.normalizeSnapshot(snapshot);
  assert.equal(result.receivedRows, source.counts.received, 'Received count does not reconcile');
  assert.equal(result.records.length, source.counts.inside, 'Local-period count does not reconcile');
  assert.equal(result.outsidePeriod.length, source.counts.outside, 'Excluded count does not reconcile');
  assert.equal(result.countIssueRows, source.counts.inconsistent, 'Quality count does not reconcile');
  assert.equal(result.duplicateRows, 0, 'Do not silently consolidate an export with duplicate observations');
  assert.equal(Object.keys(source.counts.duplicate_campaign_ids_inside).length, 0, 'Export reports duplicate campaign IDs');
  return snapshot;
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/import_rd_pilot.cjs <provided-json-path>');
  const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
  const snapshot = prepare(source);
  const destination = path.resolve(__dirname, '../data/crm-rd-snapshot.json');
  const temporary = destination + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(JSON.stringify({ imported: snapshot.campaigns.length, excluded: snapshot.outsideCampaigns.length,
    sourceUpdatedAt: null, mode: 'pilot_snapshot', scopeComplete: false, destination }));
}
module.exports = { prepare };
