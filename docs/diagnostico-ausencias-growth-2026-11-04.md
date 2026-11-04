# Ausencias no comparativo de produtos

## Recorte reproduzido

- Atual: 01/11/2026 a 03/11/2026; comparado: 29/10/2026 a 31/10/2026.
- Todos os produtos / todos os canais pagos.
- Base publicada lida em 04/11: release `2026-11-03T21:00:14.484712-03:00`.
- Fonte do produto: `reise-ssot.mart_growth_us.aquisicao_por_produto_canal_daily`.
- Diagnostico do pacote publicado; nao houve consulta adicional direta ao BQ.

## Evidencia

| Produto RS8 Avant | Pedidos anteriores | Visitas anteriores | Receita anterior | Atual no pacote |
| --- | ---: | ---: | ---: | --- |
| Monochrome All Black | 4 | 593 | 2094,01 | Registros em Outros, sem linha paga |
| Monochrome Caqui | 3 | 549 | 1735,54 | Registros em Outros, sem linha paga |
| Whisky | 2 | 276 | 976,00 | Registros em Outros, sem linha paga |

Os valores anteriores reproduzem o print. A exclusao de Outros pelo filtro de
canais pagos e correta. Para All Black e Caqui, o metodo informado pelo SSOT
em 02/11 declara preservacao do total em Outros sem quebra real por canal.
Portanto, nem todos os valores em Outros comprovam atribuicao organica, e a
ausencia de linha paga nao autoriza preencher pedidos/visitas/receita com zero.

O pacote publicado termina em 02/11, mas o filtro inclui 03/11. Na verificacao
de 04/11 por volta de 08:27 BRT, a ultima execucao agendada retornada pelo GitHub
era `41743430275`, de 03/11, com sucesso; nenhuma execucao de hoje constava na
listagem consultada. Isso nao prova falha de coleta nem pontualidade futura.

## Correcao local

- Ausencias diferenciadas entre filtro/atribuicao, periodo incompleto, ausencia
  de registros, campo nao informado e fonte indisponivel.
- Motivo e proxima verificacao especificos por linha, sem remanejar resultados.
- Valores conhecidos em outros canais aparecem nas celulas com o nome do canal
  e a indicacao "fora do filtro". Exemplo All Black: 6 pedidos, 780 visitas e
  R$ 3.719,01 em Outros no recorte carregado de 01 a 02/11. Nao entram nos
  totais pagos, na conversao paga nem na variacao contra pedidos pagos anteriores.
- Numeros de periodos carregados parcialmente sao identificados como parciais;
  variacoes desses periodos nao sao tratadas como crescimento ou queda.
- Zero informado pela origem continua zero. Conversao com denominador zero
  continua indisponivel, nunca 0% inventado.
- Testes com a base real publicada e os filtros do usuario em 1440, 820, 390 e
  320 px; sem erros JS ou requisicoes de escrita. Comparacao desligada remove
  os itens que so existiam no periodo anterior, como antes.
- Nenhuma fonte, lote de dados ou ambiente de producao foi alterado nesta revisao.

Testes: `test_growth_missing_data.cjs`, `test_growth_comparisons.cjs`,
`test_growth_filter_scope.cjs`, `test_growth_provenance.cjs`,
`test_growth_review.cjs`, `test_growth_chart_visibility.cjs` e
`check_growth_missing_data_ui.cjs`.
