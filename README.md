# Panorama de Conversao de Midia Paga e Produtos

## Escopo fechado

Este projeto nao analisa CRM, WhatsApp, e-mail, direto, organico, social ou afiliados. O escopo e somente midia paga, apresentado nestas cinco linhas comerciais:

1. Meta Ads 1.
2. Meta Ads 2.
3. Facebook (1 + 2), agregado de Meta Ads 1 e Meta Ads 2.
4. Google Ads.
5. Total pago (Facebook + Google), agregado de Meta Ads 1, Meta Ads 2 e Google ADS.

Os agregados sao calculados sobre as linhas brutas uma unica vez. Eles nao sao somados novamente ao total pago e nunca devem ser tratados como canais independentes na reconciliacao.

## Entrega atual: oito visoes de Growth Performance

O painel deve exibir, nesta ordem, todas as visoes solicitadas:

1. Taxa de conversao geral do canal dos ultimos 12 meses.
2. Taxa de conversao das campanhas dos ultimos 12 meses.
3. Taxa de conversao dos grupos de anuncios dos ultimos 12 meses.
4. Taxa de conversao dos anuncios dos ultimos 12 meses.
5. Canal + produto.
6. Campanha + produto.
7. Grupo de anuncio + produto.
8. Anuncio + produto.

Os resultados sao extraidos somente de tabelas/views existentes no SSOT. A taxa e calculada no agregado do recorte como `SUM(pedidos) / SUM(sessoes)`; sessoes ausentes continuam nulas e aparecem como pendencia. O projeto nao cria, altera ou exclui tabelas, views, schemas ou dados do BigQuery.

### Ponte de dados

O arquivo `GrowthViews.gs`, no projeto `05_APPS_SCRIPT_BRIDGE`, consulta o catalogo de colunas do dataset `reise-ssot.mart_growth_us`, escolhe a fonte SSOT compativel para cada visao e salva apenas um snapshot JSON no Drive. O endpoint publicado e:

`...?view=growth_views`

Depois de copiar o arquivo para o Apps Script, salvar e implementar uma nova versao, execute uma vez `SSOT_refreshGrowthViews()`. Em seguida, o HTML le o snapshot pelo endpoint e monta as oito tabelas no mesmo periodo selecionado pelo usuario. Essa etapa e necessaria para trocar os esbocos pela analise real retornada do BigQuery.

### Contrato de cada linha

As linhas padronizadas retornam `data`, `canal`, `origem`, `campaign_id`, `campanha`, `ad_group_id`, `grupo_anuncio`, `ad_id`, `anuncio`, `product_id`, `produto`, `sessoes`, `pedidos` e `receita`. A ausencia de uma chave oficial nao e substituida por agrupamento aproximado de texto. A cobertura e mostrada por visao e por item, para separar desempenho real de falta de denominador.

Dashboard estatico para estruturar, validar e acompanhar a conversao comercial do SSOT antes da publicacao na Vercel.

O projeto comeca pela validacao da base e evolui para as visoes de canal, origem, campanha, grupo de anuncio, anuncio e produto. Nenhuma metrica deve ser apresentada como oficial enquanto fonte, grao, denominador e cobertura nao estiverem documentados e validados.

## Objetivo

Responder, em uma unica visao confiavel, onde a conversao acontece, quais dimensoes geram pedidos e receita, quais produtos estao associados a cada dimensao e onde existem lacunas de dados.

O painel deve separar:

- resultado comercial observado;
- taxa de conversao calculada;
- cobertura e qualidade do dado;
- pendencias que impedem uma leitura oficial.

## Perguntas de negocio

### Conversao geral por canal

Qual foi a taxa de conversao de cada canal nos ultimos 12 meses completos?

Deve ser possivel identificar os canais com mais pedidos, sessoes, receita, melhor conversao, piora mensal e cobertura insuficiente.

### Conversao por campanha

Qual foi a taxa de conversao de cada campanha nos ultimos 12 meses completos?

Deve mostrar volume, eficiencia, receita e deterioracao de desempenho de cada campanha, sempre com a mesma definicao de sessao e pedido usada no canal.

### Conversao por grupo de anuncio

Qual foi a taxa de conversao de cada grupo de anuncio nos ultimos 12 meses completos?

Deve mostrar quais grupos concentram resultado e quais precisam de investigacao por baixo volume, baixa conversao ou falta de denominador.

### Conversao por anuncio

Qual foi a taxa de conversao de cada anuncio nos ultimos 12 meses completos?

