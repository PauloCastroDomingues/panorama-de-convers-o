"""Audit historical SSOT channel coverage using bounded, read-only queries."""
import json
from google.cloud import bigquery

SOURCES = ['aquisicao_por_canal8_daily', 'aquisicao_por_canal_daily']


def main():
    budget = 256 * 1024 * 1024
    with bigquery.Client(project='reise-ssot', location='US') as client:
        for source in SOURCES:
            sql = f"""SELECT FORMAT_DATE('%Y-%m', data) AS mes, canal,
              COUNT(*) AS linhas, COUNT(DISTINCT data) AS dias,
              COUNT(DISTINCT IF(sessoes IS NOT NULL, data, NULL)) AS dias_sessoes,
              SUM(sessoes) AS sessoes, SUM(pedidos_total) AS pedidos,
              MIN(data) AS inicio, MAX(data) AS fim
              FROM `reise-ssot.mart_growth_us.{source}`
              WHERE data BETWEEN @inicio AND @fim
              GROUP BY mes, canal ORDER BY canal, mes"""
            params = [bigquery.ScalarQueryParameter('inicio', 'DATE', '2025-01-01'),
                      bigquery.ScalarQueryParameter('fim', 'DATE', '2026-10-28')]
            dry = client.query(sql, job_config=bigquery.QueryJobConfig(
                query_parameters=params, dry_run=True, use_legacy_sql=False))
            if dry.statement_type != 'SELECT' or dry.total_bytes_processed is None or dry.total_bytes_processed > budget:
                raise RuntimeError('Read-only budget exceeded')
            job = client.query(sql, job_config=bigquery.QueryJobConfig(
                query_parameters=params, maximum_bytes_billed=budget, use_legacy_sql=False))
            try:
                rows = [dict(row) for row in job.result(timeout=120)]
            except TimeoutError:
                job.cancel()
                raise
            budget -= job.total_bytes_billed or 0
            print(json.dumps({'source': source, 'bytesBilled': job.total_bytes_billed,
                              'rows': rows}, default=str), flush=True)


if __name__ == '__main__':
    main()
