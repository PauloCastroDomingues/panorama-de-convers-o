"""Read-only monthly paid-channel coverage audit; no snapshot or source writes."""
import json

from google.cloud import bigquery

LIMIT = 256 * 1024 * 1024
QUERIES = {
    "commercial": """SELECT FORMAT_DATE('%Y-%m', data) AS mes, canal_detalhe AS canal,
  COUNT(DISTINCT data) AS dias,
  COUNT(DISTINCT IF(sessoes IS NOT NULL, data, NULL)) AS dias_sessoes,
  SUM(sessoes) AS sessoes
FROM `reise-ssot.mart_growth_us.aquisicao_por_canal_origem_daily_v`
WHERE data BETWEEN @inicio AND @fim
  AND canal_detalhe IN ('Meta Ads 1', 'Meta Ads 2', 'Google ADS')
GROUP BY mes, canal ORDER BY mes, canal""",
    "meta_source": """SELECT FORMAT_DATE('%Y-%m', data) AS mes, canal,
  COUNT(DISTINCT data) AS dias,
  COUNT(DISTINCT IF(sessoes IS NOT NULL, data, NULL)) AS dias_sessoes,
  COUNT(DISTINCT IF(sessoes = 0, data, NULL)) AS dias_zero,
  SUM(sessoes) AS sessoes
FROM `reise-ssot.mart_growth_us.aquisicao_por_canal`
WHERE data BETWEEN @inicio AND @fim AND canal IN ('Meta Ads 1', 'Meta Ads 2')
GROUP BY mes, canal ORDER BY mes, canal""",
}


def main():
    remaining = LIMIT
    parameters = [bigquery.ScalarQueryParameter('inicio', 'DATE', '2026-01-01'),
                  bigquery.ScalarQueryParameter('fim', 'DATE', '2026-10-28')]
    with bigquery.Client(project='reise-ssot', location='US') as client:
        for name, sql in QUERIES.items():
            dry = client.query(sql, job_config=bigquery.QueryJobConfig(
                query_parameters=parameters, dry_run=True, use_legacy_sql=False))
            if dry.statement_type != 'SELECT' or dry.total_bytes_processed is None or dry.total_bytes_processed > remaining:
                raise RuntimeError('Read-only audit budget exceeded')
            job = client.query(sql, job_config=bigquery.QueryJobConfig(
                query_parameters=parameters, maximum_bytes_billed=remaining, use_legacy_sql=False))
            try:
                rows = [dict(row) for row in job.result(timeout=120)]
            except TimeoutError:
                job.cancel()
                raise
            remaining -= job.total_bytes_billed or 0
            print(json.dumps({'source': name, 'readOnly': True, 'bytesBilled': job.total_bytes_billed, 'rows': rows}, default=str))


if __name__ == '__main__':
    main()
