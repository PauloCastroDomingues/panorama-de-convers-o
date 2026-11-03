# Atualizacao coordenada na nuvem

## Regra atual: fontes independentes

Em 03/11 o usuario determinou que a atualizacao para D-1 nao deve esperar pelo
SendFlow. O modo `--independent-sources` substitui a trava global para publicacao:

- Cada fonte validada avanca. Fonte recusada mantem os bytes da versao anterior,
  suas datas reais e `retained=true`; nao ganha carimbo artificial de atualidade.
- Growth publica canal, campanha e canal + produto quando validos e mantem os
  grupos/cruzamentos sem catalogo com aviso e datas antigas por visao.
- O painel recebe um pacote atomico, mas com estados independentes por fonte.
  `partial` e um resultado publicavel e explicito, nao uma declaracao de completude.
- Contratos invalidos, data-alvo incorreta ou nenhuma fonte aprovada bloqueiam
  a publicacao. Nenhuma metrica comercial e substituida por fonte operacional.
- Fuso America/Sao_Paulo; alvo sempre D-1, nao dados ainda abertos de hoje.
- Sem dependencia do computador local. Workflow `refresh-data.yml` publicado;
  segredo VERCEL_TOKEN confirmado no ambiente em 03/11/2026 as 13:37 BRT.
- Validacao sem publicar: execucao 41676703932 terminou com success, com fontes
  atuais ate 02/11 e SendFlow preservado em 30/09. As ressalvas Growth permanecem.
- Teste de tela com metadados simulados: 1440, 820, 390 e 320 px, sem erros JS,
  sem escrita nas fontes e sem leituras avulsas fora do pacote.

Os registros abaixo documentam a fase anterior. A exigencia de esperar todas as
fontes foi substituida pela regra acima, por solicitacao explicita do usuario.

Estado conferido em 03/11/2026, as 13:21 BRT: o diagnostico de coleta completa
esta publicado e executado no GitHub. A identidade federada e a coleta real
funcionaram sem computador local. Publicacao e agenda continuam desativadas.
Nenhuma fonte foi modificada pelo diagnostico ou pela revisao de prontidao.

## Coleta completa na nuvem

Execucao: https://github.com/PauloCastroDomingues/panorama-de-convers-o/actions/runs/41672863637

- SSOT comercial: current, ultima data 02/11/2026.
- Growth canal: current, 3187 linhas, cobertura ate 02/11.
- Growth campanha: current, 8876 linhas, cobertura ate 02/11.
- Growth canal + produto: current, 10889 linhas, cobertura ate 02/11.
- Growth grupo, campanha + produto e grupo + produto: bloqueados pela ausencia
  de catalogos privados de IDs na nuvem. Nenhuma substituicao por texto ou GA4.
- RD: current, 84 campanhas, lote committed com cobertura ate 02/11.
- WhatsApp Oficial: current, 759 linhas, ultima ativacao preenchida em 02/11.
- SendFlow: stale, 197 mensagens, ultima ocorrencia em 30/09, sem lote committed.
- O job terminou com failure porque existem bloqueios de publicacao reais,
  nao por falha de login ou dos testes. Nao e uma certificacao de historico completo.
- O candidato foi descartado ao encerrar o diretorio temporario; nenhum dado
  bruto foi enviado como artifact, commit ou novo deploy.
- Dominio principal confirmado no deployment anterior. Zero deployments para
  o commit e4745b4. Nao foram usadas credenciais Vercel no runner.

O comando manual `cloud_refresh.py --diagnose` tenta todas as fontes mesmo
quando falta catalogo. Relatorio por fonte no resumo do GitHub; erros continuam
bloqueando o lote. Uma falha de Growth nao apaga o sucesso da coleta SSOT.
`--diagnose` e `--publish` sao mutuamente exclusivos. O modo diagnostico nao sela
nem publica um lote, mesmo quando todas as fontes passam.

## Evidencia anterior e configuracao

- Acesso federado: teste manual 41670635118 concluido com sucesso. Oito objetos
  BigQuery passaram na validacao de consultas; a view comercial principal teve
  leitura real de uma linha de 02/11. Foram faturados 73400320 bytes nessa amostra.
  As quatro permissoes de escrita verificadas nao foram detectadas nos oito
  objetos. Isso nao substitui auditoria completa de IAM, dependencias ou historico.
- RD: leitura integral pelo coletor local existente em 03/11 as 13:07 BRT.
  Lote `rd-832517-20261103100419901`, 84 campanhas, cobertura declarada ate 02/11,
  observado em `2026-11-03T07:04:19.901-03:00`. Contrato aceito pelo leitor;
  historico completo continua nao homologado. Nao comprova execucoes futuras da tarefa.
