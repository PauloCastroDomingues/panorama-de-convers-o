"""Manual WIF access probe. No source writes, snapshots, schedules or deployment."""
from datetime import datetime, timedelta
import json
import os
import re
from urllib.parse import quote
from zoneinfo import ZoneInfo

PROJECT = 'reise-ssot'
ACCOUNT = 'panorama-data-reader@reise-ssot.iam.gserviceaccount.com'
PROVIDER = 'projects/482129139926/locations/global/workloadIdentityPools/panorama-github/providers/github'
MAX_BYTES = 256 * 1024 * 1024
READ_PERMISSIONS = ('bigquery.tables.get', 'bigquery.tables.getData')
WRITE_PERMISSIONS = ('bigquery.tables.update', 'bigquery.tables.updateData',
                     'bigquery.tables.delete', 'bigquery.tables.setIamPolicy')
TABLES = (
    ('mart_growth_us.aquisicao_por_canal_origem_daily_v',
     'data, sessoes, pedidos_total, receita_total', True),
    ('mart_growth_us.aquisicao_por_canal8_daily',
     'data, sessoes, pedidos_total, receita_total', True),
    ('mart_growth_us.aquisicao_por_campanha_daily',
     'data, campanha_id, sessoes, pedidos, receita', True),
    ('mart_growth_us.aquisicao_por_produto_canal_daily',
     'data, product_id, sessoes, pedidos, receita', True),
    ('mart_growth_us.shopify_order_utm_resolved_v', 'data, source_order_id', True),
    ('mart_growth_us.shopify_product_catalog_canonical_v', '*', False),
    ('mart_shared.fct_order', 'order_sk, source_order_id', False),
    ('mart_shared.fct_order_item', 'order_sk, order_item_sk', False),
)
SHEETS = {
    'rd': '1zwtc4hHo-7GXHWBXut3Xd43ybGs2IHM_K_Xh603MwQw',
    'sendflow': '1OcM3LBfMUnToMbLKXtZfgB_3CAux4om7rQ1iLSSEHXc',
}


class ProbeError(Exception):
    pass


def validate_config(env):
    expected = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/main',
                'GITHUB_REPOSITORY_ID': '1434889171', 'GITHUB_REPOSITORY_OWNER_ID': '153780526',
                'GCP_SERVICE_ACCOUNT': ACCOUNT, 'GCP_WORKLOAD_IDENTITY_PROVIDER': PROVIDER}
    if any(env.get(key) != value for key, value in expected.items()):
        raise ProbeError('unexpected_workflow_identity')


def safe_error(error):
    if isinstance(error, ProbeError):
        return str(error)
    code = getattr(error, 'code', None)
    if code in (401, 403):
        return 'access_denied'
    if code == 404:
        return 'resource_not_found_or_not_visible'
    if isinstance(error, TimeoutError):
        return 'timeout'
    return 'request_failed_' + type(error).__name__


def denied_resources(error):
    # Keep only resource identifiers, never the raw provider message or query.
    if getattr(error, 'code', None) not in (401, 403):
        return []
    matches = re.findall(r'\b(?:Table|Routine)\s+(reise-ssot:[A-Za-z0-9_]+\.[A-Za-z0-9_]+)', str(error))
    return sorted(set(matches))


def probe_table(client, bq, definition, day, live=False):
    suffix, columns, dated = definition
    source = PROJECT + '.' + suffix
    stage = 'metadata'
    try:
        table = client.get_table(source, timeout=30)
        stage = 'permissions'
        permissions = client.test_iam_permissions(source, READ_PERMISSIONS + WRITE_PERMISSIONS,
                                                 timeout=30).get('permissions', [])
        if set(permissions) & set(WRITE_PERMISSIONS):
            raise ProbeError('unexpected_table_write_permission')
        if not set(READ_PERMISSIONS).issubset(permissions):
            raise ProbeError('table_read_permission_not_confirmed')
        sql = 'SELECT ' + columns + ' FROM `' + source + '`'
        params = []
        if dated:
            sql += ' WHERE data = @day'
            params = [bq.ScalarQueryParameter('day', 'DATE', day)]
        sql += ' LIMIT 1'
        config = dict(use_legacy_sql=False, query_parameters=params,
                      maximum_bytes_billed=MAX_BYTES, labels={'purpose': 'panorama-access-check'})
        stage = 'query_dry_run'
        dry = client.query(sql, location=table.location, timeout=30,
                           job_config=bq.QueryJobConfig(**config, dry_run=True))
        if dry.statement_type != 'SELECT' or dry.total_bytes_processed is None:
            raise ProbeError('select_validation_failed')
        result = {'source': suffix, 'status': 'ok', 'queryValidated': True,
                  'tableWritePermissionsDetected': False, 'liveSampleRead': False}
        if live:
            stage = 'sample_read'
            if dry.total_bytes_processed > MAX_BYTES:
                raise ProbeError('sample_exceeds_256_mib_budget')
            job = client.query(sql, location=table.location, timeout=30,
                               job_config=bq.QueryJobConfig(**config))
            try:
                rows = list(job.result(timeout=90, max_results=1))
            except TimeoutError:
                job.cancel()
                raise
            result.update(liveSampleRead=True, sampleRows=len(rows),
                          bytesBilled=job.total_bytes_billed)
        return result
    except Exception as error:
        return {'source': suffix, 'status': 'failed', 'stage': stage, 'error': safe_error(error),
                'deniedResources': denied_resources(error)}


