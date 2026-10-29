"""Focused contract, preservation, and failure tests; no network access."""

from datetime import date, datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import refresh_crm_ssot as refresh


def row(day="2025-01-01", label="E-mail", sessions=2, orders=1, revenue="10", origin="RD"):
    return {"data": day, "canal": label, "canal_detalhe": label, "origem": origin,
            "sessoes": sessions, "pedidos": orders, "receita": revenue}


def snapshot(rows):
    return {"kind": refresh.KIND, "source": refresh.SOURCE, "start": "2025-01-01",
            "end": max(item["data"] for item in rows), "rules": {"orders": "consolidated_ssot"},
            "rows": rows, "metadata": {"session_bridge": {"source": refresh.BRIDGE, "filter": refresh.BRIDGE_FILTER}}}


class RefreshTests(unittest.TestCase):
    def test_brt_yesterday_at_utc_boundary(self):
        self.assertEqual(refresh.yesterday(datetime(2026, 10, 28, 1, tzinfo=timezone.utc)), date(2026, 10, 26))

    def test_null_and_zero_stay_distinct(self):
        rows = refresh.normalize_rows([row(sessions=None, orders=0, revenue=Decimal("0"))], date(2025, 1, 1))
        self.assertIsNone(rows[0]["sessoes"])
        self.assertEqual(rows[0]["pedidos"], 0)
        self.assertEqual(rows[0]["receita"], "0")
        status = refresh.refresh_status(rows, date(2025, 1, 1), "observed")
        metrics = status["channels"]["email"]["metrics"]
        self.assertEqual(metrics["sessoes"]["knownDays"], 0)
        self.assertIsNone(metrics["sessoes"]["targetValue"])
        self.assertEqual(metrics["pedidos"]["knownDays"], 1)
        self.assertEqual(metrics["pedidos"]["targetValue"], 0)

    def test_channel_sessions_do_not_require_sessions_on_order_origins(self):
        rows = [row(sessions=None), row(sessions=8, orders=0, revenue="0", origin="channel")]
        self.assertEqual(refresh.daily_totals(rows)[("2025-01-01", "E-mail")],
                         {"sessoes": 8, "pedidos": 1, "receita": "10"})
        rows[0]["pedidos"] = None
        self.assertIsNone(refresh.daily_totals(rows)[("2025-01-01", "E-mail")]["pedidos"])

    def test_google_bridge_preserves_commercial_values_and_is_idempotent(self):
        rows = [row(label="Google ADS", sessions=None, origin="Google"), row()]
        bridge = [{"data": date(2025, 1, 1), "sessoes": 30}, {"data": "2025-01-02", "sessoes": 0}]
        result, stats = refresh.apply_bridge(rows, bridge, date(2025, 1, 2))
        self.assertEqual(stats["merged_rows"], 1)
        self.assertEqual(stats["added_rows"], 1)
        google = [item for item in result if item["canal"] == "Google ADS"]
        self.assertEqual([(item["sessoes"], item["pedidos"], item["receita"]) for item in google], [(30, 1, "10"), (0, 0, "0")])
        again, _ = refresh.apply_bridge(result, bridge, date(2025, 1, 2))
        self.assertEqual(again, result)
        with self.assertRaisesRegex(refresh.RefreshError, "conflict"):
            refresh.apply_bridge(result, [{"data": "2025-01-01", "sessoes": 99}], date(2025, 1, 2))

    def test_regressing_rows_metrics_and_window_are_rejected(self):
        old = snapshot([row(), row("2025-01-02", label="Google ADS", sessions=50, origin="Google")])
        with self.assertRaisesRegex(refresh.RefreshError, "dates_regression"):
            refresh.reject_regression(old, [row()], date(2025, 1, 3))
        changed = [dict(item) for item in old["rows"]]
        changed[1]["sessoes"] = None
        with self.assertRaisesRegex(refresh.RefreshError, "coverage_regression"):
            refresh.reject_regression(old, changed, date(2025, 1, 3))
        with self.assertRaisesRegex(refresh.RefreshError, "window_regression"):
            refresh.reject_regression(old, old["rows"], date(2025, 1, 1))

    def test_empty_duplicate_and_unsafe_counts_are_rejected(self):
        for rows in ([], [row(), row()], [row(sessions=2**53)]):
            with self.assertRaises(refresh.RefreshError):
                refresh.normalize_rows(rows, date(2025, 1, 1))

    def test_atomic_replace_failure_keeps_original_and_cleans_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_bytes(b'{"last_good": true}\n')
            before = path.read_bytes()
            with patch.object(refresh.os, "replace", side_effect=OSError("private detail")):
                with self.assertRaises(OSError):
                    refresh.atomic_json(path, {"last_good": False}, before)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_concurrent_edit_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_bytes(b'{"concurrent": true}')
            with self.assertRaisesRegex(refresh.RefreshError, "changed_during"):
                refresh.atomic_json(path, {"overwrite": True}, b"older")
            self.assertEqual(json.loads(path.read_bytes()), {"concurrent": True})

    def test_query_failure_reports_only_sanitized_error(self):
        with tempfile.TemporaryDirectory() as directory:
            output, status_path = Path(directory) / "snapshot.json", Path(directory) / "status.json"
            refresh.atomic_json(output, snapshot([row()]))
            before = output.read_bytes()
            def fail(_):
                raise RuntimeError("access_token=SECRET user@example.test")
            status = refresh.run(date(2025, 1, 2), output, status_path, fail)
            self.assertEqual(output.read_bytes(), before)
            self.assertEqual(status["error"], "refresh_failed")
            self.assertNotIn("SECRET", status_path.read_text())
            self.assertEqual(set(status), {"checkedAt", "targetDate", "latestDate", "channels", "status", "error"})

    def test_valid_but_stale_source_is_persisted_without_false_freshness(self):
        with tempfile.TemporaryDirectory() as directory:
            output, status_path = Path(directory) / "snapshot.json", Path(directory) / "status.json"
            refresh.atomic_json(output, snapshot([row()]))
            def fetch(_):
                return ([row(), row("2025-01-02")], [{"data": "2025-01-02", "sessoes": 4}],
                        {"definition": "SELECT data", "session_bridge": {"source": refresh.BRIDGE, "filter": refresh.BRIDGE_FILTER}}, [], {})
            status = refresh.run(date(2025, 1, 3), output, status_path, fetch)
            self.assertEqual(status["status"], "stale")
            self.assertIsNone(status["error"])
            self.assertEqual(status["latestDate"], "2025-01-02")
            self.assertEqual(status["channels"]["email"]["metrics"]["sessoes"]["latestDate"], "2025-01-02")
            first = json.loads(output.read_bytes())["rows"]
            refresh.run(date(2025, 1, 3), output, status_path, fetch)
            self.assertEqual(json.loads(output.read_bytes())["rows"], first)

    def test_empty_refresh_leaves_last_good(self):
        with tempfile.TemporaryDirectory() as directory:
            output, status_path = Path(directory) / "snapshot.json", Path(directory) / "status.json"
            refresh.atomic_json(output, snapshot([row()]))
            before = output.read_bytes()
            status = refresh.run(date(2025, 1, 2), output, status_path, lambda _: ([], [], {}, [], {}))
            self.assertEqual(status["error"], "empty_source")
            self.assertEqual(output.read_bytes(), before)

    def test_freshness_is_independent_of_historical_coverage(self):
        rows = [row("2026-10-27", label=label, sessions=0, orders=0, revenue="0")
                for label in ("E-mail", "WhatsApp Oficial", "WhatsApp Nao Oficial")]
        status = refresh.refresh_status(rows, date(2026, 10, 27), "observed")
        self.assertEqual(status["status"], "current")
        for channel in status["channels"].values():
            for metric in channel["metrics"].values():
                self.assertEqual(metric["status"], "current")
                self.assertEqual(metric["coverageStatus"], "partial")
                self.assertEqual(metric["knownDays"], 1)
                self.assertEqual(metric["missingDays"], 664)

    def test_rolling_window_preserves_old_history_and_replaces_origins(self):
        with tempfile.TemporaryDirectory() as directory:
            output, status_path = Path(directory) / "snapshot.json", Path(directory) / "status.json"
            old_rows = [row("2025-01-01"), row("2026-09-27"), row("2026-10-22", origin="old-origin")]
            refresh.atomic_json(output, snapshot(old_rows))
            def fetch(end):
                self.assertEqual(refresh.refresh_start(end), date(2026, 9, 28))
                return ([row("2026-10-22", origin="new-origin"), row("2026-10-27")],
                        [{"data": "2026-10-27", "sessoes": 5}], {"session_bridge": {}}, [], {})
            status = refresh.run(date(2026, 10, 27), output, status_path, fetch)
            self.assertIsNone(status["error"])
            result = json.loads(output.read_bytes())["rows"]
            self.assertEqual([item for item in result if item["data"] < "2026-09-28"], old_rows[:2])
            self.assertEqual([item["origem"] for item in result if item["data"] == "2026-10-22"], ["new-origin"])
            self.assertEqual(refresh.daily_totals(result)[("2026-10-22", "E-mail")]["pedidos"], 1)

    def test_dry_runs_precede_queries_and_total_billing_is_capped(self):
        client = Mock()
        calls = []
        def query(sql, *, location, job_config):
            calls.append(job_config)
            self.assertTrue(sql.startswith("SELECT "))
            self.assertEqual(location, "US")
            self.assertFalse(job_config.use_legacy_sql)
            self.assertEqual(job_config.query_parameters[0].value, date(2026, 9, 28))
            self.assertEqual(job_config.query_parameters[1].value, date(2026, 10, 27))
            job = SimpleNamespace(statement_type="SELECT", total_bytes_processed=100,
                                  total_bytes_billed=200, job_id="fixture", cache_hit=False,
                                  result=lambda timeout: [])
            return job
        client.query.side_effect = query
        with patch("google.cloud.bigquery.Client", return_value=client), patch.object(refresh, "inspect_source", return_value={}):
            _, _, metadata, jobs, estimates = refresh.fetch_sources(date(2026, 10, 27))
        self.assertEqual([bool(config.dry_run) for config in calls], [True, True, False, False])
        self.assertEqual(calls[2].maximum_bytes_billed, refresh.MAX_BYTES)
        self.assertEqual(calls[3].maximum_bytes_billed, refresh.MAX_BYTES - 200)
        self.assertEqual(metadata["refresh"]["total_bytes_billed"], 400)
        self.assertEqual(len(jobs), 2)
        self.assertEqual(sum(estimates.values()), 200)
        client.close.assert_called_once()

    def test_excessive_estimates_never_execute_a_paid_query(self):
        client = Mock()
        client.query.return_value = SimpleNamespace(statement_type="SELECT", total_bytes_processed=refresh.MAX_BYTES)
        with patch("google.cloud.bigquery.Client", return_value=client), patch.object(refresh, "inspect_source", return_value={}):
            with self.assertRaisesRegex(refresh.RefreshError, "dry_run_budget_exceeded"):
                refresh.fetch_sources(date(2026, 10, 27))
        self.assertEqual(client.query.call_count, 2)
        self.assertTrue(all(call.kwargs["job_config"].dry_run for call in client.query.call_args_list))


if __name__ == "__main__":
    unittest.main()
