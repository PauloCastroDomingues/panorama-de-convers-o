"""Refresh recent origin details and full paid-channel history using SELECTs and ADC.

Run with .venv/Scripts/python.exe scripts/refresh_crm_ssot.py [--end YYYY-MM-DD].
No source writes, credential exports, scheduling, or deployment are performed.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
import json
import math
import os
from pathlib import Path
import tempfile
import unicodedata
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "ssot-commercial-channels.json"
STATUS_OUTPUT = ROOT / "data" / "crm-refresh-status.json"
PROJECT = "reise-ssot"
LOCATION = "US"
TIMEZONE = ZoneInfo("America/Sao_Paulo")
START = date(2025, 1, 1)
MAX_BYTES = 768 * 1024 * 1024
SOURCE = PROJECT + ".mart_growth_us.aquisicao_por_canal_origem_daily_v"
LEGACY_BRIDGE = PROJECT + ".mart_growth_us.shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_complete_v"
LEGACY_BRIDGE_FILTER = "LOWER(canal) = 'google' AND LOWER(tipo) = 'paid'"
BRIDGE = PROJECT + ".mart_growth_us.aquisicao_por_canal8_daily"
BRIDGE_FILTER = "canal = 'Google ADS'"
KIND = "ssot_commercial_channel_daily_v1"
METRICS = ("sessoes", "pedidos", "receita")
KEY_FIELDS = ("data", "canal", "canal_detalhe", "origem")
SCHEMA = {"data": "DATE", "canal": "STRING", "canal_detalhe": "STRING", "origem": "STRING",
          "sessoes": "INTEGER", "pedidos_total": "INTEGER", "receita_total": "NUMERIC", "investimento": "FLOAT"}
BRIDGE_SCHEMA = {"data": "DATE", "canal": "STRING", "sessoes": "INTEGER"}
PAID_TOTALS_SCHEMA = {**BRIDGE_SCHEMA, "pedidos_total": "INTEGER", "receita_total": "NUMERIC"}
QUERIES = {
    "commercial_daily": f"""SELECT data, canal, canal_detalhe, origem, sessoes,
       pedidos_total AS pedidos, receita_total AS receita, investimento
FROM `{SOURCE}`
WHERE data BETWEEN @google_start_date AND @end_date
  AND (data >= @start_date OR canal_detalhe IN ('Meta Ads 1', 'Meta Ads 2', 'Google ADS'))
ORDER BY data, canal, canal_detalhe, origem""",
    "google_sessions": f"""SELECT data, sessoes
FROM `{BRIDGE}`
WHERE data BETWEEN @google_start_date AND @end_date
  AND {BRIDGE_FILTER}
ORDER BY data""",
    "paid_channel_totals": f"""SELECT data, canal, canal AS canal_detalhe,
       'Consolidado do canal SSOT' AS origem, sessoes,
       pedidos_total AS pedidos, receita_total AS receita
FROM `{BRIDGE}`
WHERE data BETWEEN @google_start_date AND @end_date
  AND canal IN ('Meta ADS', 'Google ADS')
