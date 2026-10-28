// New standalone diagnostic file. Do not replace the production bridge or doGet.
var SSOT_CRM_E_PROJECT = 'reise-ssot';
var SSOT_CRM_E_LOCATION = 'US';
var SSOT_CRM_E_MAX_BYTES = '1073741824';
var SSOT_CRM_E_START = '2026-10-21';
var SSOT_CRM_E_END = '2026-10-27';

function SSOT_inspectCrmChannelEvidence() {
  var known = ['dashboard_gerencial_channels_daily_live_v', 'shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_v',
    'shopify_sessions_channels_daily_human_closed_v', 'shopify_orders_last_click_daily_v', 'shopify_orders_channels_daily_last_click_v',
    'shopify_marketing_attribution_orders_daily_auto_v', 'shopify_marketing_attribution_orders_daily_auto_normalized_v',
    'sales_attributed_to_marketing_v', 'crm_coupon_orders_v', 'crm_coupon_registry', 'crm_reactivation_rule_config'];
  var namesSql = known.map(function(name) { return "'" + name + "'"; }).join(', ');
  var metadata = SSOT_CRM_E_query_([
    'SELECT table_name, COUNT(*) AS column_count,',
    'TO_JSON_STRING(ARRAY_AGG(STRUCT(column_name, data_type) ORDER BY ordinal_position)) AS columns_json',
    'FROM `reise-ssot.mart_growth_us.INFORMATION_SCHEMA.COLUMNS`',
    'WHERE (table_name IN (' + namesSql + ')',
    "OR REGEXP_CONTAINS(LOWER(table_name), r'rd.?station|e.?mail|newsletter|club|vip|sendflow'))",
    "AND NOT REGEXP_CONTAINS(LOWER(table_name), r'backup|(^|_)stage(_|$)|(^|_)tmp(_|$)|auth|password')",
    'GROUP BY table_name ORDER BY table_name LIMIT 201'
  ].join('\n'), false);
  var tables = metadata.rows.map(function(row) {
    return { table: row.table_name, columnCount: Number(row.column_count), columns: JSON.parse(row.columns_json) };
  });
  var result = { ok: true, generatedAt: new Date().toISOString(), project: SSOT_CRM_E_PROJECT, location: SSOT_CRM_E_LOCATION,
    window: { start: SSOT_CRM_E_START, end: SSOT_CRM_E_END }, metadataTruncated: tables.length > 200,
    tables: tables.slice(0, 200), lineage: [], profiles: [],
    rules: { mode: 'read_only', noTableMutation: true, noDirectGa4Read: true, noPersonalRows: true,
      maximumBytesBilled: SSOT_CRM_E_MAX_BYTES, candidateAttributionNotValidated: true } };
  var views = SSOT_CRM_E_query_('SELECT table_name, view_definition FROM `reise-ssot.mart_growth_us.INFORMATION_SCHEMA.VIEWS` WHERE table_name IN (' + namesSql + ')', false);
  result.lineage = views.rows.map(function(row) {
    var sql = row.view_definition || '';
    var references = [], match, pattern = /`([^`]+)`/g;
    while ((match = pattern.exec(sql)) !== null) if (references.indexOf(match[1]) < 0) references.push(match[1]);
    return { table: row.table_name, references: references,
      proportionalSignals: /proxy|proporc|proxy_capped|peso_total/i.test(sql),
      zeroFillSignals: /(?:COALESCE|IFNULL)\s*\([^)]*,\s*0\s*\)/i.test(sql),
      note: 'Signals and dependencies are not a lineage or attribution certification.' };
  });
  var profileSources = ['dashboard_gerencial_channels_daily_live_v', 'shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_v'];
  profileSources.forEach(function(name) {
    var table = tables.filter(function(item) { return item.table === name; })[0];
    if (!table) { result.profiles.push({ table: name, ok: false, reason: 'not_in_accessible_metadata' }); return; }
    var columns = table.columns.map(function(column) { return column.column_name; });
    if (!['data', 'canal', 'tipo', 'sessoes', 'pedidos', 'vendas'].every(function(column) { return columns.indexOf(column) >= 0; })) {
      result.profiles.push({ table: name, ok: false, reason: 'unexpected_schema' }); return;
    }
    try {
      var profile = SSOT_CRM_E_query_(SSOT_CRM_E_profileSql_(name), true);
      result.profiles.push({ table: name, ok: true, estimatedBytes: profile.estimatedBytes,
        truncated: profile.rows.length > 500, grain: 'data + canal + tipo; source_rows reports input multiplicity', rows: profile.rows.slice(0, 500) });
    } catch (error) { result.profiles.push({ table: name, ok: false, reason: String(error.message || error) }); }
  });
  result.complete = !result.metadataTruncated && result.profiles.every(function(item) { return item.ok && !item.truncated; });
  Logger.log(JSON.stringify({ ok: result.ok, complete: result.complete, generatedAt: result.generatedAt, window: result.window, rules: result.rules, metadataTruncated: result.metadataTruncated }));
  result.tables.forEach(function(table) { Logger.log(JSON.stringify({ catalog: table })); });
  result.lineage.forEach(function(lineage) { Logger.log(JSON.stringify({ lineage: lineage })); });
  result.profiles.forEach(function(profile) {
    Logger.log(JSON.stringify({ profile: profile.table, ok: profile.ok, reason: profile.reason || null, estimatedBytes: profile.estimatedBytes || null, truncated: profile.truncated || false, rows: (profile.rows || []).length }));
    (profile.rows || []).forEach(function(row) { Logger.log(JSON.stringify({ source: profile.table, daily: row })); });
  });
  return result;
}

function SSOT_CRM_E_profileSql_(name) {
  if (['dashboard_gerencial_channels_daily_live_v', 'shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_v'].indexOf(name) < 0) throw new Error('Source not allowed');
  return [
    'SELECT data, canal, tipo, COUNT(*) AS source_rows,',
    'SUM(sessoes) AS sessoes_recebidas, SUM(pedidos) AS pedidos_recebidos, SUM(vendas) AS receita_recebida,',
    'COUNTIF(sessoes IS NULL) AS rows_missing_sessions, COUNTIF(pedidos IS NULL) AS rows_missing_orders, COUNTIF(vendas IS NULL) AS rows_missing_revenue',
    'FROM `reise-ssot.mart_growth_us.' + name + '`',
    'WHERE data BETWEEN @start_date AND @end_date',
    "AND REGEXP_CONTAINS(LOWER(canal), r'rd.?station|(^|[ _-])e.?mail($|[ _-])|club|vip|whats')",
    'GROUP BY data, canal, tipo ORDER BY data, canal, tipo LIMIT 501'
  ].join('\n');
}

function SSOT_CRM_E_query_(sql, profile) {
  var options = { query: sql, location: SSOT_CRM_E_LOCATION, useLegacySql: false, maximumBytesBilled: SSOT_CRM_E_MAX_BYTES,
    useQueryCache: true, timeoutMs: 10000, maxResults: 501 };
  var estimatedBytes = null;
  if (profile) {
    options.parameterMode = 'NAMED';
    options.queryParameters = [
      { name: 'start_date', parameterType: { type: 'DATE' }, parameterValue: { value: SSOT_CRM_E_START } },
      { name: 'end_date', parameterType: { type: 'DATE' }, parameterValue: { value: SSOT_CRM_E_END } }
    ];
    var estimate = BigQuery.Jobs.query(Object.assign({}, options, { dryRun: true }), SSOT_CRM_E_PROJECT);
    if (estimate.errors && estimate.errors.length) throw new Error(JSON.stringify(estimate.errors));
    estimatedBytes = estimate.totalBytesProcessed === undefined ? null : String(estimate.totalBytesProcessed);
    if (estimatedBytes !== null && Number(estimatedBytes) > Number(SSOT_CRM_E_MAX_BYTES)) throw new Error('Read skipped: estimated bytes ' + estimatedBytes + ' exceed the existing 1 GiB limit');
  }
  var response = BigQuery.Jobs.query(options, SSOT_CRM_E_PROJECT);
  var jobId = response.jobReference && response.jobReference.jobId;
  var deadline = Date.now() + 90000;
  while (!response.jobComplete) {
    if (!jobId) throw new Error('Missing query job ID');
    if (Date.now() > deadline) throw new Error('Job still running: ' + jobId + '; inspect before retrying');
    Utilities.sleep(250);
    response = BigQuery.Jobs.getQueryResults(SSOT_CRM_E_PROJECT, jobId, { location: SSOT_CRM_E_LOCATION, timeoutMs: 10000, maxResults: 501 });
  }
  if (response.errors && response.errors.length) throw new Error(JSON.stringify(response.errors));
  if (response.pageToken) throw new Error('Unexpected pagination; do not treat result as complete');
  var fields = response.schema && response.schema.fields || [];
  if ((response.rows || []).length && !fields.length) throw new Error('Missing result schema; do not treat rows as validated');
  var rows = (response.rows || []).map(function(row) {
    var record = {};
    fields.forEach(function(field, index) { record[field.name] = row.f[index].v; });
    return record;
  });
  return { rows: rows, estimatedBytes: estimatedBytes };
}