- SendFlow: mesma conferencia encontrou 197 mensagens na base legada, ultima
  ocorrencia em 30/09 e observacao em `2026-10-28T13:12:59.954Z`. Sem collectionId
  ou coveredThrough. O checkpoint do outro chat nao substitui um lote committed.
  Nenhuma chamada ao MCP SendFlow foi feita nesta revisao.
- WhatsApp Oficial: leitura atual da origem retornou 759 linhas e ultima data
  com ativacao preenchida em 02/11. Nao comprova cobertura integral nem carimbo
  de atualizacao da fonte; dias sem disparos continuam sem zeros inferidos.
- Growth: os dois catalogos locais cobrem 01/09 a 29/10, com 323 linhas Meta e
  64 Google. Precisam de renovacao real e disponibilizacao privada para a nuvem.
  Sao cadastros de identidade; nao substituem pedidos, sessoes ou receita SSOT.
- GitHub: ambiente `panorama-data` restrito a main, com somente as duas variaveis
  de identidade. Nao ha PANORAMA_CATALOG_BUCKET nem segredos de publicacao no
  ambiente ou repositorio. Os workflows remotos sao check-cloud-access.yml e
  diagnose-data.yml, ambos exclusivamente manuais e sem publicacao.
  refresh-data.yml ainda nao foi publicado; PANORAMA_CLOUD_ENABLED nao existe.
- Site publicado: status ainda e do ciclo de 30/10, alvo 29/10, SendFlow em 30/09.
  A leitura das fontes acima nao atualizou snapshots locais nem o site.

O primeiro push do diagnostico acionou um deploy Git inesperado. Foi feito
rollback e confirmado o dominio principal no deployment anterior
`dpl_7DzoZSmEuTxP7zVsojAbmx45a7ce`. O commit 579b179 adicionou
`git.deploymentEnabled=false` em vercel.json; nao gerou deploy. O agendamento e
a publicacao de novos dados continuam desligados. Deploy manual futuro exige
validacao e autorizacao; nao confundir isso com o rollback de restauracao.

Execucao de acesso: https://github.com/PauloCastroDomingues/panorama-de-convers-o/actions/runs/41670635118

## O que esta implementado

- Contrato de entrega do chat, prompts e sequencia de ativacao em
  [tarefas-chat-coleta-crm.md](tarefas-chat-coleta-crm.md). RD mantem suas abas;
  SendFlow aceita lotes imutaveis em novas abas auxiliares, sem editar as antigas.
- `collectionId`, `coveredThrough` e ultima ocorrencia separados. Uma coleta
  concluida pode nao ter eventos novos; isso nao cria metricas zero nem homologa
  cobertura total. SendFlow legado continua legivel localmente, mas nao libera
  uma publicacao coordenada sem identificacao de lote concluido.
- Ate tres tentativas por fonte operacional, com espera de 60 segundos entre
  tentativas para atraso/erro transitorio. Erros de autenticacao ou contrato nao
  sao contornados. O comando de diagnostico le as planilhas sem gravar snapshots.

- Executor GitHub Actions sem depender do computador. Disparo manual inicialmente
  sem publicacao; agenda desativada enquanto a variavel do repositorio
  `PANORAMA_CLOUD_ENABLED` nao for `true`.
- Coleta de SSOT, WhatsApp Oficial, RD e SendFlow em paralelo, em diretorio
  temporario isolado. Growth usa o SSOT do mesmo ciclo, depois da sua coleta.
- Data-alvo D-1 em America/Sao_Paulo. Publicacao bloqueada se uma fonte ativa ou
  um cruzamento Growth ativo estiver atrasado, com erro ou sem identificacao de coleta.
- Validacao do conteudo pelo mesmo contrato no executor e no navegador.
- Um pacote `panorama-release.json` para Growth e CRM. Pacotes invalidos nao
  substituem a versao em memoria. Os filtros permanecem na atualizacao.
- Deploy de producao sem trocar o dominio, conferencia dos arquivos por SHA-256,
  conferencia do pacote e promocao somente depois dessas validacoes.
- Comparacao com a versao de producao lida antes da coleta. Se uma troca de versao
  for detectada antes de publicar, a execucao e bloqueada para nao sobrescreve-la.
  Publicacoes manuais devem ser coordenadas com a rotina: a API nao oferece aqui
  uma troca condicional atomica entre essa conferencia e a promocao.
- Historico anterior parte da ultima versao publicada, nao de um checkout antigo.
- Fontes permanecem somente leitura. Escrita restrita ao candidato temporario e,
  quando autorizado/configurado, ao deploy do proprio painel.

## O que nao significa cobertura integral

Atualidade, integridade do lote e cobertura historica sao verificacoes diferentes.
O coletor preserva os contratos existentes: comercial pago desde 2025; detalhe
CRM relido nos ultimos 30 dias com historico anterior preservado; fontes Growth
com janela propria; RD usa a ultima coleta committed; SendFlow le as campanhas
existentes na planilha. Isso NAO reconstroi dados ausentes nem reconsulta toda a
origem RD/SendFlow diretamente. Nenhuma lacuna e preenchida com zero.

