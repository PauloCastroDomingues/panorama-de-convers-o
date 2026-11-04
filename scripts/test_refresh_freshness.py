from datetime import datetime
import unittest
from unittest.mock import patch

import check_data_freshness as freshness


def fixture():
    def row(key):
        return {'id': key, 'status': 'current', 'latestDate': '2026-11-03'}
    return {'targetDate': '2026-11-03', 'readOnly': True,
            'finishedAt': '2026-11-04T08:30:00-03:00',
            'sources': [row(key) for key in freshness.CORE_SOURCES] + [
                {'id': 'growth', 'status': 'partial', 'views': [row(key) for key in freshness.CORE_VIEWS]},
                {'id': 'sendflow', 'status': 'stale', 'latestDate': '2026-09-30'}]}


class FreshnessTests(unittest.TestCase):
    def check(self, status=None, at='2026-11-04T09:00:00-03:00'):
        return freshness.evaluate(status or fixture(), datetime.fromisoformat(at))

    def test_pending_sendflow_and_detail_do_not_hide_current_core(self):
        result = self.check()
        self.assertTrue(result['coreCurrent'])
        self.assertFalse(result['refreshRequired'])
        self.assertEqual(result['sourceWarnings'], ['growth', 'sendflow'])

    def test_regular_refresh_after_four_hours(self):
        self.assertTrue(self.check(at='2026-11-04T12:30:00-03:00')['refreshRequired'])

    def test_stale_core_retries_before_four_hours(self):
        status = fixture()
        status['sources'][0]['latestDate'] = '2026-11-02'
        result = self.check(status)
        self.assertEqual(result['overdue'], ['ssot'])
        self.assertTrue(result['refreshRequired'])

    def test_retained_or_error_is_not_current(self):
        for field, value in [('retained', True), ('error', 'blocked'), ('status', 'partial')]:
            status = fixture()
            status['sources'][0][field] = value
            self.assertFalse(self.check(status)['coreCurrent'])

    def test_covered_through_takes_precedence_over_latest_activity(self):
        status = fixture()
        status['sources'][2].update(latestDate='2026-11-01', coveredThrough='2026-11-03')
        self.assertTrue(self.check(status)['coreCurrent'])
        status['sources'][2].update(latestDate='2026-11-03', coveredThrough='2026-11-01')
        self.assertFalse(self.check(status)['coreCurrent'])

    def test_missing_or_retained_growth_view_requires_refresh(self):
        status = fixture()
        status['sources'][3]['views'].pop()
        self.assertIn('growth:channel_product', self.check(status)['overdue'])
        status = fixture()
        status['sources'][3]['retained'] = True
        self.assertFalse(self.check(status)['coreCurrent'])

    def test_bad_dates_and_missing_sources(self):
        status = fixture()
        status['sources'][0]['latestDate'] = 'invalid'
        status['sources'].pop(1)
        self.assertEqual(self.check(status)['overdue'], ['ssot', 'whatsapp'])

    def test_midnight_uses_sao_paulo_not_utc(self):
        result = self.check(at='2026-11-05T01:00:00+00:00')
        self.assertEqual(result['targetDate'], '2026-11-03')
        self.assertTrue(result['coreCurrent'])

    def test_new_day_requires_new_target(self):
        result = self.check(at='2026-11-05T03:00:00+00:00')
        self.assertEqual(result['targetDate'], '2026-11-04')
        self.assertFalse(result['coreCurrent'])

    def test_invalid_timestamp_or_missing_readonly_not_green(self):
        status = fixture()
        status['finishedAt'] = 'invalid'
        self.assertFalse(self.check(status)['coreCurrent'])
        status = fixture()
        status.pop('readOnly')
        self.assertFalse(self.check(status)['coreCurrent'])

    def test_future_timestamp_not_green(self):
        self.assertFalse(self.check(at='2026-11-04T08:00:00-03:00')['coreCurrent'])

    def test_network_failure_triggers_collection_and_fails_verification(self):
        with patch('check_data_freshness.urlopen', side_effect=TimeoutError), \
                patch('check_data_freshness.report'), patch.dict('os.environ', {}, clear=True):
            with patch('sys.argv', ['check']):
                self.assertEqual(freshness.main(), 0)
            with patch('sys.argv', ['check', '--verify']):
                self.assertEqual(freshness.main(), 1)


if __name__ == '__main__':
    unittest.main()
