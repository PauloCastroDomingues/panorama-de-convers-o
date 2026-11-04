# Atualizacao manual de Growth

O cabecalho mostra `generatedAt` da visao selecionada em America/Sao_Paulo.
Este horario e da coleta valida, nao do acesso ao painel nem do ultimo pedido.
Visoes preservadas continuam mostrando o horario antigo.

O botao solicita o escopo `growth`: SSOT comercial (dependencia de canais) e
Growth. RD, SendFlow e WhatsApp operacional nao sao coletados nem recebem nova
data de leitura. O coletor continua somente leitura no SSOT.

## Ativacao na nuvem (pendente)

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
Testes simulados da API nao comprovam uma coleta real nem ativam a nuvem.
