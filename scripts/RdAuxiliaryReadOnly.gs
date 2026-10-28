// Standalone Apps Script project. Never replace GrowthViews.gs or the SSOT doGet.
// Script properties: RD_AUX_SHEET_ID, RD_SHEETS_READ_TOKEN, RD_ACCOUNT_ID.
var RD_AUX_COLLECTION_HEADERS = ['collection_id', 'account_id', 'observed_at', 'start_date', 'end_date', 'record_count', 'status'];
var RD_AUX_CAMPAIGN_FIELDS = ['campaign_id', 'campaign_name', 'send_at', 'contacts_count', 'email_delivered_count', 'email_opened_count', 'email_clicked_count', 'email_bounced_count', 'email_dropped_count', 'email_unsubscribed_count', 'email_spam_reported_count'];
var RD_AUX_CAMPAIGN_HEADERS = ['collection_id', 'account_id'].concat(RD_AUX_CAMPAIGN_FIELDS);

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('RD_SHEETS_READ_TOKEN');
  if (!token || !e || !e.parameter || e.parameter.token !== token) return RD_AUX_json_({ ok: false, error: 'unauthorized' });
  try {
    return RD_AUX_json_(RD_AUX_snapshot_(props));
  } catch (error) {
    return RD_AUX_json_({ ok: false, error: 'rd_auxiliary_read_failed' });
  }
}

function RD_AUX_snapshot_(props) {
  var sheetId = props.getProperty('RD_AUX_SHEET_ID') || '1zwtc4hHo-7GXHWBXut3Xd43ybGs2IHM_K_Xh603MwQw';
  var accountId = props.getProperty('RD_ACCOUNT_ID');
  if (!sheetId || !accountId) throw new Error('missing_configuration');
  var protectedIds = ['1z_Aixkiton5AmlpIM8q0daWFgXNPKXjqo15wxD5C2oM', '1vlkkrA52FBGk79k0ou3vch1XqM-AdHVDj42IXO7hIZo', '1OcM3LBfMUnToMbLKXtZfgB_3CAux4om7rQ1iLSSEHXc'];
  if (protectedIds.indexOf(sheetId) !== -1) throw new Error('use_dedicated_auxiliary_sheet');
  var book = SpreadsheetApp.openById(sheetId);
  var collections = RD_AUX_rows_(book, 'RD_COLETAS', RD_AUX_COLLECTION_HEADERS).filter(function (row) { return row.status === 'committed' && row.account_id === accountId; });
  if (!collections.length) throw new Error('no_committed_collection');
  var ids = {};
  collections.forEach(function (row) {
    if (typeof row.collection_id !== 'string' || !row.collection_id || ids[row.collection_id]) throw new Error('duplicate_or_invalid_collection');
    ids[row.collection_id] = true;
    RD_AUX_timestamp_(row.observed_at);
    if (!RD_AUX_date_(row.start_date) || !RD_AUX_date_(row.end_date) || row.start_date > row.end_date) throw new Error('invalid_period');
    if (RD_AUX_count_(row.record_count) === null) throw new Error('missing_record_count');
  });
  collections.sort(function (a, b) { return Date.parse(b.observed_at) - Date.parse(a.observed_at); });
  if (collections.length > 1 && Date.parse(collections[0].observed_at) === Date.parse(collections[1].observed_at)) throw new Error('ambiguous_latest_collection');
  var current = collections[0];
  var rows = RD_AUX_rows_(book, 'RD_CAMPANHAS', RD_AUX_CAMPAIGN_HEADERS).filter(function (row) { return row.collection_id === current.collection_id; });
  if (rows.length !== RD_AUX_count_(current.record_count)) throw new Error('incomplete_collection');
  var seen = {};
  var campaigns = [], outside = [];
  rows.forEach(function (row) {
    if (row.account_id !== accountId || typeof row.campaign_id !== 'string' || !row.campaign_id.trim()) throw new Error('account_or_campaign_id_requires_text');
    RD_AUX_timestamp_(row.send_at);
    var key = JSON.stringify([accountId, row.campaign_id, new Date(row.send_at).toISOString()]);
    if (seen[key]) throw new Error('duplicate_campaign_observation');
    seen[key] = true;
    var record = { campaign_id: row.campaign_id, campaign_name: typeof row.campaign_name === 'string' ? row.campaign_name : null, send_at: row.send_at };
    RD_AUX_CAMPAIGN_FIELDS.slice(3).forEach(function (field) { record[field] = RD_AUX_count_(row[field]); });
    var date = Utilities.formatDate(new Date(row.send_at), 'America/Sao_Paulo', 'yyyy-MM-dd');
    (date >= current.start_date && date <= current.end_date ? campaigns : outside).push(record);
  });
  return { schemaVersion: 1, source: { name: 'RD Station Marketing', tool: 'emails_by_campaign_analytics', accountId: accountId,
    observedAt: current.observed_at, sourceUpdatedAt: null, start: current.start_date, end: current.end_date,
    timeZone: 'America/Sao_Paulo', mode: 'auxiliary_sheet', scopeComplete: false, coverageEvidence: null,
    uniqueCountsConfirmed: false, uniqueCountsEvidence: null }, campaigns: campaigns, outsideCampaigns: outside };
}

function RD_AUX_rows_(book, name, headers) {
  var sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('missing_sheet');
  var count = sheet.getLastRow();
  if (count < 1 || count > 20000) throw new Error('source_size_requires_review');
  var range = sheet.getRange(1, 1, count, headers.length);
  var values = range.getValues();
  if (JSON.stringify(values.shift()) !== JSON.stringify(headers)) throw new Error('unexpected_headers');
  if (range.getFormulas().some(function (row) { return row.some(function (value) { return Boolean(value); }); })) throw new Error('formulas_not_allowed');
  return values.filter(function (row) { return row.some(function (value) { return value !== ''; }); }).map(function (row) {
    var record = {};
    headers.forEach(function (header, index) { record[header] = row[index]; });
    return record;
  });
}

function RD_AUX_count_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('invalid_count');
  return value;
}
function RD_AUX_date_(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function RD_AUX_timestamp_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !RD_AUX_date_(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw new Error('timestamp_requires_offset');
}
function RD_AUX_json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
