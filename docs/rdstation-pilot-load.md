# Carga local do piloto RD: 21 a 27/10/2026

## Coleta atual, posterior ao piloto

Apos o preenchimento do usuario, a base auxiliar foi relida em modo somente leitura. O lote committed rd-832517-20261028182739587 contem 72 campanhas de 28/09 a 27/10/2026, observadas em 28/10/2026 as 15:27:39 America/Sao_Paulo. Ele agora alimenta data/crm-rd-snapshot.json. Cinco campanhas seguem em ressalva; nenhum registro esta fora desse recorte. Os contadores continuam observados, com cobertura e unicidade nao homologadas.

O piloto original descrito abaixo foi preservado em scripts/fixtures/rd-pilot-20261028.json para regressao. Nao foi somado a nova coleta. A atualizacao local foi manual pelo conector autorizado; nao ha ponte remota configurada, agendamento ou deploy. O SSOT nao foi consultado nem alterado nesta atualizacao.

## Evidencia atual

O usuario forneceu o JSON completo no anexo 776a4f15-55f6-412c-844e-a13320914cb1/Pasted text.txt e a execucao do catalogo SSOT no anexo 01ce0192-d86e-4146-be2b-f96b834969c6/Pasted text.txt.
Ambos foram lidos; nenhum anexo, fonte RD, planilha ou objeto do SSOT foi alterado.

- Coleta RD informada: 2026-10-28T17:21:41.255725+00:00. sourceUpdatedAt continua null.
- Conta de campanhas: 832517. 26 registros recebidos; 25 pela data de envio local de 21 a 27/10; um envio de 20/10 separado.
- Sem IDs duplicados nesse recorte. Cinco campanhas com zero entregas e descadastros/denuncias positivos: 20444123, 20443351, 20437151, 20443271 e 20441002.
- Somatorios brutos recebidos no recorte: 1523910 selecionados, 1227558 entregues, 372900 aberturas e 1765 cliques. Sao contagens por envio e observacao, NAO audiencia unica, taxa homologada ou prova de cobertura integral.
- O envio 20407302 de 20/10 nao entra na selecao nem e usado para criar um comparativo aparentemente completo.
- Cobertura global nao comprovada e equivalencia dos campos unicos no MCP nao confirmada. Coincidencia de IDs entre subperiodos nao prova ausencia de limite oculto.

## Importacao e exibicao

Atualizacao de 28/10/2026: a base auxiliar RD agora foi criada e preenchida no Sheets. Ver docs/rdstation-auxiliary-integration.md para URL, conferencias e ativacao futura. A integracao operacional avancou; a reconciliacao comercial SSOT foi deixada por ultimo por solicitacao do usuario. Nenhum agendamento ou deploy foi realizado.

scripts/import_rd_pilot.cjs faz uma importacao mecanica, com campos permitidos, reconciliacao de quantidades e validacao antes de substituir o snapshot local. Nao consulta APIs nem escreve em fontes externas.

Comando completo usado:

```powershell
node scripts/import_rd_pilot.cjs "C:\Users\reise\.codex\attachments\776a4f15-55f6-412c-844e-a13320914cb1\Pasted text.txt"
```

data/crm-rd-snapshot.json preserva os campos numericos e nomes de campanhas recebidos. Os percentuais prontos/provisorios do arquivo nao sao importados; as taxas Reise sao recalculadas das contagens.
A captura nao inclui dados de pessoas nem o ID numerico inseguro da conta de automacoes.

Localhost: http://127.0.0.1:8020/?crmChannel=email#crm
Essa URL abre o piloto explicitamente, sem trocar silenciosamente o periodo escolhido pelo usuario em acessos normais.

O detalhe E-mail apresenta campanhas observadas, contadores consistentes, registros em revisao e cliques informados; todos com a ressalva de piloto. Ha busca por nome sem distincao de acentos, ordenacao por cabecalho, filtro de qualidade e paginacao de dez registros. Essas operacoes sao locais e nao fazem nova consulta RD.
As cinco linhas com contradicao conservam os zeros em suas colunas e recebem "Em revisao" nas taxas. As outras mostram calculos aritmeticos explicitamente provisorios, nao taxas homologadas. Nao ha semaforo de performance sobre esse piloto.

Os filtros temporais do CRM controlam a selecao dos registros. Sem extracao para o periodo comparado, a tela informa esse limite em vez de fabricar variacao. Dentro do intervalo piloto, informa os registros e ressalvas observados no comparativo, sem declara-los cobertura integral.
O resultado comercial continua vindo exclusivamente do SSOT do canal. Uma selecao sem linhas RD ou uma falha no arquivo operacional nao apaga pedidos e receita SSOT. Nenhuma venda do canal e repetida por campanha.

## Automacoes e precisao de IDs

O identificador da conta de automacoes foi fornecido como numero JSON acima de Number.MAX_SAFE_INTEGER. Uma leitura JavaScript pode arredondar esse numero; nao o usar como chave nem inferir que e equivalente ao ID de campanhas.
Solicitar IDs como texto diretamente da origem, sem conversao numerica intermediaria. O normalizador rejeita IDs numericos inseguros. A resposta vazia de automacoes e a equivalencia de contas seguem nao validadas; nao sao transformadas em zero atividades.

## Catalogo SSOT recebido

As consultas de metadados funcionaram em US e southamerica-east1. complete=false decorre de moreCandidates=true: o primeiro diagnostico mostrou somente 30 candidatos por regiao. Isso nao representa erro de autenticacao nem prova ausencia de dados.

Fontes existentes confirmadas no catalogo, ainda candidatas a consumo:

