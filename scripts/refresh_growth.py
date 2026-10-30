"""Read-only Growth views. Each view retains its last valid snapshot on failure."""
from datetime import date, datetime
from decimal import Decimal
import json

import refresh_crm_ssot as ssot

OUTPUT = ssot.ROOT / 'data/ssot-growth-views.json'
MAX_BYTES = 1024 * 1024 * 1024
LEGACY_URL = 'https://script.google.com/macros/s/AKfycby7GYHJIvpKE1hwh3hCq9atS_zKQXaz4oYQ6nzzzGFdvCr-h2sfMATeTst9qgdzghKE8w/exec?view=growth_views'
LABELS = {'channel': 'Canal', 'campaign': 'Campanha', 'ad_group': 'Grupo', 'ad': 'Anuncio',
          'channel_product': 'Canal + produto', 'campaign_product': 'Campanha + produto',
          'ad_group_product': 'Grupo + produto', 'ad_product': 'Anuncio + produto'}
SOURCES = {
    'campaign': ('aquisicao_por_campanha_daily', {'data': 'DATE', 'canal': 'STRING', 'campanha': 'STRING',
        'campanha_id': None, 'sessoes': None, 'pedidos': None, 'receita': None}),
    'channel_product': ('aquisicao_por_produto_canal_daily', {'data': 'DATE', 'canal': 'STRING',
        'produto': 'STRING', 'product_id': None, 'sessoes': None, 'pedidos': None, 'receita': None}),
    'utm': ('shopify_order_utm_resolved_v', {'data': 'DATE', 'utm_source': 'STRING',
        'utm_term': 'STRING', 'utm_content': 'STRING', 'order_name': None, 'total_amount': None}),
}


