# Atualizacao CRM

## Contrato

- Pedidos, receita, sessoes e conversao comercial: somente SSOT.
- RD, SendFlow e a planilha de WhatsApp Oficial: ativacao operacional, separada das vendas do canal.
- Todas as origens sao somente leitura. A coleta substitui apenas o JSON derivado deste projeto, nunca uma tabela ou planilha original.
- Fechamento esperado: D-1 em America/Sao_Paulo. O dia corrente nao e apresentado como um dia fechado.
- Atualidade de D-1 e cobertura historica sao medidas diferentes. Datas historicas ausentes continuam ausentes.

## Coleta Local SSOT

```powershell
.\.venv\Scripts\python.exe scripts/refresh_crm_ssot.py
```

Consulta parametrizada e somente SELECT na view oficial, com dry run e limite total de 768 MiB. Rele integralmente os ultimos 30 dias e preserva o historico anterior, sem somar versoes antigas e novas de um mesmo dia. Mantem a ponte de sessoes Google ja existente e nao atribui vendas por inferencia. Contrato, duplicidades, datas e cobertura sao validados antes de substituir o arquivo atomicamente. Falhas preservam a ultima extracao valida.

Saidas:
- `data/ssot-commercial-channels.json`: extracao comercial consumida pelo painel.
- `data/crm-refresh-status.json`: horario da tentativa, alvo D-1, ultima data, cobertura por canal/metrica e eventual codigo de erro. Nao contem credenciais.

## Agendamento Windows

Depois de uma coleta valida:

```powershell
powershell -NoProfile -File scripts/install_crm_refresh_task.ps1
powershell -NoProfile -File scripts/install_crm_refresh_task.ps1 -VerifyOnly
```

Tarefa `Reise-Panorama-CRM-SSOT-ReadOnly`: 08h, 12h, 16h e 20h de Brasilia e ao entrar no Windows. Retenta falhas tres vezes, a cada 15 minutos. Nao executa instancias simultaneas. Requer computador ligado, sessao do usuario e credenciais Google validas; uma autenticacao expirada gera erro no status, nao um arquivo vazio.

O instalador exige uma coleta atual confirmada nas ultimas 24h. O agendamento **nao publica arquivos e nao atualiza a Vercel**. Nao e uma rotina de nuvem.

## Leitura No Navegador

O CRM mostra o SSOT antes de aguardar as fontes operacionais. Busca a extracao sem cache, verifica novamente a cada cinco minutos enquanto a aba CRM estiver visivel e ao voltar para a janela, e oferece atualizacao manual. A leitura mais recente prevalece sobre respostas antigas do Growth. Erros de rede preservam o estado valido; filtros personalizados e campos em edicao nao sao descartados.

O indicador D-1 depende dos dados de cada canal, nao do horario de abertura da tela. Atualizar a leitura nao executa uma coleta no provedor.

## Producao E Provedores

Auditoria de 28/10/2026: o projeto Vercel `reise-team/panorama-de-conversao` nao possui variaveis de ambiente. As configuracoes RD e SendFlow estao sem endpoint. Portanto, nao ha ponte de producao nem coletor diario homologado para esses provedores neste projeto.

- RD: consulta direta MCP conferiu 72 campanhas ate 27/10; snapshot observado em 28/10. Cinco campanhas continuam com ressalvas; cobertura e contagens unicas nao homologadas.
- SendFlow: existem releases e envios de outubro, mas o snapshot consumido permanece o setembro validado. A existencia de mensagens recentes nao comprova completude diaria de todas as releases.
- SSOT: o agendamento acima atualiza o ambiente local. Para producao continua, falta um executor de nuvem com acesso somente leitura e um caminho de entrega ao painel.

As pontes operacionais ja preparadas em `scripts/RdAuxiliaryReadOnly.gs` e `scripts/SendFlowReadOnly.gs` precisam ser publicadas em projetos dedicados. Os tokens ficam somente no servidor. Configuracoes esperadas pelos handlers existentes:

- RD: `RD_SHEETS_API_URL`, `RD_SHEETS_READ_TOKEN`, `RD_ACCOUNT_ID`.
- SendFlow: `SENDFLOW_SHEETS_API_URL`, `SENDFLOW_SHEETS_READ_TOKEN`.

Antes de ativar os endpoints no frontend, validar resposta autenticada, contrato, data, falha com preservacao da ultima leitura e origem da coleta. Ler uma planilha automaticamente nao significa que RD ou SendFlow estejam preenchendo essa planilha automaticamente. Nao reutilizar credenciais pessoais ADC no frontend ou no Git.
