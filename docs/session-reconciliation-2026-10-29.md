# Reconciliacao de sessoes e comparacao opcional

## Evidencia

Leitura em 29/10/2026, somente SELECT e metadados do projeto reise-ssot.
Nenhuma alteracao nas fontes, planilhas, contas ou permissoes.

Para Google ADS em 28/10/2026:

| Leitura | Sessoes |
| --- | ---: |
| Ponte anterior: shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_complete_v | 3078 |
| SSOT comercial: aquisicao_por_canal8_daily, campo sessoes | 3423 |
| Campo sessoes_ga4, nao utilizado | 3580 |

A fonte comercial por origem nao preenche sessoes de Google. A ponte anterior
usava o fechamento Shopify, um contrato diferente da tabela comercial usada
para esse canal. A correcao le sessoes diretamente de aquisicao_por_canal8_daily,
filtrando canal = 'Google ADS', sem substituir pedidos ou receita.

Consulta de confirmacao: a34138d7-5cae-4c68-87d9-84923c2a0ebb, local US.
O snapshot conserva os IDs dos jobs da atualizacao em metadata/jobs.

## Resultado

- Google em 28/10: 46 pedidos, R$ 26.297,98, 3423 sessoes, conversao 1,34%.
- Total pago em 28/10: 91 pedidos, 11877 sessoes, conversao 0,77%.
- 279 registros existentes de sessoes Google foram revisados na carga local.
- Nenhum pedido ou valor de receita dos registros existentes foi alterado.
- O historico de sessoes Google e reconsultado; os demais canais historicos
  anteriores a janela de 30 dias permanecem preservados.
- Dias duplicados na fonte de sessoes Google geram erro, nunca soma duplicada.
- Nulos permanecem nulos; zeros efetivamente retornados pela fonte sao preservados.

## Comparacao

Growth e CRM possuem controles independentes de comparacao, aplicados pelo
mesmo formulario dos demais filtros. Desligar preserva as datas escolhidas,
retira series, valores anteriores e sinais de variacao. Cancelar descarta a
edicao. Comparacao independente A/B e metas do artefato nao sao comparacao
temporal e permanecem separadas.

Semaforos usam cor e seta: crescimento/queda, igualdade neutra, custos com
polaridade inversa e investimento neutro. Taxas variam em pontos percentuais.
Base ausente, incompleta ou zero nao gera crescimento percentual inventado.

## Limites

SSOT, Growth, WhatsApp Oficial e RD foram lidos ate 28/10. A base auxiliar de
SendFlow ainda termina em 30/09; atualizar o painel nao cria coletas ausentes.
Lacunas historicas e cruzamentos sem sessoes continuam explicitamente parciais.
Esta correcao foi validada em localhost; nao foi publicada neste turno.