def serial(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def channel_view(commercial):
    rows = [{'data': day, 'canal': channel, **metrics}
            for (day, channel), metrics in ssot.daily_totals(commercial['rows']).items()]
    return {'view': 'channel', 'source': commercial['source'], 'rows': rows,
            'generatedAt': commercial['extracted_at']}


class Reader:
    def __init__(self, end):
        from google.cloud import bigquery
        self.bq = bigquery
        self.client = bigquery.Client(project=ssot.PROJECT, location=ssot.LOCATION)
        self.remaining = MAX_BYTES
        self.end = end
        self.jobs = []

    def read(self, key):
        name, fields = SOURCES['utm' if key in ('ad_group', 'ad') else key]
        source = ssot.PROJECT + '.mart_growth_us.' + name
        table = self.client.get_table(source, timeout=30)
        schema = {field.name: field.field_type for field in table.schema}
        if table.location != ssot.LOCATION or any(field not in schema or (kind and schema[field] != kind) for field, kind in fields.items()):
            raise ssot.RefreshError('growth_schema_mismatch')
        if key in ('ad_group', 'ad'):
            dim, alias = ('utm_term', 'grupo_anuncio') if key == 'ad_group' else ('utm_content', 'anuncio')
            sql = f'''SELECT data, utm_source AS origem, NULLIF(TRIM({dim}), '') AS {alias},
                CAST(NULL AS INT64) AS sessoes, COUNT(DISTINCT order_name) AS pedidos,
                SUM(total_amount) AS receita FROM `{source}`
                WHERE data BETWEEN @start AND @end AND NULLIF(TRIM({dim}), '') IS NOT NULL
                GROUP BY data, origem, {alias}'''
        else:
            dims = 'campanha, CAST(campanha_id AS STRING) AS campaign_id' if key == 'campaign' else 'produto, CAST(product_id AS STRING) AS product_id'
            sql = f'SELECT data, canal, {dims}, sessoes, pedidos, receita FROM `{source}` WHERE data BETWEEN @start AND @end'
        params = [self.bq.ScalarQueryParameter('start', 'DATE', ssot.START), self.bq.ScalarQueryParameter('end', 'DATE', self.end)]
        config = dict(use_legacy_sql=False, query_parameters=params, maximum_bytes_billed=self.remaining)
        dry = self.client.query(sql, location=ssot.LOCATION, job_config=self.bq.QueryJobConfig(**config, dry_run=True))
        if dry.statement_type != 'SELECT' or dry.total_bytes_processed is None or dry.total_bytes_processed > self.remaining:
            raise ssot.RefreshError('growth_budget_exceeded')
        job = self.client.query(sql, location=ssot.LOCATION, job_config=self.bq.QueryJobConfig(**config))
        try:
            rows = [{field: serial(value) for field, value in row.items()} for row in job.result(timeout=180)]
        except TimeoutError:
            job.cancel()
            raise ssot.RefreshError('growth_query_timeout') from None
        self.remaining -= job.total_bytes_billed or 0
        self.jobs.append({'view': key, 'jobId': job.job_id, 'bytesBilled': job.total_bytes_billed, 'readOnly': True})
        if not rows or any(not ssot.START.isoformat() <= row['data'] <= self.end.isoformat() for row in rows):
            raise ssot.RefreshError('empty_or_invalid_growth_view')
        for row in rows:
            for metric in ('sessoes', 'pedidos'):
                ssot.count(row[metric])
            row['receita'] = ssot.revenue(row['receita'])
        return {'view': key, 'source': source, 'rows': rows, 'generatedAt': datetime.now(ssot.TIMEZONE).isoformat()}

    def close(self):
        self.client.close()


def seed_previous(previous):
    if all(previous.get(key, {}).get('rows') for key in ('campaign', 'channel_product')):
        return previous
    import requests
    try:
        response = requests.get(LEGACY_URL, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if payload.get('ok') is True and isinstance(payload.get('data'), list):
            for view in payload['data']:
                if view.get('view') in LABELS and isinstance(view.get('rows'), list) and not previous.get(view['view'], {}).get('rows'):
                    previous[view['view']] = {**view, 'generatedAt': view.get('generatedAt') or payload.get('generatedAt')}
    except Exception:
        pass
    return previous


def preserve_history(key, view, previous, end):
    rows = view['rows']
    days = {row['data'] for row in rows}
    boundary = ssot.START.isoformat()
    # These two sources retain a complete rolling window of 120 calendar days.
    # Archive only the expired prefix; gaps inside the live window still fail.
    if key in ('campaign', 'channel_product') and days:
        first, last = min(days), max(days)
        if (len(days) == 120 and last == end.isoformat()
                and (date.fromisoformat(last) - date.fromisoformat(first)).days == 119
                and previous.get('source') == view.get('source')):
            boundary = first
            view['history'] = {'liveStart': first, 'liveEnd': last,
                               'retainedBefore': boundary, 'mode': 'preserved_snapshot'}
    return {**view, 'rows': rows + [row for row in previous.get('rows', [])
                                  if row['data'] < boundary]}


def run(end, commercial, output=OUTPUT, reader_factory=Reader, seed=seed_previous):
    original = output.read_bytes() if output.exists() else None
    old = json.loads(original) if original else {}
    previous = {view['view']: view for view in old.get('data', [])}
    previous = seed(previous)
    views, checks, readiness = [], [], []
    reader = reader_factory(end)
    try:
        for key, label in LABELS.items():
            error = None
            unsupported = key.endswith('_product') and key != 'channel_product'
            provisional = key in ('ad_group', 'ad')
            try:
                view = channel_view(commercial) if key == 'channel' else {'view': key, 'rows': []} if unsupported else reader.read(key)
                if key != 'channel' and not unsupported:
                    view = preserve_history(key, view, previous.get(key, {}), end)
                old_dates = {row['data'] for row in previous.get(key, {}).get('rows', [])}
                if not old_dates <= {row['data'] for row in view['rows']}:
                    raise ssot.RefreshError('growth_history_regression')
            except Exception as exc:
                error = ssot.safe_error(exc)
                view = previous.get(key, {'view': key, 'rows': []})
            latest = max((row['data'] for row in view['rows']), default=None)
            status = 'error' if error else 'unavailable' if unsupported else 'current' if latest == end.isoformat() else 'stale'
            checks.append({'id': key, 'label': label, 'status': status, 'latestDate': latest,
                           'error': error, 'rows': len(view['rows']), 'conversionAvailable': not (unsupported or provisional)})
            readiness.append({'view': key, 'label': label, 'status': 'Pendente' if unsupported or not view['rows'] else 'Provisorio por UTM' if provisional else 'Disponivel (ultima leitura)' if error else 'Disponivel',
                'source': view.get('source'), 'reason': 'Sem fonte SSOT validada neste grao.' if unsupported else
                'UTM: pedidos e receita; sem denominador de sessoes neste grao.' if provisional else error})
            views.append(view)
    finally:
        reader.close()
    now = datetime.now(ssot.TIMEZONE).isoformat()
    payload = {'ok': True, 'generatedAt': now, 'timeZone': 'America/Sao_Paulo', 'mode': 'read_only_snapshot',
        'window': {'start': ssot.START.isoformat(), 'end': end.isoformat()}, 'data': views,
        'readiness': readiness, 'refresh': {'views': checks, 'jobs': reader.jobs}}
    if all(any(view['view'] == key and view['rows'] for view in views) for key in ('campaign', 'channel_product')):
        ssot.atomic_json(output, payload, original)
    active = [check for check in checks if check['status'] != 'unavailable']
    return {'status': 'error' if any(c['error'] for c in active) else 'stale' if any(c['status'] == 'stale' for c in active) else 'current',
            'latestDate': min((c['latestDate'] for c in active if c['latestDate']), default=None),
            'checkedAt': now, 'views': checks, 'coverageComplete': False,
            'note': 'Tres cruzamentos com produto sem fonte validada; grupo/anuncio sem sessoes.'}
