"""GET-only readers for the CRM auxiliary sheets. No provider/source writes."""
import csv
from datetime import date, datetime, timedelta
import io
import json
import re
import shutil
import subprocess

import refresh_crm_ssot as ssot

RD_SHEET = '1zwtc4hHo-7GXHWBXut3Xd43ybGs2IHM_K_Xh603MwQw'
SF_SHEET = '1OcM3LBfMUnToMbLKXtZfgB_3CAux4om7rQ1iLSSEHXc'
WA_SHEET = '1vlkkrA52FBGk79k0ou3vch1XqM-AdHVDj42IXO7hIZo'
RD_FIELDS = ['campaign_id', 'campaign_name', 'send_at', 'contacts_count', 'email_delivered_count',
    'email_opened_count', 'email_clicked_count', 'email_bounced_count', 'email_dropped_count',
    'email_unsubscribed_count', 'email_spam_reported_count']
COLECTION_FIELDS = ['collection_id', 'account_id', 'observed_at', 'start_date', 'end_date', 'record_count', 'status']


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})', value):
        raise ssot.RefreshError('timestamp_requires_offset')
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def counter(value):
    if value in ('', None):
        return None
    return ssot.count(value)


def sheet_date(value):
    if type(value) is int and 36526 <= value <= 73415:
        return (date(1899, 12, 30) + timedelta(days=value)).isoformat()
    return ssot.iso_date(value)


class Sheets:
    def __init__(self, sheet_id):
        from google_sheets_auth import load_credentials
        from google.auth.transport.requests import AuthorizedSession
        credentials = load_credentials()
        self.session = AuthorizedSession(credentials)
        self.url = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheet_id
        self.meta = self.get('', {'fields': 'properties(title,timeZone),sheets(properties)'} )
        self.tabs = {s['properties']['title']: s['properties'] for s in self.meta['sheets']}

    def get(self, suffix, params):
        response = self.session.get(self.url + suffix, params=params, timeout=30)
        if response.status_code in (401, 403):
            raise ssot.RefreshError('sheet_read_access_required')
        if not response.ok:
            raise ssot.RefreshError('sheet_read_failed')
        return response.json()

    def rows(self, name, columns, expected=None):
        tab = self.tabs.get(name)
        if not tab:
            raise ssot.RefreshError('sheet_tab_missing')
        length = tab['gridProperties']['rowCount']
        if length > 20000:
            raise ssot.RefreshError('sheet_size_requires_review')
        ranges = [f"'{name}'!{start}1:{end}{length}" for start, end in columns]
        result = self.get('/values:batchGet', {'ranges': ranges, 'valueRenderOption': 'FORMULA', 'dateTimeRenderOption': 'SERIAL_NUMBER'})
        records = []
        for block in result.get('valueRanges', []):
            values = block.get('values', [])
            if not values:
                raise ssot.RefreshError('sheet_headers_missing')
            headers, *values = values
            if expected and headers != expected:
                raise ssot.RefreshError('sheet_headers_changed')
            for index, values_row in enumerate(values):
                if any(isinstance(v, str) and v.startswith('=') for v in values_row):
                    raise ssot.RefreshError('source_formula_requires_review')
                while len(records) <= index:
                    records.append({})
                records[index].update({header: values_row[column] if column < len(values_row) else '' for column, header in enumerate(headers)})
        return [row for row in records if any(value != '' for value in row.values())]

    def close(self):
        self.session.close()


def validate_js(kind, payload):
    node = shutil.which('node') or r'C:\Program Files\nodejs\node.exe'
    code = "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const p=JSON.parse(s);const m=require('./assets/crm-" + kind + ".js');" + ('m.sanitizeSnapshot(p);' if kind == 'rd' else 'm.validate(p);') + "process.stdout.write('ok');});"
    result = subprocess.run([node, '-e', code], input=json.dumps(payload), text=True, capture_output=True, cwd=ssot.ROOT, timeout=30)
    if result.returncode or result.stdout != 'ok':
        raise ssot.RefreshError('operational_contract_invalid')


