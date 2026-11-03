# Entrega do chat para o Panorama

Estado: codigo local preparado; tarefas do chat e planilhas NAO foram alteradas.
A aplicacao permanece somente leitura nas fontes. Apenas a tarefa do chat,
com autorizacao propria, escreve nas planilhas auxiliares indicadas.
Nunca escrever em RD, SendFlow, SSOT ou na planilha de referencia dos calculos.

## Ordem de ativacao

1. Revisar a tarefa SendFlow existente e executar manualmente com o prompt abaixo.
   Nao criar uma segunda tarefa concorrente. Confirmar que os conectores MCP e
   Sheets funcionam tambem na execucao agendada, nao apenas na conversa interativa.
2. Revisar a tarefa RD existente com as garantias abaixo, sem mudar seus cabecalhos.
3. Conferir as duas entregas com `scripts/check_operational_delivery.py`.
4. Configurar a identidade de leitura e a publicacao descritas em
   [cloud-refresh-readiness.md](cloud-refresh-readiness.md).
5. Validar uma execucao na nuvem sem publicar, depois uma publicacao acompanhada.
   Somente depois ativar a agenda e substituir a tarefa Windows.

Sugestao de agenda, ainda nao configurada: RD 07:00 e SendFlow 07:15, fuso
America/Sao_Paulo; primeiro consumo da aplicacao 08:17. Usar folga maior se as
coletas demorarem. As tentativas posteriores da aplicacao nao disparam o chat.
Uma tarefa que exige aprovacao interativa nao e uma automacao autonomamente validada.
Revisar avisos de falha tanto do chat quanto do GitHub.

## Prompt para a tarefa SendFlow

```text
Atualize a base auxiliar SendFlow do Panorama usando apenas consultas no MCP
SendFlow e escritas na planilha auxiliar autorizada:
https://docs.google.com/spreadsheets/d/1OcM3LBfMUnToMbLKXtZfgB_3CAux4om7rQ1iLSSEHXc/edit

Fuso: America/Sao_Paulo. A data-alvo e ontem, calculada em cada execucao.
Nao fixe setembro, outubro, um piloto ou um unico release como filtro permanente.
Nao altere SendFlow, SSOT, RD nem qualquer outra planilha. Nao exporte pessoas,
telefones, texto das mensagens ou links privados; apenas IDs e metricas agregadas.

Antes da carga, inspecione as ferramentas realmente disponiveis, as campanhas
acessiveis, a paginacao, as definicoes e as datas/fusos retornados. Nao invente
nomes de ferramentas ou parametros. Confira o escopo contra o ultimo lote e
as campanhas acessiveis. Se houver limite, falta de acesso ou paginacao nao
resolvida, registre a limitacao; nao afirme que consultou toda a conta.

Mantenha Mensagens, Acoes, Movimento_diario e todas as outras abas existentes.
Crie somente as abas auxiliares SF_MENSAGENS, SF_ACOES e SF_MOVIMENTO, se ausentes,
com os cabecalhos exatos do contrato abaixo. Use um collection_id novo por lote.
IDs e datas devem ser texto; contadores numericos; desconhecido fica vazio,
nunca zero inventado. Nao use formulas. Nao sobrescreva lotes committed.

O lote deve representar todo o historico ja incorporado mais as novas consultas.
start_date deve incluir a menor data historica existente, nao apenas ontem.
end_date e D-1. Preserve registros antigos e reconsulte os periodos novos ou
pendentes, inclusive o intervalo desde a ultima consulta concluida. Reconsulte
ao menos os ultimos 7 dias para atualizar indicadores tardios, quando a origem
permitir. Essa janela operacional nao significa que contadores antigos estejam
definitivamente fechados. Nao copie contadores anteriores como se fossem reconsultados.

Importe o historico legado sem alterar suas abas nem inventar correspondencias.
Deduplicate por releaseId + actionId + messageIndex nas mensagens,
releaseId + actionId nas acoes e releaseId + date no movimento.
Nao some duas versoes da mesma metrica. Preserve generatedAt original quando
o registro historico nao tiver sido consultado novamente.

Confira contagem de mensagens por acao e reconciliacao dos totais das metricas
recipients, delivered, read e played. Se os provedores usarem escopos diferentes,
nao ajuste numeros para forcar reconciliacao: registre partial e a divergencia.
Converta sentAt com offset para a data local; mantenha a chave original do movimento.
Nao atribua pedidos, receita, sessoes ou conversao ao SendFlow: pertencem ao SSOT.

Depois de escrever, releia todas as linhas do novo collection_id e confira os
valores, IDs unicos, contagens, periodo e releases. Somente entao registre o lote
em SF_COLETAS como committed, com observed_at real do fim da verificacao.
Na primeira migracao, crie SF_COLETAS por ultimo, quando os dados ja estiverem
conferidos. Se nao conseguir concluir, nao ative a nova aba de controle.
Nas execucoes seguintes, collecting/partial/error nao podem substituir committed.
Um lote committed e imutavel; uma correcao usa outro collection_id.

release_ids deve ser um array JSON de strings com todas as campanhas realmente
cobertas pelo lote, inclusive as consultadas sem eventos. Uma consulta vazia so
comprova ausencia de eventos no escopo consultado, nunca ausencia de falha global.
Sem resposta confirmada da origem, nao avance end_date nem marque committed.
As contagens de SF_COLETAS sao o numero de linhas gravadas no lote, nao a soma
de destinatarios. A primeira carga pode ser vazia somente se nao apagar historico.

Se alguma aba ultrapassar 20.000 linhas, interrompa e solicite ajuste de armazenamento;
nao apague historico nem esconda truncamento para concluir a tarefa.
Nao publique no Vercel nem altere permissoes.

Retorne: collection_id, periodo consultado, releases cobertos, ultima data de
evento, observed_at, quantidades por tabela, verificacoes e limitacoes. Se falhar,
informe a etapa e preserve a ultima entrega valida. Nao declare sucesso sem releitura.
```

