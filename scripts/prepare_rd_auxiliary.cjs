const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Rd = require('../assets/crm-rd.js');
const { prepare } = require('./import_rd_pilot.cjs');

const collectionHeaders = ['collection_id', 'account_id', 'observed_at', 'start_date', 'end_date', 'record_count', 'status'];
const campaignFields = ['campaign_id', 'campaign_name', 'send_at', 'contacts_count', 'email_delivered_count', 'email_opened_count', 'email_clicked_count', 'email_bounced_count', 'email_dropped_count', 'email_unsubscribed_count', 'email_spam_reported_count'];
const campaignHeaders = ['collection_id', 'account_id', ...campaignFields];

function bundle(input) {
  const snapshot = Rd.sanitizeSnapshot(input.schemaVersion === 1 ? input : prepare(input));
  const source = snapshot.source;
  const digest = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const collectionId = `rd-${source.accountId}-${digest.slice(0, 24)}`;
  const rows = [...snapshot.campaigns, ...snapshot.outsideCampaigns];
  const collection = [collectionId, source.accountId, source.observedAt, source.start, source.end, rows.length];
  return { schemaVersion: 1, sourceDigest: digest, collectionId,
    writePolicy: 'Dedicated auxiliary sheet only; RAW cell values; commit manifest only after exact readback. No source or SSOT writes.',
    collections: { sheet: 'RD_COLETAS', headers: collectionHeaders, pending: [...collection, 'pending'], committed: [...collection, 'committed'] },
    campaigns: { sheet: 'RD_CAMPANHAS', headers: campaignHeaders,
      rows: rows.map((row) => [collectionId, source.accountId, ...campaignFields.map((field) => row[field])]) },
    quality: { inside: snapshot.campaigns.length, outside: snapshot.outsideCampaigns.length,
      countIssueRows: Rd.normalizeSnapshot(snapshot).countIssueRows, scopeComplete: false, uniqueCountsConfirmed: false } };
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/prepare_rd_auxiliary.cjs <json-path>');
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
  const result = bundle(input);
  const directory = path.resolve(__dirname, '../output/rd-auxiliary');
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `${result.collectionId}.json`);
  const content = JSON.stringify(result, null, 2) + '\n';
  if (fs.existsSync(destination)) {
    if (fs.readFileSync(destination, 'utf8') !== content) throw new Error('Existing bundle differs; refusing to overwrite');
  } else fs.writeFileSync(destination, content, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ prepared: result.campaigns.rows.length, collectionId: result.collectionId, destination, externalWrites: false }));
}
module.exports = { bundle, collectionHeaders, campaignHeaders };