Deve permitir comparar anuncios sem transformar ausencia de sessoes em conversao zero e sem misturar fontes ou modelos de atribuicao diferentes.

### Canal + produto

Quais produtos sao vendidos por cada canal e qual e a conversao de cada combinacao?

Deve permitir analisar pedidos, sessoes disponiveis, receita, taxa de conversao, participacao no canal e produtos sem resultado no periodo.

### Campanha + produto

Quais produtos sao associados a cada campanha e qual campanha gera melhor resultado para cada produto?

### Grupo de anuncio + produto

Quais grupos de anuncio contribuem para cada produto e quais combinacoes apresentam volume, eficiencia ou cobertura insuficientes?

### Anuncio + produto

Quais anuncios geram cada produto e quais devem ser investigados por conversao, receita, volume ou ausencia de sessoes?

## Hierarquia analitica

As dimensoes esperadas sao:

    canal
      -> campanha
        -> grupo de anuncio
          -> anuncio

Produto e uma dimensao associada a qualquer nivel acima.

Visoes necessarias:

    canal
    campanha
    grupo de anuncio
    anuncio
    canal + produto
    campanha + produto
    grupo de anuncio + produto
    anuncio + produto

Cada visao deve ser calculada a partir de dados no grao correspondente. Nao se deve fabricar campanha, grupo, anuncio ou produto a partir do nome do canal, origem, UTM incompleta ou regra de aproximacao.

## Definicoes de negocio

### Taxa de conversao

A taxa oficial e calculada por soma do periodo:

    taxa de conversao = SUM(pedidos) / SUM(sessoes)

Nao e permitido calcular a media das taxas diarias ou mensais. A taxa usa pedidos totais divididos por sessoes totais do mesmo recorte, periodo, canal, origem, campanha, grupo, anuncio ou produto.

### Denominador

O denominador oficial e Sessoes SSOT.

Sessoes de GA4, Meta, Google Ads ou Shopify nao podem preencher automaticamente uma lacuna do SSOT. Qualquer fonte complementar futura deve ser identificada e validada separadamente.

### Pedidos e receita

- pedidos representa pedidos validos segundo o recorte oficial do SSOT;
- receita e uma metrica de apoio e nao substitui o denominador;
- pedidos, sessoes e receita devem usar a mesma janela, timezone e regra de atribuicao;
- metricas financeiras devem preservar a precisao disponivel na fonte.

### Janela temporal

- padrao: ultimos 12 meses completos;
- o mes corrente pode aparecer somente como parcial e deve ser identificado;
- a comparacao mensal usa o timezone America/Sao_Paulo;
- um periodo fechado deve conter todos os dias previstos na janela.

### Nulo, zero e pendente

- null ou vazio significa que a fonte nao informou o dado;
- zero significa que a fonte informou zero;
- ausencia de sessao nao pode ser convertida em zero;
- pedidos sem sessoes positivas geram taxa Pendente ou Indisponivel;
- cobertura parcial deve aparecer junto do resultado.

## Regras de negocio SSOT

1. O SSOT e a fonte oficial para pedidos, sessoes, receita e classificacao comercial.
2. A fonte atual de validacao e reise-ssot.mart_growth_us.aquisicao_por_canal_origem_daily_v.
3. O dashboard usa o extrato local data/ssot-commercial-channels.json em modo somente leitura.
4. Nenhuma tabela, view, schema, dado, permissao ou configuracao do BigQuery deve ser criada, alterada ou excluida por este projeto.
5. GA4, Meta, Google Ads e Shopify nao devem completar sessoes ausentes sem decisao documentada e validacao especifica.
6. A classificacao oficial deve priorizar canal_detalhe quando preenchido e validado.
7. WhatsApp Nao Oficial deve ser apresentado como WhatsApp Organico, conforme regra comercial.
8. Nao dividir nem inferir Facebook, Instagram ou outro canal quando a fonte nao trouxer essa separacao oficial.
9. Origens aparecem somente quando existirem registros validos no periodo analisado.
10. Origens nao podem ser somadas novamente ao total do canal quando o canal ja vem consolidado na fonte.
11. Canais novos ou nao mapeados nao podem desaparecer silenciosamente. Devem ser identificados como informados, pendentes de classificacao ou Outros, conforme regra aprovada.
12. O total geral deve ser calculado no grao correto, evitando dupla contagem por origem, campanha, pedido ou item.
13. Presente, ausente, zero e nulo devem ser diferenciados.
14. A taxa e oficial somente com denominador disponivel, positivo e coberto para o recorte.
15. Toda publicacao deve informar fonte, periodo, atualizacao e limitacoes.