### Contrato SendFlow

Linha 1, nomes e ordem exatos. Todas as tabelas de dados levam collection_id na
primeira coluna. O lote inclui historico; o leitor rejeita perda de IDs anteriores.
release_ids e texto JSON, por exemplo `["id-real-1","id-real-2"]`, nao uma lista ficticia.

SF_COLETAS (A:I):
```text
collection_id,observed_at,start_date,end_date,messages_count,actions_count,movement_count,release_ids,status
```

SF_MENSAGENS (A:M):
```text
collection_id,releaseId,actionId,messageKey,messageIndex,sentAt,date,type,recipients,delivered,read,played,generatedAt
```

SF_ACOES (A:M):
```text
collection_id,releaseId,actionId,sentAt,date,success,groups,messageCount,recipients,delivered,read,played,generatedAt
```

SF_MOVIMENTO (A:G):
```text
collection_id,releaseId,date,originalDateKey,add,remove,clicks
```

Datas: YYYY-MM-DD. Instantes: ISO 8601 com offset ou Z. messageKey corresponde
a actionId + ':' + messageIndex; nao renumerar indices existentes. Uma acao
tem tantas mensagens quanto messageCount. Os IDs releaseId precisam pertencer
ao release_ids da coleta. Nao incluir campos pessoais adicionais.

## Complemento para a tarefa RD existente

Preservar as instrucoes de consulta ja validadas e acrescentar:

