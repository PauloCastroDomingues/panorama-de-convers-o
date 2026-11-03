"""Build and validate one cloud release. Never modify sources or the local data directory."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

import refresh_all_data as refresh
import refresh_crm_ssot as ssot
import refresh_growth as growth
import refresh_operational as operational

PRODUCTION = 'https://panorama-de-conversao.vercel.app'
TEAM = 'team_aOeQqmuvWdvxrN9JEPNPLfEU'
PROJECT = 'prj_tgHvNI7zPAN1qNUlKVcwE0PRiEM3'
SNAPSHOTS = ('ssot-commercial-channels.json', 'ssot-growth-views.json',
             'crm-whatsapp-snapshot.json', 'crm-rd-snapshot.json',
             'crm-sendflow-snapshot.json', 'crm-refresh-status.json', 'data-refresh-status.json')
STATIC_DATA = ('crm-weekly-reference.json', 'ga4-growth-alternative.json',
               'crm-rd-config.json', 'crm-sendflow-config.json')


def digest(content):
    return hashlib.sha256(content).hexdigest()


def blockers(status, expected_target=None):
    """Freshness is not historical completeness; preserve coverage caveats separately."""
    reasons = []
    for failure in status.get('preparationErrors', []):
        reasons.append(f'preparation:{failure}')
    target = status.get('targetDate')
    if not target or not status.get('finishedAt') or status.get('readOnly') is not True:
        reasons.append('cycle_incomplete')
    try:
        if date.fromisoformat(target).isoformat() != target:
            raise ValueError()
        started = operational.timestamp(status.get('startedAt'))
        finished = operational.timestamp(status.get('finishedAt'))
        if started > finished:
            reasons.append('cycle_invalid_timestamps')
    except (ValueError, TypeError, ssot.RefreshError):
        finished = None
        reasons.append('cycle_invalid_timestamps')
    if expected_target is not None and target != expected_target.isoformat():
        reasons.append('cycle_target_not_d1')
    records = status.get('sources', [])
    if len(records) != len(refresh.SOURCES) or {r.get('id') for r in records} != set(refresh.SOURCES):
        reasons.append('sources_incomplete')
    for record in records:
        key = record.get('id', 'unknown')
        if record.get('status') != 'current' or record.get('error'):
            reasons.append(f'{key}:not_current')
        covered = record.get('coveredThrough') if key in ('rd', 'sendflow', 'growth') else record.get('latestDate')
        if not covered or covered < (target or ''):
            reasons.append(f'{key}:before_target')
        if key in ('rd', 'sendflow') and not record.get('collectionId'):
            reasons.append(f'{key}:committed_collection_required')
        if key == 'growth':
            views = record.get('views', [])
            expected = set(growth.LABELS) - {'ad', 'ad_product'}
            active = [v for v in views if v.get('id') in expected]
            if len(active) != len(expected) or {v.get('id') for v in active} != expected:
                reasons.append('growth:views_missing')
            for view in active:
                if (view.get('status') != 'current' or view.get('error')
                        or (view.get('coveredThrough') or '') < (target or '')):
                    reasons.append(f'growth:{view["id"]}:not_current')
        observed = record.get('observedAt')
        if key in ('rd', 'sendflow') and not observed:
            reasons.append(f'{key}:collection_timestamp_missing')
        if observed and target:
            try:
                instant = operational.timestamp(observed)
                if instant.astimezone(ssot.TIMEZONE).date().isoformat() <= target:
                    reasons.append(f'{key}:collection_before_day_closed')
                if finished and instant > finished:
                    reasons.append(f'{key}:collection_in_future')
            except (ValueError, TypeError, ssot.RefreshError):
                reasons.append(f'{key}:collection_timestamp_invalid')
    return sorted(set(reasons))


def download_baseline(destination, get):
    # Two reads detect a promotion during download; hashes protect subsequent releases.
    before = get('data/data-refresh-status.json')
    index = get('')
    status = json.loads(before)
    contents = {name: get('data/' + name) for name in SNAPSHOTS if name != 'data-refresh-status.json'}
    if get('data/data-refresh-status.json') != before or get('') != index:
        raise ssot.RefreshError('production_changed_during_baseline')
    contents['data-refresh-status.json'] = before
    manifest = (status.get('release') or {}).get('files', {})
    if manifest and set(manifest) != set(SNAPSHOTS) - {'data-refresh-status.json'}:
        raise ssot.RefreshError('baseline_manifest_incomplete')
    if manifest and any(digest(contents[name]) != value for name, value in manifest.items()):
        raise ssot.RefreshError('baseline_hash_mismatch')
    for name, content in contents.items():
        json.loads(content)
        (destination / name).write_bytes(content)
    return {'status': before, 'index': index, 'snapshots': contents}


def collect_operational(name, read, end, directory, attempts=3, pause=time.sleep):
    """Bounded waits for the upstream task; no retries for auth/schema failures."""
    retryable = {'source_request_failed', 'sheet_read_failed', 'no_committed_collection',
                 'collection_changed_during_read'}
    for attempt in range(attempts):
        try:
            result = operational.write_source(name, read, end, data_dir=directory)
            if (result['status'] == 'current' or attempt == attempts - 1
                    or (name == 'sendflow' and not result.get('collectionId'))):
                return result
        except Exception as error:
            if ssot.safe_error(error) not in retryable or attempt == attempts - 1:
                raise
        pause(60)


def collect_candidate(end, directory, collectors=None, preparation_errors=()):
    started = datetime.now(ssot.TIMEZONE).isoformat()
    if collectors is None:
        def commercial_and_growth():
            result = ssot.run(end, output=directory / SNAPSHOTS[0], status_output=directory / 'crm-refresh-status.json')
            if result['status'] != 'current':
                return {'ssot': result, 'growth': {'status': 'error', 'error': 'ssot_dependency_not_current'}}
            commercial = json.loads((directory / SNAPSHOTS[0]).read_text(encoding='utf-8'))
            try:
                growth_result = growth.run(end, commercial, output=directory / SNAPSHOTS[1])
            except Exception as error:
                growth_result = {'status': 'error', 'error': ssot.safe_error(error)}
            return {'ssot': result, 'growth': growth_result}
        collectors = {'commercial': commercial_and_growth}
        for name, read in (('whatsapp', operational.read_whatsapp), ('rd', operational.read_rd), ('sendflow', operational.read_sendflow)):
            collectors[name] = lambda name=name, read=read: {
                name: collect_operational(name, read, end, directory)}
    results = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(collect): key for key, collect in collectors.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results.update(future.result())
            except Exception as error:
                keys = ('ssot', 'growth') if key == 'commercial' else (key,)
                for failed in keys:
                    results[failed] = {'status': 'error', 'error': ssot.safe_error(error)}
    finished = datetime.now(ssot.TIMEZONE).isoformat()
    status = {'schemaVersion': 1, 'runId': started, 'startedAt': started, 'checkedAt': finished,
              'finishedAt': finished, 'targetDate': end.isoformat(), 'readOnly': True,
              'preparationErrors': list(preparation_errors),
              'sources': [{'id': key, 'label': label, **results.get(key, {'status': 'error', 'error': 'missing_result'})}
                          for key, label in refresh.SOURCES.items()]}
    status['status'] = 'partial' if preparation_errors else refresh.aggregate(status['sources'])
    status['publicationBlockers'] = blockers(status)
    ssot.atomic_json(directory / 'data-refresh-status.json', status)
    return status


def prepare_catalogs(directory):
    # Never fall back to developer-machine catalogs after a cloud read fails.
    os.environ['PANORAMA_GROWTH_CATALOG_DIR'] = str(directory)
    try:
        cloud_catalogs(directory)
        return []
    except Exception as error:
        return [ssot.safe_error(error)]


def diagnostic_report(status):
    """Only operational metadata goes to public workflow logs, never source rows."""
    fields = ('id', 'status', 'latestDate', 'coveredThrough', 'rows', 'error', 'retained')
    sources = []
    for record in status['sources']:
        source = {key: record[key] for key in fields if key in record}
        if record['id'] in ('rd', 'sendflow'):
            source['hasCommittedCollection'] = bool(record.get('collectionId'))
        if record['id'] == 'growth':
            source['views'] = [{key: view[key] for key in fields if key in view}
                               for view in record.get('views', [])]
        sources.append(source)
    independent = status.get('publicationPolicy') == 'independent_sources'
    return {'targetDate': status['targetDate'], 'checkedAt': status['finishedAt'],
            'readOnly': True, 'historicalCoverageComplete': False,
            'status': status['status'], 'publicationPolicy': status.get('publicationPolicy', 'all_sources'),
            'sourceWarnings': status.get('sourceWarnings', []),
            'sources': sources, 'publicationBlockers': status['publicationBlockers'] if independent else blockers(status, ssot.yesterday())}


def report_diagnostic(status):
    report = diagnostic_report(status)
    content = json.dumps(report, ensure_ascii=True, indent=2)
    print(content, flush=True)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with Path(summary).open('a', encoding='utf-8') as handle:
            handle.write('## Conferencia das fontes - somente leitura\n\n')
            handle.write('Resultado da coleta, anterior a qualquer publicacao. Dados de origem nao foram alterados.\n\n')
            handle.write('```json\n' + content + '\n```\n')
    return report


def validate_bundle(path):
    node = shutil.which('node')
    if not node:
        raise ssot.RefreshError('node_required')
    result = subprocess.run([node, str(ssot.ROOT / 'scripts/validate_release.cjs'), str(path)],
                            capture_output=True, timeout=60)
    if result.returncode or result.stdout != b'ok':
        raise ssot.RefreshError('cloud_bundle_invalid')


def seal(directory, status, expected_target=None):
    reasons = blockers(status, expected_target)
    if reasons:
        raise ssot.RefreshError('cloud_release_blocked: ' + ', '.join(reasons))
    files = {name: digest((directory / name).read_bytes()) for name in SNAPSHOTS if name != 'data-refresh-status.json'}
    status['release'] = {'id': status['runId'], 'files': files, 'mode': 'coordinated_cloud_release',
                         'historicalCoverageComplete': False}
    ssot.atomic_json(directory / 'data-refresh-status.json', status)
    bundle = {'schemaVersion': 1, 'releaseId': status['runId'],
              'files': {name: json.loads((directory / name).read_text(encoding='utf-8')) for name in SNAPSHOTS}}
    ssot.atomic_json(directory / 'panorama-release.json', bundle)
    validate_bundle(directory / 'panorama-release.json')


def reconcile_available(directory, status, baseline):
    """Accept validated sources independently; retain exact bytes for rejected sources."""
    reasons = blockers(status, ssot.yesterday())
    if any(reason.startswith(('cycle_', 'sources_')) for reason in reasons):
        raise ssot.RefreshError('invalid_independent_cycle')
    previous = {source['id']: source for source in json.loads(baseline['status'])['sources']}
    files = {'ssot': SNAPSHOTS[0], 'growth': SNAPSHOTS[1],
             **{key: f'crm-{key}-snapshot.json' for key in ('whatsapp', 'rd', 'sendflow')}}
    accepted = []
    for index, record in enumerate(status['sources']):
        key = record['id']
        eligible = record['status'] == 'current' and not any(reason.startswith(key + ':') for reason in reasons)
        if key == 'growth' and 'ssot' not in accepted:
            eligible = False
        if key == 'growth' and 'ssot' in accepted:
            payload = json.loads((directory / files[key]).read_text(encoding='utf-8'))
            commercial = json.loads((directory / files['ssot']).read_text(encoding='utf-8'))
            channel = next((view for view in payload.get('data', []) if view['view'] == 'channel'), {})
            eligible = (bool(channel.get('generatedAt')) and channel.get('generatedAt') == commercial.get('extracted_at')
                        and any(view['id'] == 'channel' and view['status'] == 'current'
                                for view in record.get('views', [])))
            if eligible:
                record['status'] = 'current' if all(view['status'] in ('current', 'unavailable')
                                                   for view in record['views']) else 'partial'
                for view in record['views']:
                    view['retained'] = view['status'] not in ('current', 'unavailable')
        if eligible:
            record['retained'] = False
            record['lastSuccessfulReadAt'] = status['finishedAt']
            accepted.append(key)
        else:
            (directory / files[key]).write_bytes(baseline['snapshots'][files[key]])
            if key == 'ssot':
                (directory / 'crm-refresh-status.json').write_bytes(baseline['snapshots']['crm-refresh-status.json'])
            status['sources'][index] = {**previous[key], 'id': key, 'label': record['label'],
                'status': 'error' if record.get('error') else 'stale',
                'error': record.get('error'), 'checkedAt': status['finishedAt'], 'retained': True,
                'retentionReason': 'Ultima versao validada preservada; coleta atual nao liberada.'}
    if not accepted:
        raise ssot.RefreshError('no_valid_source_to_publish')
    status.update(publicationPolicy='independent_sources', acceptedSources=accepted,
                  sourceWarnings=reasons, publicationBlockers=[],
                  status='current' if all(row['status'] == 'current' for row in status['sources']) else 'partial')
    ssot.atomic_json(directory / 'data-refresh-status.json', status)
    return status


def seal_available(directory, status):
    if (status.get('publicationPolicy') != 'independent_sources' or not status.get('acceptedSources')
            or status.get('publicationBlockers') or status.get('targetDate') != ssot.yesterday().isoformat()):
        raise ssot.RefreshError('independent_release_not_reconciled')
    files = {name: digest((directory / name).read_bytes()) for name in SNAPSHOTS if name != 'data-refresh-status.json'}
    status['release'] = {'id': status['runId'], 'files': files, 'mode': 'independent_sources',
                         'historicalCoverageComplete': False}
    ssot.atomic_json(directory / 'data-refresh-status.json', status)
    bundle = {'schemaVersion': 1, 'releaseId': status['runId'],
              'files': {name: json.loads((directory / name).read_text(encoding='utf-8')) for name in SNAPSHOTS}}
    ssot.atomic_json(directory / 'panorama-release.json', bundle)
    validate_bundle(directory / 'panorama-release.json')


def cloud_catalogs(directory):
    import google.auth
    from google.auth.transport.requests import AuthorizedSession
    bucket = os.environ.get('PANORAMA_CATALOG_BUCKET', '')
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]', bucket):
        raise ssot.RefreshError('cloud_catalog_bucket_required')
    credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/devstorage.read_only'])
    with AuthorizedSession(credentials) as session:
        for channel in ('meta', 'google'):
            name = f'growth-bridge-{channel}-catalog.json'
            response = session.get(f'https://storage.googleapis.com/storage/v1/b/{bucket}/o/{name}', params={'alt': 'media'}, timeout=30)
            response.raise_for_status()
            payload = response.json()
            growth.bridge.validate_catalog(payload, 'adset_id' if channel == 'meta' else 'ad_group_id', ssot.yesterday())
            ssot.atomic_json(directory / name, payload)
    os.environ['PANORAMA_GROWTH_CATALOG_DIR'] = str(directory)


def cli(*args, cwd):
    executable = shutil.which('vercel')
    if not executable:
        raise ssot.RefreshError('vercel_cli_required')
    interaction = [] if args[0] == 'curl' else ['--non-interactive']
    # CLI reads VERCEL_TOKEN from its inherited environment. curl forwards --token.
    result = subprocess.run([executable, '--scope', TEAM, *interaction, *args], cwd=cwd,
                            capture_output=True, timeout=600)
    if result.returncode:
        # CLI stderr may contain authorization details. Do not export it to artifacts.
        raise ssot.RefreshError('vercel_cloud_' + args[0] + '_failed')
    return result.stdout


def verify_release(get, directory):
    expected = (directory / 'data-refresh-status.json').read_bytes()
    if json.loads(get('data/data-refresh-status.json')) != json.loads(expected):
        raise ssot.RefreshError('release_status_mismatch')
    status = json.loads(expected)
    for name, value in status['release']['files'].items():
        if digest(get('data/' + name)) != value:
            raise ssot.RefreshError('release_snapshot_mismatch')
    if digest(get('data/panorama-release.json')) != digest((directory / 'panorama-release.json').read_bytes()):
        raise ssot.RefreshError('release_bundle_mismatch')
    if b'<html' not in get('').lower():
        raise ssot.RefreshError('release_html_missing')


def verify_promoted_release(get, directory, pause=time.sleep):
    # Domain propagation may briefly serve the prior deployment after promotion.
    retryable = {'release_status_mismatch', 'release_snapshot_mismatch',
                 'release_bundle_mismatch', 'release_html_missing'}
    for attempt in range(6):
        try:
            verify_release(get, directory)
            return
        except ssot.RefreshError as error:
            if str(error) not in retryable or attempt == 5:
                raise
            pause(10)


def publish_candidate(stage, directory, baseline, get, run_cli=cli):
    def unchanged():
        if get('data/data-refresh-status.json') != baseline['status'] or get('') != baseline['index']:
            raise ssot.RefreshError('production_changed_before_promotion')
    unchanged()
    response = json.loads(run_cli('deploy', '--prod', '--skip-domain', '--yes', '--json', cwd=stage))
    deployment = response.get('deployment', response)
    url = deployment['url']
    if deployment['readyState'] != 'READY' or not re.fullmatch(r'https://panorama-de-conversao-[a-z0-9]+-reise-team\.vercel\.app', url):
        raise ssot.RefreshError('unexpected_cloud_deployment')
    # Authenticated CLI access keeps deployment protection enabled.
    verify_release(lambda path: run_cli('curl', url + '/' + path, cwd=stage), directory)
    unchanged()
    run_cli('promote', url, '--yes', cwd=stage)
    verify_promoted_release(get, directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check-only', action='store_true', help='Read current status, without collecting or deploying.')
    mode.add_argument('--publish', action='store_true', help='Stage, verify and promote only a complete current cycle.')
    mode.add_argument('--diagnose', action='store_true', help='Collect every available source in isolation; never seal or deploy.')
    parser.add_argument('--independent-sources', action='store_true', help='Publish valid sources without waiting for delayed providers.')
    args = parser.parse_args()
    if args.check_only:
        status = json.loads((ssot.ROOT / 'data/data-refresh-status.json').read_text(encoding='utf-8'))
        reasons = blockers(status, expected_target=ssot.yesterday())
        print(json.dumps({'publicationBlockers': reasons, 'targetDate': status['targetDate']}))
        return 1 if reasons else 0
    if os.environ.get('PANORAMA_SHEETS_AUTH') != 'workload_identity':
        raise ssot.RefreshError('cloud_workload_identity_required')
    import requests
    def get(path):
        response = requests.get(PRODUCTION + '/' + path, timeout=(10, 90), headers={'Cache-Control': 'no-cache'})
        response.raise_for_status()
        return response.content
    with tempfile.TemporaryDirectory(prefix='panorama-cloud-') as temporary:
        root = Path(temporary)
        stage = root / 'site'
        stage.mkdir()
        directory = stage / 'data'
        directory.mkdir()
        catalogs = root / 'catalogs'
        catalogs.mkdir()
        preparation_errors = prepare_catalogs(catalogs)
        baseline = download_baseline(directory, get)
        status = collect_candidate(ssot.yesterday(), directory, preparation_errors=preparation_errors)
        if args.diagnose:
            report = report_diagnostic(status)
            return 1 if report['publicationBlockers'] else 0
        if args.independent_sources:
            reconcile_available(directory, status, baseline)
            seal_available(directory, status)
            report_diagnostic(status)
        else:
            report_diagnostic(status)
            seal(directory, status, expected_target=ssot.yesterday())
        if not args.publish:
            return 0
        for name in ('assets', 'api'):
            shutil.copytree(ssot.ROOT / name, stage / name)
        (stage / 'assets/release-mode.js').write_text('window.PANORAMA_CLOUD_RELEASE = true;\n', encoding='utf-8')
        for name in ('index.html', 'vercel.json', '.vercelignore'):
            shutil.copy2(ssot.ROOT / name, stage / name)
        for name in STATIC_DATA:
            shutil.copy2(ssot.ROOT / 'data' / name, directory / name)
        (stage / '.vercel').mkdir()
        ssot.atomic_json(stage / '.vercel/project.json', {'projectId': PROJECT, 'orgId': TEAM, 'projectName': 'panorama-de-conversao'})
        publish_candidate(stage, directory, baseline, get)
        print(json.dumps({'published': PRODUCTION, 'runId': status['runId']}))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'status': 'blocked', 'error': ssot.safe_error(error)}))
        raise SystemExit(1)