- mart_growth_us.dashboard_gerencial_channels_daily_live_v: data, canal, tipo, sessoes, vendas, pedidos.
- mart_growth_us.shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_v: os mesmos campos comerciais diarios. As variantes e backups nao sao somados com ela.
- mart_growth_us.sales_attributed_to_marketing_v: report_date, referring_channel, utm_source, utm_medium, is_total, pedidos/receita last-click e metadados de janela. O campo is_total e as janelas exigem cuidado contra duplicacao.
- mart_growth_us.crm_coupon_orders_v e crm_coupon_registry: cupom, canal e origem do mapeamento. Cupom nao comprova sozinho causalidade ou campanha RD; nao ler dados pessoais dessa view no piloto.
- mart_growth_us.crm_reactivation_rule_config e crm_reactivation_whatsapp_daily_v: regras e resultados de reativacao; nao presumir correspondencia com grupos VIP.
- mart_mkt_crm.crm_ativacao_funil, crm_reguas_reativacao e crm_retencao_saude_base_v: candidatos agregados para futuras visoes da cadeira. Nao sao contadores de entrega RD.

Reise Club/grupos VIP podem estar em valores de canal/origem ou em fontes omitidas pelo limite. A listagem atual ainda nao prova a chave desses recortes.
Metadados de tabelas de autenticacao, contatos e perfis apareceram na busca generica por coluna email. Nenhuma linha dessas tabelas foi lida; elas nao serao usadas nesta etapa.

## Proxima verificacao SSOT

Arquivo completo: scripts/CrmSsotChannelEvidence.gs. Adicionar como arquivo novo no Apps Script autorizado, sem substituir doGet, GrowthViews.gs ou o diagnostico anterior. Executar SSOT_inspectCrmChannelEvidence.

O script:

- Consulta colunas e dependencias de fontes direcionadas em mart_growth_us, excluindo backup, stage, tmp e objetos de autenticacao.
- Le apenas agregados de data/canal/tipo de duas views candidatas confirmadas no catalogo, para o mesmo piloto de sete dias. Mantem contagem de linhas com sessoes, pedidos ou receita ausentes; nao preenche zeros nem calcula conversao por campanha.
- Faz dry run antes das leituras de dados, conserva maximumBytesBilled de 1 GiB por consulta e pula leituras acima desse teto. Nao aumenta o limite para forcar a execucao.
- Nao altera tabelas, regras, permissoes ou planilhas, nao exporta pessoas e nao consulta GA4 diretamente. A linhagem de todas as dependencias ainda precisa ser validada; encontrar uma view nao homologa atribuicao.

O usuario executou o script no BigQuery e forneceu o resultado no anexo db42a62b-55e6-468f-83af-0d3c79cca455/Pasted text.txt. A coleta de 2026-10-28T17:53:30.728Z retornou ok=true e complete=true, sem truncamento de metadados ou dos dois perfis. complete indica execucao do diagnostico sem cortes/falhas, nao homologacao comercial das fontes.

### Resultado observado: 21 a 27/10/2026

Somatorios calculados dos registros diarios recebidos, agrupando para INVESTIGACAO os nomes iniciados por rd. Esse agrupamento nao constitui um de-para comercial aprovado nem transforma as fontes em equivalentes.

| Fonte candidata | Sessoes recebidas | Pedidos recebidos | Receita recebida |
| --- | ---: | ---: | ---: |
| dashboard_gerencial_channels_daily_live_v | 1737 | 40 | 22956.24 |
| shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_v | 1737 | 14 | 8064.69 |

No dashboard live, vendas/pedidos aparecem em Rd Station enquanto sessoes aparecem em rd station, rdstation e rd+station+. Shopify_Email/shopify_email e Whatsapp/whatsapp tambem aparecem separados. Esse padrao e evidencia de fragmentacao por rotulos; o ponto exato do join e as regras de normalizacao ainda exigem leitura das definicoes atuais.

As duas fontes NAO podem ser somadas nem usadas como alternativas equivalentes. A igualdade das sessoes nao resolve a divergencia de pedidos e receita. Nao ha taxa de conversao comercial homologada por essa comparacao.

O dashboard live referencia shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_complete_v, cuja definicao nao foi incluida neste retorno. A segunda fonte referencia shopify_sessions_channels_daily_human_v, shopify_channel_performance_daily_v e ssot_revenue_daily; o diagnostico detectou sinais de preenchimento por zero nessa definicao. Sinais de busca textual nao certificam nem descartam rateio nas dependencias.

Shopify Email permanece separado de RD. Whatsapp generico nao comprova a divisao entre Oficial e Organico, nem identifica Reise Club/grupos VIP. Nenhum desses nomes foi promovido automaticamente ao canal canonico do painel.

Proxima validacao: conferir as definicoes atuais dessas dependencias e reconciliar agregados diarios das fontes independentes de pedidos last-click e sessoes human_closed, com a mesma janela, origem e regra temporal. Corrigir eventuais rotulos apenas na camada de leitura, sem modificar o SSOT. Os totais do canal nao serao atribuidos a campanhas RD por coincidencia de datas; cliques consolidados por data de envio nao comprovam sessoes/clicks do mesmo universo.

O novo log nao atualiza campanhas RD nem cria agendamento. A carga RD continua sendo o snapshot piloto descrito acima; nenhuma fonte comercial do painel foi substituida com base nesse diagnostico.

## Verificacao local

Testes de dados: node scripts/test_crm_rd.cjs; node scripts/test_crm_email.cjs; node scripts/test_crm_sendflow.cjs; node scripts/test_growth_comparisons.cjs.
Diagnostico em harness: node scripts/test_crm_evidence.cjs.
QA de navegador: node scripts/check_crm_rd_ui.cjs e node scripts/check_crm_sendflow_ui.cjs.

Nenhuma publicacao, carga historica integral ou automacao foi ativada.