Criativo e criativo + produto continuam indisponiveis, sem serem fabricados para
liberar a agenda. Grupos e cruzamentos por IDs continuam parciais, sem sessoes
inventadas nem atribuicao causal de vendas. `historicalCoverageComplete` permanece
false; um lote publicado nao deve ser apresentado como historico homologado.

Um dia sem disparos exige evidencia de cobertura da coleta para ser distinguido
de coleta ausente. A data da ultima mensagem, sozinha, nao comprova isso.

## Dependencias externas ainda pendentes

Para reduzir os passos manuais, usar primeiro o modo de conferencia de
`scripts/setup_cloud_identity.py`, conforme
[configurar-identidade-nuvem.md](configurar-identidade-nuvem.md). A aplicacao de IAM
exige --apply e confirmacao do projeto. O script nao altera dados nem ativa agenda.
A conta e a federacao ja passaram no diagnostico autenticado pelo GitHub acima.
A coleta completa, os vinculos Growth e a entrega conjunta ainda nao passaram.

1. Conta de servico Google: BigQuery Job User no projeto reise-ssot e Data Viewer
   somente nos objetos necessarios dos datasets mart_growth_us e mart_shared,
   incluindo dependencias autorizadas das views. Sem Editor/Owner.
2. Compartilhar as planilhas auxiliares RD e SendFlow com essa identidade como
   Leitor; habilitar Sheets API e as APIs de autenticacao necessarias.
3. Workload Identity Federation Google/GitHub com impersonacao dessa conta,
   restrita ao repositorio e a branch main. Nao exportar login pessoal nem criar
   chave JSON. Revisar condicoes por IDs numericos do repositorio/proprietario.
4. Ambiente GitHub `panorama-data`, restrito a main. Variaveis:
   `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `PANORAMA_CATALOG_BUCKET`.
   Segredo `VERCEL_TOKEN` nesse ambiente, com o menor acesso de publicacao possivel.
   Nao colocar tokens no chat, codigo, artefatos ou no frontend.
5. Bucket privado com leitura da conta de servico para os arquivos
   `growth-bridge-meta-catalog.json` e `growth-bridge-google-catalog.json`.
   Cada arquivo precisa de start, end, rows e IDs conferidos de conta/campanha/grupo.
   Copiar os catalogos locais nao resolve a renovacao: terminam em 29/10.
   Uma coleta independente ainda precisa renova-los; e proibido apenas avancar end.
6. Alimentacao da base SendFlow e evidencia de cobertura dos dias sem disparos.
   A leitura local de 03/11 as 13:08 encontrou SendFlow ate 30/09 e WhatsApp com
   ocorrencias ate 02/11. RD tinha coleta de 03/11 com janela ate 02/11.
   Esses estados podem mudar; atualidade nao comprova historico completo.

## Ativacao, somente depois dessas dependencias

1. Revisar e versionar o codigo aprovado, excluindo _legacy, .local, arquivos
   temporarios e credenciais. O checkout local tem outras alteracoes anteriores.
2. Publicar o workflow no GitHub. Ele nao esta ativo apenas por existir localmente.
3. Executar manualmente com publish=false e conferir os resultados das cinco fontes.
4. Executar manualmente com publish=true; conferir o site e os dados publicados.
5. Somente depois habilitar `PANORAMA_CLOUD_ENABLED=true` como variavel do repositorio.
   Agenda prevista: 08:17, 12:17, 16:17 e 20:17 de Brasilia. GitHub pode atrasar
   execucoes; isso nao e garantia de horario exato nem sincronizacao instantanea
   entre bancos de provedores diferentes. Conferir notificacoes de workflows com falha.
6. Desativar a tarefa Windows apenas depois de validar a substituicao em nuvem.

## Verificacao local

```powershell
.venv\Scripts\python.exe -m unittest discover -s scripts -p test_cloud_refresh.py
.venv\Scripts\python.exe -m unittest discover -s scripts -p 'test_refresh*.py'
.venv\Scripts\python.exe -m unittest discover -s scripts -p 'test_growth*.py'
node scripts/test_release_data.cjs
node scripts/check_cloud_release_ui.cjs
```

O teste de navegador intercepta somente as respostas da sessao de teste, usando
metricas existentes e metadados de publicacao simulados. Nao grava nos snapshots,
nao coleta nas origens, nao publica e nao comprova uma execucao autenticada de nuvem.
Capturas ficam em output/cloud-release; nao devem ser apresentadas como atualizacao real.

`scripts/cloud_refresh.py --check-only` apenas informa bloqueios locais. Codigo de
saida 1 significa que o lote nao pode ser publicado; nao e autorizacao para remover
as validacoes. Sem configuracao Google/GitHub, a migracao permanece pendente.
