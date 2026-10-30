# Atualizacao unificada

`scripts/refresh_all_data.py` e a unica entrada de coleta do Panorama local.
Executar com `.venv\Scripts\python.exe scripts\refresh_all_data.py`.

## Fontes

| Fonte | Leitura | Saida local |
| --- | --- | --- |
| Comercial SSOT | SELECT canonico, historico pago completo e ultimos 30 dias de CRM | ssot-commercial-channels.json |
| Growth | SELECT de campanhas, produto/canal e UTM; canal canonico | ssot-growth-views.json |
| WhatsApp Oficial | CSV da planilha original, sem copiar mensagens | crm-whatsapp-snapshot.json |
| RD | Ultima coleta committed da planilha auxiliar, conta 832517 | crm-rd-snapshot.json |
| SendFlow | Todas as campanhas existentes nas tres abas, sem conteudo pessoal | crm-sendflow-snapshot.json |

Pedidos, receita, sessoes e conversao comercial continuam exclusivamente no SSOT.
Ativacao operacional nao substitui essas metricas. Campos ausentes continuam null.
Datas Sheets em formato serial sao convertidas somente nos campos de data.
A planilha WhatsApp usa datas sem ano: o ultimo bloco e ancorado em 2026,
com viradas de ano anteriores preservadas. Revisar essa ancora quando a fonte
mudar de ano ou passar a fornecer datas completas.

## Estado e falhas

`data/data-refresh-status.json` registra tentativa, ultimo sucesso, data dos
dados e erro por fonte. `current` significa leitura ate D-1, nao cobertura
historica integral. A cobertura e registrada separadamente. Uma fonte com falha
nao impede as demais, e sua ultima versao valida permanece disponivel.
Publicacao de cada snapshot e atomica. Um lock do sistema impede duas coletas
unificadas simultaneas. Nenhum token e gravado em arquivos publicos.

Growth preserva a ultima leitura por visao, incluindo o cache do bridge existente
na migracao. Cruzamentos de produto sem fonte validada permanecem pendentes;
grupo/anuncio UTM nao ganham sessoes artificiais. As consultas usam dry-run,
limite de bytes e timeout. O historico comercial pago e relido desde 2025;
o historico de CRM anterior a 30 dias e preservado.

Campanha e canal/produto apresentam uma janela movel de 120 dias. Quando a
mesma fonte retorna os 120 dias consecutivos ate D-1, preservamos apenas o
prefixo anterior a essa janela no snapshot, com metadados de historico.
O periodo sobreposto e substituido pela leitura atual. Lacunas internas,
encolhimentos inesperados e mudancas de fonte continuam bloqueados.
As requisicoes operacionais usam 2 segundos para cada tentativa de conexao
e 30 segundos para leitura, evitando longas esperas por enderecos sem resposta.

## Localhost e agendamento

Iniciar `.venv\Scripts\python.exe scripts\serve_local.py --port 8020`.
O servidor escuta somente 127.0.0.1; o comando de coleta e fixo. O POST de
atualizacao exige Host local, Origin da mesma pagina e cabecalho proprio.
Somente index, assets e data sao servidos. Credenciais e scripts nao sao servidos.
O botao Atualizar base inicia as cinco fontes; a conclusao recarrega Growth e
CRM, preservando filtros personalizados e edicao em andamento.

`scripts/install_crm_refresh_task.ps1` substitui a acao da tarefa existente,
nao cria uma segunda rotina concorrente. Requer uma leitura validada de todas
as fontes; nao deve ser instalado enquanto houver erro de autenticacao.
Mantem 08h, 12h, 16h, 20h e logon, no fuso de Brasilia.

## Dependencias externas

- SSOT usa ADC apenas com cloud-platform. Sheets usa um cliente OAuth Desktop
  proprio da empresa e somente spreadsheets.readonly, com token privado separado
  em `.local/google-sheets-credentials.json`. Nao reutilizar o cliente OAuth do
  Google Cloud SDK para pedir permissoes Sheets: isso pode bloquear o login.
  Preparar o cliente real no Google Auth Platform, com consentimento adequado
  (interno somente se aplicavel a organizacao), Sheets API habilitada e conta
  autorizada. Nao desativar protecoes nem tornar planilhas publicas.
  Executar `scripts/google_sheets_auth.py --client-file CAMINHO_DO_JSON` com
  Python do projeto. O helper valida leitura das duas planilhas antes de gravar
  a credencial. Nao altera ADC nem os dados das planilhas. Nao colar segredos no chat.
  Renovacao pode ser exigida pela conta; nao ha garantia de execucao desassistida
  com uma sessao pessoal. Nunca exportar credenciais para o frontend ou Vercel.
  Documentacao: https://docs.cloud.google.com/docs/authentication/application-default-credentials
  e https://developers.google.com/workspace/sheets/api/scopes
- Ler uma planilha nao coleta dados novos do RD ou SendFlow. O processo de
  origem precisa alimentar a planilha antes do painel. Uma coleta antiga gera
  status de atraso, mesmo se a leitura HTTP ocorreu agora.
- A base SendFlow verificada em 29/10/2026 continha somente setembro. A planilha
  RD ja tinha uma coleta committed de 29/10 cobrindo ate 28/10. Nenhuma fonte foi
  alterada para corrigir essas diferencas.
- O artefato semanal e referencia fixa de metas, nao uma fonte de realizado.
- Este servidor e agendamento sao locais. Producao necessita uma identidade de
  servico com permissoes minimas e armazenamento/rotina no servidor. O botao
  publicado apenas rele as bases publicadas enquanto isso nao for configurado.
  Nenhum deploy faz parte desta alteracao.

## Verificacao

`python -m unittest discover -s scripts -p 'test_refresh*.py'`

`node scripts/check_general_refresh_ui.cjs`

Testes simulados comprovam controle de falhas, contratos e integracao de UI;
nao substituem uma coleta autenticada bem-sucedida das cinco fontes.
