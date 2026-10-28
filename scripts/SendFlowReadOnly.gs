// Use a separate Apps Script project. Do not replace the SSOT bridge's doGet.
var SENDFLOW_SHEET_ID = '1OcM3LBfMUnToMbLKXtZfgB_3CAux4om7rQ1iLSSEHXc';
var SENDFLOW_RELEASE_ID = '8TVmVDvdGL3OWrTYv9xx';
var SENDFLOW_TIMEZONE = 'America/Sao_Paulo';

function doGet(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('SENDFLOW_SHEETS_READ_TOKEN');
  if (!expected || !e || !e.parameter || e.parameter.token !== expected) return SF_json_({ ok: false, error: 'unauthorized' });
  try {
    var cache = CacheService.getScriptCache();
    var saved = cache.get('sendflow-snapshot-v1');
    if (saved) return ContentService.createTextOutput(saved).setMimeType(ContentService.MimeType.JSON);
    var book = SpreadsheetApp.openById(SENDFLOW_SHEET_ID);
    var messages = SF_rows_(book, 'Mensagens', [[1, 10], [19, 5]]).map(function (row) {
      return { releaseId: SF_text_(row.release_id), actionId: SF_text_(row.action_id), messageKey: SF_text_(row.message_key),
        messageIndex: SF_number_(row.message_index), sentAt: SF_timestamp_(row.sent_at_utc), date: SF_date_(row.data_brasilia),
        type: SF_text_(row.type), recipients: SF_number_(row.recipients), delivered: SF_number_(row.delivered),
        read: SF_number_(row.read), played: SF_number_(row.played), generatedAt: SF_timestamp_(row.generated_at_utc) };
    }).filter(function (row) { return row.releaseId === SENDFLOW_RELEASE_ID; });
    var actions = SF_rows_(book, 'Acoes', [[1, 6], [11, 1], [17, 7]]).map(function (row) {
      return { releaseId: SF_text_(row.release_id), actionId: SF_text_(row.action_id), sentAt: SF_timestamp_(row.sent_at_utc),
        date: SF_date_(row.data_brasilia), success: row.success === true, groups: SF_number_(row.groups),
        messageCount: SF_number_(row.message_count), recipients: SF_number_(row.recipients), delivered: SF_number_(row.delivered),
        read: SF_number_(row.read), played: SF_number_(row.played), generatedAt: SF_timestamp_(row.generated_at_utc) };
    }).filter(function (row) { return row.releaseId === SENDFLOW_RELEASE_ID; });
    var movement = SF_rows_(book, 'Movimento_diario', [[1, 6]]).map(function (row) {
      return { releaseId: SF_text_(row.release_id), date: SF_date_(row.data_brasilia), originalDateKey: SF_text_(row.date_key_original),
        add: SF_number_(row.add), remove: SF_number_(row.remove), clicks: SF_number_(row.clicks) };
    }).filter(function (row) { return row.releaseId === SENDFLOW_RELEASE_ID; });
    var dates = movement.map(function (row) { return row.date; }).concat(actions.map(function (row) { return row.date; })).sort();
    if (!dates.length) throw new Error('empty_source');
    var observed = messages.map(function (row) { return row.generatedAt; }).filter(Boolean).sort();
    var result = { schemaVersion: 1, source: { spreadsheetId: SENDFLOW_SHEET_ID, name: book.getName(),
      releaseId: SENDFLOW_RELEASE_ID, releaseName: 'Ativacoes [Setembro/26]', timeZone: SENDFLOW_TIMEZONE,
      extractedAt: observed.length ? observed[observed.length - 1] : null,
      coverage: { start: dates[0], end: dates[dates.length - 1] }, scope: 'one_campaign', mode: 'live_sheet', includesPersonalData: false },
      messages: messages, actions: actions, movement: movement };
    var json = JSON.stringify(result);
    if (Utilities.newBlob(json).getBytes().length < 95000) cache.put('sendflow-snapshot-v1', json, 300);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  } catch (error) { return SF_json_({ ok: false, error: 'sheet_read_failed' }); }
}

function SF_rows_(book, name, columnRanges) {
  var sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('missing_sheet');
  var length = sheet.getLastRow();
  if (length < 1 || length > 20000) throw new Error('source_size_requires_review');
  var rows = [];
  columnRanges.forEach(function (columns) {
    var values = sheet.getRange(1, columns[0], length, columns[1]).getValues();
    var headers = values.shift();
    values.forEach(function (values, index) {
      rows[index] = rows[index] || {};
      headers.forEach(function (header, column) { rows[index][header] = values[column]; });
    });
  });
  return rows.filter(function (row) { return row.release_id; });
}

function SF_number_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  var result = typeof value === 'number' ? value : /^\d+$/.test(String(value)) ? Number(value) : NaN;
  if (!isFinite(result) || result < 0 || Math.floor(result) !== result) throw new Error('invalid_count');
  return result;
}

function SF_text_(value) { return value === null || typeof value === 'undefined' ? '' : String(value); }
function SF_timestamp_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  var date = value instanceof Date ? value : new Date(value);
  if (!isFinite(date.getTime())) throw new Error('invalid_timestamp');
  return date.toISOString();
}
function SF_date_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, SENDFLOW_TIMEZONE, 'yyyy-MM-dd');
  var text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw new Error('date_requires_validation');
}
function SF_json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