## Contrato de dados atual

O extrato atual tem este contrato minimo:

    data             DATE
    canal            STRING
    canal_detalhe    STRING
    origem           STRING
    sessoes          INT64 ou null
    pedidos          INT64
    receita          NUMERIC ou FLOAT64

Grao atual:

    data + canal + canal_detalhe + origem

### Visao de campanhas - status atual

A visao `Taxa de conversao por campanha` esta disponivel no endpoint `growth_views`, com `campanha_id`, campanha, sessoes, pedidos e receita no mesmo extrato SSOT. O painel continua calculando a taxa somente pelas somas do recorte.

O extrato comercial local `data/ssot-commercial-channels.json` possui somente:

    data + canal + canal_detalhe + origem + sessoes + pedidos + receita

Por isso, nao e correto calcular campanha agrupando `origem`, nome de canal, conta de anuncios ou texto aproximado. O painel nao usa `.local/gads_ads.json`, GA4, cliques, impressoes ou conversoes da plataforma como substituto do SSOT.

Para liberar a visao oficial, a proxima extracao deve fornecer, no minimo:

    data
    campaign_id ou utm_campaign
    campanha ou nome da campanha
    sessoes SSOT
    pedidos SSOT
    receita SSOT

Tambem devem ser informados a chave de unicidade, a regra de atribuicao, o timezone, a janela diaria e a forma de reconciliacao com o total por canal. A taxa sera calculada somente assim:

    SUM(pedidos SSOT) / SUM(sessoes SSOT)

O HTML consulta o endpoint Apps Script `?view=growth_views` para carregar as oito visoes. Quando a ponte nao existe, a tabela mostra explicitamente a pendencia em vez de apresentar uma taxa inventada.

No estado validado em 2026-10-26:

    channel             Disponivel
    campaign            Disponivel
    ad_group             Provisorio por UTM, sem sessoes no mesmo grao
    ad                   Provisorio por UTM, sem sessoes no mesmo grao
    channel_product      Disponivel
    campaign_product     Pendente de ponte
    ad_group_product     Pendente de ponte
    ad_product           Pendente de ponte

As visoes provisórias exibem pedidos e receita identificados por UTM, mas nao liberam conversao enquanto nao houver sessoes SSOT no mesmo grao. As quatro visoes pendentes permanecem visiveis no painel para orientar a proxima extracao.

### Atualizacao diaria de campanhas

Foi criada a rotina `scripts/refresh_campaigns.py` como alternativa local/manual. Ela faz uma consulta `SELECT` somente leitura, reprocessa os ultimos 12 meses ate o dia anterior e grava o extrato em `data/ssot-campaigns-12m.json` usando substituicao atomica.

A atualizacao diaria principal fica no Apps Script por meio do arquivo `Campaigns.gs`, adicionado ao projeto `05_APPS_SCRIPT_BRIDGE`. Depois de copiar o arquivo para o Apps Script, implantar uma nova versao e executar uma vez `SSOT_setupCampaignsDaily8()`, o gatilho consulta o dia anterior todos os dias por volta das 08:00 no fuso `America/Sao_Paulo`. A funcao `SSOT_refreshCampaignsYesterday()` usa somente `SELECT` no BigQuery e atualiza o snapshot do endpoint `?view=campaigns`.

O HTML tenta primeiro `data/ssot-campaigns-12m.json` e, quando ele nao existe, consulta o endpoint Apps Script `view=campaigns`. Isso permite a atualizacao em uma publicacao estatica sem executar Python no navegador. Nenhuma tabela, view, schema ou dado do BigQuery e alterado.

Para habilitar campanha, grupo, anuncio e produto, a fonte deve fornecer campos oficiais equivalentes:

    campanha
    campanha_id
    grupo_anuncio
    grupo_anuncio_id
    anuncio
    anuncio_id
    produto
    produto_id ou sku

IDs sao preferiveis aos nomes porque nomes podem mudar, repetir ou ser normalizados de forma diferente entre periodos. Toda nova dimensao exige documentacao do grao, chave de unicidade, fonte, janela e regra de atribuicao.

## Validacoes obrigatorias

Antes de considerar uma visao pronta, verificar:

