const assert = require('node:assert/strict');
const rd = require('../assets/crm-rd.js');
const context = { accountId: 'fixture-account', observedAt: '2026-10-28T12:00:00-03:00', start: '2026-10-21', end: '2026-10-27',
  uniqueCountsConfirmed: true, uniqueCountsEvidence: 'Fixture: validated passthrough to the official email analytics API', scopeComplete: true,
  coverageEvidence: 'Fixture: complete single-campaign response' };
// Campaign counts from the supplied diagnostic; account and clock are test-only fixtures.
const campaign = { account_id: context.accountId, campaign_id: 20428712, campaign_name: 'Ultimas 07 Horas', send_at: '2026-10-24T17:00:00-03:00',
  contacts_count: 40005, email_delivered_count: 39807, email_opened_count: 19035, email_clicked_count: 56 };
const source = JSON.stringify(campaign);
const result = rd.normalizeCampaigns([campaign], context);
assert.equal(JSON.stringify(campaign), source);
assert.equal(result.records[0].date, '2026-10-24');
assert.equal(result.records[0].rates.deliveryRate, 39807 / 40005);
assert.equal(result.records[0].rates.openRate, 19035 / 39807);
assert.equal(result.records[0].rates.clickToOpenRate, 56 / 19035);
assert.equal(result.sourceUpdatedAt, null, 'Collection clock is not source update time');
assert.equal(result.interactionEventDatesKnown, false);
assert.equal(result.receivedRows, 1);
assert.equal(rd.normalizeCampaigns([campaign], { ...context, scopeComplete: false }).consolidated, null);
assert.throws(() => rd.normalizeCampaigns([campaign], { ...context, coverageEvidence: null }), /coverage_evidence/);
const unknown = rd.normalizeCampaigns([campaign], { ...context, uniqueCountsConfirmed: false });
assert.equal(unknown.records[0].counts.clicked, 56);
assert.equal(unknown.records[0].rates.openRate, null);
assert.equal(unknown.records[0].rates.clickToOpenRate, null);
assert.equal(unknown.records[0].rates.deliveryRate, 39807 / 40005);
assert.throws(() => rd.normalizeCampaigns([campaign], { ...context, uniqueCountsEvidence: null }), /evidence/);
assert.equal(rd.normalizeCampaigns([campaign, campaign], context).duplicateRows, 1);
assert.equal(rd.normalizeCampaigns([campaign, campaign], context).observed.selected, 40005);
assert.throws(() => rd.normalizeCampaigns([campaign, { ...campaign, email_clicked_count: 57 }], context), /conflicting/);
assert.throws(() => rd.normalizeCampaigns([{ ...campaign, account_id: 'other-account' }], context), /account_mismatch/);
assert.throws(() => rd.normalizeCampaigns([{ ...campaign, send_at: '2026-10-24T17:00:00' }], context), /timestamp/);
assert.throws(() => rd.normalizeCampaigns([{ ...campaign, send_at: '2026-02-31T17:00:00Z' }], context), /timestamp/);
assert.throws(() => rd.normalizeCampaigns([{ ...campaign, email_clicked_count: -1 }], context), /invalid_rd_count/);
const boundary = rd.normalizeCampaigns([{ ...campaign, send_at: '2026-10-21T01:00:00Z' }], context);
assert.equal(boundary.records.length, 0);
assert.equal(boundary.outsidePeriod[0].date, '2026-10-20', 'Dates are clipped after Sao Paulo conversion');
const suspicious = { ...campaign, campaign_id: 20441002, contacts_count: 113142, email_delivered_count: 0, email_opened_count: 0, email_clicked_count: 0,
  email_unsubscribed_count: 1, email_spam_reported_count: 1 };
const quarantined = rd.normalizeCampaigns([campaign, suspicious], context);
assert.equal(quarantined.records[1].counts.delivered, 0, 'Observed zero is never rewritten');
assert.equal(quarantined.records[1].trustedCounts.delivered, null);
assert.equal(quarantined.records[1].rates.deliveryRate, null, 'Suspicious zero cannot masquerade as a verified delivery rate');
assert.equal(quarantined.observed.delivered, null, 'Do not hide a quarantined campaign by summing only good rows');
assert.equal(quarantined.observed.coverage.delivered.known, 1);
assert.ok(quarantined.records[1].issues.includes('zero_delivery_with_activity'));
const allBounced = rd.normalizeCampaigns([{ ...suspicious, email_unsubscribed_count: 0, email_spam_reported_count: 0, email_bounced_count: 113142 }], context);
assert.equal(allBounced.records[0].rates.deliveryRate, 0, 'Bounces alone do not contradict zero deliveries');
assert.equal(allBounced.records[0].issues.includes('zero_delivery_with_activity'), false);
const minimized = rd.normalizeCampaigns([{ ...campaign, contact_email: 'private@example.test', email_clicked_rate: 99, access_token: 'private' }], context);
assert.equal(/private@example|access_token|email_clicked_rate/.test(JSON.stringify(minimized)), false, 'Whitelisted records exclude private or ready-made rate fields');
assert.equal('orders' in minimized.records[0], false, 'No channel sales are copied into campaign records');
console.log('CRM RD: real diagnostic formulas, date clipping, quality flags, account isolation and deduplication passed.');

