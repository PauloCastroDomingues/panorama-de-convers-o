# Avaliacao do piloto RD Station

## Evidencias e limites

O diagnostico fornecido pelo usuario em 28/10/2026 relata 24 campanhas locais de 21 a 27/10, mostra sete exemplos e nao fornece o JSON integral, os IDs de conta ou um horario exato de coleta. E evidencia de conectividade, nao uma carga completa para publicar.
Fonte local: anexo 317c130e-702d-4f54-a1e2-a2e3119af5e4/Pasted text.txt. Nenhum dado do anexo foi inserido como resultado atual do painel.

Os campos contacts_count, email_delivered_count, email_opened_count e email_clicked_count foram observados pelo coletor. Ha envio de 20/10 na resposta, contadores zero com atividades posteriores, automacoes vazias e divergencia de account_id entre recursos.

## O que pode avancar

- Preparar a camada de contagens de campanhas e os calculos Reise, sem exigir a resolucao de automacoes para processar campanhas separadamente.
- Filtrar send_at com offset para America/Sao_Paulo e preservar registros excluidos do recorte para auditoria.
- Preservar zeros da origem, mas separar contagem recebida de contagem apta para indicadores quando houver inconsistencia. Uma ressalva de qualidade nao e uma correcao do dado bruto.
- Recalcular entregabilidade, abertura e CTOR; nao usar a taxa pronta de clique da RD como CTOR.
- Separar horario de coleta de horario de atualizacao da fonte. O segundo continua desconhecido quando a RD nao o retorna.

O schema oficial de GET /platform/analytics/emails define email_opened_count e email_clicked_count como unicos por lead. Verificado no schema JSON da pagina oficial em 28/10/2026. A limitacao do diagnostico e a descricao do MCP, nao ausencia dessa definicao na API. Confirmar o encaminhamento dos mesmos campos antes de homologar a equivalencia no conector.
Fonte: https://developers.rdstation.com/reference/get_platform-analytics-emails

## Controles implementados

assets/crm-rd.js recebe registros de campanha e um contexto de coleta explicito. Nao faz chamadas externas nem escreve em fontes.

- Conta diferente da esperada gera erro, em vez de mistura silenciosa.
- Timestamp sem fuso ou data invalida e rejeitado.
- Registro fora do periodo local nao entra na agregacao.
- Observacao identica repetida nao vira novo envio; valores conflitantes para a mesma unidade geram erro.
- Apenas campos permitidos entram na saida. Nao ha contatos, tokens, HTML ou taxas prontas.
- Zero entregas com aberturas, cliques, descadastros ou spam positivos recebe zero_delivery_with_activity. O zero original permanece em counts, enquanto trustedCounts e as taxas afetadas ficam indisponiveis para homologacao. Rejeicoes isoladas nao provam inconsistencia: uma campanha pode nao ter entregas por rejeicao total.
- Contagens unicas nao confirmadas nao geram abertura/CTOR homologados. A evidencia e uma entrada explicita do coletor, nao uma inferencia do modulo.
- Sem cobertura de coleta comprovada, consolidated fica null; observed mostra apenas o recorte observado. Mesmo com cobertura de coleta, campos em ressalva continuam parciais, nao sao omitidos para produzir um total aparentemente completo.

O modulo esta preparado e testado, mas nao foi ligado a uma base RD real. O painel existente nao recebe as sete linhas do diagnostico como se fossem as 24 campanhas.

## Descoberta SSOT no arquivo fornecido

Arquivo examinado em leitura: C:/Users/reise/OneDrive/Guilherme/DOCS/DADOS/reise-bigquery-project.zip.
Trata-se de codigo historico, nao prova da definicao ou existencia atual das views.

- sql/04_marts_area/08_mart_growth_us_panel_objects.sql, linhas 243 e 273/287: define shopify_channels_daily_v e reconhece RD Station/email. Contudo, o comentario das linhas 225-232 descreve distribuicao proporcional de pedidos/vendas por proxy. Essa implementacao historica NAO deve ser adotada como atribuicao comercial observada neste projeto.
- sql/04_marts_area/12_mart_growth_us_shopify_orders_journey_last_click.sql, linhas 139-159: ha classificacao RD Station na jornada last-click. E uma candidata a investigar, nao um de-para de campanha homologado.
- session_artifacts/2026-03-26/sql/04_marts_area/20_mart_growth_us_shopify_attribution_channels_normalized.sql: define shopify_marketing_attribution_orders_daily_auto_normalized_v sobre shopify_marketing_attribution_orders_daily_auto_v e reconhece grupos vips em source/medium. Nao comprova IDs de grupos ou segmentacao Reise Club.
- Nao foi encontrada referencia literal de Reise Club nos arquivos SQL/Markdown examinados. Isso NAO significa ausencia de seus dados no BigQuery.

Nenhum SQL de criacao, alteracao ou seed do ZIP foi executado. O catalogo atual, linhagem, grao, periodo, IDs e regras de atribuicao precisam ser verificados antes de escolher a fonte.

## Proximas duas leituras

1. Executar scripts/CrmSsotCatalogDiagnostic.gs no Apps Script ja autorizado ao projeto, como novo arquivo. Funcao: SSOT_inspectCrmSourceCatalog. Nao substituir GrowthViews.gs ou doGet. Requer o servico avancado BigQuery ja usado pelas consultas anteriores. Apenas INFORMATION_SCHEMA.COLUMNS de datasets mart_* nas regioes US e southamerica-east1; limite de faturamento 1 GiB por consulta, sem elevar o limite existente. Nao le linhas de clientes, pedidos, eventos ou GA4. Mais de 30 candidatos ou erro regional sao reportados como cobertura incompleta. Testado somente em harness, nao no BigQuery real.
2. Executar o prompt completo docs/rdstation-pilot-export-prompt.txt no chat conectado a RD para obter os registros integrais, metadados de cobertura e esclarecimento de contas. Essa conexao ainda nao esta exposta as ferramentas desta sessao.

Automacao diaria, historico completo e publicacao ficam para depois da validacao das cargas. Sessoes, pedidos, receita e conversao oficial permanecem SSOT; nao ha fallback automatico GA4.
