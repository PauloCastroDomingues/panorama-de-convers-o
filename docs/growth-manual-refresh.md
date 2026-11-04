# Atualizacao manual de Growth

O cabecalho mostra `generatedAt` da visao selecionada em America/Sao_Paulo.
Este horario e da coleta valida, nao do acesso ao painel nem do ultimo pedido.
Visoes preservadas continuam mostrando o horario antigo.

O botao solicita o escopo `growth`: SSOT comercial (dependencia de canais) e
Growth. RD, SendFlow e WhatsApp operacional nao sao coletados nem recebem nova
data de leitura. O coletor continua somente leitura no SSOT.

## Operacao sem chave

Por solicitacao do usuario, o botao nao pede senha ou chave. O token GitHub
continua exclusivamente no servidor. Qualquer visitante do painel pode pedir
uma coleta, sujeita a intervalo global minimo de 10 minutos entre tentativas.
Execucoes em andamento sao acompanhadas, sem iniciar outra. Durante o intervalo,
o painel apenas carrega o ultimo lote e informa quando sera permitida nova coleta.

O limite consulta o historico persistente do GitHub, inclusive falhas. Uma segunda
verificacao na fila serializada do workflow bloqueia disparos simultaneos antes
das consultas ao SSOT. Falha ao verificar o limite bloqueia a coleta. Validar a
origem da requisicao evita chamadas de outros sites no navegador, mas nao autentica
visitantes nem substitui controle de acesso; esta e uma escolha explicita do MVP.

## Validacao em producao sem chave

Publicado e validado em 04/11/2026. Um clique real iniciou a execucao
`41912009893`, concluida com sucesso, sem dialogo nem cabecalho de chave.
O painel carregou o lote `2026-11-04T18:01:38.135136-03:00` e mostrou
04/11/2026 as 18:01:55 (Brasilia). O recorte continua fechado em 03/11 (D-1).

Uma segunda solicitacao durante a coleta reutilizou a mesma execucao.
Apos a conclusao, outra solicitacao retornou `cooldown: true`, sem iniciar
coleta, com `Retry-After: 467`. RD, SendFlow e WhatsApp operacional mantiveram
os mesmos hashes e horarios de leitura/verificacao. Nenhum erro de navegador.
`PANORAMA_REFRESH_KEY` foi removida do ambiente Production do Vercel;
`PANORAMA_GITHUB_REFRESH_TOKEN` permanece somente no servidor.

## Historico da primeira ativacao

Ativado em 04/11/2026. O clique real no navegador iniciou a execucao
`41910062903`, concluida com sucesso. O painel carregou o lote
`2026-11-04T17:49:01.684441-03:00` e mostrou a ultima coleta de produtos em
04/11/2026 as 17:49:18 (Brasilia). O fechamento ocorreu as 17:49:19.

- `requestedSources`: somente `ssot` e `growth`.
- Canal, campanha e canal + produto: cobertura ate 03/11/2026 (D-1).
- Grupos e cruzamentos dependentes do catalogo continuam preservados ate
  29/10/2026, com a ressalva `growth_identity_catalog_missing`.
- RD, SendFlow e WhatsApp operacional: hashes dos arquivos, horarios de
  leitura bem-sucedida e horarios de verificacao permaneceram identicos.
- Na primeira versao, POST sem chave retornava HTTP 401. Essa exigencia foi
  substituida pelo controle de intervalo acima. A chave local nao e mais usada.

A primeira execucao (`41909446147`) foi bloqueada pelo contrato do lote, sem
publicar dados. A correcao inclui teste que sela um lote Growth com o contrato
real JavaScript e preserva as fontes nao consultadas. `acceptedSources` indica
fontes aprovadas para compor o pacote, inclusive fontes reutilizadas ainda
validas; nao significa que todas foram novamente consultadas.

## Configuracao para manutencao

1. Revisar e publicar as alteracoes do frontend, API e workflow no mesmo projeto.
2. No Vercel, guardar `PANORAMA_GITHUB_REFRESH_TOKEN` como segredo de servidor:
   token GitHub fine-grained limitado ao repositorio
   `PauloCastroDomingues/panorama-de-convers-o`, permissao Actions: write.
   Nao usar o token de publicacao Vercel nem enviar credenciais pelo chat.
3. `PANORAMA_REFRESH_KEY` nao e mais necessario. O token GitHub nunca vai ao navegador.
4. Fazer novo deploy para disponibilizar as variaveis. Validar um clique,
   a execucao Actions, a nova publicacao, a data da visao e o limite entre tentativas.

Referencia: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event

Sem configuracao, o botao informa que a coleta nao esta habilitada. Nunca
apresenta uma simples releitura como coleta bem-sucedida. Execucoes em curso
sao acompanhadas, sem disparar outra. A concorrencia do workflow serializa
publicacoes com a rotina agendada; cliques simultaneos de diferentes clientes
podem entrar na fila do GitHub. A coleta fecha em D-1, como a rotina existente:
o horario novo nao implica dados intradiarios nem corrige lacunas na origem.

No localhost com `scripts/serve_local.py`, a rota loopback executa o mesmo
escopo e depende da credencial local de leitura. Preview estatico nao coleta.
Testes simulados da API nao substituem a verificacao real registrada acima.