- contrato e versao da fonte;
- contagem declarada contra numero real de linhas;
- campos obrigatorios;
- datas validas, timezone e periodo coberto;
- registros fora da janela;
- duplicidade no grao declarado;
- metricas finitas e nao negativas;
- pedidos como contagem inteira;
- sessoes nulas, zeradas ou positivas;
- pedidos com sessoes ausentes ou zeradas;
- divergencia entre total do canal e soma de origens;
- reconciliacao entre niveis quando possivel;
- cobertura por mes e dimensao;
- existencia real de campanhas, grupos, anuncios e produtos;
- risco de dupla contagem por pedido ou item.

Status de cada resultado:

    Valido       fonte e denominador adequados
    Parcial      resultado existe, mas cobertura tem limitacoes
    Pendente     falta campo ou denominador
    Bloqueado    fonte ou grao nao permitem leitura confiavel

## Comportamento esperado do dashboard

O dashboard deve oferecer:

- filtro de periodo com destaque para os 12 meses completos;
- filtro global de canais aplicado à tabela, ao produto e às oito visões;
- selecao de mes para validacao mes a mes;
- filtros de produto por modelo, cor e tamanho;
- visao de canal e origem com expansao por canal;
- campanha, grupo e anuncio quando os campos estiverem disponiveis;
- visoes combinadas com produto;
- KPIs de pedidos, sessoes, receita e taxa;
- comparacao entre periodo atual e periodo comparativo nas oito visoes;
- grafico mensal comparavel entre canais;
- tabela detalhada com cobertura e status;
- base ampla consolidada por camada, plataforma, canal, campanha, grupo, criativo e produto;
- mensagens para dados ausentes ou pendentes;
- exportacao dos dados exibidos;
- layout responsivo para desktop, tablet e celular.

O painel nao deve esconder linhas sem dados. Deve mostrar a ausencia e explicar por que a metrica nao foi calculada.

### Filtro e leitura de produto

O filtro de produto trabalha somente com modelo, cor e tamanho. O projeto usa colunas SSOT quando elas existirem. Como o extrato atual entrega principalmente `product_id` e `produto`, os atributos que nao vierem em coluna propria podem ser derivados do nome apenas como apoio de validacao e sao marcados como derivados. Quando nao houver evidencia suficiente, o valor permanece `Nao informado`.

A visao `Canal + produto` mostra canal, modelo, cor, tamanho, sessoes, pedidos, receita e conversao no periodo atual, no comparativo e na variacao da taxa. Ela responde quais canais performaram quais produtos; nao distribui sessoes gerais de canal para produtos.

Os nomes de campanha recebem o prefixo da fonte identificada pelo campo `canal`, como `Meta Ads` ou `Google Ads`. Isso e uma rotulagem de leitura, nao uma nova atribuicao.

## Estado atual do projeto

- aplicacao: HTML, CSS e JavaScript sem backend;
- fonte carregada: data/ssot-commercial-channels.json;
- operacao: somente leitura no navegador;
- API externa: endpoint Apps Script somente leitura para `campaigns` e `growth_views`;
- publicacao: preparada para Vercel como site estatico;
- campanha e canal + produto: disponiveis no endpoint SSOT atual;
- grupo e anuncio: exibidos como provisórios por UTM, sem taxa oficial;
- campanha + produto, grupo + produto e anuncio + produto: exibidos como pendentes até existir uma ponte SSOT no mesmo grao.

### O que aparece no HTML atual

O painel apresenta as oito visoes solicitadas, sempre nesta ordem, em um seletor de granularidade, uma matriz de contrato operacional e uma base ampla de comparacao. A tela principal nao usa oito cards independentes como mecanismo de analise.

- 01. taxa geral do canal dos ultimos 12 meses;
- 02. taxa das campanhas dos ultimos 12 meses;
- 03. taxa dos grupos de anuncios dos ultimos 12 meses;
- 04. taxa dos anuncios dos ultimos 12 meses;
- 05. canal + produto;
- 06. campanha + produto;
- 07. grupo de anuncio + produto;
- 08. anuncio + produto.

O status das oito visoes e atualizado no navegador conforme o endpoint carregado: `Disponivel`, `Provisorio por UTM`, `Pendente` ou `Sem linhas no recorte`. A matriz e os resultados informam para cada visao o grao, as chaves, a fonte, a quantidade de itens, a taxa e a cobertura. Cada resultado compara sessoes, pedidos, receita e conversao do periodo atual com o periodo comparativo e mostra a variacao da taxa. Nenhuma taxa e criada para grupo, anuncio ou cruzamentos sem sessoes SSOT no mesmo grao.

