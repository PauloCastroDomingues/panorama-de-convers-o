# Fontes de dados do CRM

## Escopo e prioridade

O usuario confirmou a conexao da RD Station Marketing Advanced no chat e informou que o SSOT contem dados de RD Station, Reise Club e grupos VIP.
Essa informacao orienta a descoberta de fontes; ainda nao comprova tabelas, chaves, cobertura ou atribuicao disponiveis na extracao do painel.
A conexao no chat nao configura automaticamente uma carga para o projeto.

1. Consultar primeiro o SSOT, sempre em modo somente leitura, inclusive para localizar dados operacionais ja consolidados.
2. RD Station, SendFlow e a planilha de WhatsApp Oficial complementam campos operacionais ausentes ou detalhamentos nao expostos pelo SSOT. Dados sobrepostos servem para reconciliacao, nao para somar duas vezes o mesmo resultado.
3. Usar GA4 somente para uma necessidade analitica identificada que as fontes anteriores nao atendam. Documentar pergunta, fonte, periodo, fuso, grao, denominador e limitacoes antes de incorporar a leitura.

Nao ha escrita, exclusao ou criacao de dados nas fontes originais. Escritas em bases auxiliares exigem destino e escopo autorizados. Nenhuma publicacao ou automacao e ativada por esta politica.

## Resultado comercial

- Sessoes, pedidos e receita oficiais continuam no SSOT.
- Conversao comercial = soma dos pedidos SSOT / soma das sessoes SSOT compativeis. Nao calcular media de taxas.
- Uma leitura complementar de GA4 deve ficar identificada e separada; nunca substituir silenciosamente o denominador SSOT nem combinar pedidos SSOT com sessoes GA4 sob o nome de conversao oficial.
- Ausencia de ativacao na RD ou SendFlow nao apaga resultados existentes no SSOT.
- Ausencia em uma extracao nao comprova ausencia no SSOT. Primeiro revisar fonte, filtros, classificacao e cobertura.
- Nao transformar valores ausentes em zero ou copiar totais do canal para suas campanhas, grupos e mensagens.

## Reise Club e grupos VIP

Tratar inicialmente como recortes de publico/operacao, nao como novos canais canonicos nem sinonimos automaticos de WhatsApp Organico.

Antes de disponibilizar cada recorte, validar:

- Tabela/view de origem e definicao do recorte.
- IDs estaveis do publico/grupo, campanha e canal quando existirem.
- Relacionamento comprovado com RD Station, SendFlow ou outra operacao.
- Grao de cada metrica e chave de deduplicacao.
- Cobertura temporal e regra de atribuicao comercial, quando houver.
- Sobreposicao entre publicos: uma pessoa ou pedido pode pertencer a mais de um grupo. Nao somar recortes sobrepostos como se fossem exclusivos.

Nomes de campanha, utm_term, utm_content e segmentacoes inferidas nao sao, isoladamente, prova de grupo, produto ou atribuicao.

## Ativacao e comparacao

Separar metricas de entrega/engajamento das metricas comerciais. Confirmar contagens unicas, denominadores e se os contadores sao acumulados por envio ou eventos ocorridos no dia.

Campanhas avulsas e e-mails de automacao precisam de descoberta e cobertura proprias. A presenca de um endpoint nao comprova o historico de ambos.

Comparar apenas recortes com definicoes e cobertura compativeis. Para recibos acumulados, considerar o tempo de maturacao das coortes. Preservar data de envio, data de observacao, fuso original e atualizacao da fonte.

## Estado de implementacao

O adaptador atual protege o resultado comercial dos tres canais CRM existentes. Esta politica nao adiciona automaticamente um conector RD, novos recortes, mapeamentos ou consultas GA4.
O proximo passo e validar o catalogo SSOT e a resposta agregada da RD antes de definir o contrato de ingestao.