def read_rd():
    book = Sheets(RD_SHEET)
    try:
        collections = [row for row in book.rows('RD_COLETAS', [('A', 'G')], COLECTION_FIELDS)
                       if row['account_id'] == '832517' and row['status'] == 'committed']
        if not collections:
            raise ssot.RefreshError('rd_no_committed_collection')
        if len({row['collection_id'] for row in collections}) != len(collections):
            raise ssot.RefreshError('rd_duplicate_collection')
        collections.sort(key=lambda row: timestamp(row['observed_at']), reverse=True)
        current = collections[0]
        if len(collections) > 1 and timestamp(current['observed_at']) == timestamp(collections[1]['observed_at']):
            raise ssot.RefreshError('rd_ambiguous_latest_collection')
        start, end = ssot.iso_date(current['start_date']), ssot.iso_date(current['end_date'])
        if start > end:
            raise ssot.RefreshError('rd_invalid_period')
        rows = [r for r in book.rows('RD_CAMPANHAS', [('A', 'M')], ['collection_id', 'account_id'] + RD_FIELDS)
                if r['collection_id'] == current['collection_id']]
        if len(rows) != counter(current['record_count']):
            raise ssot.RefreshError('rd_collection_incomplete')
        campaigns, outside, seen = [], [], set()
        for row in rows:
            if row['account_id'] != '832517' or not isinstance(row['campaign_id'], str):
                raise ssot.RefreshError('rd_account_or_id_mismatch')
            instant = timestamp(row['send_at'])
            key = (row['campaign_id'], instant)
            if key in seen:
                raise ssot.RefreshError('rd_duplicate_campaign')
            seen.add(key)
            record = {field: counter(row[field]) if field in RD_FIELDS[3:] else row[field] for field in RD_FIELDS}
            day = instant.astimezone(ssot.TIMEZONE).date().isoformat()
            (campaigns if start <= day <= end else outside).append(record)
        payload = {'schemaVersion': 1, 'source': {'name': 'RD Station Marketing', 'tool': 'emails_by_campaign_analytics',
            'accountId': '832517', 'observedAt': current['observed_at'], 'sourceUpdatedAt': None, 'start': start, 'end': end,
            'timeZone': 'America/Sao_Paulo', 'mode': 'auxiliary_sheet', 'scopeComplete': False, 'coverageEvidence': None,
            'uniqueCountsConfirmed': False, 'uniqueCountsEvidence': None}, 'campaigns': campaigns, 'outsideCampaigns': outside}
        validate_js('rd', payload)
        return payload, {'latestDate': end, 'observedAt': current['observed_at'], 'rows': len(campaigns), 'coverageComplete': False,
            'note': 'Ultima coleta committed da planilha; a coleta no RD precisa alimentar esta origem.'}
    finally:
        book.close()


def read_sendflow():
    book = Sheets(SF_SHEET)
    try:
        maps = {
            'messages': ('Mensagens', [('A', 'J'), ('S', 'W')], {'releaseId': 'release_id', 'actionId': 'action_id', 'messageKey': 'message_key',
                'messageIndex': 'message_index', 'sentAt': 'sent_at_utc', 'date': 'data_brasilia', 'type': 'type', 'recipients': 'recipients',
                'delivered': 'delivered', 'read': 'read', 'played': 'played', 'generatedAt': 'generated_at_utc'}),
            'actions': ('Acoes', [('A', 'F'), ('K', 'K'), ('Q', 'W')], {'releaseId': 'release_id', 'actionId': 'action_id', 'sentAt': 'sent_at_utc',
                'date': 'data_brasilia', 'success': 'success', 'groups': 'groups', 'messageCount': 'message_count', 'recipients': 'recipients',
                'delivered': 'delivered', 'read': 'read', 'played': 'played', 'generatedAt': 'generated_at_utc'}),
            'movement': ('Movimento_diario', [('A', 'F')], {'releaseId': 'release_id', 'date': 'data_brasilia', 'originalDateKey': 'date_key_original',
                'add': 'add', 'remove': 'remove', 'clicks': 'clicks'})}
        payload = {'schemaVersion': 1}
        counts = {'messageIndex', 'recipients', 'delivered', 'read', 'played', 'groups', 'messageCount', 'add', 'remove', 'clicks'}
        for key, (tab, columns, mapping) in maps.items():
            records = []
            for row in book.rows(tab, columns):
                if not row.get('release_id'):
                    continue
                if any(field not in row for field in mapping.values()):
                    raise ssot.RefreshError('sendflow_headers_changed')
                record = {dest: counter(row[src]) if dest in counts else row[src] for dest, src in mapping.items()}
                record['date'] = sheet_date(record['date'])
                for field in ('sentAt', 'generatedAt'):
                    if field in record:
                        timestamp(record[field])
                records.append(record)
            payload[key] = records
        dates = sorted({r['date'] for name in maps for r in payload[name]})
        releases = sorted({r['releaseId'] for name in maps for r in payload[name]})
        observed = max((r['generatedAt'] for r in payload['messages'] + payload['actions']), key=timestamp, default=None)
        if not dates or not observed:
            raise ssot.RefreshError('sendflow_empty_source')
        payload['source'] = {'spreadsheetId': SF_SHEET, 'name': book.meta['properties']['title'],
            'releaseId': releases[0] if len(releases) == 1 else None, 'releaseIds': releases,
            'releaseName': 'Campanhas presentes na base SendFlow', 'timeZone': 'America/Sao_Paulo',
            'extractedAt': observed, 'coverage': {'start': dates[0], 'end': dates[-1]},
            'coverageComplete': False, 'scope': 'auxiliary_sheet', 'mode': 'live_sheet', 'includesPersonalData': False}
        validate_js('sendflow', payload)
        return payload, {'latestDate': dates[-1], 'observedAt': observed, 'rows': len(payload['messages']), 'releases': releases,
            'coverageComplete': False, 'note': 'Todas as campanhas da planilha; campanhas ausentes ainda dependem da coleta SendFlow.'}
    finally:
        book.close()


