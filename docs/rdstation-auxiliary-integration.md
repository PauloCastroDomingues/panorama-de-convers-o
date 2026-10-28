# RD: alimentacao auxiliar e leitura do CRM

## O que ja funciona localmente

- A coleta atual da base auxiliar foi importada localmente: 72 campanhas de 28/09 a 27/10/2026, observadas em 28/10/2026 as 15:27:39 America/Sao_Paulo, cinco com ressalvas e nenhum registro externo. Lote rd-832517-20261028182739587, marcado committed na planilha. Ele substitui o snapshot de leitura, sem somar fotografias.
- O piloto anterior continua preservado em scripts/fixtures/rd-pilot-20261028.json: 25 campanhas no recorte e um registro externo. E referencia de regressao, nao o resultado atual.
- api/crm-rd.js recebe somente GET, consulta a ponte no servidor, limita a resposta a 3 MB, valida a conta e remove campos fora do contrato. O token nao vai ao navegador.
- O CRM pode ler essa rota quando explicitamente habilitada. Se a ponte falhar, conserva a ultima leitura valida do navegador, ou o snapshot empacotado, indicando a falha e a data original. Uma coleta mais antiga nao substitui o cache mais recente.
- scripts/prepare_rd_auxiliary.cjs prepara o lote para a planilha sem escrever nela. O mesmo JSON gera a mesma collection_id; repetir nao cria outro lote.
- scripts/RdAuxiliaryReadOnly.gs e um arquivo COMPLETO de uma ponte Apps Script separada, exclusivamente de leitura. Nao substitui arquivos do projeto SSOT.

Nenhum coletor automatico, agenda ou publicacao Vercel foi ativado. A ponte do servidor foi testada em harness, nao em uma implantacao remota real.

Nesta atualizacao, a planilha foi apenas LIDA pelo conector; nao houve escrita na base, no RD, no SSOT ou nas referencias. A carga ja havia sido feita pelo usuario no chat conectado. A importacao para o snapshot local nao configura uma leitura remota diaria.

## Base auxiliar dedicada

A planilha NOVA Reise CRM - RD Operacional foi criada em 28/10/2026 na pasta ChatGPT do Drive:

https://docs.google.com/spreadsheets/d/1zwtc4hHo-7GXHWBXut3Xd43ybGs2IHM_K_Xh603MwQw/edit

Abas verificadas: RD_CAMPANHAS (sheetId 259379498), RD_COLETAS (1298641914), DICIONARIO (1301745665). Fuso America/Sao_Paulo, locale pt_BR. Os 26 registros do piloto foram relidos e comparados campo a campo ao bundle original antes de marcar o lote rd-832517-1d08b90c34c66caf4ca43773 como committed. Sao 25 no recorte e um externo, com cinco campanhas em ressalva. Numeros e zeros originais foram preservados. O export nativo foi relido e renderizado para verificacao visual.

Depois, o usuario preencheu uma segunda coleta: 72 linhas do lote rd-832517-20261028182739587. A aba passou a ter 98 registros de observacao (26 antigos + 72 novos). O consumidor usa somente as 72 linhas do lote mais recente. O manifesto e as quantidades foram conferidos antes da atualizacao local; todos os nomes, IDs, datas e contadores recebidos foram preservados. Committed nao comprova paginacao, cobertura integral ou unicidade dos contadores RD.

Nao usar a referencia CRM E-MAILS/26 nem qualquer planilha original do WhatsApp ou SendFlow. Nao copiar dados pessoais. Nenhuma dessas fontes originais foi alterada. A base criada ainda NAO e uma ponte remota ativa nem uma coleta diaria agendada.

Dois cabeçalhos, na ordem exata, iniciando em A1:

RD_COLETAS:

```text
collection_id,account_id,observed_at,start_date,end_date,record_count,status
```

RD_CAMPANHAS:

```text
collection_id,account_id,campaign_id,campaign_name,send_at,contacts_count,email_delivered_count,email_opened_count,email_clicked_count,email_bounced_count,email_dropped_count,email_unsubscribed_count,email_spam_reported_count
```

IDs, datas ISO e timestamps devem ser TEXTO. Datas: YYYY-MM-DD. Timestamps: ISO 8601 com segundos e offset. Contadores e record_count: numeros inteiros, sem formatacao de milhar. Ausente: celula vazia, nunca zero por conveniencia. Sem formulas. Enviar valores RAW; textos iniciados por =, +, - ou @ devem permanecer texto, nao formulas. Nao remover caracteres dos nomes originais.

collection_id identifica uma fotografia, nao um dia de engajamento. Chave da campanha dentro do lote: account_id + campaign_id + send_at convertido para UTC. Campanhas com contadores contraditorios continuam no lote; as taxas afetadas sao isoladas pelo consumidor.

