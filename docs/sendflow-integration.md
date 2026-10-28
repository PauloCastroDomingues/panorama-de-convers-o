# SendFlow para CRM

## Estado atual

O snapshot local foi extraido em modo somente leitura da planilha `1OcM3LBfMUnToMbLKXtZfgB_3CAux4om7rQ1iLSSEHXc`.
Escopo: campanha `8TVmVDvdGL3OWrTYv9xx`, setembro/2026; 90 acoes, 197 mensagens e 30 datas.
Nao e a conta inteira nem uma coleta atual de outubro. Nenhuma fonte foi alterada.

`data/crm-sendflow-snapshot.json` contem apenas IDs operacionais, datas e contagens.
Conteudo de mensagens, URLs, JSON bruto e segmentacao inferida nao entram no frontend.
`assets/crm-sendflow.js` valida chaves e reconciliacao e agrega cada tabela em seu proprio grao.
SSOT do canal e ativacao da campanha aparecem separados. A taxa comercial exige todos os dias com pedidos e sessoes compativeis.
Para E-mail, WhatsApp Oficial e WhatsApp Organico, o SSOT e a fonte primaria de sessoes, pedidos, receita e conversao. Fontes operacionais podem estar sem lancamentos ou fora da cobertura sem apagar esses indicadores comerciais. O cruzamento e por canal canonico e periodo; mensagem, campanha e grupo exigem atribuicao adicional validada. Pedidos e receita podem ser comparados quando completos, mesmo se a cobertura de sessoes impedir a taxa. O resumo tambem respeita essa cobertura e nao recalcula taxa sobre subtotais parciais.
Na verificacao local, a ponte growth retorna origens sem uma classificacao validada de WhatsApp Organico. Para esse canal, o adaptador conserva a fonte SSOT consolidada existente, identifica-a como snapshot e mostra sua data. Setembro tem pedidos em 30/30 dias, mas sessoes conhecidas em apenas 16/30 dias; portanto, a taxa mensal nao e calculada.

## Fluxo completo

1. SendFlow para Sheets: o coletor conectado ao MCP consulta acoes e recibos e atualiza a base auxiliar. Esta etapa ainda nao esta agendada.
2. Sheets para projeto: um Apps Script separado le somente colunas permitidas. Um endpoint no servidor guarda a credencial e valida o contrato.
3. Projeto para analise: o navegador recebe JSON sanitizado. Filtros e comparacoes sao locais e nao disparam consultas ao SendFlow.

## Ativar a leitura da planilha depois da revisao local

- Criar um projeto Apps Script separado. Nao substituir o `doGet` nem os arquivos da ponte SSOT.
- Usar o arquivo completo `scripts/SendFlowReadOnly.gs`. Ele apenas le a planilha e usa cache temporario; nao tem comandos de escrita nem gatilhos.
- Definir uma credencial longa e aleatoria na propriedade de script `SENDFLOW_SHEETS_READ_TOKEN` pelo proprio ambiente. Nao colocar a credencial em chat, git ou frontend.
- Rever autorizacoes e configuracao do Web App antes de implementar. A ponte exige token mesmo se o transporte do Web App for acessivel externamente.
- No servidor do projeto, definir `SENDFLOW_SHEETS_API_URL` com o endereco `/exec` dessa nova ponte e `SENDFLOW_SHEETS_READ_TOKEN` com a mesma credencial.
- O token protege a ponte, nao autentica os visitantes do painel. Antes de publicar dados CRM, definir controle de acesso do painel ou confirmar explicitamente o publico autorizado; a rota do projeto entrega os indicadores a quem puder acessa-la.
- Somente depois de testar a rota autenticada servidor-ponte, configurar `endpoint` como `/api/crm-sendflow` em `data/crm-sendflow-config.json`.
- Sem as variaveis ou se a ponte falhar, o projeto mantem o snapshot validado e sua data. Isso nao e uma atualizacao ao vivo.
- O servidor Python estatico nao executa a pasta `api`; a validacao da ponte exige ambiente serverless ou harness Node. Nenhuma implementacao na Vercel foi feita nesta etapa.

A ponte fornecida esta restrita a campanha e planilha acima. Outras campanhas e meses exigem consolidar a fonte e validar a cobertura antes de ampliar essa configuracao.

## Agendamento e cobertura

Primeiro validar a integracao e resolver lacunas criticas; depois configurar a coleta diaria as 8h em America/Sao_Paulo.
Ler a planilha automaticamente nao atualiza o SendFlow para Sheets: sao duas etapas independentes.
O coletor deve preservar historico de observacoes, deduplicar por release/acao/indice de mensagem e carimbo de observacao e respeitar os limites do conector.
Para reavaliacoes, usar apenas a ultima observacao de cada mensagem no snapshot consolidado, sem somar fotografias.
Extracoes parciais nao podem substituir a ultima versao completa.

## Limites de interpretacao

- Leituras acumuladas por data de envio nao sao leituras ocorridas naquele dia.
- Ha 194 mensagens com leituras maiores que entregas. Nao calcular um funil entre esses dois contadores sem esclarecer a semantica.
- As 371 entradas sao subtotal em 24/30 dias; cliques estao ausentes em 30/30 dias. Ausencia nao vira zero.
- Participantes unicos, resultado por grupo, cliques unicos e vendas por mensagem nao foram comprovados.
- Nao copiar totais SSOT do canal para cada campanha ou mensagem.
- Comparacoes exigem cobertura nos dois periodos; recibos de coortes diferentes podem ter maturacoes diferentes.

## Verificacao

Executar `node scripts/test_crm_sendflow.cjs` e `node scripts/test_growth_comparisons.cjs`.
Revisar desktop, tablet e mobile no localhost antes de publicar.
