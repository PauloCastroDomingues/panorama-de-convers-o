from datetime import date
import json
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch, Mock

import cloud_refresh as cloud
import refresh_all_data as refresh
import test_cloud_refresh as fixtures


class GrowthScopeTests(unittest.TestCase):
    def test_cloud_skips_operational_sources_and_preserves_their_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            previous = fixtures.current_status()
            (directory / 'data-refresh-status.json').write_text(json.dumps(previous))
            def commercial(*args, **kwargs):
                kwargs['output'].write_text('{}')
                return {'status': 'current'}
            with patch.object(cloud.ssot, 'run', side_effect=commercial), \
                 patch.object(cloud.growth, 'run', return_value={'status': 'current'}), \
                 patch.object(cloud, 'collect_operational') as operational:
                result = cloud.collect_candidate(date(2026, 10, 29), directory, scope='growth')
            operational.assert_not_called()
            self.assertEqual(result['requestedSources'], ['ssot', 'growth'])
            self.assertEqual(result['sources'][2:], previous['sources'][2:])

    def test_reconciliation_does_not_renew_untouched_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            status, baseline = fixtures.CloudReleaseTests().independent_fixture(directory)
            status['requestedSources'] = ['ssot', 'growth']
            previous = json.loads(baseline['status'])
            with patch.object(cloud.ssot, 'yesterday', return_value=date(2026, 10, 29)):
                result = cloud.reconcile_available(directory, status, baseline)
            self.assertEqual(result['acceptedSources'], ['ssot', 'growth', 'whatsapp', 'rd'])
            for row, old in zip(result['sources'][2:], previous['sources'][2:]):
                self.assertEqual(row, {**old, 'retained': old['status'] != 'current'})
                self.assertNotIn('lastSuccessfulReadAt', row)
            for name in ('whatsapp', 'rd', 'sendflow'):
                filename = f'crm-{name}-snapshot.json'
                self.assertEqual((directory / filename).read_bytes(), baseline['snapshots'][filename])

    def test_growth_scope_seals_against_real_release_contract(self):
        # Exercise the actual JS contract in CI, without contacting any source.
        root = cloud.ssot.ROOT
        fixture = subprocess.run(['node', '-e',
            "process.stdout.write(JSON.stringify(require('./scripts/fixtures/cloud-release.cjs').independentBundle()))"],
            cwd=root, capture_output=True, check=True, timeout=30)
        bundle = json.loads(fixture.stdout)
        stamp = bundle['files']['data-refresh-status.json']['finishedAt']
        bundle['files']['ssot-commercial-channels.json']['extracted_at'] = stamp
        for view in bundle['files']['ssot-growth-views.json']['data']:
            if view['view'] == 'channel':
                view['generatedAt'] = stamp
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            snapshots = {name: json.dumps(bundle['files'][name]).encode() for name in cloud.SNAPSHOTS}
            for name, contents in snapshots.items():
                (directory / name).write_bytes(contents)
            status = json.loads(snapshots['data-refresh-status.json'])
            status['requestedSources'] = ['ssot', 'growth']
            baseline = {'status': snapshots['data-refresh-status.json'], 'snapshots': snapshots}
            with patch.object(cloud.ssot, 'yesterday', return_value=date.fromisoformat(status['targetDate'])):
                cloud.reconcile_available(directory, status, baseline)
                cloud.seal_available(directory, status)

    def test_local_growth_runs_dependency_first_without_operational_calls(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'status.json'
            previous = fixtures.current_status()
            output.write_text(json.dumps(previous))
            calls = []
            def collect(name):
                calls.append(name)
                return {'status': 'current'}
            collectors = {key: lambda key=key: collect(key) for key in refresh.SOURCES}
            result = refresh.run(date(2026,10,29), output, collectors, scope='growth')
            self.assertEqual(calls, ['ssot', 'growth'])
            self.assertEqual(result['sources'][2:], previous['sources'][2:])

    def test_local_growth_does_not_read_an_old_commercial_snapshot_after_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            growth = Mock()
            result = refresh.run(date(2026,10,29), Path(temp)/'status.json',
                                 {'ssot': lambda: {'status':'error'}, 'growth':growth}, scope='growth')
            growth.assert_not_called()
            self.assertEqual(result['sources'][1]['status'], 'error')


if __name__ == '__main__':
    unittest.main()
