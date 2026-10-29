"""Read-only September reconciliation of the contracts used by Growth."""
import json
from google.cloud import bigquery

QUERIES = {
    'consolidated': """SELECT canal, COUNT(DISTINCT data) dias,
      SUM(sessoes) sessoes, SUM(pedidos_total) pedidos, SUM(receita_total) receita,
      MIN(build_ts) build_min, MAX(build_ts) build_max
      FROM `reise-ssot.mart_growth_us.aquisicao_por_canal8_daily`
      WHERE data BETWEEN @inicio AND @fim AND canal IN ('Meta ADS', 'Google ADS') GROUP BY canal""",
    'accounts': """SELECT canal, COUNT(DISTINCT data) dias,
      SUM(sessoes) sessoes, SUM(pedidos_total) pedidos, SUM(receita_total) receita,
      MIN(data) inicio, MAX(data) fim, MIN(build_ts) build_min, MAX(build_ts) build_max
      FROM `reise-ssot.mart_growth_us.aquisicao_por_canal_daily`
      WHERE data BETWEEN @inicio AND @fim AND canal IN ('Meta Ads 1', 'Meta Ads 2', 'Google Ads') GROUP BY canal""",
    'origin_view': """SELECT canal_detalhe canal, COUNT(DISTINCT data) dias,
      SUM(sessoes) sessoes, SUM(pedidos_total) pedidos, SUM(receita_total) receita
      FROM `reise-ssot.mart_growth_us.aquisicao_por_canal_origem_daily_v`
      WHERE data BETWEEN @inicio AND @fim AND canal_detalhe IN ('Meta Ads 1', 'Meta Ads 2', 'Google ADS') GROUP BY canal""",
}


def main():
    budget = 256 * 1024 * 1024
    params = [bigquery.ScalarQueryParameter('inicio', 'DATE', '2026-09-01'),
              bigquery.ScalarQueryParameter('fim', 'DATE', '2026-09-30')]
    with bigquery.Client(project='reise-ssot', location='US') as client:
        for name, sql in QUERIES.items():
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
            print(json.dumps({'source': name, 'bytesBilled': job.total_bytes_billed, 'rows': rows}, default=str), flush=True)


if __name__ == '__main__':
    main()