## Preparar o piloto existente sem recolher tudo

```powershell
node scripts/prepare_rd_auxiliary.cjs data/crm-rd-snapshot.json
```

O JSON em output/rd-auxiliary tem cabecalhos, linhas completas e manifestos pending/committed. Nao contem credenciais. Tambem aceita a estrutura do JSON de extracao original, validando as quantidades declaradas.

Gravacao pelo coletor autorizado, somente no destino auxiliar:

1. Conferir cabecalhos e procurar collection_id. Se ja estiver committed e as linhas coincidirem exatamente, nao repetir a carga.
2. Registrar RD_COLETAS como pending; acrescentar as linhas em RD_CAMPANHAS. Nunca somar contadores com lotes anteriores.
3. Reler TODOS os campos do lote e comparar com o preparado, inclusive IDs, datas, nulls e zeros. Divergencia: manter pending e reportar, sem corrigir silenciosamente a origem.
4. Somente depois da conferencia exata, mudar o status desse lote auxiliar para committed. record_count inclui os registros fora da janela local, que o leitor separa dos totais.

O leitor escolhe apenas a coleta committed mais recente da conta configurada. Lote com quantidade divergente, chave repetida, timestamp sem fuso ou formula e recusado; ele nao combina partes de fotografias diferentes. committed significa copia conferida, NAO cobertura completa do RD ou homologacao comercial.

Cada lote deve conter todo o recorte operacional que se deseja disponibilizar naquela leitura. O leitor NAO monta historico unindo lotes. Para investigar um periodo maior, coletar esse recorte explicitamente; nao estender a cobertura pelo menor/maior dia observado. O historico permanece na planilha, mas a interface le somente a ultima fotografia. Limite defensivo: 20 mil linhas por aba; acima disso, revisar armazenamento/paginacao sem apagar historico automaticamente.

## Ponte de leitura

Criar um projeto Apps Script separado e usar scripts/RdAuxiliaryReadOnly.gs inteiro. Definir nas propriedades desse NOVO script:

```text
RD_AUX_SHEET_ID=1zwtc4hHo-7GXHWBXut3Xd43ybGs2IHM_K_Xh603MwQw
RD_SHEETS_READ_TOKEN=<credencial longa e aleatoria, gerada no ambiente>
RD_ACCOUNT_ID=832517
```

Revisar permissoes e implantar o script como Web App. A ponte usa doGet e TextOutput JSON; o token e exigido mesmo se o transporte puder ser acessado externamente. Nao por o token em chat, frontend ou git.

No servidor do projeto, configurar separadamente:

```text
RD_SHEETS_API_URL=https://script.google.com/macros/s/<deployment-id>/exec
RD_SHEETS_READ_TOKEN=<mesmo segredo>
RD_ACCOUNT_ID=832517
```

Somente depois de testar essa ponte real, alterar data/crm-rd-config.json para:

```json
{"endpoint":"/api/crm-rd","accountId":"832517"}
```

Hoje endpoint permanece vazio, de proposito. O servidor Python estatico de localhost nao executa api/. O token autentica servidor-ponte, nao os visitantes: antes de publicar, confirmar acesso autorizado ao painel ou configurar autenticacao. A rota publica do projeto nao deve ser tratada como protecao de dados privados.

O ID real da base ja esta em data/crm-rd-config.json e e o destino padrao da ponte Apps Script. Isso nao substitui implantar o Web App e configurar as credenciais no servidor. O prompt diario tambem ja referencia essa base existente.

## Frequencia e limites

Proposta para o MVP: uma coleta diaria depois do fechamento D-1, em America/Sao_Paulo, reconsultando uma janela operacional explicita (por exemplo 30 dias) para capturar revisoes. Essa janela e de envios; os contadores podem continuar acumulando depois do envio. Comparativos mais longos requerem extracao dos dois recortes. Uma carga historica e uma tarefa separada.

O prompt completo docs/rdstation-daily-fill-prompt.txt serve para preparar/configurar o coletor no chat conectado. Nenhum agendamento foi criado. A agenda automatica so sera ativada depois da validacao de ponta a ponta, com a reconciliacao comercial SSOT por ultimo, conforme a nova ordem solicitada.

Sessoes, pedidos, receita e conversao comercial continuam exclusivamente no SSOT. Nao calcular sessoes/cliques como se fossem a mesma coorte sem evidencia de equivalencia temporal e de atribuicao. Nao repartir vendas do canal por campanhas. SendFlow e outra base e nao entra nestas abas RD.

## Referencias tecnicas

- https://developers.google.com/apps-script/guides/web
- https://vercel.com/docs/functions/runtimes/node-js
