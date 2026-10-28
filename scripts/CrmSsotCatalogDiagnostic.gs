// Add as a separate file; do not replace GrowthViews.gs or the SSOT doGet.
var SSOT_CRM_METADATA_PROJECT = 'reise-ssot';
var SSOT_CRM_METADATA_MAX_BYTES = '1073741824';

function SSOT_inspectCrmSourceCatalog() {
  var regions = [
    { qualifier: 'region-us', location: 'US' },
    { qualifier: 'region-southamerica-east1', location: 'southamerica-east1' }
  ];
  var results = regions.map(function(region) {
    try {
      var response = SSOT_CRM_metadataQuery_(SSOT_CRM_metadataSql_(region.qualifier), region.location);
      var tables = response.map(function(row) {
        return { dataset: row.f[0].v, table: row.f[1].v, columnCount: Number(row.f[2].v), columns: JSON.parse(row.f[3].v) };
      });
      var truncated = tables.length > 30;
      return { location: region.location, ok: true, moreCandidates: truncated, tables: tables.slice(0, 30) };
    } catch (error) {
      return { location: region.location, ok: false, error: String(error.message || error), tables: [] };
    }
  });
  var result = { ok: results.some(function(region) { return region.ok; }),
    complete: results.every(function(region) { return region.ok && !region.moreCandidates; }),
    generatedAt: new Date().toISOString(), project: SSOT_CRM_METADATA_PROJECT, regions: results,
    rules: { mode: 'read_only_metadata', noSourceDataRead: true, noTableMutation: true, noGa4Read: true,
      maximumBytesBilled: SSOT_CRM_METADATA_MAX_BYTES, candidatesAreNotValidatedAttribution: true } };
  // Separate log lines avoid putting every table in one oversized log entry.
  Logger.log(JSON.stringify({ ok: result.ok, complete: result.complete, generatedAt: result.generatedAt, project: result.project, rules: result.rules }));
  results.forEach(function(region) {
    Logger.log(JSON.stringify({ location: region.location, ok: region.ok, moreCandidates: region.moreCandidates || false, error: region.error || null, tables: region.tables.length }));
    region.tables.forEach(function(table) { Logger.log(JSON.stringify({ location: region.location, candidate: table })); });
  });
  return result;
}

function SSOT_CRM_metadataSql_(region) {
  if (['region-us', 'region-southamerica-east1'].indexOf(region) < 0) throw new Error('Invalid metadata region');
  return [
    'WITH catalog AS (',
    '  SELECT table_schema, table_name, column_name, data_type, ordinal_position',
    '  FROM `' + SSOT_CRM_METADATA_PROJECT + '.' + region + '.INFORMATION_SCHEMA.COLUMNS`',
    "  WHERE STARTS_WITH(table_schema, 'mart_')",
    '), candidates AS (',
    '  SELECT table_schema, table_name, COUNT(*) AS column_count,',
    '    TO_JSON_STRING(ARRAY_AGG(STRUCT(column_name, data_type) ORDER BY ordinal_position)) AS columns_json,',
    "    LOGICAL_OR(REGEXP_CONTAINS(LOWER(CONCAT(table_name, ' ', column_name)), r'rd.?station|(^|_)rd(_|$)|e.?mail|newsletter|crm|reise.?club|grup.*vip|sendflow')) AS direct_match,",
    "    LOGICAL_OR(REGEXP_CONTAINS(LOWER(table_name), r'attribut|channels|sessions_referrer|orders_last_click')) AS bridge_match",
    '  FROM catalog GROUP BY table_schema, table_name',
    ')',
    'SELECT table_schema, table_name, column_count, columns_json FROM candidates',
    'WHERE direct_match OR bridge_match',
    "ORDER BY REGEXP_CONTAINS(LOWER(table_name), r'rd.?station|e.?mail|newsletter|crm|reise.?club|grup.*vip|sendflow') DESC, bridge_match DESC, direct_match DESC, table_schema, table_name",
    'LIMIT 31'
  ].join('\n');
}

function SSOT_CRM_metadataQuery_(sql, location) {
  var response = BigQuery.Jobs.query({ query: sql, useLegacySql: false, location: location,
    maximumBytesBilled: SSOT_CRM_METADATA_MAX_BYTES, useQueryCache: true, maxResults: 31, timeoutMs: 10000 }, SSOT_CRM_METADATA_PROJECT);
  var deadline = Date.now() + 120000;
  while (!response.jobComplete) {
    if (!response.jobReference || !response.jobReference.jobId) throw new Error('Metadata job did not return its ID');
    if (Date.now() > deadline) throw new Error('Metadata job still running: ' + response.jobReference.jobId + '; inspect it before retrying');
    Utilities.sleep(250);
    response = BigQuery.Jobs.getQueryResults(SSOT_CRM_METADATA_PROJECT, response.jobReference.jobId,
      { location: location, maxResults: 31, timeoutMs: 10000 });
  }
  if (response.errors && response.errors.length) throw new Error(JSON.stringify(response.errors));
  if (response.pageToken) throw new Error('Unexpected metadata pagination; do not treat this response as complete');
  return response.rows || [];
}