def get_sheet_json(session, url, params):
    response = session.get(url, params=params, timeout=(5, 30))
    if response.status_code in (401, 403):
        raise ProbeError('sheet_read_access_denied')
    if response.status_code != 200:
        raise ProbeError('sheet_read_failed')
    return response.json()


def probe_sheet(session, name):
    stage = 'metadata'
    try:
        base = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS[name]
        meta = get_sheet_json(session, base, {'fields': 'spreadsheetId,sheets(properties(title))'})
        if meta.get('spreadsheetId') != SHEETS[name]:
            raise ProbeError('unexpected_spreadsheet')
        tabs = {s['properties']['title'] for s in meta.get('sheets', [])}
        if name == 'rd':
            required = ('RD_COLETAS', 'RD_CAMPANHAS')
            mode = 'collection'
        elif 'SF_COLETAS' in tabs:
            required = ('SF_COLETAS', 'SF_MENSAGENS', 'SF_ACOES', 'SF_MOVIMENTO')
            mode = 'collection'
        else:
            required = ('Mensagens', 'Acoes', 'Movimento_diario')
            mode = 'legacy_not_release_ready'
        stage = 'sample_read'
        if not set(required).issubset(tabs):
            raise ProbeError('required_tabs_missing')
        samples = []
        for tab in required:
            values = get_sheet_json(session, base + '/values/' + quote("'" + tab + "'!A1:W2", safe=''),
                                    {'valueRenderOption': 'FORMULA'}).get('values', [])
            if not values or not any(value != '' for value in values[0]):
                raise ProbeError('sheet_header_missing')
            samples.append({'tab': tab, 'sampleRows': max(0, len(values) - 1)})
        return {'source': name, 'status': 'ok', 'mode': mode, 'samples': samples}
    except Exception as error:
        return {'source': name, 'status': 'failed', 'stage': stage, 'error': safe_error(error)}


def federated_credentials(scopes):
    import google.auth
    from google.auth import external_account, impersonated_credentials
    credentials, _ = google.auth.default(scopes=scopes)
    if not isinstance(credentials, (external_account.Credentials, impersonated_credentials.Credentials)):
        raise ProbeError('federated_credentials_required')
    if credentials.service_account_email != ACCOUNT:
        raise ProbeError('unexpected_service_account')
    return credentials


def main():
    results = []
    try:
        validate_config(os.environ)
        from google.cloud import bigquery
        from google.auth.transport.requests import AuthorizedSession, Request
        credentials = federated_credentials(['https://www.googleapis.com/auth/cloud-platform'])
        credentials.refresh(Request())
        results.append({'source': 'federated_identity', 'status': 'ok'})
        day = (datetime.now(ZoneInfo('America/Sao_Paulo')) - timedelta(days=1)).date()
        with bigquery.Client(project=PROJECT, credentials=credentials) as client:
            for index, definition in enumerate(TABLES):
                result = probe_table(client, bigquery, definition, day, live=index == 0)
                results.append(result)
                print(json.dumps(result), flush=True)
        sheets_credentials = federated_credentials(['https://www.googleapis.com/auth/spreadsheets.readonly'])
        with AuthorizedSession(sheets_credentials, refresh_timeout=30) as session:
            for name in SHEETS:
                result = probe_sheet(session, name)
                results.append(result)
                print(json.dumps(result), flush=True)
    except Exception as error:
        results.append({'source': 'identity_or_setup', 'status': 'failed', 'error': safe_error(error)})
    passed = bool(results) and all(r['status'] == 'ok' for r in results)
    report = {'accessChecksPassed': passed, 'automationEnabledByThisTest': False,
              'sourceDataModified': False, 'deployed': False, 'checks': results,
              'limitations': ['Samples do not validate freshness, complete history or metric reconciliation.',
                              'Permission checks cover listed tables only, not all effective IAM permissions.',
                              'No WhatsApp Official, catalog bucket, RD MCP or SendFlow MCP requests.']}
    rendered = json.dumps(report, indent=2)
    print(rendered, flush=True)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as handle:
            handle.write('## Read-only access check\n\n```json\n' + rendered + '\n```\n')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
