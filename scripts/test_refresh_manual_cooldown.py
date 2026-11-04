from datetime import datetime, timezone
import unittest
from check_data_freshness import manual_refresh_allowed


class ManualCooldownTests(unittest.TestCase):
    def test_serialized_workflow_rejects_recent_attempt_even_if_failed(self):
        now = datetime(2026, 11, 4, 20, 0, tzinfo=timezone.utc)
        run = {'id': 10, 'created_at': '2026-11-04T19:59:00Z', 'conclusion': 'failure'}
        self.assertFalse(manual_refresh_allowed([run], '11', now))
        run['created_at'] = '2026-11-04T19:50:00Z'
        self.assertTrue(manual_refresh_allowed([run], '11', now))

    def test_current_later_and_cancelled_runs_do_not_block_first_collection(self):
        now = datetime(2026, 11, 4, 20, 0, tzinfo=timezone.utc)
        runs = [{'id': 11, 'created_at': now.isoformat()}, {'id': 12, 'created_at': now.isoformat()},
                {'id': 10, 'created_at': now.isoformat(), 'conclusion': 'cancelled'}]
        self.assertTrue(manual_refresh_allowed(runs, '11', now))

    def test_invalid_timestamp_fails_closed(self):
        with self.assertRaises(ValueError):
            manual_refresh_allowed([{'id': 1, 'created_at': 'invalid'}], '2', datetime.now(timezone.utc))


if __name__ == '__main__':
    unittest.main()