A base ampla consolida as entidades em uma tabela de leitura rapida. Cada linha informa a camada (canal, campanha, grupo, criativo ou cruzamento com produto), plataforma, canal, campanha, grupo, criativo, produto, modelo, cor e tamanho, seguida dos indicadores atuais, comparativos e da variacao da taxa. Ela serve para localizar rapidamente onde investigar; os blocos das oito visoes permanecem como fonte de auditoria. Quando nao existe uma ponte SSOT no mesmo grao, a linha permanece `Pendente` ou `Sem dado`, nunca e preenchida por inferencia.

## Fases de implementacao

### Fase 0: fundacao e validacao

- definir fonte, grao e contrato;
- validar datas, duplicidades e metricas;
- validar cobertura do denominador;
- preservar nulos, zeros e pendencias;
- criar base de evidencias para publicacao.

### Fase 1: canal e origem

- validar canais oficiais;
- exibir origens somente quando existirem;
- reconciliar canal e origem sem dupla contagem;
- permitir validacao mes a mes.

### Fase 2: canal e produto

- identificar fonte oficial de produto;
- documentar pedido, item e receita;
- validar associacao entre canal e produto;
- publicar somente apos reconciliacao.

### Fase 3: campanha, grupo e anuncio

- disponibilizar campos e IDs oficiais;
- validar a hierarquia;
- verificar alteracoes de nome e reutilizacao de IDs;
- calcular taxas por soma do periodo.

### Fase 4: produto em todos os niveis

- campanha + produto;
- grupo de anuncio + produto;
- anuncio + produto;
- validar dupla contagem e reconciliacao com niveis superiores.

### Fase 5: publicacao

- revisar dados sensiveis;
- gerar extrato sanitizado;
- testar desktop, tablet e celular;
- testar filtros, estados vazios e pendencias;
- publicar somente apos validacao final.

## Criterio de pronto

Uma visao so esta pronta quando:

1. fonte e periodo estao identificados;
2. grao e chave de unicidade estao documentados;
3. taxa foi calculada sobre totais, nao medias;
4. denominador possui cobertura conhecida;
5. nulos, zeros e pendencias estao preservados;
6. totais nao possuem dupla contagem;
7. canal e origem reconciliam quando a comparacao e valida;
8. resultado foi conferido em pelo menos um mes fechado;
9. tela informa limitacoes e data de atualizacao;
10. layout foi verificado em desktop, tablet e celular.

## O que nao fazer

- nao criar view ou tabela no BigQuery;
- nao alterar a planilha de CRM ou sua estrutura;
- nao trocar a fonte SSOT por uma fonte mais conveniente;
- nao preencher sessoes ausentes com zero;
- nao calcular conversao como media de taxas;
- nao inferir origem, campanha, grupo, anuncio ou produto;
- nao somar origens sobre total de canal ja consolidado;
- nao ocultar periodos sem cobertura;
- nao publicar snapshot com informacao sensivel sem sanitizacao.

## Executar localmente

Na pasta do projeto:

    python -m http.server 8020

Abra:

    http://127.0.0.1:8020

Nao abra o index.html por file://, porque o navegador pode bloquear o carregamento do JSON local.

## Publicar na Vercel

Importe este diretorio como projeto estatico. Nao e necessario instalar dependencias nem configurar build command. A raiz publicada deve conter:

    index.html
    assets/
    data/ssot-commercial-channels.json
    vercel.json

Antes da publicacao, confirme se o extrato pode ser exposto publicamente. Caso contenha informacao comercial sensivel, substitua-o por uma versao sanitizada ou use uma arquitetura protegida.

## Historico preservado

O aplicativo Streamlit e a documentacao anterior foram preservados em _legacy/streamlit-20261022/. O reinicio do projeto nao apagou os arquivos historicos.

## Plano de extracao SSOT para conversao

As sessoes usadas no denominador devem ser buscadas no campo sessoes da fonte SSOT e nunca substituidas por cliques, impressoes, conversoes de uma plataforma de midia ou sessoes estimadas.

### Fontes encontradas

#### Camada oficial de canal e origem

Fonte:

    reise-ssot.mart_growth_us.aquisicao_por_canal_origem_daily_v

Extrato local atual:

    data/ssot-commercial-channels.json

Caracteristicas observadas no extrato:

