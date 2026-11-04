# Atualizacao manual de Growth

O cabecalho mostra `generatedAt` da visao selecionada em America/Sao_Paulo.
Este horario e da coleta valida, nao do acesso ao painel nem do ultimo pedido.
Visoes preservadas continuam mostrando o horario antigo.

O botao solicita o escopo `growth`: SSOT comercial (dependencia de canais) e
Growth. RD, SendFlow e WhatsApp operacional nao sao coletados nem recebem nova
data de leitura. O coletor continua somente leitura no SSOT.

## Validacao em producao

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
- POST sem chave: HTTP 401. Nenhuma credencial foi exibida no chat ou no Git.
- A chave do operador esta no arquivo privado do Windows
  `%LOCALAPPDATA%/ReisePanorama/growth-refresh-key.txt`, fora do OneDrive e do Git.

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
3. Guardar `PANORAMA_REFRESH_KEY` no Vercel: chave aleatoria longa, no minimo
   32 caracteres, compartilhada somente com os operadores autorizados do MVP.
   A chave e pedida em campo de senha e fica apenas na memoria da aba, nunca
   em localStorage, logs ou codigo. O token GitHub nunca vai ao navegador.
4. Fazer novo deploy para disponibilizar as variaveis. Validar um clique
   autorizado, a execucao Actions, a nova publicacao e a data da visao.

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
