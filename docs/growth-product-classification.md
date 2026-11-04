# Growth: linhas e tipos de produto

Classificacao local pelo nome preservado do SSOT, nao um cadastro oficial.
Nao escreve no BigQuery, nao altera metricas e nao interpreta ausencia como zero.

## Regras

- Precedencia: GT, Avant, Phantom, Knit, 911, Macan, RS; depois nomes adicionais.
- RS8 Avant pertence a Avant; RS7 GT pertence a GT; Phantom Knit pertence a Phantom.
- 911 Carrera pertence a 911; 911 GT pertence a GT.
- Nomes adicionais explicitos: Munich, NYC, Workplace, Manhattan, entre outros
  enumerados em NAMED_PRODUCT_LINES. Nao inferir a linha de um kit por seus possiveis componentes.
- Tipos adicionais identificados: vestuario, perfumes, kits e chinelos.
  Nao classificar roupas como acessorios apenas para preencher uma categoria.
- Sem linha no nome: a fonte nao permite identificar uma linha com essas regras.
  Isto nao comprova que o produto nao pertence a uma linha no cadastro comercial.
- Produtos novos sem correspondencia permanecem nas visoes de produtos e totais
  gerais. As visoes Linha e Canal + linha, incluindo selecoes A/B de linhas,
  mostram somente produtos com linha identificada.

## Auditoria de 04/11/2026

Base publicada: lote 2026-11-04T13:23:56.776372-03:00.
Escopo: todos os dias carregados, canais pagos Growth, nomes distintos de produtos.
137 nomes encontrados; 55 estavam sem linha reconhecida. As regras adicionais
identificam 42 deles. Restam 13 sem linha explicita, e nenhum sem tipo reconhecido.
O resultado e especifico deste lote, nao uma garantia sobre novos produtos.

Gerar o relatorio detalhado:

```powershell
node scripts/audit_product_classification.cjs caminho/ssot-growth-views.json
```

O arquivo output/product-taxonomy/classification-audit.json registra nomes, IDs,
canais e classificacoes. Nas visoes Linha e Canal + linha, abrir o contador de
produtos mostra a composicao do recorte atual, ou do comparado quando nao ha atual.

## Limites de agregacao

Pedidos somados por produto nao sao pedidos unicos da linha. Conversao e a razao
das somas no mesmo recorte, nunca a media simples de taxas. Valores sem base
completa permanecem nao calculaveis. A media historica respeita canais e filtros.