- 8.686 linhas no extrato atualizado;
- periodo de 2025-01-01 a 2026-10-22;
- possui os canais oficiais, origens, pedidos, receita e sessoes;
- 3.073 linhas com pedidos maiores que zero e sessoes nulas nas linhas de origem;
- 3.368 linhas com sessoes nulas nas linhas de origem;
- pedidos e sessoes podem estar em linhas diferentes do mesmo dia e canal;
- a leitura do painel consolida primeiro por data + canal, sem exigir que a sessao esteja repetida na linha de cada origem;
- a classificacao usa canal_detalhe quando preenchido, preservando Meta Ads 1 e Meta Ads 2.

#### Camada SSOT com sessoes preenchidas

Fonte candidata encontrada:

    reise-ssot.mart_growth_us.shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_complete_v

Extrato local de investigacao:

    .local/ssot_channels_daily.json

Caracteristicas observadas:

- 17.574 linhas;
- periodo de 2025-01-01 a 2026-10-22;
- possui o campo sessoes preenchido no recorte inspecionado;
- possui pedidos e receita;
- o campo canal ainda aparece como origem bruta em varios registros, por exemplo Facebook, Instagram, Google, Youtube e Whatsapp;
- essa fonte nao pode ser ligada diretamente aos canais oficiais por igualdade textual.

### Ponte de sessoes aplicada no painel

O canal Google ADS estava sem sessoes na camada oficial de canal/origem, embora as sessoes existissem na camada SSOT completa. O extrato local atualizado aplica uma ponte somente para o denominador:

- fonte: `reise-ssot.mart_growth_us.shopify_channels_daily_shopify_attrib_with_shopify_sessions_human_complete_v`;
- filtro: `canal = Google` e `tipo = paid` na origem bruta;
- destino: canal oficial `Google ADS`;
- pedidos e receita: preservados integralmente da `aquisicao_por_canal_origem_daily_v`;
- nenhuma tabela ou view do BigQuery foi criada ou alterada;
- a ponte fica registrada em `metadata.session_bridge` no JSON carregado pelo painel.

O painel nao distribui sessoes Google entre origens de pedido nem inventa sessoes para outros niveis. Quando a fonte nao fecha um dia com pedidos, a taxa do dia fica pendente, mas a taxa do recorte continua calculavel quando existe denominador total.

### Como as sessoes serao usadas

Para cada nivel, a extracao devera seguir esta ordem:

1. buscar sessoes no campo sessoes do SSOT;
2. buscar pedidos validos e receita no mesmo periodo e regra de atribuicao;
3. aplicar a classificacao oficial de canal, origem, campanha, grupo, anuncio ou produto;
4. validar a chave e o grao antes de agregar;
5. calcular pedidos totais dividido por sessoes totais;
6. marcar como Pendente somente o recorte cujo denominador total esteja ausente, zerado ou sem ponte validada;
7. quando existirem lacunas em dias, calcular a taxa do recorte por `SUM(pedidos) / SUM(sessoes)` e exibir a lacuna como cobertura parcial.

Nao sera feito um join por nome de canal entre a camada bruta e a camada oficial. A ligacao precisa usar a regra oficial de classificacao ou uma chave documentada no SSOT.

## Escopo das oito visoes

### 1. Taxa geral do canal

Pergunta: qual canal converte melhor nos ultimos 12 meses completos?

Campos minimos:

    mes, canal, sessoes, pedidos, receita

Saidas: taxa de conversao, pedidos, sessoes, receita, participacao, cobertura e variacao mes a mes.

### 2. Taxa da campanha

Pergunta: quais campanhas geram mais pedidos e conversao?

Campos minimos:

    mes, canal, campanha_id, campanha, sessoes, pedidos, receita

A campanha deve ser identificada por ID oficial. UTM campaign sem uma chave validada pode ser exibida como referencia, mas nao libera uma visao oficial de campanha.

### 3. Taxa do grupo de anuncios

Pergunta: quais grupos de anuncios sustentam ou prejudicam a performance da campanha?

Campos minimos:

    mes, canal, campanha_id, grupo_anuncio_id, grupo_anuncio, sessoes, pedidos, receita

O grupo precisa manter sua conta, campanha e ID. Nao agrupar somente pelo nome.

### 4. Taxa do anuncio

Pergunta: quais anuncios geram resultado e quais precisam de investigacao?

Campos minimos:

    mes, canal, campanha_id, grupo_anuncio_id, anuncio_id, anuncio, sessoes, pedidos, receita

Anuncios sem ID, com nome nulo ou sem ponte para pedidos e sessoes permanecem fora da taxa oficial e aparecem como pendentes.

### 5. Canal + produto

Pergunta: quais produtos convertem dentro de cada canal?

