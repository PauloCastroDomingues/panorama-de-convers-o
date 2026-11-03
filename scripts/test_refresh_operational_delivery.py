import copy
from datetime import date
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import refresh_operational as op
import refresh_crm_ssot as ssot
import check_operational_delivery as diagnostic


class Book:
    def __init__(self, tables):
        self.tables = tables
        self.tabs = tables
        self.meta = {'properties': {'title': 'Test only'}}
        self.closed = False

    def rows(self, name, columns, expected=None):
        rows = copy.deepcopy(self.tables[name])
        if expected and rows:
            assert list(rows[0]) == expected, (name, list(rows[0]), expected)
        if expected:
            assert ord(columns[0][1]) - ord('A') + 1 == len(expected)
        return rows

    def close(self):
        self.closed = True


def sendflow_book(empty=False):
    collection = dict(zip(op.SF_COLLECTION_FIELDS, [
        'sf-test', '2026-10-30T07:15:00-03:00', '2026-09-01', '2026-10-29',
        0 if empty else 1, 0 if empty else 1, 0, '["release-test"]', 'committed']))
    values = {
        'messages': ['release-test', 'action-test', 'action-test:0', 0, '2026-09-30T12:00:00Z',
                     '2026-09-30', 'text', 10, 8, 4, None, '2026-10-30T10:00:00Z'],
        'actions': ['release-test', 'action-test', '2026-09-30T12:00:00Z', '2026-09-30', True,
                    1, 1, 10, 8, 4, None, '2026-10-30T10:00:00Z']}
    tables = {'SF_COLETAS': [collection]}
    for key, (tab, _, fields) in op.SF_TABLES.items():
        tables[tab] = [] if empty or key == 'movement' else [dict(zip(['collection_id'] + fields, ['sf-test'] + values[key]))]
    return Book(tables)