```text
Escreva somente na base auxiliar RD autorizada:
https://docs.google.com/spreadsheets/d/1zwtc4hHo-7GXHWBXut3Xd43ybGs2IHM_K_Xh603MwQw/edit
Nao alterar a planilha de referencia de calculos, RD Station ou SSOT.
Preserve os cabecalhos e lotes existentes em RD_COLETAS e RD_CAMPANHAS.
Conta de campanhas: 832517. Nao misture automacoes de outra conta.

Calcule D-1 em America/Sao_Paulo em cada execucao, sem datas fixas.
Preserve a abrangencia historica da ultima carga; nao troque a base acumulada
por uma carga apenas do ultimo dia. Consulte novas campanhas desde a ultima
entrega e reconsulte campanhas recentes para revisar indicadores tardios.
Declare exatamente a janela, as consultas e os limites que conseguiu verificar.
Nao declare cobertura completa quando paginacao ou limite do MCP forem desconhecidos.

Use collection_id novo e imutavel, account_id como texto e todos os campos
originais. Nao calcule sessoes, pedidos ou receita: essas metricas sao SSOT.
Preserve zeros originais inconsistentes, sinalize-os e deixe taxas com denominador
invalido nulas. Nao corrija os numeros do provedor por estimativa.

Grave as linhas do lote em RD_CAMPANHAS e releia-as. Confira conta, IDs,
send_at com offset, duplicatas e record_count. Registros fora do periodo local
nao entram nos totais do recorte, mas contam nas linhas recebidas do lote.
Finalize RD_COLETAS com status committed somente depois dessa conferencia.
observed_at e o horario real do fim da coleta, depois do encerramento de end_date.
Nunca edite um lote committed. Falhas ficam partial/error e nao apagam lotes validos.
Consulta sem novas campanhas nao e falha, desde que a consulta esteja confirmada
e o historico tenha sido preservado; nao crie registros zerados para preencher datas.
Nao avance datas por simples copia de metadados.

Retorne collection_id, janela, observed_at, contagem recebida, campanhas dentro
e fora do periodo, limitacoes e resultado da releitura. Nao declare sucesso
se o acesso ao MCP ou ao Sheets depender de uma aprovacao que nao foi concluida.
```

RD_COLETAS (A:G), contrato existente:
```text
collection_id,account_id,observed_at,start_date,end_date,record_count,status
```

RD_CAMPANHAS (A:M), contrato existente:
```text
collection_id,account_id,campaign_id,campaign_name,send_at,contacts_count,email_delivered_count,email_opened_count,email_clicked_count,email_bounced_count,email_dropped_count,email_unsubscribed_count,email_spam_reported_count
```

## Conferencia sem escrever nas fontes

```powershell
.venv\Scripts\python.exe scripts/check_operational_delivery.py
```

Esse comando apenas le as planilhas e valida contratos. Nao coleta nos provedores,
nao altera os snapshots locais e nao publica. Saida 1 significa pendencia.
deliveryReady indica entrega identificada e consultada ate D-1, nao prova cobertura
integral da conta nem execucao futura garantida. O leitor preserva coverageComplete=false.

Na nuvem, aguarda ate duas vezes por 60 segundos para uma fonte atrasada ou erro
transitorio. Falhas de autenticacao/contrato interrompem essa fonte sem novas tentativas.
Se o conjunto continuar incompleto, nenhuma nova versao e promovida pelo ciclo.
WhatsApp Oficial e catalogos Growth continuam tendo dependencias proprias; acertar
RD e SendFlow nao libera sozinho a publicacao das cinco fontes.

## Verificacao desta implementacao

Leitura direta das planilhas em 03/11/2026, 08:59 BRT, sem escritas:
- RD: lote rd-832517-20261103100419901, consultado ate 02/11, 84 campanhas;
  entrega passou no contrato. Nao e homologacao de cobertura historica total.
- SendFlow: 197 mensagens, ultima ocorrencia 30/09, extracao informada de 28/10;
  sem collection_id ou periodo de consulta confirmado. Migracao e nova coleta pendentes.

Esses resultados nao atualizaram os arquivos publicados no Vercel nem os snapshots
locais. As capturas de testes de publicacao usam metadados simulados, nao dados novos.