A combinacao exige sessoes especificas do produto ou uma regra SSOT de denominador por produto. Sessoes gerais do canal nao podem ser usadas como se fossem sessoes do produto.

### 6. Campanha + produto

Pergunta: quais produtos sao gerados por cada campanha?

Exige a ponte validada entre sessao, campanha, produto e pedido. Nao associar produto pelo nome da campanha.

### 7. Grupo de anuncios + produto

Pergunta: quais grupos contribuem para cada produto?

Exige grupo identificado por ID, produto identificado por ID ou SKU e uma ponte sem multiplicar pedido ou receita.

### 8. Anuncio + produto

Pergunta: quais anuncios geram cada produto e quais possuem baixa eficiencia?

Exige anuncio por ID, produto por ID ou SKU e vinculo validado entre sessao, item comprado e atribuicao.

## Fontes candidatas que nao sao SSOT oficial

O arquivo .local/gads_ads.json possui campanha, grupo e anuncio do conector Windsor.ai. Ele e util para diagnosticar investimento, cliques, impressoes e conversoes da plataforma, mas nao possui as sessoes SSOT nem os pedidos SSOT. Portanto:

- pode ser usado como contexto de midia;
- nao pode ser usado sozinho para calcular a taxa oficial do projeto;
- nao deve substituir pedidos e sessoes do SSOT;
- deve ser reconciliado por IDs e periodo antes de qualquer comparacao.

Os arquivos .local/ga4_products*.json possuem metricas de produto observado no GA4, como unidades visualizadas, adicionadas ao carrinho e compradas. Eles nao comprovam sozinhos conversao de sessoes SSOT nem atribuicao de pedido pago. Servem como diagnostico de comportamento, nao como denominador oficial de conversao por produto.

## Como o painel vai explicar problemas de performance

Cada resultado devera ser lido em quatro camadas:

1. Volume: sessoes, pedidos e receita gerados.
2. Eficiencia: taxa de conversao, receita por pedido e, quando validado, investimento e retorno.
3. Cobertura: percentual de sessoes, pedidos e dimensoes com chave identificada.
4. Diagnostico: causa provavel, evidencia disponivel e proxima validacao necessaria.

Exemplos de diagnostico:

- muitas sessoes e poucos pedidos: problema de conversao ou qualidade do trafego;
- poucos pedidos e sessoes ausentes: problema de cobertura, nao necessariamente de performance;
- receita alta com baixa taxa: investigar ticket medio, mix de produtos e denominador;
- campanha com investimento e sem pedido SSOT: separar ausencia de venda de atraso ou falha de atribuicao;
- produto com muitas visualizacoes e poucas compras: investigar interesse, preco, estoque, pagina e checkout;
- queda mensal com cobertura estavel: investigar performance real;
- queda mensal com cobertura quebrada: bloquear conclusao e investigar a fonte primeiro.

Toda conclusao devera ser apresentada como fato, hipotese ou pendencia, acompanhada do periodo, fonte, filtro e evidencia usada.

## Sequencia de validacao solicitada

O trabalho deve seguir esta ordem:

1. validar a camada oficial de canal e origem;
2. validar a classificacao da fonte de sessoes preenchidas;
3. reconciliar sessoes, pedidos e receita por mes e canal;
4. liberar a taxa geral de canal somente apos a reconciliacao;
5. validar campanha e grupo por ID;
6. validar anuncio por ID;
7. validar o produto por ID ou SKU;
8. liberar os quatro cruzamentos com produto;
9. publicar a leitura de performance com fatos, hipoteses e pendencias.

Enquanto uma etapa nao passar, a visao correspondente deve aparecer como Pendente. A ausencia de valor e uma informacao de qualidade, nao deve ser preenchida com zero.

## Referencia visual aplicada em 2026-10-26

O layout atual segue a estrutura do artefato `Reise - Visitas e Vendas - Out x Set 2026`: relatorio editorial com resumo executivo, indicadores de volume, tabelas comparativas, evolucao mensal, leitura por canal e detalhamento de campanhas, criativos e produtos.

O escopo deste projeto foi reduzido para midia paga. Portanto, as secoes de CRM e de canais de relacionamento do artefato nao fazem parte desta tela. A leitura fica restrita a:

- Meta Ads 1;
- Meta Ads 2;
- Facebook (1 + 2);
- Google Ads;
- Total pago (Facebook + Google).

