# Calculos de E-mail da Reise

## Referencia imutavel

Planilha: https://docs.google.com/spreadsheets/d/1z_Aixkiton5AmlpIM8q0daWFgXNPKXjqo15wxD5C2oM/edit
Leitura em 28/10/2026; locale pt_BR; fuso America/Sao_Paulo.
Nenhuma escrita, alteracao de formato, copia ou exclusao foi realizada nessa planilha.
Esta e uma referencia metodologica, nao uma nova fonte automatica nem uma extracao RD atual.

## Definicoes verificadas nas formulas

| Indicador | Formula Reise | Evidencia |
| --- | --- | --- |
| Entregabilidade | entregues / leads selecionados | JANEIRO!J2 = I2/H2; OUTUBRO!J2 |
| Abertura | aberturas / entregues | JANEIRO!L2 = K2/I2; OUTUBRO!L2 |
| Clique por abertura (CTOR) | cliques unicos / aberturas | JANEIRO!N2 = M2/K2; OUTUBRO!N2 |
| Taxa de sessao | sessoes / cliques unicos | MEDIANAS!J2 = I2/G2 |
| Conversao comercial | pedidos / sessoes | MEDIANAS!L2 = K2/I2 |
| Ticket medio | receita / pedidos | AGOSTO!P1:S1 tem esses indicadores; a formula do ticket nao foi comprovada na amostra. Definicao do projeto, nao formula extraida dessa aba. |

Os percentuais sao armazenados como proporcoes e formatados como percentual apenas na apresentacao.
O CTOR e diferente de CTR (cliques / entregues). Nao mapear uma taxa pronta da RD sem confirmar o denominador; recalcular com contagens compativeis.

## Consolidacao e referencias

OUTUBRO!H8:N8, H20:N20, H36:N36 e H61:N61 sao subtotais, nao novos disparos. Nao soma-los novamente com as linhas de campanhas.
Para taxa consolidada de dia, semana, mes ou filtro: somar os contadores validos do mesmo recorte e depois dividir. Nao usar media aritmetica de taxas.

MEDIANAS!D6, F6, H6, J6 e L6 usam MEDIAN sobre as taxas mensais de julho, agosto e setembro. Essa mediana e um benchmark separado, nao a taxa consolidada nem uma meta aprovada automaticamente.
Os insumos de sessoes e pedidos de MEDIANAS!I2:K4 sao valores digitados na referencia; sua origem/atribuicao SSOT nao esta demonstrada pelas formulas.
Na aba Media de Clique, o consolidado B8 tambem usa MEDIAN(B3:B7), apesar do titulo conter "media".
Fluxos!F2 e H2 usam abertura / entregues e cliques / aberturas; F5 e H5 usam medianas das linhas do fluxo.
Nao misturar campanhas avulsas, repiques e fluxos num benchmark sem informar o recorte e o grao.

Exemplo conferido: seis envios de OUTUBRO!A2:N7 somam 157941 selecionados, 154280 entregues, 58796 aberturas e 384 cliques. O CTOR consolidado e 384/58796 = 0,6531%, igual a N8, e nao 384/154280.

## Base tratada RD

As contagens e as observacoes originais ficam preservadas. A camada tratada deve carregar:

- Identificadores reais da conta, campanha/e-mail e unidade de envio conforme o grao confirmado na RD; tipo campanha avulsa, repique ou fluxo apenas quando comprovado.
- Data/hora original de envio, fuso, data local America/Sao_Paulo, data de coleta e semantica temporal dos contadores.
- Selecionados, entregues, aberturas unicas e cliques unicos, com nulos preservados.
- Nome, assunto, oferta, cupom e segmentacao somente quando disponiveis na fonte ou em de-para validado. Ausencia na API nao autoriza inferencia comercial pelo titulo.
- As tres taxas operacionais derivadas e indicadores de cobertura/qualidade.
- Sessoes, pedidos, receita, conversao e ticket em uma leitura SSOT no grao validado; nao replicar totais do canal nas linhas de cada e-mail.

A documentacao de /platform/analytics/emails descreve contacts_count como contatos selecionados, email_delivered_count como entregas, email_opened_count como aberturas unicas por lead e email_clicked_count como cliques unicos por lead. Confirmar esses campos na resposta real do MCP antes de conectar o leitor. Nao reconstruir contagens a partir de percentuais arredondados.
Referencia: https://developers.rdstation.com/reference/get_platform-analytics-emails

Somar pessoas unicas por e-mail nao produz pessoas unicas no periodo: ha repeticao de audiencia entre envios. Historicos de coleta tambem nao sao novos disparos; consolidar observacoes por chave e data de coleta antes de agregar.

## Cruzamento SSOT

O SSOT continua prioritario, inclusive para localizar dados RD, Reise Club e grupos VIP ja consolidados.
Pedidos e sessoes SSOT fornecem a conversao oficial do canal. Para detalhar campanha, publico ou grupo, exigir chaves e atribuicao nesse mesmo grao.
A taxa sessoes / cliques exige escopo compativel entre sessoes e envios: coorte de envio da RD e data de sessao SSOT nao sao automaticamente equivalentes. Pode superar 100% e nao deve ser limitada artificialmente. Sem vinculo, a funcao nao calcula essa taxa.
GA4 nao e consultado automaticamente. Qualquer uso excepcional precisa de pergunta, justificativa e identificacao de fonte; nao preencher denominador SSOT com GA4 silenciosamente.

## Comparativos e semaforos

Mostrar atual, comparacao e variacao em pontos percentuais para taxas; a variacao relativa e uma coluna distinta. Base anterior zero nao gera crescimento percentual infinito.
Mediana de periodos comparaveis pode servir como referencia explicitamente identificada, com quantidade de periodos validos. Nao fixar os numeros desta referencia como meta de todos os meses.
Diagnostico sugerido: entrega -> selecionados/descartes; abertura -> assunto, horario e segmento; CTOR -> oferta e conteudo; taxa de sessao -> links, UTMs e escopo; conversao -> produto, pagina e oferta. Essa sequencia orienta investigacao, nao comprova causalidade.

## Implementacao e limite atual

assets/crm-email.js concentra taxas, agregacao ponderada, mediana e comparacao. O acompanhamento manual de E-mail usa essa mesma funcao e preserva zero observado.
scripts/test_crm_email.cjs confere exemplos e benchmarks contra a referencia, sem acessar ou alterar a planilha.
A referencia metodologica nao foi promovida a resultado atual. A carga posterior do piloto e descrita abaixo; nao houve carga historica integral nem publicacao.

O diagnostico posterior confirmou os quatro campos RD e trouxe inicialmente uma amostra de sete das 24 campanhas relatadas. A extracao seguinte corrigiu esse numero: 26 recebidas, 25 no periodo e uma excluida. O JSON completo dessa consulta foi importado localmente com cinco ressalvas, sem homologar cobertura global. assets/crm-rd.js trata datas, contas, duplicatas e qualidade; o painel identifica a leitura como piloto e os calculos como provisorios. Estado atual em docs/rdstation-pilot-load.md; avaliacao inicial em docs/rdstation-pilot-assessment.md.
