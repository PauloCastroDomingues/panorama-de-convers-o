import copy
from datetime import date
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import refresh_all_data as refresh
import refresh_growth as growth
import refresh_operational as operational
import refresh_crm_ssot as ssot


class RefreshTests(unittest.TestCase):
    def test_all_collectors_run_even_after_failure(self):
        called = []
        def collector(key):
            def collect():
                called.append(key)
                if key == 'rd':
                    raise ssot.RefreshError('sheet_read_access_required')
                return {'status': 'current', 'latestDate': '2026-10-28'}
            return collect
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'status.json'
            status = refresh.run(date(2026, 10, 28), path, {key: collector(key) for key in refresh.SOURCES})
            self.assertEqual(called, list(refresh.SOURCES))
            self.assertEqual(status['status'], 'partial')
            self.assertTrue(status['finishedAt'])
            self.assertEqual(status, json.loads(path.read_text()))
            self.assertEqual(status['sources'][3]['error'], 'sheet_read_access_required')

    def test_stale_source_never_reports_global_current(self):
        self.assertEqual(refresh.aggregate([{'status': 'current'}, {'status': 'stale'}]), 'stale')
        self.assertEqual(refresh.aggregate([{'status': 'current'}, {'status': 'queued'}]), 'running')

    def test_failure_retains_last_success(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'status.json'
            ok = {key: lambda: {'status': 'current', 'latestDate': '2026-10-28'} for key in refresh.SOURCES}
            previous = refresh.run(date(2026, 10, 28), path, ok)
            def fail():
                raise ValueError('secret must not leak')
            result = refresh.run(date(2026, 10, 28), path, {key: fail for key in refresh.SOURCES})
            for old, new in zip(previous['sources'], result['sources']):
                self.assertEqual(old['lastSuccessfulReadAt'], new['lastSuccessfulReadAt'])
                self.assertEqual(old['latestDate'], new['latestDate'])
                self.assertEqual(new['error'], 'refresh_failed')
            self.assertNotIn('secret', path.read_text())

    def test_cross_process_lock_rejects_duplicate(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'refresh.lock'
            with refresh.refresh_lock(path):
                with self.assertRaises((ssot.RefreshError, BlockingIOError)):
                    with refresh.refresh_lock(path):
                        pass

    def test_success_clears_manual_import_auth_warning(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'status.json'
            path.write_text(json.dumps({'sources': [{
                'id': key, 'readPath': 'connected_read_only_import',
                'automaticReadStatus': 'authentication_required',
                'error': 'authentication_failed',
            } for key in refresh.SOURCES]}))
            collectors = {key: lambda: {'status': 'current', 'latestDate': '2026-10-28'}
                          for key in refresh.SOURCES}
            collectors['sendflow'] = lambda: {'status': 'stale', 'latestDate': '2026-09-30'}
            status = refresh.run(date(2026, 10, 28), path, collectors)
            self.assertEqual(status['status'], 'stale')
            for row in status['sources']:
                self.assertNotIn('readPath', row)
                self.assertNotIn('automaticReadStatus', row)
                self.assertIsNone(row['error'])
                self.assertTrue(row['lastSuccessfulReadAt'])

    def test_sheet_dates_not_unix_dates(self):
        self.assertEqual(operational.sheet_date(46266), '2026-09-01')
        self.assertEqual(operational.sheet_date('2026-10-28'), '2026-10-28')
        with self.assertRaises(ssot.RefreshError):
            operational.sheet_date(0)

    def test_null_is_not_zero(self):
        self.assertIsNone(operational.counter(''))
        self.assertEqual(operational.counter(0), 0)
        with self.assertRaises(ssot.RefreshError):
            operational.counter(-1)

    def test_channel_aggregation_structural_nulls(self):
        rows = [{'data': '2026-10-28', 'canal': 'Google ADS', 'sessoes': 10, 'pedidos': 0, 'receita': '0'},
                {'data': '2026-10-28', 'canal': 'Google ADS', 'sessoes': None, 'pedidos': 2, 'receita': '120.50'}]
        view = growth.channel_view({'source': ssot.SOURCE, 'extracted_at': 'now', 'rows': rows})
        self.assertEqual(view['rows'][0]['sessoes'], 10)
        self.assertEqual(view['rows'][0]['pedidos'], 2)
        self.assertEqual(view['rows'][0]['receita'], '120.50')

    def test_growth_keeps_failed_view_and_marks_missing_grains(self):
        class Reader:
            jobs = []
            def __init__(self, end): pass
            def read(self, key):
                if key == 'campaign': raise ssot.RefreshError('growth_query_timeout')
                return {'view': key, 'rows': [{'data': '2026-10-28', 'sessoes': None, 'pedidos': 1, 'receita': '20'}]}
            def close(self): pass
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'growth.json'
            old_view = {'view': 'campaign', 'rows': [{'data': '2026-10-27', 'pedidos': 10}]}
            path.write_text(json.dumps({'data': [old_view]}))
            commercial = {'source': ssot.SOURCE, 'extracted_at': 'now', 'rows': []}
            status = growth.run(date(2026, 10, 28), commercial, path, Reader, seed=lambda previous: previous)
            new = json.loads(path.read_text())
            self.assertEqual(new['data'][1], old_view)
            self.assertEqual(len(new['data']), 8)
            self.assertEqual(status['status'], 'error')
            self.assertEqual(sum(v['status'] == 'unavailable' for v in status['views']), 3)

    def test_rejects_older_operational_observation(self):
        previous = {'source': {'observedAt': '2026-10-29T10:00:00Z'}}
        older = {'source': {'observedAt': '2026-10-28T10:00:00Z'}}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'crm-rd-snapshot.json'
            path.write_text(json.dumps(previous))
            original = path.read_bytes()
            with self.assertRaises(ssot.RefreshError):
                operational.write_source('rd', lambda: (older, {'latestDate': '2026-10-27'}), date(2026, 10, 28), Path(folder))
            self.assertEqual(original, path.read_bytes())


if __name__ == '__main__':
    unittest.main()
