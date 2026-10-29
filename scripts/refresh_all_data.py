"""Refresh every active Panorama source, without writing to any source system."""
from contextlib import contextmanager
from datetime import datetime
import json
import os

import refresh_crm_ssot as ssot
import refresh_growth
import refresh_operational as operational

OUTPUT = ssot.ROOT / 'data/data-refresh-status.json'
SOURCES = {'ssot': 'SSOT comercial', 'growth': 'Visoes Growth', 'whatsapp': 'WhatsApp Oficial',
           'rd': 'RD Station', 'sendflow': 'SendFlow'}


@contextmanager
def refresh_lock(path):
    path.parent.mkdir(exist_ok=True)
    with path.open('a+b') as handle:
        if not path.stat().st_size:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise ssot.RefreshError('refresh_already_running') from None
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def collect_growth(end):
    commercial = json.loads(ssot.OUTPUT.read_text(encoding='utf-8'))
    return refresh_growth.run(end, commercial)


def aggregate(sources):
    if any(row['status'] in ('queued', 'running') for row in sources):
        return 'running'
    if any(row['status'] == 'error' for row in sources):
        return 'partial'
    return 'current' if all(row['status'] == 'current' for row in sources) else 'stale'


def run(end=None, output=OUTPUT, collectors=None):
    end = end or ssot.yesterday()
    if collectors is None:
        collectors = {'ssot': lambda: ssot.run(end), 'growth': lambda: collect_growth(end),
            'whatsapp': lambda: operational.write_source('whatsapp', operational.read_whatsapp, end),
            'rd': lambda: operational.write_source('rd', operational.read_rd, end),
            'sendflow': lambda: operational.write_source('sendflow', operational.read_sendflow, end)}
    previous = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
    old = {row['id']: row for row in previous.get('sources', [])}
    now = datetime.now(ssot.TIMEZONE).isoformat()
    status = {'schemaVersion': 1, 'runId': now, 'startedAt': now, 'checkedAt': now, 'finishedAt': None,
        'targetDate': end.isoformat(), 'status': 'running', 'readOnly': True,
        'sources': [{**old.get(key, {}), 'id': key, 'label': label, 'status': 'queued'} for key, label in SOURCES.items()],
        'excluded': [{'id': 'crm-weekly-reference', 'reason': 'Referencia de metas, nao e realizado.'},
                     {'id': 'ga4-alternative', 'reason': 'Fonte alternativa inativa; conversao comercial permanece SSOT.'}]}
    ssot.atomic_json(output, status)
    for record in status['sources']:
        record['status'] = 'running'
        ssot.atomic_json(output, status)
        try:
            result = collectors[record['id']]()
            if result['status'] not in ('current', 'stale', 'error'):
                raise ssot.RefreshError('invalid_refresh_result')
            if result['status'] != 'error':
                result['lastSuccessfulReadAt'] = datetime.now(ssot.TIMEZONE).isoformat()
                result.setdefault('error', None)
                record.pop('readPath', None)
                record.pop('automaticReadStatus', None)
            record.update(result)
        except Exception as error:
            record.update(status='error', error=ssot.safe_error(error), checkedAt=datetime.now(ssot.TIMEZONE).isoformat())
        status['status'] = aggregate(status['sources'])
        status['checkedAt'] = datetime.now(ssot.TIMEZONE).isoformat()
        ssot.atomic_json(output, status)
    status['finishedAt'] = status['checkedAt']
    ssot.atomic_json(output, status)
    return status


def main():
    try:
        with refresh_lock(ssot.ROOT / '.local/data-refresh.lock'):
            result = run()
        print(json.dumps(result, ensure_ascii=True))
        return 1 if result['status'] == 'partial' else 0
    except Exception as error:
        print(json.dumps({'status': 'error', 'error': ssot.safe_error(error)}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