ORDER BY data, canal""",
}
CRM = {"email": "E-mail", "whatsapp-oficial": "WhatsApp Oficial", "whatsapp-organico": "WhatsApp Organico"}
CRM_LABELS = {"email": "email", "whatsappoficial": "whatsapp-oficial",
              "whatsappnaooficial": "whatsapp-organico", "whatsapporganico": "whatsapp-organico"}


class RefreshError(Exception):
    """Only fixed error codes from this module may be exposed in status JSON."""


def yesterday(now=None):
    return (now or datetime.now(TIMEZONE)).astimezone(TIMEZONE).date() - timedelta(days=1)


def refresh_start(end):
    return max(START, end - timedelta(days=29))


def iso_date(value):
    if type(value) is date:
        return value.isoformat()
    if not isinstance(value, str):
        raise RefreshError("invalid_date")
    try:
        if date.fromisoformat(value).isoformat() == value:
            return value
    except ValueError:
        pass
    raise RefreshError("invalid_date")


def channel(row):
    return row.get("canal_detalhe") or row.get("canal")


def crm_channel(label):
    text = unicodedata.normalize("NFD", label or "").lower()
    return CRM_LABELS.get("".join(char for char in text if char.isascii() and char.isalnum()))


def count(value):
    if value is not None and (type(value) is not int or value < 0 or value > 2**53 - 1):
        raise RefreshError("invalid_count")
    return value


def revenue(value):
    if value is None:
        return None
    if not isinstance(value, (Decimal, str, int)) or isinstance(value, bool):
        raise RefreshError("invalid_revenue")
    try:
        number = Decimal(value)
        if number.is_finite():
            return format(number, "f")
    except ArithmeticError:
        pass
    raise RefreshError("invalid_revenue")


def normalize_rows(rows, end):
    clean, seen = [], set()
    for raw in rows:
        row = {name: raw[name] for name in KEY_FIELDS}
        row["data"] = iso_date(row["data"])
        if not START.isoformat() <= row["data"] <= end.isoformat():
            raise RefreshError("row_outside_window")
        if not isinstance(channel(row), str) or not channel(row):
            raise RefreshError("invalid_channel")
        if any(row[name] is not None and not isinstance(row[name], str) for name in KEY_FIELDS[1:]):
            raise RefreshError("invalid_dimensions")
        key = tuple(row[name] for name in KEY_FIELDS)
        if key in seen:
            raise RefreshError("duplicate_row")
        seen.add(key)
        row.update(sessoes=count(raw["sessoes"]), pedidos=count(raw["pedidos"]), receita=revenue(raw["receita"]))
        investment = raw.get("investimento")
        if investment is not None and (type(investment) not in (int, float) or not math.isfinite(investment)):
            raise RefreshError("invalid_investment")
        row["investimento"] = investment
        clean.append(row)
    if not clean:
        raise RefreshError("empty_source")
    return sorted(clean, key=lambda row: tuple(row[name] or "" for name in KEY_FIELDS))


def apply_bridge(rows, bridge_rows, end):
    if not bridge_rows:
        raise RefreshError("empty_google_bridge")
    result = [dict(row) for row in rows]
    sessions = defaultdict(list)
    for row in bridge_rows:
        day = iso_date(row["data"])
        if not START.isoformat() <= day <= end.isoformat():
            raise RefreshError("bridge_outside_window")
        if day in sessions:
            raise RefreshError("duplicate_google_channel_day")
        sessions[day].append(count(row["sessoes"]))
    merged = added = 0
    for day, values in sorted(sessions.items()):
        # A missing source observation is never manufactured as a zero session day.
        if any(value is None for value in values):
            continue
        total = count(sum(values))
        google = [row for row in result if row["data"] == day and channel(row) == "Google ADS"]
        known = [row for row in google if row["sessoes"] is not None]
        if known:
            if sum(row["sessoes"] for row in known) != total:
                raise RefreshError("google_native_sessions_conflict")
            continue
        matches = [row for row in google if row["origem"] == "Google"]
        if len(matches) > 1:
            raise RefreshError("ambiguous_google_bridge")
        if matches:
            matches[0]["sessoes"] = total
            merged += 1
        else:
            # Match the established bridge: this row contributes sessions only.
            result.append({"data": day, "canal": "Google ADS", "canal_detalhe": "Google ADS",
                           "origem": "Google", "sessoes": total, "pedidos": 0, "receita": "0", "investimento": None})
            added += 1
    return normalize_rows(result, end), {"merged_rows": merged, "added_rows": added, "read_only": True}


def daily_totals(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[(row["data"], channel(row))].append(row)
    result = {}
    for key, group in grouped.items():
        values = {}
        for metric in METRICS:
            available = [row[metric] for row in group if row[metric] is not None]
            # The canonical view unions order-origin rows with channel-level sessions.
            if not available or (metric != "sessoes" and len(available) != len(group)):
                values[metric] = None
            elif metric == "receita":
                values[metric] = format(sum((Decimal(value) for value in available), Decimal(0)), "f")
            else:
                values[metric] = count(sum(available))
        result[key] = values
    return result


def validate_previous(snapshot):
    if snapshot.get("kind") != KIND or snapshot.get("source") != SOURCE or snapshot.get("start") != START.isoformat():
        raise RefreshError("snapshot_contract_mismatch")
    bridge = snapshot.get("metadata", {}).get("session_bridge", {})
    if (bridge.get("source"), bridge.get("filter")) not in {
        (BRIDGE, BRIDGE_FILTER), (LEGACY_BRIDGE, LEGACY_BRIDGE_FILTER)
    }:
        raise RefreshError("unverified_existing_bridge")
    normalize_rows(snapshot["rows"], date.fromisoformat(snapshot["end"]))


def reject_regression(previous, rows, end):
    if end.isoformat() < previous["end"]:
        raise RefreshError("window_regression")
    old_dates = {row["data"] for row in previous["rows"]}
    new_dates = {row["data"] for row in rows}
    if not old_dates <= new_dates:
        raise RefreshError("historical_dates_regression")
    old_daily, new_daily = daily_totals(previous["rows"]), daily_totals(rows)
    for key, old in old_daily.items():
        if not (crm_channel(key[1]) or key[1] == "Google ADS"):
            continue
        for metric in METRICS:
            if old[metric] is not None and new_daily.get(key, {}).get(metric) is None:
                raise RefreshError("metric_coverage_regression")


def paid_channel_snapshot(raw, end, previous=None):
    rows = normalize_rows(raw, end)
    seen = set()
    for row in rows:
        key = (row['data'], row['canal'])
        if row['canal'] not in {'Meta ADS', 'Google ADS'} or row['canal_detalhe'] != row['canal']:
            raise RefreshError('invalid_paid_channel')
        if key in seen:
            raise RefreshError('duplicate_paid_channel_day')
        seen.add(key)
    previous = previous or {}
    if previous and previous.get('source') not in {BRIDGE, SOURCE}:
        raise RefreshError('paid_channel_contract_mismatch')
    old_daily, new_daily = daily_totals(previous.get('rows', [])), daily_totals(rows)
    for key, old in old_daily.items():
        for metric in METRICS:
            if old[metric] is not None and new_daily.get(key, {}).get(metric) is None:
                raise RefreshError('paid_channel_coverage_regression')
    return {'source': BRIDGE, 'grain': 'data + canal', 'start': START.isoformat(),
            'end': end.isoformat(), 'read_only': True,
            'mapping': 'Meta consolidado e Google; sem rateio por conta e sem soma com linhas detalhadas',
            'rows': rows}


def reconcile_paid_totals(origins, history, end):
    """Keep live commercial numerators; use historical sessions only when absent."""
    origins = normalize_rows(origins, end)
    grouped = defaultdict(list)
    for row in origins:
        label = channel(row)
        if label not in {'Meta Ads 1', 'Meta Ads 2', 'Google ADS'}:
            continue
        label = 'Meta ADS' if label.startswith('Meta Ads') else label
        grouped[(row['data'], label)].append(dict(row, canal=label, canal_detalhe=label))
    fallback = {(row['data'], row['canal']): row for row in normalize_rows(history, end)}
    result = []
    for day, label in sorted(set(grouped) | set(fallback)):
        key = (day, label)
        metrics = daily_totals(grouped[key]).get(key, {metric: None for metric in METRICS})
        if metrics['sessoes'] is None:
            metrics['sessoes'] = fallback.get(key, {}).get('sessoes')
        result.append({'data': day, 'canal': label, 'canal_detalhe': label,
                       'origem': 'Consolidado do canal SSOT', **metrics})
    return result


def refresh_status(rows, end, checked_at, error=None):
    target = end.isoformat()
    expected = (end - START).days + 1
    grouped = defaultdict(list)
    for row in rows:
        identifier = crm_channel(channel(row))
        if identifier:
            grouped[identifier].append({**row, "canal": identifier, "canal_detalhe": identifier})
    channels = {}
    for identifier, name in CRM.items():
        daily = daily_totals(grouped[identifier])
        metrics = {}
        for metric in METRICS:
            known = sorted(day for (day, _), values in daily.items() if values[metric] is not None and day <= target)
            latest = known[-1] if known else None
            metrics[metric] = {"latestDate": latest, "knownDays": len(known), "expectedDays": expected,
                               "missingDays": expected - len(known),
                               "targetValue": daily.get((target, identifier), {}).get(metric),
                               "coverageStatus": "partial" if len(known) < expected else "complete",
                               "status": "current" if latest == target else "stale"}
        states = [entry["status"] for entry in metrics.values()]
        channels[identifier] = {"name": name, "latestDate": max((key[0] for key in daily), default=None),
                                "metrics": metrics, "status": "stale" if "stale" in states else "current"}
    states = [entry["status"] for entry in channels.values()]
    latest = max((row["data"] for row in rows), default=None)
    state = "error" if error else "stale" if latest != target or "stale" in states else "current"
    return {"checkedAt": checked_at, "targetDate": target, "latestDate": latest,
            "channels": channels, "status": state, "error": error}


def inspect_source(client, source, required, table_type="VIEW"):
    table = client.get_table(source)
    schema = {field.name: field.field_type for field in table.schema}
    if table.location != LOCATION or table.table_type != table_type or (table_type == "VIEW" and not table.view_query):
        raise RefreshError("source_view_mismatch")
    if any(schema.get(name) != kind for name, kind in required.items()):
        raise RefreshError("source_schema_mismatch")
    return {"definition": table.view_query, "schema": schema, "modified": table.modified.isoformat() if table.modified else None}


def fetch_sources(end):
    from google.cloud import bigquery

    client = bigquery.Client(project=PROJECT, location=LOCATION)
    try:
        metadata = inspect_source(client, SOURCE, SCHEMA)
        bridge_metadata = inspect_source(client, BRIDGE, PAID_TOTALS_SCHEMA, table_type="TABLE")
        parameters = [bigquery.ScalarQueryParameter("start_date", "DATE", refresh_start(end)),
                      bigquery.ScalarQueryParameter("google_start_date", "DATE", START),
                      bigquery.ScalarQueryParameter("end_date", "DATE", end)]
        estimates, jobs, results = {}, [], {}
        for name, sql in QUERIES.items():
            dry = client.query(sql, location=LOCATION, job_config=bigquery.QueryJobConfig(
                dry_run=True, use_legacy_sql=False, use_query_cache=False,
                maximum_bytes_billed=MAX_BYTES, query_parameters=parameters))
            if dry.total_bytes_processed is None or dry.statement_type != "SELECT":
                raise RefreshError("invalid_dry_run")
            estimates[name] = dry.total_bytes_processed
        if sum(estimates.values()) > MAX_BYTES:
            raise RefreshError("dry_run_budget_exceeded")
        remaining = MAX_BYTES
        for name, sql in QUERIES.items():
            if estimates[name] > remaining:
                raise RefreshError("remaining_budget_exceeded")
            job = client.query(sql, location=LOCATION, job_config=bigquery.QueryJobConfig(
                use_legacy_sql=False, use_query_cache=True,
                maximum_bytes_billed=remaining, query_parameters=parameters))
            try:
                result = job.result(timeout=180)
                results[name] = [dict(row.items()) for row in result]
            except TimeoutError:
                job.cancel()
                raise RefreshError("query_timeout") from None
            if job.statement_type != "SELECT" or job.total_bytes_billed is None:
                raise RefreshError("invalid_query_job")
            jobs.append({"query": name, "job_id": job.job_id, "location": LOCATION,
                         "bytes_processed": job.total_bytes_processed, "bytes_billed": job.total_bytes_billed,
                         "cache_hit": job.cache_hit, "maximum_bytes_billed": remaining})
            remaining -= job.total_bytes_billed
            if remaining < 0:
                raise RefreshError("query_budget_exceeded")
        metadata["session_bridge"] = {"source": BRIDGE, "filter": BRIDGE_FILTER,
            "mapping": "sessoes comerciais do canal Google ADS; nao usa sessoes_ga4 nem fechamento Shopify",
            "orders_and_revenue": "preservados da fonte oficial aquisicao_por_canal_origem_daily_v",
            **bridge_metadata}
        metadata["refresh"] = {"read_only": True, "maximum_total_bytes_billed": MAX_BYTES,
                               "total_bytes_billed": MAX_BYTES - remaining, "queries": QUERIES,
                               "query_start": refresh_start(end).isoformat(), "query_end": end.isoformat(),
                               "google_query_start": START.isoformat()}
        metadata['refresh']['paid_history_start'] = START.isoformat()
        return results["commercial_daily"], results["google_sessions"], metadata, jobs, estimates, results["paid_channel_totals"]
    finally:
        client.close()


def atomic_json(path, payload, expected_bytes=None):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                         prefix="." + path.name + ".", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=True, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        if json.loads(temporary.read_text(encoding="utf-8")) != payload:
            raise RefreshError("serialization_mismatch")
        if expected_bytes is not None and path.read_bytes() != expected_bytes:
            raise RefreshError("snapshot_changed_during_refresh")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def safe_error(error):
    if isinstance(error, RefreshError):
        return str(error)
    if isinstance(error, OSError):
        return "local_io_failed"
    if type(error).__module__.startswith("google.auth"):
        return "authentication_failed"
    return "refresh_failed"


def run(end, output=OUTPUT, status_output=STATUS_OUTPUT, fetch=fetch_sources):
    previous = None
    try:
        original = output.read_bytes()
        previous = json.loads(original.decode("utf-8-sig"))
        validate_previous(previous)
        if not START <= end <= yesterday():
            raise RefreshError("invalid_target_date")
        if end.isoformat() < previous["end"]:
            raise RefreshError("window_regression")
        raw, bridge, metadata, jobs, estimates, *paid_totals = fetch(end)
        if previous.get('paid_channel_totals') and not paid_totals:
            raise RefreshError('missing_paid_channel_refresh')
        full_paid_history = metadata.get('refresh', {}).get('paid_history_start') == START.isoformat()
        paid_raw = paid_totals[0] if paid_totals else None
        if full_paid_history and paid_raw is not None:
            paid_raw = reconcile_paid_totals(raw, paid_raw, end)
        paid_snapshot = paid_channel_snapshot(paid_raw, end, previous.get('paid_channel_totals')) if paid_raw is not None else None
        if full_paid_history and paid_snapshot:
            paid_snapshot.update(source=SOURCE, session_history_source=BRIDGE,
                mapping='Pedidos e receita da visao por origem; sessoes somadas dessa visao, com complemento historico apenas quando ausentes; sem rateio por conta')
        start = refresh_start(end).isoformat()
        canonical = normalize_rows([row for row in raw if iso_date(row["data"]) >= start], end)
        updated, bridge_stats = apply_bridge(canonical, [row for row in bridge if iso_date(row["data"]) >= start], end)
        preserved = [row for row in previous["rows"] if row["data"] < start]
        if full_paid_history:
            paid_labels = {'Meta Ads 1', 'Meta Ads 2', 'Google ADS'}
            history = normalize_rows([row for row in raw if channel(row) in paid_labels], end)
            preserved = [row for row in preserved if channel(row) not in paid_labels]
            preserved.extend(row for row in history if row['data'] < start)
        # Reconcile Google's complete history from the same commercial contract.
        # Historical CRM rows stay intact; paid numerators come from the live view.
        historical_bridge = [row for row in bridge if iso_date(row["data"]) < start]
        if preserved and historical_bridge:
            history = [dict(row, sessoes=None) for row in preserved if channel(row) == "Google ADS"]
            repaired_google, _ = apply_bridge(history, historical_bridge, end)
            preserved = [row for row in preserved if channel(row) != "Google ADS"] + repaired_google
        # Replace complete dates in the lookback, never union old and new origins.
        rows = sorted(preserved + updated, key=lambda row: tuple(row[name] or "" for name in KEY_FIELDS))
        reject_regression(previous, rows, end)
        metadata["session_bridge"].update(bridge_stats)
        metadata["session_bridge"]["refresh_start"] = start
        metadata.setdefault("refresh", {}).update({"replacement_start": start, "replacement_end": end.isoformat(),
            "preserved_rows": len(preserved), "preserved_history_through": (refresh_start(end) - timedelta(days=1)).isoformat() if preserved else None,
            "previous_snapshot_extracted_at": previous.get("extracted_at")})
        now = datetime.now(TIMEZONE).isoformat()
        snapshot = {"kind": KIND, "source": SOURCE, "rules": previous["rules"],
                    "timezone": "America/Sao_Paulo", "start": START.isoformat(), "end": end.isoformat(),
                    "extracted_at": now, "rows": rows, "row_count": len(rows),
                    "metadata": metadata, "jobs": jobs, "estimates": estimates}
        if paid_snapshot is not None:
            snapshot['paid_channel_totals'] = {**paid_snapshot, 'extracted_at': now}
        status = refresh_status(rows, end, now)
        atomic_json(output, snapshot, expected_bytes=original)
    except Exception as error:
        status = refresh_status(previous.get("rows", []) if previous else [], end,
                                datetime.now(TIMEZONE).isoformat(), safe_error(error))
    try:
        atomic_json(status_output, status)
    except Exception:
        status["status"], status["error"] = "error", "status_write_failed"
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end", type=date.fromisoformat, default=yesterday())
    status = run(parser.parse_args().end)
    print(json.dumps(status, ensure_ascii=True))
    return 1 if status["status"] == "error" else 2 if status["status"] == "stale" else 0


if __name__ == "__main__":
    raise SystemExit(main())
