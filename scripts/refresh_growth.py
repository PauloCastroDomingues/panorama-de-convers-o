"""Read-only Growth views. Each view retains its last valid snapshot on failure."""
from datetime import date, datetime
from decimal import Decimal
import json

import refresh_crm_ssot as ssot
import growth_observed_bridge as bridge

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
}


PROVENANCE_FIELDS = {'is_estimado': 'BOOLEAN', 'metodo_rateio': 'STRING',
                     'sessoes_real': 'BOOLEAN', 'sessoes_last_click': 'INTEGER'}


def provenance_columns(schema, key):
    fields = PROVENANCE_FIELDS if key == 'campaign' else {
        field: PROVENANCE_FIELDS[field] for field in ('is_estimado', 'metodo_rateio')}
    columns = []
    for field, kind in fields.items():
        if field in schema and schema[field] != kind:
            raise ssot.RefreshError('growth_provenance_schema_mismatch')
        sql_type = {'BOOLEAN': 'BOOL', 'INTEGER': 'INT64'}.get(kind, kind)
        columns.append(field if field in schema else f'CAST(NULL AS {sql_type}) AS {field}')
    return ', '.join(columns)


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
        self.observed = None
        self.observed_error = None

    def query(self, sql, region, params, label):
        config = dict(use_legacy_sql=False, query_parameters=params, maximum_bytes_billed=self.remaining)
        dry = self.client.query(sql, location=region, timeout=30,
            job_config=self.bq.QueryJobConfig(**config, dry_run=True))
        if dry.statement_type != 'SELECT' or dry.total_bytes_processed is None or dry.total_bytes_processed > self.remaining:
            raise ssot.RefreshError('growth_budget_exceeded')
        job = self.client.query(sql, location=region, timeout=30, job_config=self.bq.QueryJobConfig(**config))
        try:
            rows = [dict(row) for row in job.result(timeout=180)]
        except TimeoutError:
            job.cancel()
            raise ssot.RefreshError('growth_query_timeout') from None
        self.remaining -= job.total_bytes_billed or 0
        self.jobs.append({'view': label, 'jobId': job.job_id, 'region': region,
                          'bytesBilled': job.total_bytes_billed, 'readOnly': True})
        return rows

    def read(self, key):
        if key in bridge.KEYS:
            if self.observed_error:
                raise self.observed_error
            if self.observed is None:
                try:
                    self.observed = bridge.collect(self)
                except Exception as exc:
                    self.observed_error = exc
                    raise
            return self.observed[key]
        name, fields = SOURCES[key]
        source = ssot.PROJECT + '.mart_growth_us.' + name
        table = self.client.get_table(source, timeout=30)
        schema = {field.name: field.field_type for field in table.schema}
        if table.location != ssot.LOCATION or any(field not in schema or (kind and schema[field] != kind) for field, kind in fields.items()):
            raise ssot.RefreshError('growth_schema_mismatch')
        dims = 'campanha, CAST(campanha_id AS STRING) AS campaign_id' if key == 'campaign' else 'produto, CAST(product_id AS STRING) AS product_id'
        provenance = provenance_columns(schema, key)
        sql = f'SELECT data, canal, {dims}, sessoes, pedidos, receita, {provenance} FROM `{source}` WHERE data BETWEEN @start AND @end'
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
            unsupported = key in ('ad', 'ad_product')
            observed = key in bridge.KEYS
            try:
                view = channel_view(commercial) if key == 'channel' else {'view': key, 'rows': []} if unsupported else reader.read(key)
                if key != 'channel' and not unsupported and not observed:
                    view = preserve_history(key, view, previous.get(key, {}), end)
                old_dates = {row['data'] for row in previous.get(key, {}).get('rows', [])}
                if not unsupported and (not observed or previous.get(key, {}).get('contract') == bridge.CONTRACT) and not old_dates <= {row['data'] for row in view['rows']}:
                    raise ssot.RefreshError('growth_history_regression')
            except Exception as exc:
                error = ssot.safe_error(exc)
                view = previous.get(key, {'view': key, 'rows': []})
                if observed and view.get('contract') != bridge.CONTRACT:
                    view = {'view': key, 'rows': []}
            latest = max((row['data'] for row in view['rows']), default=None)
            covered_end = view.get('validatedWindow', {}).get('end', latest)
            status = 'error' if error else 'unavailable' if unsupported else 'current' if covered_end == end.isoformat() else 'stale'
            checks.append({'id': key, 'label': label, 'status': status, 'latestDate': latest,
                           'coveredThrough': covered_end, 'error': error, 'rows': len(view['rows']), 'conversionAvailable': not (unsupported or observed)})
            readiness.append({'view': key, 'label': label, 'status': 'Pendente' if unsupported or not view['rows'] else 'Parcial por IDs conferidos (ultima leitura)' if observed and error else 'Parcial por IDs conferidos' if observed else 'Disponivel (ultima leitura)' if error else 'Disponivel',
                'source': view.get('source'), 'reason': 'Criativo sem vinculo comercial validado; utm_content nao comprova ID de anuncio.' if unsupported else
                bridge.REASON if observed else error})
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
    covered = [check.get('coveredThrough') for check in active]
    return {'status': 'error' if any(c['error'] for c in active) else 'stale' if any(c['status'] == 'stale' for c in active) else 'current',
            'latestDate': min((c['latestDate'] for c in active if c['latestDate']), default=None),
            'coveredThrough': min(covered) if covered and all(covered) else None,
            'checkedAt': now, 'views': checks, 'coverageComplete': False,
            'note': 'Grupos e cruzamentos de produto com cobertura parcial por IDs; criativos pendentes. Sem sessoes nos novos graos.'}


if __name__ == '__main__':
    import argparse
    from pathlib import Path
    from refresh_all_data import refresh_lock, aggregate, OUTPUT as STATUS_OUTPUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--end', type=date.fromisoformat, default=ssot.yesterday())
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    with refresh_lock(ssot.ROOT / '.local/data-refresh.lock'):
        result = run(args.end, json.loads(ssot.OUTPUT.read_text(encoding='utf-8')), output=args.output)
        if args.output.resolve() == OUTPUT.resolve() and STATUS_OUTPUT.exists():
            original_status = STATUS_OUTPUT.read_bytes()
            status = json.loads(original_status)
            for source in status.get('sources', []):
                if source['id'] == 'growth':
                    source.update(result)
                    if result['status'] != 'error':
                        source.update(lastSuccessfulReadAt=result['checkedAt'], error=None)
            status['status'] = aggregate(status['sources'])
            ssot.atomic_json(STATUS_OUTPUT, status, original_status)
    print(json.dumps(result, ensure_ascii=True))
    raise SystemExit(1 if result['status'] == 'error' else 0)