const snapshot = require('./fixtures/rd-pilot-20261028.json');
const model = rd.normalizeSnapshot(snapshot);
assert.equal(model.receivedRows, 26);
assert.equal(model.records.length, 25);
assert.equal(model.outsidePeriod.length, 1);
assert.equal(model.outsidePeriod[0].campaignId, '20407302');
assert.equal(model.countIssueRows, 5);
assert.equal(model.scopeComplete, false);
assert.equal(model.consolidated, null);
assert.equal(model.records.find((row) => row.campaignId === '20428712').provisionalRates.clickToOpenRate, 56 / 19035);
assert.equal(model.records.find((row) => row.campaignId === '20441002').provisionalRates.deliveryRate, null);
const full = rd.selectPeriod(model, '2026-10-21', '2026-10-27');
assert.deepEqual(full.receivedTotals, { selected: 1523910, delivered: 1227558, opened: 372900, clicked: 1765 });
assert.equal(full.consolidated, null, 'Received counter totals are not certified period performance');
assert.equal(rd.selectPeriod(model, '2026-10-20', '2026-10-20').records.length, 0, 'Excluded records cannot become a spurious full comparison');
assert.equal(rd.selectPeriod(model, '2026-08-01', '2026-08-31').receivedTotals.clicked, null);
assert.equal(rd.selectPeriod({ ...model, scopeComplete: true }, '2026-08-01', '2026-08-31').consolidated, null, 'Validated source coverage does not extend beyond its own window');
assert.equal(model.observed.delivered, null, 'Suspicious zero deliveries prevent a misleading aggregate');
assert.equal(model.observed.opened, null, 'Unconfirmed unique counts remain separate from provisional arithmetic');
assert.throws(() => rd.normalizeCampaigns([campaign], { ...context, accountId: Number.MAX_SAFE_INTEGER + 1 }), /unsafe_rd_identifier/);
const preparedSource = { extraction: { tool: 'emails_by_campaign_analytics', account_id: 832517, collectedAt: snapshot.source.observedAt,
  query_parameters: { start_date: snapshot.source.start, end_date: snapshot.source.end } },
  counts: { received: 26, inside: 25, outside: 1, inconsistent: 5, duplicate_campaign_ids_inside: {} },
  campaigns_inside_period: snapshot.campaigns, campaigns_outside_period: snapshot.outsideCampaigns };
const importer = require('./import_rd_pilot.cjs');
assert.equal(importer.prepare(preparedSource).campaigns.length, 25);
assert.throws(() => importer.prepare({ ...preparedSource, counts: { ...preparedSource.counts, inside: 24 } }), /count does not reconcile/);
assert.equal(/workflow_email_statistics|reise_rates_provisional|collectedAt|account_id/.test(JSON.stringify(snapshot)), false, 'Pilot only contains whitelisted data, not workflow IDs or ready-made rates');
console.log('CRM RD actual pilot: 26 received, 25 selected, five flagged, snapshot import and coverage guards passed.');

const latestSnapshot = require('../data/crm-rd-snapshot.json');
const latest = rd.normalizeSnapshot(latestSnapshot);
assert.equal(latest.receivedRows, latestSnapshot.campaigns.length + latestSnapshot.outsideCampaigns.length);
assert.equal(latest.records.length, latestSnapshot.campaigns.length);
assert.equal(latest.outsidePeriod.length, latestSnapshot.outsideCampaigns.length);
assert.ok(latest.records.length > 0);
assert.equal(latest.duplicateRows, 0);
assert.equal(latest.period.start, latestSnapshot.source.start);
assert.equal(latest.period.end, latestSnapshot.source.end);
assert.equal(latest.scopeComplete, false, 'Committed auxiliary load does not certify RD coverage');
const sums = Object.fromEntries([['selected', 'contacts_count'], ['delivered', 'email_delivered_count'], ['opened', 'email_opened_count'], ['clicked', 'email_clicked_count']].map(([key, field]) => [key, latestSnapshot.campaigns.reduce((sum, row) => sum + row[field], 0)]));
assert.deepEqual(rd.selectPeriod(latest, latest.period.start, latest.period.end).receivedTotals, sums);
console.log(`CRM RD latest sheet load: ${latest.records.length} observations; original pilot retained as a regression fixture.`);