def read_whatsapp():
    import requests
    response = requests.get('https://docs.google.com/spreadsheets/d/' + WA_SHEET + '/export',
                            params={'format': 'csv', 'gid': '404910707'}, timeout=30)
    response.raise_for_status()
    text = response.content.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(text))
    # Explicit campaign/metric fields only; message text and links are not copied.
    allowed = ['Tema', 'Categoria', 'Data', 'Hora', 'Segmenta\u00e7\u00e3o', 'P\u00fablico',
               'Total Entregue', 'Aberturas', 'Total de cliques', 'Sess\u00f5es', 'Pedidos', 'Receita', 'Investimento']
    if any(field not in reader.fieldnames for field in allowed):
        raise ssot.RefreshError('whatsapp_headers_changed')
    rows = [{**{key: row[key] for key in allowed}, '__sourceRow': index + 2} for index, row in enumerate(reader)]
    # This workbook contains dd/mm campaign dates for 2026, not a rolling year.
    dates, year, previous_key = [], 2026, None
    for row in reversed(rows):
        if row['Data'] and re.fullmatch(r'\d{1,2}/\d{1,2}', row['Data']):
            day, month = map(int, row['Data'].split('/'))
            key = month * 100 + day
            if previous_key is not None and key > previous_key:
                year -= 1
            row['isoDate'] = date(year, month, day).isoformat()
            previous_key = key
            if row['isoDate'] <= ssot.yesterday().isoformat() and row['Tema'] and any(row[field].strip() for field in ('Total Entregue', 'Aberturas', 'Total de cliques')):
                dates.append(row['isoDate'])
    if not rows or not dates:
        raise ssot.RefreshError('whatsapp_empty_source')
    now = datetime.now(ssot.TIMEZONE).isoformat()
    return {'schemaVersion': 1, 'source': {'spreadsheetId': WA_SHEET, 'checkedAt': now, 'sourceUpdatedAt': None,
        'dateYear': 2026, 'latestDate': max(dates)}, 'rows': rows}, {'latestDate': max(dates), 'observedAt': None,
        'rows': len(rows), 'coverageComplete': False, 'note': 'Ultima data com ativacao preenchida; dias sem disparo nao sao zeros inferidos.'}


def write_source(name, read, end, data_dir=ssot.ROOT / 'data'):
    path = data_dir / ('crm-' + name + '-snapshot.json')
    original = path.read_bytes() if path.exists() else None
    payload, status = read()
    if original:
        previous = json.loads(original)
        old_source, new_source = previous['source'], payload['source']
        old_time, new_time = (old_source.get('observedAt') or old_source.get('extractedAt')), (new_source.get('observedAt') or new_source.get('extractedAt'))
        if old_time and new_time and timestamp(new_time) < timestamp(old_time):
            unchanged = name == 'sendflow' and all(previous.get(key) == payload.get(key) for key in ('messages', 'actions', 'movement'))
            if not unchanged:
                raise ssot.RefreshError('operational_observation_regression')
            payload['source']['extractedAt'] = old_time
            status['observedAt'] = old_time
        if name == 'sendflow':
            for table, key in [('messages', 'messageKey'), ('actions', 'actionId')]:
                old_ids = {(r['releaseId'], r[key]) for r in previous[table]}
                if not old_ids <= {(r['releaseId'], r[key]) for r in payload[table]}:
                    raise ssot.RefreshError('sendflow_history_regression')
    ssot.atomic_json(path, payload, original)
    status.update(status='current' if status['latestDate'] >= end.isoformat() else 'stale', checkedAt=datetime.now(ssot.TIMEZONE).isoformat())
    return status
