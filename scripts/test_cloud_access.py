from datetime import date
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import check_cloud_access as probe


class AccessTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.get_table.return_value = SimpleNamespace(location='US')
        self.client.test_iam_permissions.return_value = {'permissions': list(probe.READ_PERMISSIONS)}
        self.dry = SimpleNamespace(statement_type='SELECT', total_bytes_processed=1024)
        self.job = Mock(total_bytes_billed=1024)
        self.job.result.return_value = [{'private_value': 'must_not_be_logged'}]
        self.client.query.side_effect = [self.dry, self.job]
        self.bq = SimpleNamespace(QueryJobConfig=lambda **kw: SimpleNamespace(**kw),
                                  ScalarQueryParameter=lambda *args: args)

    def run_table(self, live=True):
        return probe.probe_table(self.client, self.bq, probe.TABLES[0], date(2026, 11, 2), live=live)

    def test_fixed_identity(self):
        env = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/main',
               'GITHUB_REPOSITORY_ID': '1434889171', 'GITHUB_REPOSITORY_OWNER_ID': '153780526',
               'GCP_SERVICE_ACCOUNT': probe.ACCOUNT, 'GCP_WORKLOAD_IDENTITY_PROVIDER': probe.PROVIDER}
        probe.validate_config(env)
        for key in env:
            with self.subTest(key=key), self.assertRaises(probe.ProbeError):
                probe.validate_config({**env, key: 'unexpected'})

    def test_live_sample_select_only_and_no_values_logged(self):
        result = self.run_table()
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['sampleRows'], 1)
        self.assertNotIn('must_not_be_logged', str(result))
        for call in self.client.query.call_args_list:
            self.assertTrue(call.args[0].startswith('SELECT '))
            self.assertTrue(call.args[0].endswith('LIMIT 1'))
            self.assertNotIn(';', call.args[0])
            config = call.kwargs['job_config']
            self.assertEqual(config.maximum_bytes_billed, probe.MAX_BYTES)
            self.assertFalse(hasattr(config, 'destination'))
            self.assertFalse(hasattr(config, 'write_disposition'))

    def test_other_tables_dry_run_only(self):
        result = self.run_table(live=False)
        self.assertEqual(result['status'], 'ok')
        self.assertFalse(result['liveSampleRead'])
        self.assertEqual(self.client.query.call_count, 1)

    def test_empty_day_does_not_claim_freshness(self):
        self.job.result.return_value = []
        result = self.run_table()
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['sampleRows'], 0)
        self.assertNotIn('fresh', result)

    def test_write_permission_blocks_query(self):
        for permission in probe.WRITE_PERMISSIONS:
            self.client.query.reset_mock()
            self.client.test_iam_permissions.return_value = {'permissions': [*probe.READ_PERMISSIONS, permission]}
            self.assertEqual(self.run_table()['error'], 'unexpected_table_write_permission')
            self.client.query.assert_not_called()

    def test_missing_read_blocks_query(self):
        self.client.test_iam_permissions.return_value = {'permissions': ['bigquery.tables.get']}
        self.assertEqual(self.run_table()['error'], 'table_read_permission_not_confirmed')
        self.client.query.assert_not_called()

    def test_non_select_blocks_execution(self):
        self.dry.statement_type = 'SCRIPT'
        self.assertEqual(self.run_table()['error'], 'select_validation_failed')
        self.assertEqual(self.client.query.call_count, 1)

    def test_over_budget_blocks_execution(self):
        self.dry.total_bytes_processed = probe.MAX_BYTES + 1
        self.assertEqual(self.run_table()['error'], 'sample_exceeds_256_mib_budget')
        self.assertEqual(self.client.query.call_count, 1)

    def test_timeout_cancels_own_query(self):
        self.job.result.side_effect = TimeoutError('sensitive text')
        self.assertEqual(self.run_table()['error'], 'timeout')
        self.job.cancel.assert_called_once()

    def test_errors_do_not_leak_messages(self):
        self.client.get_table.side_effect = RuntimeError('SECRET_CREDENTIAL')
        result = self.run_table()
        self.assertEqual(result['error'], 'request_failed_RuntimeError')
        self.assertNotIn('SECRET_CREDENTIAL', str(result))

    def test_access_error_reports_only_allowlisted_resource_ids(self):
        class Forbidden(Exception):
            code = 403
        error = Forbidden('Access Denied: Table reise-ssot:source.orders: SECRET_VALUE '
                          'Table other-project:private.orders')
        self.assertEqual(probe.denied_resources(error), ['reise-ssot:source.orders'])
        self.assertEqual(probe.denied_resources(RuntimeError(str(error))), [])

    def test_git_push_cannot_deploy_panel(self):
        import json
        path = Path(__file__).resolve().parents[1] / 'vercel.json'
        config = json.loads(path.read_text(encoding='utf-8'))
        self.assertIs(config['git']['deploymentEnabled'], False)

    def sheet(self, name, tabs):
        session = Mock()
        metadata = {'spreadsheetId': probe.SHEETS[name],
                    'sheets': [{'properties': {'title': title}} for title in tabs]}
        responses = [metadata] + [{'values': [['header'], ['SECRET_METRIC']]} for _ in tabs]
        session.get.side_effect = [SimpleNamespace(status_code=200, json=lambda data=data: data)
                                   for data in responses]
        return session

    def test_rd_read_only_samples(self):
        session = self.sheet('rd', ['RD_COLETAS', 'RD_CAMPANHAS'])
        result = probe.probe_sheet(session, 'rd')
        self.assertEqual(result['status'], 'ok')
        self.assertNotIn('SECRET_METRIC', str(result))
        self.assertEqual(session.get.call_count, 3)
        session.post.assert_not_called()
        session.put.assert_not_called()

    def test_sf_legacy_does_not_claim_delivery(self):
        result = probe.probe_sheet(self.sheet('sendflow', ['Mensagens', 'Acoes', 'Movimento_diario']), 'sendflow')
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['mode'], 'legacy_not_release_ready')

    def test_sf_incomplete_new_contract_does_not_fallback(self):
        session = self.sheet('sendflow', ['SF_COLETAS', 'Mensagens', 'Acoes', 'Movimento_diario'])
        self.assertEqual(probe.probe_sheet(session, 'sendflow')['error'], 'required_tabs_missing')

    def test_sheet_forbidden(self):
        session = Mock()
        session.get.return_value = SimpleNamespace(status_code=403)
        self.assertEqual(probe.probe_sheet(session, 'rd')['error'], 'sheet_read_access_denied')

    def test_workflow_is_manual_without_deployment_or_secrets(self):
        path = Path(__file__).resolve().parents[1] / '.github/workflows/check-cloud-access.yml'
        workflow = path.read_text(encoding='utf-8')
        for forbidden in ('schedule:', 'push:', 'pull_request:', 'vercel', 'secrets.', 'refresh-data.yml'):
            self.assertNotIn(forbidden, workflow)
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('persist-credentials: false', workflow)


if __name__ == '__main__':
    unittest.main()