As oito visoes continuam aparecendo na ordem solicitada: canal, campanha, grupo de anuncio, anuncio, canal + produto, campanha + produto, grupo + produto e anuncio + produto. Cada bloco mostra periodo atual, periodo comparativo, variacao da conversao e status da cobertura. Quando a fonte nao entrega sessoes no mesmo grao, o resultado permanece `Pendente` ou `Sem dado`.

O ZIP usado como referencia contem valores estaticos de outro relatorio. Seus numeros nao foram copiados para a aplicacao. O painel usa o extrato local e o endpoint Apps Script do SSOT, preservando a regra de nao criar ou alterar tabelas e views no BigQuery.

## Pendencias reais encontradas em 2026-10-26

Pendente nao significa que a tela falhou. Significa que a fonte nao entrega o denominador ou a chave necessaria no mesmo grao da pergunta. No extrato local `data/ssot-commercial-channels.json`, foram encontrados 8.686 registros com os campos `data`, `canal`, `canal_detalhe`, `origem`, `sessoes`, `pedidos` e `receita`. Nao existem ali campos de campanha, grupo, anuncio ou produto.

| Visao | Situacao correta | O que falta para liberar a taxa oficial |
|---|---|---|
| Canal | Disponivel quando ha sessoes SSOT no agregado | Reconciliar dias com pedidos e sessoes nulas |
| Campanha | Disponivel pela fonte SSOT de campanha | Manter a chave `campanha_id` e reconciliar com o canal |
| Grupo de anuncio | Nao disponivel no mesmo grao | `grupo_anuncio_id`, nome, sessoes SSOT, pedidos SSOT e receita SSOT |
| Anuncio | Nao disponivel no mesmo grao | `anuncio_id`, nome, sessoes SSOT, pedidos SSOT e receita SSOT |
| Canal + produto | Disponivel quando a fonte traz produto e sessoes | `product_id` ou SKU sem duplicar pedido |
| Campanha + produto | Nao disponivel no mesmo grao | ponte validada de campanha, produto, sessao e pedido |
| Grupo + produto | Nao disponivel no mesmo grao | ponte validada de grupo, produto, sessao e pedido |
| Anuncio + produto | Nao disponivel no mesmo grao | ponte validada de anuncio, produto, sessao e pedido |

Tambem foram encontrados arquivos auxiliares locais. `ga4_media.json` possui sessoes, compras e receita por campanha e alguns grupos/criativos; `ga4_products_*.json` possui itens vistos, itens comprados e receita por produto, campanha, grupo e criativo. Eles podem orientar uma analise alternativa, mas nao devem ser apresentados como conversao oficial SSOT sem aprovacao, porque usam metricas GA4 e podem ter outra atribuicao, janela ou timezone. `gads_ads.json` possui custo, cliques, impressoes e conversoes da plataforma, mas nao possui pedidos e sessoes SSOT.

Para eliminar os bloqueios hoje sem inventar dados, ha duas rotas honestas:

1. Extrair do SSOT as oito visoes com os campos minimos da tabela acima. Esta e a rota oficial.
2. Autorizar uma camada alternativa separada, com selo `GA4 / plataforma`, usando sessoes e compras GA4 para campanhas, grupos e criativos e `itens_purchased / itens_viewed` para produto. Ela nao pode ser misturada com a taxa SSOT.

O painel agora possui uma fila `Onde agir primeiro`: indica cobertura a investigar, canais para otimizar e sinais para escalar/replicar. Ela usa somente volume, taxa e variacao observados; nao afirma causa sem evidencia.

## Camada GA4 autorizada

Com autorizacao para usar a alternativa, foi gerado `data/ga4-growth-alternative.json` a partir dos extratos locais GA4. O arquivo e compactado por dicionarios e contem todas as combinacoes encontradas no recorte de 01/10/2025 a 30/09/2026:

- campanhas, grupos e anuncios: `ecommerce_purchases / sessions` do GA4;
- canal + produto, campanha + produto, grupo + produto e anuncio + produto: `items_purchased / items_viewed` do GA4;
- nomes de campanha, grupo e anuncio sao enriquecidos somente para leitura pelos catalogos locais de Google Ads e Meta Ads;
- nenhum valor GA4 entra no KPI SSOT, no grafico oficial ou na conversao geral do canal;
- a camada aparece no HTML com selo `GA4 / nao SSOT` e sem comparativo artificial.

Assim, a camada oficial responde as visoes com SSOT validado e a camada GA4 permite investigar as granularidades faltantes sem apresentar um denominador diferente como se fosse o mesmo indicador.
