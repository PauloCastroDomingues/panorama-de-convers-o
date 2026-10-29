# Panorama: caminho de decisao e limites

Revisao local em 29/10/2026. Fontes consultadas somente em leitura; nenhuma publicacao realizada nesta revisao.

## O que apresentar a diretoria

O painel consolida resultados comerciais e organiza a investigacao. Ele mostra o que mudou, decompoe matematicamente a variacao da receita e sugere a proxima verificacao. Nao e um modelo de causalidade, previsao ou atribuicao incremental.

A sequencia CRM passa a ser: resultado SSOT, prioridade de investigacao, etapas de ativacao, sessoes e pedidos do canal. Ritmo diario, metas, acompanhamento e detalhes de RD/SendFlow ficam acessiveis em secoes recolhidas. As visoes existentes foram preservadas.

## Perguntas que responde

| Pergunta | Evidencia e condicao |
| --- | --- |
| Quanto o canal vendeu e converteu? | Pedidos, receita e sessoes SSOT no recorte. Conversao = soma dos pedidos / soma das sessoes, com denominador e cobertura validos. |
| Cresceu ou caiu em relacao a outro periodo? | Comparacao opcional por canal, com semaforos. Valores parciais nao sustentam conclusoes de crescimento. |
| Qual fator pesa na variacao da receita? | Nova leitura CRM: sessoes, conversao e ticket, em periodos de igual duracao e cobertura completa. |
| Por onde comecar a investigacao? | Maior contribuicao negativa recebe prioridade; sem pressao negativa, acompanha-se o principal fator positivo. E uma regra de triagem, nao uma decisao automatica de investimento. |
| Quais etapas operacionais foram registradas? | Contadores por etapa da planilha WhatsApp Oficial, RD e SendFlow, respeitando as validacoes de cada fonte. |
| Como estao produtos e campanhas em Growth? | Canal, campanha e canal + produto estao disponiveis no snapshot, sujeitos aos filtros e a cobertura. Growth atualmente restringe a analise a canais pagos. |

## Perguntas que ainda nao responde

| Pergunta | Por que nao | O que fecha a lacuna |
| --- | --- | --- |
| Qual e-mail ou mensagem gerou cada venda? | Correspondencia de canal e data nao comprova atribuicao ao envio. | IDs e UTMs consistentes, ponte validada ate pedido e janela de atribuicao definida. |
| Por que a conversao mudou? | A identidade matematica mostra o fator, nao a causa. | Dados de produto, estoque, oferta, dispositivo, carrinho/checkout e testes controlados conforme a hipotese. |
| Qual produto explica a mudanca no CRM? | O detalhe de produtos do CRM ainda nao foi implementado; a tela Growth e de midia paga. | Visao CRM canal + produto com denominadores compativeis e IDs validados. |
| Como um produto performou em cada campanha, grupo e criativo? | Os tres cruzamentos com produto nao possuem fonte SSOT validada no snapshot. | Ponte de dimensoes e metricas na mesma granularidade. |
| Qual a conversao de cada grupo/criativo? | Ha pedidos e receita provisorios por UTM, mas nao sessoes nesse nivel. | Denominador SSOT validado no mesmo grao. |
| Qual o retorno incremental, margem ou verba ideal? | Receita atribuida nao mede incrementalidade; custos e margem completos nao foram demonstrados. | Investimento, custos, margem e desenho de teste ou metodologia causal homologada. |
| O crescimento vai continuar? | Dois periodos nao sustentam previsao nem significancia estatistica. | Historico consistente, ajuste de sazonalidade, volume e validacao de previsao. |
| Toda a operacao esta atualizada diariamente? | Atualizar o dashboard nao preenche dados faltantes na origem auxiliar. | Coleta operacional de todas as campanhas e monitoramento de atraso por fonte. |

## Evidencia de atualizacao

Snapshot local `data/data-refresh-status.json`, concluido em 29/10/2026 as 11:50 BRT:

- SSOT comercial, Growth, WhatsApp Oficial e RD possuem registros ate 28/10/2026.
- SendFlow: ultima data de atividade carregada e 30/09/2026; uma coleta recente nao significa atividade recente nem cobertura completa.
- A disponibilidade de D-1 nao comprova completude do historico. Existem lacunas por canal e metrica.
- RD permanece com cobertura operacional nao homologada. Contadores recebidos nao devem ser tratados automaticamente como funil validado.
- Grupos e anuncios: conversao indisponivel por falta de sessoes; tres cruzamentos de produto pendentes conforme `data/ssot-growth-views.json`.

## Exemplo real: 28/10 versus 27/10/2026

| Canal | Sessoes | Conversao | Receita: variacao absoluta |
| --- | --- | --- | --- |
| E-mail | 1.111 para 865 | 0,63% para 1,39% | +R$ 3.384,18 |
| WhatsApp Organico | 546 para 376 | 0,55% para 2,39% | +R$ 3.397,61 |
| WhatsApp Oficial | 945 para 554 | 1,16% para 3,07% | +R$ 5.344,96 |

Fato: a receita aumentou apesar da queda de visitas. Conversao e ticket subiram. A decisao inicial e investigar a perda de volume sem prejudicar a eficiencia observada. Nao ha evidencia suficiente para creditar o ganho a uma campanha, oferta ou mensagem especifica. Volumes de pedidos pequenos exigem cautela ao generalizar percentuais de um unico dia.

## Regra da nova leitura

Receita = sessoes x (pedidos / sessoes) x (receita / pedidos).

As contribuicoes em reais sao calculadas pela media das seis ordens de substituicao dos tres fatores entre periodos (decomposicao simetrica). Somam a variacao total antes do arredondamento; centavos exibidos podem divergir por arredondamento. Nao sao vendas atribuiveis, receita perdida recuperavel ou previsao de ganho.

A decomposicao exige valores nao negativos, sessoes e pedidos positivos nos dois periodos, cobertura completa de sessoes/pedidos/receita e igual duracao. Comparacao desligada, base zero, dados ausentes ou cobertura parcial interrompem a leitura explicativa. Igual duracao nao controla sazonalidade, composicao do publico ou dias da semana.

Os funis sao diagramas de etapas, sem escala quantitativa de area. As taxas mostram a relacao entre contadores quando validada; nao provam que cada pessoa percorreu todas as etapas. Sessoes e pedidos sao apresentados uma unica vez para o canal, separados dos tipos de envio.

## Prioridades para confiar na operacao

1. Fechar o atraso e a cobertura da origem SendFlow e homologar contadores RD.
2. Validar cobertura do historico SSOT, sem substituir ausencia por zero.
3. Adicionar detalhe CRM de canal + produto e a ponte entre ativacao e resultado, sem inferencias por nomes parecidos.
4. Formalizar responsavel, prazo e evidencia esperada para cada investigacao; isso ainda nao e um fluxo de tarefas dentro do painel.
5. Medir o tempo de analise antes/depois com gestores. A nova hierarquia busca reduzir leitura repetida, mas a economia de tempo ainda nao foi medida.

## Verificacao desta entrega

Testes unitarios da decomposicao, cobertura, base zero, imutabilidade e comparacao; verificacao no navegador dos tres canais e visao geral, detalhes expansiveis, persistencia de expansao e comparacao desligada. Conferencia em 1440, 820, 390 e 320 pixels. Snapshots e planilhas de origem nao foram alterados nesta revisao.
