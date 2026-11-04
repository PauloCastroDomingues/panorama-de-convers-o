"""Read-only freshness gate for scheduled collection and verified releases."""
import argparse
from datetime import date, datetime, timedelta
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

STATUS_URL = 'https://panorama-de-conversao.vercel.app/data/data-refresh-status.json'
CORE_SOURCES = ('ssot', 'whatsapp', 'rd')
CORE_VIEWS = ('channel', 'campaign', 'channel_product')


def current(record, target):
    try:
        coverage = date.fromisoformat(record.get('coveredThrough') or record.get('latestDate') or '')
        return (record.get('status') == 'current' and not record.get('retained')
                and not record.get('error') and coverage >= target)
    except (TypeError, ValueError):
        return False


def evaluate(status, now):
    target = now.astimezone(ZoneInfo('America/Sao_Paulo')).date() - timedelta(days=1)
    sources = {row['id']: row for row in status.get('sources', [])}
    overdue = [key for key in CORE_SOURCES if not current(sources.get(key, {}), target)]
    growth = sources.get('growth', {})
    views = {row['id']: row for row in growth.get('views', [])}
    overdue += ['growth:' + key for key in CORE_VIEWS
                if growth.get('retained') or not current(views.get(key, {}), target)]
    if status.get('targetDate') != target.isoformat() or status.get('readOnly') is not True:
        overdue.append('cycle')
    try:
        finished = datetime.fromisoformat(status['finishedAt'].replace('Z', '+00:00'))
        age = (now - finished).total_seconds()
        periodic_due = age < 0 or age >= 4 * 60 * 60
        if age < 0:
            overdue.append('cycle_timestamp')
    except (KeyError, TypeError, ValueError):
        periodic_due = True
        overdue.append('cycle_timestamp')
    warnings = [key for key, row in sources.items() if not current(row, target)]
    return {'targetDate': target.isoformat(), 'coreCurrent': not overdue,
            'overdue': overdue, 'sourceWarnings': warnings,
            'refreshRequired': bool(overdue) or periodic_due}


def report(result):
    print(json.dumps(result, ensure_ascii=True))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with Path(summary).open('a', encoding='utf-8') as handle:
            handle.write('## Atualidade dos dados publicados\n\n```json\n'
                         + json.dumps(result, ensure_ascii=True, indent=2) + '\n```\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    try:
        request = Request(STATUS_URL, headers={'Cache-Control': 'no-cache'})
        with urlopen(request, timeout=30) as response:
            status = json.load(response)
        result = evaluate(status, datetime.now(ZoneInfo('America/Sao_Paulo')))
    except Exception:
        # An unavailable status must trigger recovery, never a false "up to date".
        result = {'coreCurrent': False, 'refreshRequired': True, 'overdue': ['status_unavailable']}
    if args.force:
        result['refreshRequired'] = True
    report(result)
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with Path(output).open('a', encoding='utf-8') as handle:
            handle.write('refresh=' + str(result['refreshRequired']).lower() + '\n')
    return 1 if args.verify and not result['coreCurrent'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
