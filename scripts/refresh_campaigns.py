"""Read-only daily SSOT campaign extract for the Panorama dashboard.

The query reads existing BigQuery views only. It never creates, updates or
deletes tables, views, schemas, permissions or source data.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import json
from pathlib import Path
import tempfile
from zoneinfo import ZoneInfo

from google.cloud import bigquery


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "ssot-campaigns-12m.json"
TIMEZONE = ZoneInfo("America/Sao_Paulo")
PROJECT = "reise-ssot"
LOCATION = "southamerica-east1"
MAX_BYTES = 1024 * 1024 * 1024


QUERY = r"""
WITH sessions AS (
  SELECT
    data,
    NULLIF(TRIM(canal), '') AS canal,
    NULLIF(TRIM(utm_campaign), '') AS campanha,
    COUNT(*) AS sessoes
  FROM `reise-ssot.mart_growth_us.ga4_user_sessions_daily_v`
  WHERE data BETWEEN @start_date AND @end_date
    AND NULLIF(TRIM(utm_campaign), '') IS NOT NULL
  GROUP BY 1, 2, 3
),
orders AS (
  SELECT
    paid_date_brt AS data,
    `reise-ssot.mart_growth_us.fn_canal_pedido`(
      LOWER(TRIM(COALESCE(last_source_description, utm_source, last_source, ''))),
      LOWER(TRIM(COALESCE(utm_source, ''))),
      LOWER(TRIM(COALESCE(utm_medium, '')))
    ) AS canal,
    NULLIF(TRIM(CAST(utm_campaign AS STRING)), '') AS campanha,
    COUNT(DISTINCT order_name) AS pedidos,
    SUM(CAST(total_amount AS NUMERIC)) AS receita
  FROM `reise-ssot.mart_growth_us.shopify_order_utm_resolved_v`
  WHERE paid_date_brt BETWEEN @start_date AND @end_date
    AND NULLIF(TRIM(CAST(utm_campaign AS STRING)), '') IS NOT NULL
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(s.data, o.data) AS data,
  COALESCE(s.canal, o.canal) AS canal,
  COALESCE(s.campanha, o.campanha) AS campanha,
  s.sessoes,
  COALESCE(o.pedidos, 0) AS pedidos,
  COALESCE(o.receita, CAST(0 AS NUMERIC)) AS receita
FROM sessions s
FULL OUTER JOIN orders o
  ON s.data = o.data
 AND s.canal = o.canal
 AND s.campanha = o.campanha
ORDER BY data, canal, campanha
"""


def period(today: date | None = None) -> tuple[date, date]:
    today = today or datetime.now(TIMEZONE).date()
    end = today - timedelta(days=1)
    month = end.month - 11
    year = end.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1), end


def serialise(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def fetch_rows(start: date, end: date) -> list[dict]:
    client = bigquery.Client(project=PROJECT, location=LOCATION)
    config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start_date", "DATE", start),
            bigquery.ScalarQueryParameter("end_date", "DATE", end),
        ],
        maximum_bytes_billed=MAX_BYTES,
        use_query_cache=True,
    )
    result = client.query(QUERY, job_config=config, location=LOCATION).result()
    rows = []
    for row in result:
        rows.append({
            "data": serialise(row["data"]),
            "canal": serialise(row["canal"]),
            "campaign": serialise(row["campanha"]),
            "sessoes": serialise(row["sessoes"]),
            "pedidos": serialise(row["pedidos"]),
            "receita": serialise(row["receita"]),
        })
    return rows


def write_payload(start: date, end: date, rows: list[dict]) -> None:
    payload = {
        "kind": "ssot_campaign_daily_v1",
        "source": [
            "reise-ssot.mart_growth_us.ga4_user_sessions_daily_v",
            "reise-ssot.mart_growth_us.shopify_order_utm_resolved_v",
        ],
        "timezone": "America/Sao_Paulo",
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "grain": "data + canal + utm_campaign",
        "campaign_key": "utm_campaign exacta, sem fuzzy matching",
        "extracted_at": datetime.now(TIMEZONE).isoformat(),
        "rows": rows,
        "row_count": len(rows),
        "rules": {
            "sessions": "COUNT(*) na view deduplicada ga4_user_sessions_daily_v",
            "orders": "COUNT(DISTINCT order_name) em shopify_order_utm_resolved_v",
            "conversion": "SUM(pedidos) / SUM(sessoes)",
            "missing_sessions": "null permanece null; nunca convertido em zero",
            "bigquery_mutation": "none",
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=OUTPUT.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, default=serialise)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(OUTPUT)


def main() -> int:
    start, end = period()
    rows = fetch_rows(start, end)
    write_payload(start, end, rows)
    print(f"Atualizado: {OUTPUT} | janela {start} a {end} | {len(rows)} linhas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
