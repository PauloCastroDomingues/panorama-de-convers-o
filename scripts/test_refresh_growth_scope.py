from datetime import date
import json
from pathlib import Path
import tempfile
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
            self.assertEqual(result['acceptedSources'], ['ssot', 'growth'])
            self.assertEqual(result['sources'][2:], previous['sources'][2:])
            for name in ('whatsapp', 'rd', 'sendflow'):
                filename = f'crm-{name}-snapshot.json'
                self.assertEqual((directory / filename).read_bytes(), baseline['snapshots'][filename])

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
