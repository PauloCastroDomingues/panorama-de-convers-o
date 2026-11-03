import copy
from datetime import date
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import cloud_refresh as cloud
import refresh_crm_ssot as ssot
import google_sheets_auth


def current_status():
    views = [{'id': key, 'status': 'current', 'coveredThrough': '2026-10-29'}
             for key in cloud.growth.LABELS if key not in ('ad', 'ad_product')]
    return {'status': 'current', 'runId': 'test', 'readOnly': True, 'targetDate': '2026-10-29',
            'startedAt': '2026-10-30T07:55:00-03:00', 'finishedAt': '2026-10-30T08:00:00-03:00',
            'sources': [{'id': key, 'label': key, 'status': 'current', 'latestDate': '2026-10-29',
                         **({'observedAt': '2026-10-30T07:00:00-03:00', 'collectionId': 'test',
                             'coveredThrough': '2026-10-29'} if key in ('rd', 'sendflow') else {}),
                         **({'views': views, 'coveredThrough': '2026-10-29'} if key == 'growth' else {})} for key in cloud.refresh.SOURCES]}


class CloudReleaseTests(unittest.TestCase):
    def test_authentication_uses_environment_without_forwarding_credentials(self):
        with patch.dict('cloud_refresh.os.environ', {'VERCEL_TOKEN': 'testtoken'}):
            with patch('cloud_refresh.shutil.which', return_value='vercel'):
                with patch('cloud_refresh.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=b'ok')) as run:
                    cloud.cli('curl', 'https://example.test/data.json', cwd=Path('.'))
        command = run.call_args.args[0]
        self.assertNotIn('--token', command)
        self.assertNotIn('testtoken', command)
        self.assertLess(command.index('--scope'), command.index('curl'))
        self.assertEqual(command[command.index('curl') + 1:], ['https://example.test/data.json'])

    def test_curl_does_not_receive_unsupported_noninteractive_option(self):
        with patch('cloud_refresh.shutil.which', return_value='vercel'):
            with patch('cloud_refresh.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=b'ok')) as run:
                cloud.cli('curl', 'https://example.test/data.json', cwd=Path('.'))
                self.assertNotIn('--non-interactive', run.call_args.args[0])
                cloud.cli('deploy', '--yes', cwd=Path('.'))
                self.assertIn('--non-interactive', run.call_args.args[0])

    def test_legacy_sendflow_does_not_delay_current_sources_with_repeated_reads(self):
        with patch('cloud_refresh.operational.write_source', return_value={'status': 'stale'}) as read:
            with patch('cloud_refresh.time.sleep') as pause:
                self.assertEqual(cloud.collect_operational('sendflow', None, None, Path('.'), pause=pause)['status'], 'stale')
        read.assert_called_once()
        pause.assert_not_called()

    def independent_fixture(self, directory):
        status = current_status()
        previous = copy.deepcopy(status)
        previous['sources'][-1].update(latestDate='2026-09-30', status='stale')
        for field in ('collectionId', 'coveredThrough', 'observedAt'):
            previous['sources'][-1].pop(field)
        snapshots = {name: b'{"preserved":true}' for name in cloud.SNAPSHOTS}
        snapshots['data-refresh-status.json'] = json.dumps(previous).encode()
        for name, value in snapshots.items():
            (directory / name).write_bytes(value)
        (directory / cloud.SNAPSHOTS[0]).write_text('{"extracted_at":"2026-10-30T08:00:00-03:00"}')
        (directory / cloud.SNAPSHOTS[1]).write_text(json.dumps({'data': [
            {'view': 'channel', 'generatedAt': '2026-10-30T08:00:00-03:00'}]}))
        return status, {'status': snapshots['data-refresh-status.json'], 'snapshots': snapshots}

    def test_sendflow_does_not_block_valid_sources_or_receive_fake_new_date(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            status, baseline = self.independent_fixture(directory)
            status['sources'][-1].update(status='stale', latestDate='2026-09-30', collectionId=None)
            (directory / 'crm-sendflow-snapshot.json').write_bytes(b'{"unvalidated":true}')
            with patch('cloud_refresh.ssot.yesterday', return_value=date(2026, 10, 29)):
                result = cloud.reconcile_available(directory, status, baseline)
            self.assertEqual(result['acceptedSources'], ['ssot', 'growth', 'whatsapp', 'rd'])
            self.assertEqual(result['status'], 'partial')
            sf = result['sources'][-1]
            self.assertTrue(sf['retained'])
            self.assertEqual(sf['latestDate'], '2026-09-30')
            self.assertNotIn('collectionId', sf)
            self.assertEqual((directory / 'crm-sendflow-snapshot.json').read_bytes(), baseline['snapshots']['crm-sendflow-snapshot.json'])

    def test_partial_growth_keeps_fresh_channel_and_reports_old_groups(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            status, baseline = self.independent_fixture(directory)
            growth = status['sources'][1]
            growth['status'] = 'error'
            growth['views'][2].update(status='error', error='growth_identity_catalog_missing', coveredThrough='2026-10-28')
            status['preparationErrors'] = ['cloud_catalog_bucket_required']
            with patch('cloud_refresh.ssot.yesterday', return_value=date(2026, 10, 29)):
                result = cloud.reconcile_available(directory, status, baseline)
            self.assertEqual(result['sources'][1]['status'], 'partial')
            self.assertTrue(result['sources'][1]['views'][2]['retained'])
            self.assertFalse(result['sources'][1]['views'][0]['retained'])
            self.assertEqual(result['publicationBlockers'], [])
            self.assertIn('preparation:cloud_catalog_bucket_required', result['sourceWarnings'])

    def test_no_healthy_source_never_publishes_a_new_timestamp_only(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            status, baseline = self.independent_fixture(directory)
            for source in status['sources']:
                source.update(status='error', error='source_request_failed')
            with patch('cloud_refresh.ssot.yesterday', return_value=date(2026, 10, 29)):
                with self.assertRaisesRegex(ssot.RefreshError, 'no_valid_source'):
                    cloud.reconcile_available(directory, status, baseline)

    def test_new_rd_without_committed_collection_is_retained(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            status, baseline = self.independent_fixture(directory)
            status['sources'][3]['collectionId'] = None
            with patch('cloud_refresh.ssot.yesterday', return_value=date(2026, 10, 29)):
                result = cloud.reconcile_available(directory, status, baseline)
            self.assertTrue(result['sources'][3]['retained'])
            self.assertNotIn('rd', result['acceptedSources'])

    def test_partial_seal_rejects_unreconciled_cycle(self):
        with self.assertRaisesRegex(ssot.RefreshError, 'not_reconciled'):
            cloud.seal_available(Path('.'), current_status())

    def test_missing_catalog_does_not_cancel_other_collectors(self):
        sources = {row['id']: row for row in current_status()['sources']}
        collectors = {key: lambda key=key: {key: sources[key]} for key in sources}
        with tempfile.TemporaryDirectory() as temp:
            status = cloud.collect_candidate(date(2026, 10, 29), Path(temp), collectors,
                                             ['cloud_catalog_bucket_required'])
            self.assertEqual(len(status['sources']), 5)
            self.assertEqual(status['status'], 'partial')
            self.assertTrue(all(row['status'] == 'current' for row in status['sources']))
            self.assertIn('preparation:cloud_catalog_bucket_required', status['publicationBlockers'])
            with self.assertRaisesRegex(ssot.RefreshError, 'cloud_catalog_bucket_required'):
                cloud.seal(Path(temp), status)

    def test_growth_crash_keeps_successful_ssot_result(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / cloud.SNAPSHOTS[0]).write_text('{}', encoding='utf-8')
            with patch('cloud_refresh.ssot.run', return_value={'status': 'current'}):
                with patch('cloud_refresh.growth.run', side_effect=ssot.RefreshError('growth_budget_exceeded')):
                    with patch('cloud_refresh.collect_operational', return_value={'status': 'current'}):
                        status = cloud.collect_candidate(date(2026, 10, 29), directory)
            records = {row['id']: row for row in status['sources']}
            self.assertEqual(records['ssot']['status'], 'current')
            self.assertEqual(records['growth']['error'], 'growth_budget_exceeded')
            self.assertEqual(len(records), 5)

    def test_failed_catalog_read_cannot_use_local_catalogs(self):
        with patch.dict('os.environ', {'PANORAMA_GROWTH_CATALOG_DIR': 'developer-private-directory'}):
            with patch('cloud_refresh.cloud_catalogs', side_effect=ssot.RefreshError('cloud_catalog_bucket_required')):
                errors = cloud.prepare_catalogs(Path('isolated'))
            self.assertEqual(cloud.os.environ['PANORAMA_GROWTH_CATALOG_DIR'], 'isolated')
            self.assertEqual(errors, ['cloud_catalog_bucket_required'])

    def test_report_does_not_export_source_rows_or_private_metadata(self):
        status = current_status()
        status['sources'][0]['payload'] = {'customer': 'private-customer-value'}
        status['sources'][0]['jobs'] = [{'sql': 'private-query-value'}]
        status['sources'][3]['collectionId'] = 'private-collection-value'
        with patch('cloud_refresh.ssot.yesterday', return_value=date(2026, 10, 29)):
            report = cloud.diagnostic_report(status)
        content = json.dumps(report)
        self.assertNotIn('private-', content)
        self.assertTrue(report['sources'][3]['hasCommittedCollection'])
        self.assertEqual(report['publicationBlockers'], [])
        self.assertFalse(report['historicalCoverageComplete'])

    def test_diagnostic_workflow_cannot_publish_or_schedule(self):
        workflow = (ssot.ROOT / '.github/workflows/diagnose-data.yml').read_text(encoding='utf-8')
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('cloud_refresh.py --diagnose', workflow)
        for forbidden in ('schedule:', 'secrets.', '--publish', 'upload-artifact', 'vercel@'):
            self.assertNotIn(forbidden, workflow)

    def test_diagnostic_and_publish_are_mutually_exclusive(self):
        with patch('sys.argv', ['cloud_refresh.py', '--diagnose', '--publish']):
            with self.assertRaises(SystemExit) as error:
                cloud.main()
        self.assertEqual(error.exception.code, 2)

    def test_diagnostic_runs_all_collection_but_never_seals_or_publishes(self):
        with patch.dict('os.environ', {'PANORAMA_SHEETS_AUTH': 'workload_identity'}):
            with patch('sys.argv', ['cloud_refresh.py', '--diagnose']):
                with patch('cloud_refresh.prepare_catalogs', return_value=['cloud_catalog_bucket_required']), \
                     patch('cloud_refresh.download_baseline'), \
                     patch('cloud_refresh.collect_candidate', return_value=current_status()) as collect, \
                     patch('cloud_refresh.report_diagnostic', return_value={'publicationBlockers': ['sendflow:before_target']}), \
                     patch('cloud_refresh.seal') as seal, \
                     patch('cloud_refresh.publish_candidate') as publish:
                    self.assertEqual(cloud.main(), 1)
                collect.assert_called_once()
                seal.assert_not_called()
                publish.assert_not_called()

    def test_operational_retry_waits_for_upstream_and_is_bounded(self):
        with patch('cloud_refresh.operational.write_source', side_effect=[{'status': 'stale'}, {'status': 'current'}]) as read:
            with patch('cloud_refresh.time.sleep') as pause:
                result = cloud.collect_operational('rd', None, date(2026, 10, 29), Path('.'), pause=pause)
                self.assertEqual(result['status'], 'current')
                self.assertEqual(read.call_count, 2)
                pause.assert_called_once_with(60)
        with patch('cloud_refresh.operational.write_source', return_value={'status': 'stale'}) as read:
            with patch('cloud_refresh.time.sleep') as pause:
                self.assertEqual(cloud.collect_operational('rd', None, None, Path('.'), pause=pause)['status'], 'stale')
                self.assertEqual(read.call_count, 3)
                self.assertEqual(pause.call_count, 2)

    def test_auth_failure_does_not_retry(self):
        with patch('cloud_refresh.operational.write_source', side_effect=ssot.RefreshError('sheet_read_access_required')) as read:
            with patch('cloud_refresh.time.sleep') as pause:
                with self.assertRaises(ssot.RefreshError):
                    cloud.collect_operational('rd', None, None, Path('.'), pause=pause)
                read.assert_called_once()
                pause.assert_not_called()

    def test_transient_collection_change_retries(self):
        with patch('cloud_refresh.operational.write_source', side_effect=[ssot.RefreshError('collection_changed_during_read'), {'status': 'current'}]):
            with patch('cloud_refresh.time.sleep') as pause:
                self.assertEqual(cloud.collect_operational('rd', None, None, Path('.'), pause=pause)['status'], 'current')
                pause.assert_called_once_with(60)

    def test_all_sources_required(self):
        status = current_status()
        self.assertEqual(cloud.blockers(status), [])
        status['sources'].pop()
        self.assertIn('sources_incomplete', cloud.blockers(status))

    def test_growth_without_events_on_last_day_uses_validated_coverage(self):
        status = current_status()
        status['sources'][1]['latestDate'] = '2026-10-28'
        self.assertEqual(cloud.blockers(status), [])
        status['sources'][1]['coveredThrough'] = '2026-10-28'
        self.assertIn('growth:before_target', cloud.blockers(status))

    def test_stale_sendflow_prevents_seal(self):
        status = current_status()
        status['sources'][-1].update(status='stale', latestDate='2026-09-30')
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ssot.RefreshError, 'sendflow'):
                cloud.seal(Path(temp), status)
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_unsupported_creatives_do_not_become_required_or_fabricated(self):
        status = current_status()
        status['sources'][1]['views'].append({'id': 'ad', 'status': 'unavailable'})
        self.assertEqual(cloud.blockers(status), [])

    def test_cached_growth_view_blocks_entire_batch(self):
        status = current_status()
        status['sources'][1]['views'][2]['coveredThrough'] = '2026-10-28'
        self.assertTrue(any(reason.startswith('growth:') for reason in cloud.blockers(status)))

    def test_reading_old_collection_today_is_not_freshness(self):
        status = current_status()
        status['sources'][3]['observedAt'] = '2026-10-28T10:00:00-03:00'
        self.assertIn('rd:collection_before_day_closed', cloud.blockers(status))

    def test_closed_collection_without_recent_events_is_current(self):
        status = current_status()
        status['sources'][-1]['latestDate'] = None
        self.assertEqual(cloud.blockers(status), [])

    def test_event_date_alone_cannot_release_legacy_sendflow(self):
        status = current_status()
        status['sources'][-1].pop('collectionId')
        status['sources'][-1].pop('coveredThrough')
        self.assertIn('sendflow:committed_collection_required', cloud.blockers(status))
        self.assertIn('sendflow:before_target', cloud.blockers(status))

    def test_concurrent_collectors_same_target_and_isolated_directory(self):
        barrier = threading.Barrier(4)
        sources = {row['id']: row for row in current_status()['sources']}
        def collector(keys):
            barrier.wait(timeout=5)
            return {key: copy.deepcopy(sources[key]) for key in keys}
        collectors = {'commercial': lambda: collector(('ssot', 'growth')),
                      **{key: lambda key=key: collector((key,)) for key in ('whatsapp', 'rd', 'sendflow')}}
        with tempfile.TemporaryDirectory() as temp:
            status = cloud.collect_candidate(date(2026, 10, 29), Path(temp), collectors)
            self.assertEqual(status['publicationBlockers'], [])
            self.assertEqual(len(status['sources']), 5)
            self.assertEqual(status['targetDate'], '2026-10-29')

    def test_exception_keeps_other_results_but_blocks_publication(self):
        def fail():
            raise ssot.RefreshError('sheet_read_access_required')
        with tempfile.TemporaryDirectory() as temp:
            status = cloud.collect_candidate(date(2026, 10, 29), Path(temp), {'rd': fail})
            self.assertEqual(status['status'], 'partial')
            self.assertTrue(status['publicationBlockers'])

    def test_baseline_changed_during_download_is_rejected_before_writing(self):
        calls = 0
        def get(path):
            nonlocal calls
            if path.endswith('data-refresh-status.json'):
                calls += 1
                return json.dumps({'runId': str(calls)}).encode()
            return b'{}'
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ssot.RefreshError, 'production_changed'):
                cloud.download_baseline(Path(temp), get)
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_seal_and_verify_every_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for name in cloud.SNAPSHOTS:
                (directory / name).write_bytes(b'{"test":true}\n')
            status = current_status()
            with patch('cloud_refresh.validate_bundle'):
                cloud.seal(directory, status)
            def get(path):
                return b'<html></html>' if path == '' else (directory / Path(path).name).read_bytes()
            cloud.verify_release(get, directory)
            (directory / cloud.SNAPSHOTS[0]).write_bytes(b'{"test":false}\n')
            with self.assertRaisesRegex(ssot.RefreshError, 'snapshot_mismatch'):
                cloud.verify_release(get, directory)
            self.assertFalse(status['release']['historicalCoverageComplete'])

    def test_corrupt_payload_is_rejected_despite_green_status(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for name in cloud.SNAPSHOTS:
                (directory / name).write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(ssot.RefreshError, 'cloud_bundle_invalid'):
                cloud.seal(directory, current_status())

    def test_target_is_rechecked_before_publication(self):
        self.assertIn('cycle_target_not_d1', cloud.blockers(current_status(), date(2026, 10, 30)))

    def test_collection_timestamp_missing_invalid_or_future_blocks(self):
        for instant, expected in [(None, 'missing'), ('bad', 'invalid'), ('2026-10-31T07:00:00-03:00', 'future')]:
            status = current_status()
            status['sources'][3]['observedAt'] = instant
            suffix = 'collection_in_future' if expected == 'future' else 'collection_timestamp_' + expected
            self.assertIn('rd:' + suffix, cloud.blockers(status))

    def test_intervening_release_blocks_before_deploy(self):
        with patch('cloud_refresh.cli') as run_cli:
            with self.assertRaisesRegex(ssot.RefreshError, 'production_changed'):
                cloud.publish_candidate(Path('.'), Path('.'), {'status': b'old', 'index': b'old'}, lambda _: b'new', run_cli)
            run_cli.assert_not_called()

    def test_intervening_release_blocks_promotion(self):
        reads = iter([b'old', b'old', b'new'])
        result = {'deployment': {'url': 'https://panorama-de-conversao-test123-reise-team.vercel.app', 'readyState': 'READY'}}
        with patch('cloud_refresh.verify_release'), patch('cloud_refresh.cli', return_value=json.dumps(result)) as run_cli:
            with self.assertRaisesRegex(ssot.RefreshError, 'production_changed'):
                cloud.publish_candidate(Path('.'), Path('.'), {'status': b'old', 'index': b'old'}, lambda _: next(reads), run_cli)
            self.assertEqual([call.args[0] for call in run_cli.call_args_list], ['deploy'])

    def test_verification_failure_never_promotes(self):
        result = {'deployment': {'url': 'https://panorama-de-conversao-test123-reise-team.vercel.app', 'readyState': 'READY'}}
        with patch('cloud_refresh.verify_release', side_effect=ssot.RefreshError('hash_mismatch')):
            with patch('cloud_refresh.cli', return_value=json.dumps(result)) as run_cli:
                with self.assertRaisesRegex(ssot.RefreshError, 'hash_mismatch'):
                    cloud.publish_candidate(Path('.'), Path('.'), {'status': b'old', 'index': b'old'}, lambda _: b'old', run_cli)
                self.assertEqual([call.args[0] for call in run_cli.call_args_list], ['deploy'])

    def test_html_changed_without_data_refresh_blocks_deploy(self):
        with patch('cloud_refresh.cli') as run_cli:
            with self.assertRaisesRegex(ssot.RefreshError, 'production_changed'):
                cloud.publish_candidate(Path('.'), Path('.'), {'status': b'old', 'index': b'old'},
                                        lambda path: b'new-html' if path == '' else b'old', run_cli)
            run_cli.assert_not_called()

    def test_success_promotes_only_after_candidate_validation(self):
        calls = []
        result = {'deployment': {'url': 'https://panorama-de-conversao-test123-reise-team.vercel.app', 'readyState': 'READY'}}
        def run_cli(*args, **kwargs):
            calls.append(args[0])
            return json.dumps(result)
        with patch('cloud_refresh.verify_release', side_effect=lambda *args: calls.append('verify')):
            cloud.publish_candidate(Path('.'), Path('.'), {'status': b'old', 'index': b'old'}, lambda _: b'old', run_cli)
        self.assertEqual(calls, ['deploy', 'verify', 'promote', 'verify'])

    def test_flat_cli_json_is_supported_without_skipping_verification(self):
        result = {'url': 'https://panorama-de-conversao-test123-reise-team.vercel.app', 'readyState': 'READY'}
        with patch('cloud_refresh.verify_release') as verify:
            with patch('cloud_refresh.cli', return_value=json.dumps(result)) as run_cli:
                cloud.publish_candidate(Path('.'), Path('.'), {'status': b'old', 'index': b'old'}, lambda _: b'old', run_cli)
        self.assertEqual([call.args[0] for call in run_cli.call_args_list], ['deploy', 'promote'])
        self.assertEqual(verify.call_count, 2)

    def test_cloud_auth_never_falls_back_to_personal_oauth(self):
        from google.oauth2.credentials import Credentials
        with patch.dict('os.environ', {'PANORAMA_SHEETS_AUTH': 'workload_identity'}):
            with patch('google.auth.default', return_value=(Credentials('test'), 'test')) as auth:
                with self.assertRaisesRegex(ssot.RefreshError, 'workload_identity_required'):
                    google_sheets_auth.load_credentials()
                auth.assert_called_once_with(scopes=[google_sheets_auth.SCOPE])


if __name__ == '__main__':
    unittest.main()