class OperationalDeliveryTests(unittest.TestCase):
    def test_documented_headers_match_reader(self):
        guide = (ssot.ROOT / 'docs/tarefas-chat-coleta-crm.md').read_text(encoding='utf-8')
        for fields in [op.SF_COLLECTION_FIELDS, op.COLECTION_FIELDS,
                       ['collection_id', 'account_id'] + op.RD_FIELDS,
                       *[['collection_id'] + fields for _, _, fields in op.SF_TABLES.values()]]:
            self.assertIn(','.join(fields), guide)

    def test_diagnostic_does_not_treat_legacy_fresh_event_as_committed(self):
        result = diagnostic.inspect('sendflow', lambda: ({}, {'latestDate': '2026-10-29', 'rows': 1}), '2026-10-29')
        self.assertFalse(result['deliveryReady'])
        def fail():
            raise ValueError('secret not for output')
        self.assertNotIn('secret', json.dumps(diagnostic.inspect('rd', fail, '2026-10-29')))

    def read(self, book):
        with patch.object(op, 'Sheets', return_value=book):
            return op.read_sendflow()

    def test_last_event_and_consulted_period_are_separate(self):
        book = sendflow_book()
        payload, status = self.read(book)
        self.assertTrue(book.closed)
        self.assertEqual(status['latestDate'], '2026-09-30')
        self.assertEqual(status['coveredThrough'], '2026-10-29')
        self.assertFalse(payload['source']['coverageComplete'])
        self.assertIsNone(payload['messages'][0]['played'])
        with tempfile.TemporaryDirectory() as directory:
            result = op.write_source('sendflow', lambda: (payload, status), date(2026, 10, 29), Path(directory))
            self.assertEqual(result['status'], 'current')

    def test_confirmed_empty_collection_is_not_a_zero_metric(self):
        payload, status = self.read(sendflow_book(empty=True))
        self.assertIsNone(status['latestDate'])
        self.assertEqual(payload['messages'], [])
        self.assertEqual(status['coveredThrough'], '2026-10-29')
        self.assertFalse(payload['source']['coverageComplete'])

    def test_in_progress_collection_is_ignored(self):
        book = sendflow_book()
        pending = {**book.tables['SF_COLETAS'][0], 'collection_id': 'new', 'status': 'collecting'}
        book.tables['SF_COLETAS'].append(pending)
        self.assertEqual(self.read(book)[1]['collectionId'], 'sf-test')

    def test_no_committed_batch_does_not_fall_back_to_legacy(self):
        book = sendflow_book()
        book.tables['SF_COLETAS'][0]['status'] = 'collecting'
        with self.assertRaisesRegex(ssot.RefreshError, 'no_committed'):
            self.read(book)
        self.assertTrue(book.closed)

    def test_incomplete_count_duplicate_scope_and_future_date_rejected(self):
        cases = [('messages_count', 2, 'incomplete'), ('release_ids', '["x","x"]', 'scope'),
                 ('observed_at', '2099-10-30T07:15:00-03:00', 'future'),
                 ('end_date', '2026-10-30', 'not_closed')]
        for field, value, error in cases:
            with self.subTest(field=field):
                book = sendflow_book()
                book.tables['SF_COLETAS'][0][field] = value
                with self.assertRaisesRegex(ssot.RefreshError, error):
                    self.read(book)

    def test_scope_dates_and_reconciliation_are_validated(self):
        cases = [('releaseId', 'unknown', 'outside'), ('date', '2026-08-01', 'outside'),
                 ('sentAt', '2026-09-30T01:00:00Z', 'date_mismatch'),
                 ('generatedAt', '2026-10-31T00:00:00Z', 'after_collection'),
                 ('delivered', 7, 'contract_invalid')]
        for field, value, error in cases:
            with self.subTest(field=field):
                book = sendflow_book()
                book.tables['SF_MENSAGENS'][0][field] = value
                with self.assertRaisesRegex(ssot.RefreshError, error):
                    self.read(book)

    def test_manifest_change_during_read_rejected(self):
        book = sendflow_book()
        original = book.rows
        calls = 0
        def rows(name, columns, expected=None):
            nonlocal calls
            result = original(name, columns, expected)
            if name == 'SF_COLETAS':
                calls += 1
                if calls == 2:
                    result[0]['collection_id'] = 'changed'
            return result
        book.rows = rows
        with self.assertRaisesRegex(ssot.RefreshError, 'changed_during_read'):
            self.read(book)

    def test_loss_of_historical_movement_preserves_previous_file(self):
        payload, status = self.read(sendflow_book())
        previous = copy.deepcopy(payload)
        previous['movement'] = [{'releaseId': 'release-test', 'date': '2026-09-01'}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'crm-sendflow-snapshot.json'
            path.write_text(json.dumps(previous))
            before = path.read_bytes()
            with self.assertRaisesRegex(ssot.RefreshError, 'history_regression'):
                op.write_source('sendflow', lambda: (payload, status), date(2026, 10, 29), Path(directory))
            self.assertEqual(path.read_bytes(), before)

    def test_legacy_still_works_without_commit_tab(self):
        snapshot = json.loads((ssot.ROOT / 'data/crm-sendflow-snapshot.json').read_text(encoding='utf-8'))
        fields = {
            'Mensagens': {'releaseId': 'release_id', 'actionId': 'action_id', 'messageKey': 'message_key',
                'messageIndex': 'message_index', 'sentAt': 'sent_at_utc', 'date': 'data_brasilia', 'type': 'type',
                'recipients': 'recipients', 'delivered': 'delivered', 'read': 'read', 'played': 'played', 'generatedAt': 'generated_at_utc'},
            'Acoes': {'releaseId': 'release_id', 'actionId': 'action_id', 'sentAt': 'sent_at_utc', 'date': 'data_brasilia',
                'success': 'success', 'groups': 'groups', 'messageCount': 'message_count', 'recipients': 'recipients',
                'delivered': 'delivered', 'read': 'read', 'played': 'played', 'generatedAt': 'generated_at_utc'},
            'Movimento_diario': {'releaseId': 'release_id', 'date': 'data_brasilia', 'originalDateKey': 'date_key_original',
                'add': 'add', 'remove': 'remove', 'clicks': 'clicks'}}
        book = Book({tab: [{dest: row.get(src) for src, dest in fields[tab].items()} for row in snapshot[key]]
                     for tab, key in zip(fields, ('messages', 'actions', 'movement'))})
        payload, status = self.read(book)
        self.assertNotIn('collectionId', status)
        self.assertEqual(payload['messages'], snapshot['messages'])

    def test_rd_preserves_contract_and_exposes_collection_metadata(self):
        collection = dict(zip(op.COLECTION_FIELDS, ['rd-test', '832517', '2026-10-30T07:00:00-03:00',
                                                    '2026-10-01', '2026-10-29', 0, 'committed']))
        book = Book({'RD_COLETAS': [collection], 'RD_CAMPANHAS': []})
        with patch.object(op, 'Sheets', return_value=book):
            payload, status = op.read_rd()
        self.assertEqual(status['collectionId'], 'rd-test')
        self.assertEqual(payload['source']['coveredThrough'], '2026-10-29')
        self.assertIsNone(status['latestEventDate'])
        self.assertTrue(book.closed)


if __name__ == '__main__':
    unittest.main()
