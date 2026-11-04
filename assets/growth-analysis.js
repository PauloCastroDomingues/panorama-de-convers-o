// Shared Growth scope and period comparison. CRM owns its own filters and data.
const entityState = {
  scope: "global",
  charts: false,
  a: { view: "channel", key: "Meta Ads 1", query: "" },
  b: { view: "channel", key: "Google ADS", query: "" },
};
let productCatalogCache = null;
let entityCatalogCache = new Map();
let analysisSearchTimer = null;
let productScopeCache = null;
const chartLayouts = new WeakMap();
VIEWS.forEach((view, index) => { view.number = String(index + 1).padStart(2, "0"); });

function productFilterActive() {
  return Boolean(state.selectedProduct || state.selectedProductType || state.selectedProductLine || state.selectedModel || state.selectedColor || state.selectedSize || state.productSearch);
}
function matchesProductFilter(row, exclude = "") {
  return (!state.selectedProduct || exclude === "productKey" || row.productKey === state.selectedProduct)
    && (!state.selectedProductType || exclude === "productType" || row.productType === state.selectedProductType)
    && (!state.selectedProductLine || exclude === "productLine" || row.productLine === state.selectedProductLine)
    && (!state.selectedModel || exclude === "productModel" || row.productModel === state.selectedModel)
    && (!state.selectedColor || exclude === "productColor" || row.productColor === state.selectedColor)
    && (!state.selectedSize || exclude === "productSize" || row.productSize === state.selectedSize)
    && (!state.productSearch || Boolean(state.selectedProduct) || fuzzyMatch(row.productName, state.productSearch));
}
function productCatalog() {
  if (productCatalogCache?.payload === state.growthPayload) return productCatalogCache.rows;
  const entries = new Map();
  normalizedViewRows("channel_product").filter(row => isAnalysisRow(row) && isMerchandiseProduct(row)).forEach((row) => {
    if (row.productKey && !entries.has(row.productKey)) entries.set(row.productKey, row);
  });
  const rows = [...entries.values()].sort((a, b) => a.productName.localeCompare(b.productName, "pt-BR"));
  productCatalogCache = { payload: state.growthPayload, rows };
  entityCatalogCache.clear();
  return rows;
}
function hasGrowthObservation(row) {
  return ['pedidos', 'sessoes', 'receita'].some(key => Number.isFinite(row[key]));
}
function inAnalysisWindows(row) { return inPeriod(row, 'current') || inPeriod(row, 'compare'); }
function contextualProductRows(exclude = '', includeChannel = true) {
  return normalizedViewRows('channel_product').filter(row => isAnalysisRow(row) && isMerchandiseProduct(row)
    && inAnalysisWindows(row) && hasGrowthObservation(row) && matchesProductFilter(row, exclude)
    && (!includeChannel || matchesSelectedChannel(row)));
}
function growthChannelLabel() {
  return CHANNEL_FILTERS.find(item => item.key === state.selectedChannel)?.label
    || PAID_CHANNEL_VIEWS.find(item => item.key === state.selectedChannel)?.label || 'Todos os canais pagos';
}
function channelFilterIssue(key, productGrain = productFilterActive() || VIEWS.find(v => v.key === state.selectedView)?.product) {
  if (!key || !productGrain) return '';
  const scope = CHANNEL_FILTERS.find(item => item.key === key) || PAID_CHANNEL_VIEWS.find(item => item.key === key);
  if (!scope) return 'Canal fora do catalogo SSOT.';
  const rows = contextualProductRows('', false);
  if (rows.some(row => scope.raw.includes(row.canal))) return '';
  if (['Meta Ads 1', 'Meta Ads 2'].includes(key) && rows.some(row => row.canal === 'Facebook (1 + 2)')) {
    return 'Produto disponivel em Meta consolidado; sem separacao entre Meta Ads 1 e 2.';
  }
  return 'Sem observacoes de produto para este canal nos periodos selecionados.';
}
function sourceKeyForView(key, inherit = true) {
  if (['product', 'line', 'channel_line'].includes(key)) return 'channel_product';
  return inherit && productFilterActive()
    ? ({ channel: 'channel_product', campaign: 'campaign_product', ad_group: 'ad_group_product', ad: 'ad_product' }[key] || key)
    : key;
}
function viewAvailability(key, inherit = true) {
  const source = sourceKeyForView(key, inherit);
  const rows = source === 'channel' ? state.rows : viewEntry(source)?.rows;
  if (!rows?.length && !viewEntry(source)?.rows?.length) {
    return { available: false, reason: readiness(source)?.reason || 'Sem fonte SSOT validada para este cruzamento.' };
  }
  const productGrain = VIEWS.find(view => view.key === key)?.product || (inherit && productFilterActive());
  const issue = inherit && productGrain ? channelFilterIssue(state.selectedChannel, true) : '';
  return { available: !issue, reason: issue, source };
}
function growthViewOptions(numbered = false, inherit = true) {
  return VIEWS.map(view => {
    const status = viewAvailability(view.key, inherit);
    return `<option value="${view.key}" ${status.available ? '' : 'disabled'} title="${escapeHtml(status.reason || view.title)}">${numbered ? view.number + ' - ' : ''}${view.short}${status.available ? '' : ' - indisponivel'}</option>`;
  }).join('');
}
function configureChannelOptions(select) {
  for (const option of select.options) {
    const issue = channelFilterIssue(option.value);
    option.disabled = Boolean(issue);
    option.title = issue;
  }
}
function analysisSourceRows(period) {
  if (!productFilterActive()) return channelSourceRows(period);
  if (period === 'compare' && state.compareEnabled === false) return [];
  const source = normalizedViewRows("channel_product");
  const key = JSON.stringify([state.start, state.end, state.compareStart, state.compareEnd, state.compareEnabled,
    state.selectedProduct, state.selectedProductType, state.selectedProductLine, state.selectedModel, state.selectedColor, state.selectedSize, state.productSearch]);
  if (productScopeCache?.source !== source || productScopeCache.key !== key) {
    const rows = source.filter((row) => isAnalysisRow(row) && isMerchandiseProduct(row) && matchesProductFilter(row));
    productScopeCache = { source, key, current: rows.filter((row) => inPeriod(row, 'current')), compare: rows.filter((row) => inPeriod(row, 'compare')) };
  }
  return productScopeCache[period];
}
function dimensions(view, row) {
  const line = productLineLabel(row.productLine || "Sem classificacao");
  if (view.key === 'line' || view.key === 'channel_line') {
    const channel = view.key === 'channel_line' ? displayChannel(row.canal) : '';
    return { dimension: [channel, line].filter(Boolean).join(' / '), channel, line, product: '', campaign: '', group: '', ad: '' };
  }
  const product = row.productName || row.productKey || "";
  const campaign = row.campaignName || row.campaignKey || "";
  const group = row.groupName || row.groupKey || "";
  const ad = row.adName || row.adKey || "";
  const names = { product, channel: displayChannel(row.canal), campaign, ad_group: group, ad };
  const dimension = names[view.key] || [displayChannel(row.canal), campaign, group, ad, product].filter(Boolean).join(" / ");
  return { dimension, channel: displayChannel(row.canal), campaign, group, ad, product };
}
function filtersForProducts() {
  const catalog = productCatalog();
  const configs = [
    ["product-type-filter", "selectedProductType", "Todos os tipos", "productType"],
    ["product-line-filter", "selectedProductLine", "Todas as linhas", "productLine"],
    ["product-filter", "selectedProduct", "Todos os produtos", "productKey"],
    ["product-model-filter", "selectedModel", "Todos os modelos", "productModel"],
    ["product-color-filter", "selectedColor", "Todas as cores", "productColor"],
    ["product-size-filter", "selectedSize", "Todos os tamanhos", "productSize"],
  ];
  configs.forEach(([id, stateKey, empty, field]) => {
    const select = $(`#${id}`);
    if (!select) return;
    const choices = new Map();
    contextualProductRows(field).forEach((row) => {
      const value = row[field];
      if (value && value !== "Nao informado") choices.set(value, productFilterLabel(field === "productKey" ? row.productName : value));
    });
    const selected = state[stateKey];
    const original = catalog.find(row => row[field] === selected);
    const missingSelection = selected && !choices.has(selected);
    const emptyLabel = !choices.size && field === 'productSize' ? 'Sem tamanho na fonte' : empty;
    const taxonomy = field === 'productType' ? PRODUCT_TYPES : field === 'productLine' ? PRODUCT_LINES : null;
    select.innerHTML = taxonomy
      ? `<option value="">${emptyLabel}</option>${taxonomy.map(value => `<option value="${value}" ${choices.has(value) ? '' : 'disabled'}>${field === 'productLine' ? productLineLabel(value) : value}${choices.has(value) ? '' : ' - sem registros no recorte'}</option>`).join('')}`
      : `<option value="">${emptyLabel}</option>${missingSelection ? `<option value="${escapeHtml(selected)}" disabled>${escapeHtml(field === 'productKey' ? original?.productName || selected : selected)} - fora do recorte</option>` : ''}${[...choices].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}`;
    select.value = selected;
    select.onchange = () => {
      state[stateKey] = select.value;
      if (field === "productKey") { state.selectedModel = ""; state.selectedColor = ""; state.selectedSize = ""; }
      renderAll();
    };
    select.disabled = !choices.size && !selected;
    const label = document.querySelector(`label[for="${id}"]`);
    const rawRows = viewEntry('channel_product')?.rows || [];
    if (label && ['productModel', 'productColor'].includes(field)) {
      const explicit = field === 'productModel' ? ['model', 'modelo', 'product_model'] : ['color', 'cor'];
      const inferred = rawRows.length && rawRows.some(row => !explicit.some(key => row[key]));
      label.textContent = `${field === 'productModel' ? 'Modelo' : 'Cor'}${inferred ? ' (nome)' : ''}`;
      label.title = inferred ? 'Identificado pelo nome do produto; nao equivale a uma variante validada.' : '';
    }
  });
  const active = new Set(contextualProductRows().map(row => row.productKey));
  $("#active-product-filter").textContent = `${active.size} produtos no recorte`;
}
function withComparison(current, compare) {
  if (state.compareEnabled === false) compare = null;
  const base = current || { ...summarize([]), dimension: compare?.dimension || "", key: compare?.key || "" };
  const comparable = !base.provenance?.partialLinkage && !compare?.provenance?.partialLinkage
    && !base.periodGap && !compare?.periodGap;
  return { ...base, compare,
    comparisonPedidos: compare?.pedidos ?? null, comparisonSessoes: compare?.sessoes ?? null,
    comparisonReceita: compare?.receita ?? null, comparisonRate: compare?.rate ?? null,
    deltaPedidos: comparable ? relativeComparison(base.pedidos, compare?.pedidos) : null,
    deltaSessoes: comparable ? relativeComparison(base.sessoes, compare?.sessoes) : null,
    deltaReceita: comparable ? relativeComparison(base.receita, compare?.receita) : null, deltaRate: comparable ? delta(base, compare) : null,
  };
}
function viewPeriodGap(view, period, inherit = true) {
  if (period === 'compare' && state.compareEnabled === false) return '';
  const source = sourceKeyForView(view.key, inherit);
  const entry = viewEntry(source);
  const check = state.growthPayload?.refresh?.views?.find(item => item.id === source);
  const dates = [...(entry?.rows || []), ...(source === 'channel' ? state.rows : [])].map(row => row.data).filter(Boolean).sort();
  const declaredEnd = check?.coveredThrough || entry?.validatedWindow?.end;
  const end = source === 'channel' ? [declaredEnd, dates.at(-1)].filter(Boolean).sort().at(-1) : declaredEnd || dates.at(-1);
  const start = dates[0];
  const bounds = periodBounds(period);
  const notes = [];
  if (start && bounds.start < start) notes.push(`Historico carregado desde ${dayLabel(start)}`);
  if (end && bounds.end > end) notes.push(`Base carregada ate ${dayLabel(end)}; recorte termina em ${dayLabel(bounds.end)}`);
  return notes.join('. ');
}
function missingRecordContext(view, key, candidates, gap) {
  const source = sourceKeyForView(view.key);
  if (!viewEntry(source)?.rows?.length && !(source === 'channel' && state.rows.length)) return { label: 'Fonte indisponivel',
    detail: readiness(source)?.reason || 'A fonte deste cruzamento nao foi carregada.', action: 'Conferir disponibilidade da fonte' };
  const other = candidates.get(key) || [];
  if (other.length) {
    const channels = [...new Set(other.map(row => displayChannel(row.canal)))].join(', ');
    const available = [...new Set(other.map(row => row.canal))].map(channel => ({
      channel: displayChannel(channel), ...summarize(other.filter(row => row.canal === channel)) }));
    const unassigned = other.some(row => row.provenance?.methods?.some(method => /sem quebra real por canal/i.test(method)));
    return { label: state.selectedChannel ? 'Fora do canal selecionado' : 'Sem atribuicao paga',
      detail: `Ha registros em ${channels}, fora dos canais selecionados. ${unassigned ? 'O SSOT preservou valores em Outros por falta de quebra por canal. ' : ''}Isso nao comprova zero no recorte.`,
      action: 'Conferir atribuicao por canal', available };
  }
  if (gap) return { label: 'Periodo incompleto', detail: gap, action: 'Conferir atualizacao e cobertura' };
  return { label: 'Sem registros no recorte', detail: 'A fonte carregada nao retornou linhas para este item, periodo e filtros. Ausencia de linha nao comprova zero.',
    action: 'Conferir periodo e filtros' };
}
function recordsForDisplay(view) {
  const current = new Map(groups(view, "current").map((row) => [row.key, row]));
  const previous = new Map(groups(view, "compare").map((row) => [row.key, row]));
  const outside = { current: new Map(), compare: new Map() };
  normalizedViewRows(sourceKeyForView(view.key)).forEach(row => {
    if (!matchesViewLine(view.key, row)) return;
    if (isAnalysisRow(row) && matchesSelectedChannel(row)) return;
    if ((view.product || productFilterActive()) && (!isMerchandiseProduct(row) || !matchesProductFilter(row))) return;
    for (const period of ['current', 'compare']) {
      if (!inPeriod(row, period) || !hasGrowthObservation(row)) continue;
      const key = dimensionKey(view, row);
      if (!outside[period].has(key)) outside[period].set(key, []);
      outside[period].get(key).push(row);
    }
  });
  const gaps = { current: viewPeriodGap(view, 'current'), compare: viewPeriodGap(view, 'compare') };
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const records = [...keys].map((key) => {
    const decorate = (item, period, fallback) => ({ ...(item || { ...fallback, ...summarize([]) }),
      periodGap: gaps[period],
      missingContext: !item?.rows ? missingRecordContext(view, key, outside[period], gaps[period]) : null });
    const item = decorate(current.get(key), 'current', previous.get(key));
    const old = state.compareEnabled === false ? null : decorate(previous.get(key), 'compare', current.get(key));
    return withComparison(item, old);
  });
  return { records, official: true, sourceLabel: "SSOT" };
}
const CONVERSION_SIGNAL_BAND = 0.002;
function recordSemaphore(record) {
  if (record?.periodGap || record?.compare?.periodGap) return { tone: 'warn', label: 'Periodo incompleto', title: record.periodGap || record.compare.periodGap };
  if (record?.missingContext) return { tone: 'warn', label: record.missingContext.label, title: record.missingContext.detail };
  if (record?.provenance?.partialLinkage) return { tone: 'warn', label: 'Parcial por IDs', title: 'Pedidos identificados; cobertura de vinculos incompleta. Nao representa o total do canal.' };
  if (record?.rate == null) return { tone: "warn", label: "Validar base", title: "A conversao exige pedidos e visitas completos no mesmo recorte." };
  if (state.compareEnabled === false) return { tone: "neutral", label: "Atual", title: "Comparacao de periodos desligada." };
  const previous = record.compare;
  if (previous?.rate == null) return { tone: "neutral", label: "Sem historico", title: "Nao ha base comparavel para avaliar a variacao." };
  const change = record.rate - previous.rate;
  if (change >= CONVERSION_SIGNAL_BAND) return { tone: "good", label: "Avancou", title: "Conversao subiu pelo menos 0,20 p.p. no recorte; sinal descritivo, sem teste de significancia." };
  if (change <= -CONVERSION_SIGNAL_BAND) return { tone: "bad", label: "Recuou", title: "Conversao caiu pelo menos 0,20 p.p. no recorte; sinal descritivo, sem teste de significancia." };
  return { tone: "neutral", label: "Estavel", title: "Variacao de conversao inferior a 0,20 p.p." };
}
function nextIndicator(record) {
  if (record.periodGap || record.compare?.periodGap) return 'Conferir atualizacao e cobertura';
  if (record.missingContext) return record.missingContext.action;
  if (record.provenance?.partialLinkage) return 'Conferir cobertura dos vinculos';
  if (record.rate == null) return "Validar cobertura de visitas e pedidos";
  if (state.compareEnabled === false) return "Investigar produto, oferta e mix do canal";
  if (record.compare?.rate == null) return "Conferir cobertura do periodo anterior";
  const visits = relativeComparison(record.sessoes, record.compare.sessoes);
  const conversion = delta(record, record.compare);
  if (conversion < 0 && visits >= 0) return "Investigar carrinho, checkout e oferta";
  if (visits < 0 && conversion >= 0) return "Investigar alcance e entrada de trafego";
  if (visits < 0 && conversion < 0) return "Abrir canal, campanha e oferta";
  const ticket = record.pedidos > 0 ? record.receita / record.pedidos : null;
  const oldTicket = record.compare.pedidos > 0 ? record.compare.receita / record.compare.pedidos : null;
  if (ticket !== null && oldTicket !== null && ticket < oldTicket) return "Investigar ticket, mix e desconto";
  return "Avaliar investimento e margem antes de escalar";
}
function semaphoreMarkup(record) {
  const signal = recordSemaphore(record);
  return `<span class="semaphore ${signal.tone}" title="${escapeHtml(signal.title)}"><i></i>${signal.label}</span>`;
}
function metricComparisonCell(record, key) {
  const info = item => key === 'rate' ? provenanceMarkup(item, 'base da conversao') : '';
  const unavailable = (item, reason) => {
    const metric = { pedidos: 'Pedidos', sessoes: 'Visitas', receita: 'Receita', rate: 'Conversao' }[key] || key;
    const period = item === record.compare ? 'compare' : 'current';
    const bounds = periodBounds(period);
    const windowLabel = bounds.start && bounds.end ? `${dayLabel(bounds.start)} a ${dayLabel(bounds.end)}` : '';
    const note = [`${metric} / ${period === 'compare' ? 'Anterior' : 'Atual'}: ${windowLabel}.`,
      item?.periodGap, reason, item?.missingContext?.detail,
      key === 'rate' ? 'Conversao exige pedidos e visitas completos no mesmo recorte, com visitas maiores que zero.' : '',
      'Valor indisponivel nao significa zero. Valores anteriores nao substituem o periodo atual.'
    ].filter(Boolean).join('\n\n');
    return `<span class="metric-missing metric-unavailable"><span aria-hidden="true">&ndash;</span><button type="button" class="source-info" data-source-note="${escapeHtml(note)}" aria-label="${escapeHtml(metric + ': ' + reason)}" aria-haspopup="dialog" aria-expanded="false">${typeof CrmIcons === 'function' ? CrmIcons('Info') : 'i'}</button></span>`;
  };
  const outsideValues = item => key === 'rate' || item?.[key] != null ? []
    : (item?.missingContext?.available || []).filter(source => Number.isFinite(source[key]));
  const valueMarkup = (item) => {
    if (item?.[key] == null && item?.missingContext) {
      // Keep known values visible without attributing other channels to this filter.
      const available = outsideValues(item).map(source => {
        const previous = item === record && state.compareEnabled !== false ? record.compare : null;
        const note = [
          `${source.channel}: ${metricText(source[key], key)}. Valor fora do filtro; nao integra o total dos canais selecionados.`,
          item.missingContext.detail,
          item.periodGap,
          previous ? `Anterior nos canais selecionados: ${metricText(previous[key], key)}. Nao comparavel com este valor de ${source.channel}.` : '',
          previous?.periodGap
        ].filter(Boolean).join('\n');
        return `<span class="available-outside"><span class="outside-value">${metricText(source[key], key)}<button type="button" class="source-info" data-source-note="${escapeHtml(note)}" aria-label="Detalhes do valor em ${escapeHtml(source.channel)} fora do filtro" aria-haspopup="dialog" aria-expanded="false">${typeof CrmIcons === 'function' ? CrmIcons('Info') : 'i'}</button></span><small class="cell-note">${escapeHtml(source.channel)} &middot; fora do filtro</small></span>`;
      }).join('');
      return available || unavailable(item, item.periodGap ? 'Periodo incompleto' : item.missingContext.label);
    }
    if (item?.provenance?.partialLinkage && Number.isFinite(item?.[key])) {
      return `${metricText(item[key], key)}<small class="cell-note">Identificados / parcial</small>`;
    }
    if (key === 'rate' && item?.rate == null && Number.isFinite(item?.observedRate)) {
      const coverage = item.expectedDays ? `${item.observedDays}/${item.expectedDays} dias completos` : 'somente observacoes completas';
      return `${fmtPercent(item.observedRate)}<small class="cell-note">Parcial: ${coverage}</small>`;
    }
    if (key === 'rate' && item?.rate == null && item?.sessoes > 0) return unavailable(item, 'Base incompleta');
    if (item?.[key] == null) {
      const label = !item?.rows ? 'Sem registros no recorte' : key !== 'rate' ? 'Nao informado na fonte'
        : item.sessoes === 0 ? 'Sem visitas (base zero)' : item.sessoes == null ? 'Visitas nao informadas' : 'Pedidos nao informados';
      return unavailable(item, label);
    }
    return `${metricText(item[key], key)}${item.periodGap ? '<small class="cell-note">Parcial no periodo</small>' : ''}`;
  };
  // The previous filtered value belongs in the disclosure, not beside another scope.
  if (outsideValues(record).length) return `<div class="metric-pair"><strong>${valueMarkup(record)}</strong></div>`;
  if (state.compareEnabled === false) return `<strong>${valueMarkup(record)}${info(record)}</strong>`;
  const previous = record.compare?.[key] ?? null;
  const partial = record.provenance?.partialLinkage || record.compare?.provenance?.partialLinkage;
  const incompletePeriod = record.periodGap || record.compare?.periodGap;
  if (partial && record[key] == null && previous == null) return `<strong>${valueMarkup(record)}${info(record.provenance ? record : record.compare)}</strong>`;
  const change = partial || incompletePeriod || record.missingContext || record.compare?.missingContext
    ? ''
    : PerformanceDelta.markup(PerformanceDelta.describe(record[key], previous, { rate: key === 'rate' }));
  return `<div class="metric-pair"><strong>${valueMarkup(record)}${info(record)}</strong><small>Anterior: ${valueMarkup(record.compare)}${info(record.compare)}</small>${change}</div>`;
}
function comparisonLabel(current, previous, format = "number") {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "Fora da cobertura comparavel";
  if (format === "rate") return fmtPoints(current - previous);
  if (previous === 0) return current === 0 ? "Sem variacao" : "Base anterior zero";
  const change = current / previous - 1;
  return `${change >= 0 ? "+" : ""}${fmtPercent(change)}`;
}
function analysisScopeLabel() {
  if (!productFilterActive()) return "Canais pagos";
  const name = productCatalog().find((row) => row.productKey === state.selectedProduct)?.productName;
  return [state.selectedProductType && `Tipo: ${state.selectedProductType}`, state.selectedProductLine && `Linha: ${productLineLabel(state.selectedProductLine)}`,
    name || [state.selectedModel, state.selectedColor, state.selectedSize, state.productSearch].filter(Boolean).join(" / ")].filter(Boolean).join(" / ");
}
function renderSummary() {
  const totals = period => ({ ...summarize(selectedPaidRows(period)), periodGap: viewPeriodGap({key:'channel'}, period) });
  const total = withComparison(totals('current'), totals('compare'));
  const ids = { pedidos: "metric-orders", sessoes: "metric-sessions", receita: "metric-revenue", rate: "metric-rate" };
  Object.entries(ids).forEach(([key, id]) => {
    const node = $(`#${id}`); node.textContent = metricText(total[key], key);
    if (key === 'rate') node.insertAdjacentHTML('beforeend', provenanceMarkup(total, 'conversao do recorte'));
    let compare = node.parentElement.querySelector(".kpi-comparison");
    if (!compare) { compare = document.createElement("div"); compare.className = "kpi-comparison"; node.after(compare); }
    compare.hidden = state.compareEnabled === false;
    compare.innerHTML = compare.hidden ? '' : `<span>Anterior: ${metricText(total.compare?.[key], key)}${key === 'rate' ? provenanceMarkup(total.compare, 'periodo anterior') : ''}</span>${PerformanceDelta.markup(PerformanceDelta.describe(total[key], total.compare?.[key], { rate: key === 'rate', complete: !total.periodGap && !total.compare?.periodGap }))}`;
  });
  $("#metric-sessions").parentElement.firstElementChild.textContent = productFilterActive() ? "Visitas ao produto" : "Sessoes SSOT";
  $("#metric-orders").parentElement.firstElementChild.textContent = productFilterActive() ? "Pedidos por produto" : "Pedidos";
  $("#metric-sessions-note").textContent = total.periodGap || coverageLabel(total);
  $("#metric-rate-note").textContent = total.complete ? "Pedidos / visitas do mesmo recorte" : "Cobertura incompleta; validar a fonte";
  $("#summary-window").textContent = `${formatWindow()} / ${comparisonWindowLabel()}`;
  const productNote = productFilterActive() ? " Pedidos por produto nao sao pedidos unicos entre produtos." : "";
  $("#summary-status").innerHTML = `${semaphoreMarkup(total)}<span><strong>${escapeHtml(analysisScopeLabel())}</strong> / ${escapeHtml(nextIndicator(total))}.${productNote}</span>`;
}

// Compare elapsed days rather than pairing arrays: missing days must keep their place.
function pairedPeriods(rows, previousRows, granularity) {
  const bounds = { start: state.start, end: state.end };
  if (state.compareEnabled === false) return aggregatePeriods(rows, granularity, bounds).map((row) => withComparison(row, null));
  const offset = Math.round((toDate(state.start) - toDate(state.compareStart)) / 86400000);
  const current = new Map(aggregatePeriods(rows, granularity, bounds).map((row) => [row.key, row]));
  const projectedBounds = { start: state.start, end: shiftDate(state.compareEnd, offset) };
  const projected = previousRows.filter(row => row.data >= state.compareStart && row.data <= state.compareEnd)
    .map((row) => ({ ...row, data: shiftDate(row.data, offset), originalDate: row.data }));
  const originalBounds = new Map();
  projected.forEach((row) => {
    const key = periodBucket(row.data, granularity, row).key;
    const bounds = originalBounds.get(key);
    originalBounds.set(key, bounds ? [row.originalDate < bounds[0] ? row.originalDate : bounds[0], row.originalDate > bounds[1] ? row.originalDate : bounds[1]] : [row.originalDate, row.originalDate]);
  });
  const previous = new Map(aggregatePeriods(projected, granularity, projectedBounds).map((row) => {
    const bounds = originalBounds.get(row.key);
    return [row.key, { ...row, axisLabel: row.label, label: bounds ? `${dayLabel(bounds[0])} a ${dayLabel(bounds[1])}` : row.label }];
  }));
  const unequal = dateSpan(state.start, state.end) !== dateSpan(state.compareStart, state.compareEnd);
  return [...new Set([...current.keys(), ...previous.keys()])].sort().map((key, index) => {
    const currentPeriod = current.get(key);
    const previousPeriod = previous.get(key);
    const label = key > periodBucket(state.end, granularity).key
      ? `Comparado: ${previousPeriod?.label}` : previousPeriod?.axisLabel;
    const chartLabel = unequal ? ['day', 'day-over-day'].includes(granularity)
      ? `Dia ${Math.round((toDate(key) - toDate(state.start)) / 86400000) + 1}`
      : `${granularityLabel(granularity)} ${index + 1}` : null;
    return { ...withComparison(currentPeriod || { ...summarize([]), key, label }, previousPeriod || null), key, chartLabel };
  });
}
function chartSeriesKey(item) { return item.key || JSON.stringify([item.label, Boolean(item.dashed)]); }
function chartLegend(series, hidden) {
  const anyHidden = series.some(item => hidden.has(chartSeriesKey(item)));
  return `<div class="chart-legend" role="group" aria-label="Linhas do grafico">${series.map(item => {
    const key = chartSeriesKey(item); const checked = !hidden.has(key);
    return `<div class="chart-legend-item"><label class="chart-series-toggle ${checked ? '' : 'is-muted'}" title="${checked ? 'Ocultar' : 'Exibir'} ${escapeHtml(item.label)}"><input type="checkbox" data-chart-series="${escapeHtml(key)}" aria-label="Exibir ${escapeHtml(item.label)}" ${checked ? 'checked' : ''}><i aria-hidden="true" style="border-color:${item.color};border-top-style:${item.dashed ? 'dashed' : 'solid'}"></i><span>${escapeHtml(item.label)}</span></label>${provenanceMarkup({ provenance: summarizeProvenance(item.periods) }, item.label)}</div>`;
  }).join('')}<button type="button" class="chart-show-all" data-chart-show-all ${anyHidden ? '' : 'disabled'}>Mostrar todas</button></div>`;
}
function drawPeriodChart(box, series, metric) {
  let layout = chartLayouts.get(box);
  if (!layout) {
    layout = { hidden: new Set() }; chartLayouts.set(box, layout);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (layout.series && box.clientWidth > 0 && box.clientWidth !== layout.width) drawPeriodChart(box, layout.series, layout.metric);
      });
      observer.observe(box);
    }
  }
  Object.assign(layout, { series, metric, width: box.clientWidth });
  box.onchange = event => {
    if (!event.target.matches?.('input[data-chart-series]')) return;
    const key = event.target.dataset.chartSeries;
    if (event.target.checked) layout.hidden.delete(key); else layout.hidden.add(key);
    drawPeriodChart(box, layout.series, layout.metric);
    [...(box.querySelectorAll?.('input[data-chart-series]') || [])].find(node => node.dataset.chartSeries === key)?.focus({ preventScroll: true });
  };
  box.onclick = event => {
    if (!event.target.closest?.('[data-chart-show-all]')) return;
    layout.hidden.clear();
    drawPeriodChart(box, layout.series, layout.metric);
    box.querySelector?.('input[data-chart-series]')?.focus({ preventScroll: true });
  };
  const visible = series.filter(item => !layout.hidden.has(chartSeriesKey(item)));
  const legend = chartLegend(series, layout.hidden);
  const axis = [...new Set(series.flatMap((item) => item.periods.map((period) => period.key)))].sort();
  const labels = new Map();
  // Current periods define the shared axis; original comparison dates stay in the tooltip.
  series.forEach((item) => item.periods.forEach((period) => { if (!labels.has(period.key)) labels.set(period.key, period.chartLabel || period.label); }));
  const known = series.flatMap((item) => item.periods.map((period) => metricValue(period, metric))).filter(Number.isFinite);
  if (!visible.length || !axis.length || !known.length || !visible.some(item => item.periods.some(period => Number.isFinite(metricValue(period, metric))))) {
    box.innerHTML = legend + `<div class="empty-state chart-series-empty" role="status">${series.length && !visible.length ? 'Nenhuma linha selecionada.' : 'Sem base valida para este indicador no recorte.'}</div>`;
    return;
  }
  const width = Math.max(box.clientWidth, 300); const height = 280;
  const margin = { left: width < 600 ? 56 : 76, right: 24, top: 20, bottom: 42 };
  const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom;
  const max = chartMax(metric, known);
  const x = (i) => margin.left + (axis.length === 1 ? plotWidth / 2 : i / (axis.length - 1) * plotWidth);
  const y = (value) => margin.top + plotHeight - value / max * plotHeight;
  const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metricLabel(metric) + ': ' + visible.map(item => item.label).join('; '))}">`];
  for (let tick = 0; tick <= 4; tick++) {
    const value = max / 4 * tick;
    svg.push(`<line x1="${margin.left}" y1="${y(value)}" x2="${width - margin.right}" y2="${y(value)}" stroke="var(--line)"/><text x="${margin.left - 10}" y="${y(value) + 4}" text-anchor="end" fill="var(--muted)" font-size="10">${escapeHtml(metricText(value, metric))}</text>`);
  }
  const interval = Math.max(1, Math.ceil(axis.length / (width < 600 ? 4 : 7)));
  axis.forEach((key, i) => { if (i % interval === 0 && axis.length - 1 - i >= interval || i === axis.length - 1) svg.push(`<text x="${x(i)}" y="${height - 12}" text-anchor="${axis.length === 1 ? 'middle' : i === 0 ? 'start' : i === axis.length - 1 ? 'end' : 'middle'}" fill="var(--muted)" font-size="10">${escapeHtml(labels.get(key))}</text>`); });
  visible.forEach((item) => {
    const values = new Map(item.periods.map((period) => [period.key, period]));
    let path = ""; let connected = false;
    axis.forEach((key, i) => {
      const period = values.get(key); const value = period?.[metric];
      if (!Number.isFinite(value)) { connected = false; return; }
      path += `${connected ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)} `; connected = true;
      svg.push(`<circle cx="${x(i)}" cy="${y(value)}" r="3" fill="${item.dashed ? 'var(--bg)' : item.color}" stroke="${item.color}" stroke-width="1.5"><title>${escapeHtml(item.label)} / ${escapeHtml(period.label)} / ${escapeHtml(metricText(value, metric))}</title></circle>`);
    });
    svg.push(`<path data-series="${item.dashed ? 'comparison' : 'current'}" d="${path}" fill="none" stroke="${item.color}" stroke-width="2" ${item.dashed ? 'stroke-dasharray="6 5" opacity=".72"' : ''}/>`);
  });
  svg.push("</svg>");
  box.innerHTML = legend + svg.join("");
  window.ReiseCharts?.prepare(box);
}
function periodSeries(pairs, label, color, identity = label) {
  const currentKey = JSON.stringify([identity, 'current']);
  if (state.compareEnabled === false) return [{ key: currentKey, label, color, periods: pairs }];
  return [
    { key: currentKey, label: `${label} / Atual`, color, periods: pairs },
    { key: JSON.stringify([identity, 'comparison']), label: `${label} / Comparado`, color, dashed: true, periods: pairs.map((row) => ({ ...summarize([]), ...row.compare, key: row.key, chartLabel: row.chartLabel })) },
  ];
}
function clearPeriodChart(box, message) {
  const layout = chartLayouts.get(box);
  if (layout) layout.series = null;
  box.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}
function renderRhythmChart(periods) { drawPeriodChart($("#rhythm-chart"), periodSeries(periods, metricLabel(state.rhythmMetric), COLORS[0], 'rhythm'), state.rhythmMetric); }
function renderMiniPeriod(id, item, metric) {
  $(`#${id}-label`).textContent = item?.label || "Fora da cobertura";
  $(`#${id}-value`).textContent = metricText(item?.[metric] ?? null, metric);
  $(`#${id}-note`).innerHTML = state.compareEnabled === false ? '' : item ? `<span>Comparado: ${escapeHtml(item.compare?.label || 'Fora da cobertura')}</span><span>Anterior: ${metricText(item.compare?.[metric] ?? null, metric)}</span> ${PerformanceDelta.markup(PerformanceDelta.describe(item[metric], item.compare?.[metric], { rate: metric === 'rate' }))}` : "Sem observacao na fonte";
}
function tableSortHeader(label, key, target, active, direction) {
  return `<th scope="col" aria-sort="${active === key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}"><button type="button" class="table-sort ${active === key ? 'active' : ''}" data-${target}-sort="${key}">${label}<span aria-hidden="true">${active === key ? direction === 'asc' ? '&#8593;' : '&#8595;' : '&#8597;'}</span></button></th>`;
}
function bindTableSort(target, render) {
  document.querySelectorAll(`[data-${target}-sort]`).forEach((button) => {
    button.onclick = () => {
      const key = button.getAttribute(`data-${target}-sort`);
      const sortKey = `${target}Sort`; const directionKey = `${target}SortDirection`;
      state[directionKey] = state[sortKey] === key && state[directionKey] === "desc" ? "asc" : "desc";
      state[sortKey] = key; render();
    };
  });
}
function metricHeaders(target) {
  return [[productFilterActive() ? "Pedidos por produto" : "Pedidos", "pedidos"], [productFilterActive() ? "Visitas ao produto" : "Visitas", "sessoes"], ["Receita", "receita"], ["Conversao", "rate"]]
    .map(([label, key]) => tableSortHeader(label, key, target, state[`${target}Sort`], state[`${target}SortDirection`])).join("");
}
function conversionCoverageMarkup(pairs, rows, previousRows) {
  const currentCount = pairs.filter((row) => Number.isFinite(row.rate)).length;
  const comparisonCount = pairs.filter((row) => Number.isFinite(row.compare?.rate)).length;
  if (!pairs.length || (currentCount === pairs.length && (state.compareEnabled === false || comparisonCount === pairs.length))) return '';
  const scopes = [['Atual', rows]];
  if (state.compareEnabled !== false) scopes.push(['Comparacao', previousRows]);
  const gaps = scopes.flatMap(([label, source]) => {
    const channels = new Map();
    source.forEach((row) => {
      const channel = row.canal || 'Canal nao identificado';
      if (!channels.has(channel)) channels.set(channel, { sessoes: new Set(), pedidos: new Set() });
      ['sessoes', 'pedidos'].forEach((metric) => {
        if (!Number.isFinite(row[metric])) channels.get(channel)[metric].add(row.data);
      });
    });
    return [...channels].flatMap(([channel, metrics]) => {
      const missing = Object.entries(metrics).filter(([, dates]) => dates.size)
        .map(([metric, dates]) => `${dates.size} dia(s) sem ${metric}`);
      return missing.length ? [`<li><strong>${escapeHtml(label)} / ${escapeHtml(channel)}</strong>: ${missing.join('; ')}.</li>`] : [];
    });
  });
  const comparison = state.compareEnabled === false ? '' : ` Comparacao: ${comparisonCount} de ${pairs.length}.`;
  const status = currentCount === pairs.length ? 'Base atual completa.' : 'Conversao do recorte indisponivel: base incompleta.';
  return `<details><summary>${status} Periodos com taxa valida: ${currentCount} de ${pairs.length}.${comparison}</summary><ul>${gaps.join('')}</ul><p>Taxa = soma dos pedidos / soma das sessoes do mesmo recorte. Ausencias nao equivalem a zero; sessoes zeradas tambem impedem o calculo. O historico precisa de validacao na origem SSOT.</p></details>`;
}
function renderRhythm() {
  $('#ritmo .rhythm-grid').classList.toggle('is-entity', Boolean(entityState.charts));
  if (entityState.charts) { renderEntityRhythm(); return; }
  const rows = selectedPaidRows("current"); const previous = selectedPaidRows("compare");
  const pairs = pairedPeriods(rows, previous, state.selectedGranularity);
  renderRhythmChart(pairs);
  const coverage = $("#rhythm-coverage");
  coverage.innerHTML = state.rhythmMetric === 'rate' ? conversionCoverageMarkup(pairs, rows, previous) : '';
  coverage.hidden = !coverage.innerHTML;
  $("#rhythm-window").innerHTML = `<span>${escapeHtml(formatWindow())}</span><span>${escapeHtml(comparisonWindowLabel())}</span>`;
  $("#ritmo thead tr").innerHTML = `${tableSortHeader("Periodo", "key", "rhythm", state.rhythmSort, state.rhythmSortDirection)}${metricHeaders("rhythm")}<th>Sinal</th><th>Proximo indicador</th>`;
  const sorted = sortRecords(pairs.map((row) => ({ ...row, dimension: row.label })), state.rhythmSort, state.rhythmSortDirection);
  $("#rhythm-body").innerHTML = sorted.length ? sorted.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong>${state.compareEnabled === false ? '' : `<small class="cell-note">Comparado: ${escapeHtml(row.compare?.label || 'Fora da cobertura')}</small>`}</td>${['pedidos','sessoes','receita','rate'].map((key) => `<td>${metricComparisonCell(row, key)}</td>`).join("")}<td>${semaphoreMarkup(row)}</td><td>${escapeHtml(nextIndicator(row))}</td></tr>`).join("") : '<tr><td colspan="7" class="table-empty">Nao ha observacoes para o recorte selecionado.</td></tr>';
  bindTableSort("rhythm", renderRhythm);
  [["last-day", "day"], ["last-week", "week"], ["last-month", "month"]].forEach(([id, granularity]) => renderMiniPeriod(id, pairedPeriods(rows, previous, granularity).filter((row) => row.rows > 0).at(-1), state.rhythmMetric));
}
function renderChannelTable() {
  const previous = new Map(allChannelGroups("compare").map((row) => [row.key, row]));
  const rows = allChannelGroups("current").map((row) => withComparison(row, previous.get(row.key)));
  $("#channel-window").textContent = `${formatWindow()} / ${comparisonWindowLabel()}`;
  $("#channel-status").textContent = `${rows.filter((row) => row.pedidos !== null).length} canais com observacoes`;
  $("#canais thead tr").innerHTML = `<th>Canal</th>${metricHeaders("channel")}<th>Sinal</th><th>Proximo indicador</th>`;
  $("#channel-body").innerHTML = rows.length ? sortRecords(rows, state.channelSort, state.channelSortDirection).map((row) => {
    const issue = channelFilterIssue(row.key);
    return `<tr><td><button type="button" class="channel-link channel-open" data-channel="${escapeHtml(row.key)}" ${issue ? `disabled title="${escapeHtml(issue)}"` : ''}>${escapeHtml(row.dimension)}</button></td>${['pedidos','sessoes','receita','rate'].map((key) => `<td>${metricComparisonCell(row, key)}</td>`).join("")}<td>${semaphoreMarkup(row)}</td><td>${escapeHtml(nextIndicator(row))}</td></tr>`;
  }).join("") : '<tr><td colspan="7" class="table-empty">Sem observacoes para os filtros selecionados.</td></tr>';
  bindTableSort("channel", renderChannelTable);
  document.querySelectorAll(".channel-open").forEach((button) => { button.onclick = () => { state.selectedChannel = button.dataset.channel; renderAll(); $("#growth-views").scrollIntoView({ behavior: "smooth" }); }; });
}
function renderChart() {
  const issue = entityState.charts ? entityChartIssue() : '';
  $("#chart-scope").textContent = entityState.charts ? entityChartLabel() : `${growthChannelLabel()} / ${analysisScopeLabel()}`;
  if (issue) clearPeriodChart($('#line-chart'), issue);
  else {
    const inputs = entityState.charts ? entityChartInputs() : evolutionScopes().map(scope => ({ label: scope.label, rows: scopeRows(scope, 'current'), previous: scopeRows(scope, 'compare') }));
    drawPeriodChart($('#line-chart'), chartInputSeries(inputs), state.chartMetric);
  }
  $("#chart-window").textContent = `${formatWindow()} / ${comparisonWindowLabel()}`;
  $("#chart-note").textContent = state.compareEnabled === false ? `Atual: ${formatWindow()}.` : `Atual: ${formatWindow()}. Comparado: ${dayLabel(state.compareStart)} a ${dayLabel(state.compareEnd)}. Datas alinhadas pela posicao no recorte.${dateSpan(state.start,state.end) !== dateSpan(state.compareStart,state.compareEnd) ? ' Duracoes diferentes; ambos os periodos completos, sem extrapolar o menor.' : ''}`;
}
function evolutionScopes() {
  const scopes = selectedScopes();
  if (!state.selectedChannel || ['group-paid', 'group-meta'].includes(state.selectedChannel)) {
    return scopes.filter(scope => ['Facebook (1 + 2)', 'Google ADS'].includes(scope.key));
  }
  return scopes;
}
function entityChartInputs() {
  return ['a', 'b'].map(side => {
    const choice = entityState[side]; const entry = entityEntry(choice);
    return { label: `${side.toUpperCase()} / ${entry?.label || 'Selecione um item'}`,
      rows: entityRows(entry, choice.view, 'current'), previous: entityRows(entry, choice.view, 'compare') };
  });
}
function entityChartIssue() {
  const a = entitySelection('a'); const b = entitySelection('b');
  if (!a.selected || !b.selected) return 'Comparacao A/B: complete as duas selecoes nos filtros.';
  if (a.sourceKey !== b.sourceKey) return 'Bases diferentes: comparacao grafica indisponivel. Confira os indicadores de cada selecao na tabela A/B.';
  return '';
}
function entityChartLabel() {
  return `A/B / ${entityState.scope === 'independent' ? 'Selecoes independentes' : growthChannelLabel() + ' / ' + analysisScopeLabel()}`;
}
function chartInputSeries(inputs, granularity = state.selectedGranularity) {
  return inputs.flatMap((input, index) => periodSeries(pairedPeriods(input.rows, input.previous, granularity), input.label, COLORS[index % COLORS.length]));
}
function renderEntityRhythm() {
  const issue = entityChartIssue(); const inputs = entityChartInputs();
  const productGrain = entitySelection('a').productGrain && entitySelection('b').productGrain;
  const metrics = [[productGrain ? 'Pedidos por produto' : 'Pedidos', 'pedidos'], [productGrain ? 'Visitas ao produto' : 'Sessoes', 'sessoes'], ['Receita', 'receita'], ['Conversao', 'rate']];
  $('#rhythm-window').textContent = `${entityChartLabel()} / ${formatWindow()} / ${comparisonWindowLabel()}`;
  $('#ritmo thead tr').innerHTML = `${tableSortHeader('Selecao / periodo', 'key', 'rhythm', state.rhythmSort, state.rhythmSortDirection)}${metrics.map(([label, key]) => tableSortHeader(label, key, 'rhythm', state.rhythmSort, state.rhythmSortDirection)).join('')}<th>Sinal</th><th>Proximo indicador</th>`;
  const coverage = $('#rhythm-coverage');
  coverage.innerHTML = !issue && state.rhythmMetric === 'rate' ? inputs.map(input => `<div><strong>${escapeHtml(input.label)}</strong>${conversionCoverageMarkup(pairedPeriods(input.rows, input.previous, state.selectedGranularity), input.rows, input.previous)}</div>`).join('') : '';
  coverage.hidden = !coverage.innerHTML;
  if (issue) clearPeriodChart($('#rhythm-chart'), issue);
  else drawPeriodChart($('#rhythm-chart'), chartInputSeries(inputs), state.rhythmMetric);
  const records = issue ? [] : inputs.flatMap(input => pairedPeriods(input.rows, input.previous, state.selectedGranularity).map(row => ({ ...row, selection: input.label, dimension: `${input.label} / ${row.label}` })));
  $('#rhythm-body').innerHTML = records.length ? sortRecords(records, state.rhythmSort, state.rhythmSortDirection).map(row => `<tr><td><strong>${escapeHtml(row.selection)}</strong><small class="cell-note">${escapeHtml(row.label)}</small>${state.compareEnabled === false ? '' : `<small class="cell-note">Comparado: ${escapeHtml(row.compare?.label || 'Fora da cobertura')}</small>`}</td>${metrics.map(([, key]) => `<td>${metricComparisonCell(row, key)}</td>`).join('')}<td>${semaphoreMarkup(row)}</td><td>${escapeHtml(nextIndicator(row))}</td></tr>`).join('') : `<tr><td colspan="7" class="table-empty">${escapeHtml(issue || 'Sem observacoes no recorte.')}</td></tr>`;
  bindTableSort('rhythm', renderRhythm);
  [['last-day', 'day'], ['last-week', 'week'], ['last-month', 'month']].forEach(([id, granularity]) => {
    $(`#${id}-label`).textContent = 'Selecoes A/B';
    $(`#${id}-value`).textContent = '';
    $(`#${id}-note`).innerHTML = issue ? escapeHtml(issue) : inputs.map(input => {
      const item = pairedPeriods(input.rows, input.previous, granularity).filter(row => row.rows > 0).at(-1);
      return `<div class="entity-mini"><strong>${escapeHtml(input.label)}</strong><span>${escapeHtml(item?.label || 'Sem observacoes')}</span>${metricComparisonCell(item || summarize([]), state.rhythmMetric)}</div>`;
    }).join('');
  });
}
function explorerColumns(view) {
  const columns = { line: [["Linha", "line"]], channel_line: [["Linha", "line"], ["Canal", "channel"]], product: [["Produto", "product"]], channel: [["Canal", "channel"]], campaign: [["Campanha", "campaign"], ["Canal", "channel"]], ad_group: [["Grupo", "group"], ["Campanha", "campaign"]], ad: [["Criativo", "ad"], ["Campanha", "campaign"]], channel_product: [["Produto", "product"], ["Canal", "channel"]], campaign_product: [["Produto", "product"], ["Campanha", "campaign"], ["Canal", "channel"]], ad_group_product: [["Produto", "product"], ["Grupo", "group"]], ad_product: [["Produto", "product"], ["Criativo", "ad"]] };
  const productGrain = view.product || productFilterActive();
  const average = ['product', 'channel_product', 'line', 'channel_line'].includes(view.key) ? [['M&eacute;dia de convers&atilde;o', 'averageRate']] : [];
  return [...columns[view.key], [productGrain ? "Pedidos por produto" : "Pedidos", "pedidos"], [productGrain ? "Visitas ao produto" : "Visitas", "sessoes"], ["Receita", "receita"], ["Conversao", "rate"], ...average, ["Sinal", "semaphore"], ["Proximo indicador", "nextIndicator"]];
}
function productConversionHistory(view) {
  const grouped = new Map();
  if (!['product', 'channel_product', 'line', 'channel_line'].includes(view.key)) return grouped;
  for (const row of normalizedViewRows('channel_product')) {
    if (!state.end || row.data > state.end || !isAnalysisRow(row) || !isMerchandiseProduct(row)
        || !matchesViewLine(view.key, row) || !matchesSelectedChannel(row) || !matchesProductFilter(row)) continue;
    const key = dimensionKey(view, row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return new Map([...grouped].map(([key, rows]) => {
    const summary = summarize(rows);
    const dates = rows.map(row => row.data).sort();
    return [key, { ...summary, rate: summary.provenance?.partialLinkage ? null : summary.rate,
      start: dates[0], end: dates.at(-1) }];
  }));
}
function productAverageSignal(record) {
  if (record.periodGap || record.missingContext || record.provenance?.partialLinkage
      || record.conversionHistory?.provenance?.partialLinkage) {
    return { tone: 'neutral', label: 'Base parcial', difference: null };
  }
  if (!Number.isFinite(record.rate) || !Number.isFinite(record.averageRate)) {
    return { tone: 'neutral', label: 'Sem comparacao', difference: null };
  }
  const difference = record.rate - record.averageRate;
  // Match the existing descriptive band; this is not statistical significance.
  const edge = CONVERSION_SIGNAL_BAND - 1e-12;
  if (difference >= edge) return { tone: 'good', label: 'Acima da media', difference };
  if (difference <= -edge) return { tone: 'bad', label: 'Abaixo da media', difference };
  return { tone: 'warn', label: 'Proximo da media', difference };
}
function productAverageCell(record, view) {
  const history = record.conversionHistory;
  const signal = productAverageSignal(record);
  const scope = ['channel_product', 'channel_line'].includes(view.key) ? record.channel : growthChannelLabel();
  const lineView = ['line', 'channel_line'].includes(view.key);
  const subject = lineView ? 'dos produtos desta linha' : 'deste produto';
  const label = Number.isFinite(record.averageRate) ? fmtPercent(record.averageRate)
    : !history?.rows ? 'Sem historico' : history.sessoes === 0 ? 'Sem visitas' : 'Base incompleta';
  const note = [
    `${lineView ? 'Linha' : 'Produto'}: ${lineView ? record.line : record.product}. Canais: ${scope}.`,
    `Media historica ponderada: soma dos pedidos ${subject} / soma das visitas ${subject}. Nao e uma media simples de porcentagens.`,
    ...(lineView ? ['Linha identificada pelo nome do produto. Pedidos somados por produto; um pedido com varios produtos pode ser contado mais de uma vez. Nao representa pedidos unicos da linha.'] : []),
    `Historico disponivel ate o fim do periodo selecionado (${dayLabel(state.end)}), incluindo o periodo atual. O inicio do filtro nao limita esta referencia.`,
    history?.rows ? `Registros de ${dayLabel(history.start)} a ${dayLabel(history.end)}. Pedidos: ${Number.isFinite(history.pedidos) ? fmtNumber(history.pedidos) : 'nao informados'}. Visitas: ${Number.isFinite(history.sessoes) ? fmtNumber(history.sessoes) : 'nao informadas'}.` : `Sem registros historicos ${subject} nos canais selecionados.`,
    'Somente canais de Growth. Outros nao entra no calculo. Historico carregado nao comprova cobertura desde o lancamento. Ausencia de dados nao e zero.',
    `Semaforo: realizado menos media historica ${subject}, nos mesmos canais. Verde: pelo menos +0,20 p.p.; vermelho: no maximo -0,20 p.p.; amarelo: entre -0,20 e +0,20 p.p. Cinza: base sem comparacao segura. Faixa descritiva, nao um teste de significancia nem comprovacao de tendencia. Funciona mesmo com a comparacao temporal desligada.`,
    `Realizado: ${Number.isFinite(record.rate) ? fmtPercent(record.rate) : 'nao calculavel'}. Sinal: ${signal.label}. ${record.periodGap || ''}`,
    provenanceNote(history)
  ].join('\n\n');
  const difference = signal.difference === null ? '' : signal.difference === 0 ? '0,00 p.p.'
    : PerformanceDelta.describe(record.rate, record.averageRate, { rate: true }).text;
  return `<div class="average-kpi ${signal.tone}"><span class="product-average-value"><strong>${label}</strong><button type="button" class="source-info" data-source-note="${escapeHtml(note)}" aria-label="Base e semaforo da media de conversao de ${escapeHtml(lineView ? record.line : record.product)}" aria-haspopup="dialog" aria-expanded="false">${typeof CrmIcons === 'function' ? CrmIcons('Info') : 'i'}</button></span><span class="semaphore ${signal.tone}"><i aria-hidden="true"></i>${signal.label}</span>${difference ? `<small class="average-gap" aria-label="Realizado menos media: ${difference}">${difference}</small>` : ''}</div>`;
}
function lineProductsCell(record) {
  const current = record.rows > 0;
  const products = current ? record.products || [] : record.compare?.products || record.products || [];
  return `<strong>${escapeHtml(record.line)}</strong>${products.length ? `<details class="line-products"><summary>${products.length} produto${products.length === 1 ? '' : 's'}${current ? '' : ' no comparado'}</summary><ul>${products.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul></details>` : ''}`;
}
function renderExplorer() {
  const view = VIEWS.find((item) => item.key === state.selectedView) || VIEWS[0];
  let { records } = recordsForDisplay(view);
  if (state.explorerSearch) records = records.filter((row) => fuzzyMatch(filterText(row), state.explorerSearch));
  if (['product', 'channel_product', 'line', 'channel_line'].includes(view.key)) {
    const history = productConversionHistory(view);
    records = records.map(row => ({ ...row, conversionHistory: history.get(row.key),
      averageRate: history.get(row.key)?.rate ?? null }));
  } else if (state.explorerSort === 'averageRate') {
    state.explorerSort = 'pedidos';
    state.explorerSortDirection = 'desc';
  }
  const sorted = sortRecords(records, state.explorerSort, state.explorerSortDirection);
  const visible = sorted.slice(0, 50); const columns = explorerColumns(view);
  $("#explorer-head").innerHTML = `<tr>${columns.map(([label,key]) => {
    const subtitle = key === 'rate' ? 'No periodo' : key === 'averageRate' ? 'Realizado vs. historico'
      : key === 'semaphore' && state.compareEnabled !== false ? 'Vs. periodo anterior' : '';
    const heading = ['semaphore','nextIndicator'].includes(key) ? `<th scope="col">${label}</th>`
      : tableSortHeader(label, key, "explorer", state.explorerSort, state.explorerSortDirection);
    return heading.replace('<th ', `<th data-column="${key}" `)
      .replace('</th>', `${subtitle ? `<small class="column-context">${subtitle}</small>` : ''}</th>`);
  }).join("")}</tr>`;
  const sortSelect = $('#explorer-sort');
  const averageOption = sortSelect.querySelector('[value="averageRate"]');
  if (['product', 'channel_product', 'line', 'channel_line'].includes(view.key)) {
    if (!averageOption) sortSelect.insertAdjacentHTML('beforeend', '<option value="averageRate">M&eacute;dia de convers&atilde;o</option>');
  } else averageOption?.remove();
  sortSelect.value = state.explorerSort;
  const availability = viewAvailability(view.key);
  const quality = viewQuality(view);
  $("#explorer-status").textContent = !availability.available ? 'Cruzamento indisponivel' : quality.status;
  $("#explorer-status").className = `status-pill ${quality.tone === 'ok' ? 'ok' : 'warn'}`;
  $("#explorer-status").title = quality.note;
  const provenanceRows = sourceKeyForView(view.key) === 'channel' ? selectedPaidRows('current') : viewRows(view, 'current');
  $("#explorer-status").insertAdjacentHTML('beforeend', provenanceMarkup(summarize(provenanceRows), 'fonte desta visao'));
  if ($('#explorer-status .source-info')) $('#explorer-status').removeAttribute('title');
  $("#explorer-count").textContent = records.length > visible.length ? `${visible.length} de ${records.length} resultados` : `${records.length} resultado${records.length === 1 ? '' : 's'}`;
  $("#explorer-summary").innerHTML = `<span><strong>${escapeHtml(view.title)}</strong> / ${escapeHtml(analysisScopeLabel())}</span><span>Atual: ${formatWindow()} / ${comparisonWindowLabel()}</span>`;
  if (['line', 'channel_line'].includes(view.key)) $("#explorer-summary").insertAdjacentHTML('beforeend',
    '<span title="Somente produtos com linha identificada pelo nome. Produtos sem linha continuam nas visoes de produtos e totais gerais. Um pedido com varios produtos pode aparecer mais de uma vez na soma.">Linhas identificadas / Pedidos somados por produto, nao unicos</span>');
  const gaps = [viewPeriodGap(view, 'current'), viewPeriodGap(view, 'compare')].filter(Boolean);
  const coverage = $('#explorer-coverage');
  coverage.hidden = !gaps.length;
  coverage.textContent = [...new Set(gaps)].join('. ') + (gaps.length ? '. Valores parciais; variacoes entre periodos indisponiveis.' : '');
  if (gaps.length) {
    $('#explorer-status').firstChild.textContent = 'Periodo incompleto';
    $('#explorer-status').className = 'status-pill warn';
  }
  const reason = availability.reason || 'Sem observacoes de pedidos, visitas ou receita para esta combinacao nos periodos selecionados.';
  $("#explorer-body").innerHTML = visible.length ? visible.map((row) => `<tr>${columns.map(([,key]) => `<td data-column="${key}"${key === 'averageRate' ? ' class="product-average-cell"' : ''}>${key === 'line' ? lineProductsCell(row) : key === 'averageRate' ? productAverageCell(row, view) : ['pedidos','sessoes','receita','rate'].includes(key) ? metricComparisonCell(row, key) : key === 'semaphore' ? semaphoreMarkup(row) : key === 'nextIndicator' ? `${escapeHtml(nextIndicator(row))}${row.missingContext ? `<small class="cell-note missing-detail">${escapeHtml(row.missingContext.detail)}</small>` : ''}` : escapeHtml(row[key] || 'Nao identificado')}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" class="table-empty">${escapeHtml(reason)}</td></tr>`;
  bindTableSort("explorer", renderExplorer);
}

function entityCatalog(viewKey) {
  productCatalog();
  const sourceKey = sourceKeyForView(viewKey, entityState.scope !== 'independent');
  const cacheKey = `${viewKey}|${sourceKey}`;
  if (entityCatalogCache.has(cacheKey)) return entityCatalogCache.get(cacheKey);
  const view = VIEWS.find((item) => item.key === viewKey);
  if (viewKey === "channel") return PAID_CHANNEL_VIEWS.map((scope) => ({ key: scope.key, label: scope.label, scope }));
  const source = normalizedViewRows(sourceKey);
  const choices = new Map();
  source.filter(isAnalysisRow).forEach((row) => {
    if (!matchesViewLine(viewKey, row)) return;
    if (sourceKey.endsWith('_product') && !isMerchandiseProduct(row)) return;
    const key = dimensionKey(view, row);
    const description = dimensions(view, row);
    if (!choices.has(key)) choices.set(key, { key, label: productFilterLabel(description.dimension), rows: [] });
    choices.get(key).rows.push(row);
  });
  const result = [...choices.values()].sort((a,b) => a.label.localeCompare(b.label,"pt-BR"));
  entityCatalogCache.set(cacheKey,result); return result;
}
function entityRows(entry, viewKey, period) {
  if (!entry) return [];
  const inherit = entityState.scope !== 'independent';
  const rows = entry.scope ? scopeRows(entry.scope, period, !inherit) : (entry.rows || []).filter(row => inPeriod(row, period));
  if (!inherit) return rows;
  const usesProducts = sourceKeyForView(viewKey).endsWith('_product');
  return rows.filter(row => matchesSelectedChannel(row) && (!usesProducts || matchesProductFilter(row)));
}
const ENTITY_PRODUCT_SEARCH = '__product_search__:';
function entityProductSearch(query) {
  const term = query.trim();
  if (!term) return null;
  const entries = entityCatalog('product').filter(item => fuzzyMatch(item.label, term));
  const count = entries.filter(item => ['current', 'compare'].some(period => entityRows(item, 'product', period).some(hasGrowthObservation))).length;
  return { key: ENTITY_PRODUCT_SEARCH + encodeURIComponent(term), label: `${term} / ${count} produtos`,
    rows: entries.flatMap(item => item.rows), aggregate: true, count };
}
function entityEntry(choice) {
  if (choice.view === 'product' && choice.key.startsWith(ENTITY_PRODUCT_SEARCH)) {
    return entityProductSearch(decodeURIComponent(choice.key.slice(ENTITY_PRODUCT_SEARCH.length)));
  }
  return entityCatalog(choice.view).find(item => item.key === choice.key);
}
function entitySelection(side) {
  const choice = entityState[side];
  const entry = entityEntry(choice);
  const rows = period => entityRows(entry, choice.view, period);
  const current = rows('current'); const previous = rows('compare');
  const missing = ![...current, ...previous].some(hasGrowthObservation);
  const sourceKey = sourceKeyForView(choice.view, entityState.scope !== 'independent');
  const summary = (rows, period) => ({ ...summarize(rows), periodGap: viewPeriodGap({key:choice.view}, period, entityState.scope !== 'independent') });
  return { label: entry?.label || 'Selecione um item', ...withComparison(summary(current, 'current'), summary(previous, 'compare')),
    view: choice.view, sourceKey, missing, selected: Boolean(choice.key), aggregate: Boolean(entry?.aggregate) || ['line', 'channel_line'].includes(choice.view),
    productGrain: sourceKey.endsWith('_product') };
}
function renderEntityComparison(pickersOnly = false) {
  $('#entity-charts').checked = Boolean(entityState.charts);
  const inherit = entityState.scope !== 'independent';
  const scopeSelect = $('#entity-scope');
  scopeSelect.value = inherit ? 'global' : 'independent';
  scopeSelect.onchange = () => { entityState.scope = scopeSelect.value; renderEntityComparison(); };
  for (const side of ['a','b']) {
    const selection = entityState[side];
    const viewSelect = $(`#entity-${side}-view`);
    viewSelect.innerHTML = growthViewOptions(false, inherit);
    viewSelect.value = selection.view;
    viewSelect.onchange = () => { selection.view = viewSelect.value; selection.key = ""; selection.query = ""; $(`#entity-${side}-search`).value = ""; renderEntityComparison(); };
    const entries = entityCatalog(selection.view);
    const options = entries.filter(item => ['current', 'compare'].some(period => entityRows(item, selection.view, period).some(hasGrowthObservation))
      && (!selection.query || fuzzyMatch(item.label, selection.query)));
    options.sort((left, right) => {
      const leftCurrent = entityRows(left, selection.view, 'current').some(hasGrowthObservation);
      const rightCurrent = entityRows(right, selection.view, 'current').some(hasGrowthObservation);
      return Number(Boolean(rightCurrent)) - Number(Boolean(leftCurrent)) || left.label.localeCompare(right.label, "pt-BR");
    });
    const select = $(`#entity-${side}-key`);
    const selected = entityEntry(selection);
    const group = selection.view === 'product' ? entityProductSearch(selection.query) : null;
    const groupAvailable = group?.count > 0;
    const missingSelection = selection.key && !(groupAvailable && group.key === selection.key) && !options.some(item => item.key === selection.key);
    const selectedHasRows = selected && ['current', 'compare'].some(period => entityRows(selected, selection.view, period).some(hasGrowthObservation));
    select.innerHTML = `<option value="">${options.length ? groupAvailable ? 'Selecione um produto ou o conjunto' : 'Selecione' : 'Sem observacoes no recorte'}</option>${missingSelection ? `<option value="${escapeHtml(selection.key)}" disabled>${escapeHtml(selected?.label || selection.key)} - ${selectedHasRows ? 'fora da busca' : 'fora do recorte'}</option>` : ''}${groupAvailable ? `<option value="${escapeHtml(group.key)}">Todos os produtos encontrados: ${escapeHtml(selection.query.trim())} (${group.count})</option>` : ''}${options.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}`;
    select.disabled = !options.length && !selection.key;
    select.value = selection.key;
    select.onchange = () => { selection.key = select.value; renderEntityResults(); };
    $(`#entity-${side}-search`).oninput = (event) => { clearTimeout(analysisSearchTimer); const query = event.target.value; analysisSearchTimer = setTimeout(() => { selection.query = query; renderEntityComparison(); },180); };
  }
  if (!pickersOnly) renderEntityResults();
}
function renderEntityResults() {
  const a = entitySelection('a'); const b = entitySelection('b');
  if (!a.selected || !b.selected) {
    const pending = [!a.selected ? 'A' : '', !b.selected ? 'B' : ''].filter(Boolean).join(' e ');
    $('#entity-results').innerHTML = `<div class="entity-pending"><p>Selecao ${pending} pendente.</p><button type="button" class="outline-button" id="complete-entity-selection">Completar selecoes</button></div>`;
    $('#complete-entity-selection').onclick = () => {
      openGrowthFilters();
      document.querySelector('.filter-entity-options').open = true;
      const side = !a.selected ? 'a' : 'b';
      const select = $(`#entity-${side}-key`);
      (select.disabled ? $(`#entity-${side}-search`) : select).focus();
    };
    return;
  }
  const sameGrain = a.sourceKey === b.sourceKey && !a.provenance?.partialLinkage && !b.provenance?.partialLinkage && !a.periodGap && !b.periodGap;
  const context = entityState.scope === 'independent' ? 'A/B independente dos filtros de canal e produto' : `A/B no recorte global: ${growthChannelLabel()} / ${analysisScopeLabel()}`;
  const missing = [a.missing ? 'A' : '', b.missing ? 'B' : ''].filter(Boolean).join(' e ');
  const measures = [[a.productGrain && b.productGrain ? 'Pedidos por produto' : 'Pedidos', 'pedidos'],
    [a.productGrain && b.productGrain ? 'Visitas ao produto' : 'Visitas', 'sessoes'], ['Receita', 'receita'], ['Conversao', 'rate']];
  $('#entity-results').innerHTML = `<p class="comparison-period entity-context">${escapeHtml(context)}</p><p class="comparison-period">Atual: ${formatWindow()} / ${comparisonWindowLabel()}</p>${missing ? `<p class="filter-context-warning">Selecao ${missing}: sem observacoes no recorte. Nenhuma substituicao automatica.</p>` : ''}<div class="table-scroll"><table class="data-table entity-table"><thead><tr><th>Indicador</th><th>A / ${escapeHtml(a.label)}</th><th>B / ${escapeHtml(b.label)}</th><th>B em relacao a A</th></tr></thead><tbody>${measures.map(([label,key]) => `<tr><th scope="row">${label}</th><td>${metricComparisonCell(a,key)}</td><td>${metricComparisonCell(b,key)}</td><td>${!sameGrain ? (a.sourceKey === b.sourceKey ? 'Cobertura parcial' : 'Bases diferentes') : escapeHtml(comparisonLabel(b[key],a[key],key === 'rate' ? 'rate' : 'number'))}</td></tr>`).join('')}<tr><th>Sinal</th><td>${semaphoreMarkup(a)}</td><td>${semaphoreMarkup(b)}</td><td></td></tr><tr><th>Proximo indicador</th><td>${escapeHtml(nextIndicator(a))}</td><td>${escapeHtml(nextIndicator(b))}</td><td></td></tr></tbody></table></div>${!sameGrain ? '<p class="comparison-period">Bases distintas ou cobertura parcial de vinculos; variacao direta nao homologada.</p>' : ''}`;
  if (a.aggregate || b.aggregate) $('#entity-results').insertAdjacentHTML('beforeend', '<p class="comparison-period">Pedidos somados por produto; um pedido pode conter mais de um produto. Conversao = soma dos pedidos / soma das visitas ao produto.</p>');
}
function renderAll() {
  window.GrowthRefresh?.renderTimestamp();
  reorderGrowthSections(); setupFilters(); renderTemporalControls();
  renderSummary(); renderExplorer(); renderEntityComparison(); renderRhythm(); renderChannelTable(); renderChart(); renderQuality();
  if (typeof refreshFilterSummary === "function") refreshFilterSummary();
}
function setupAnalysisEvents() {
  $("#product-search").oninput = (event) => {
    const query = event.target.value; clearTimeout(analysisSearchTimer);
    analysisSearchTimer = setTimeout(() => { state.productSearch = query; state.selectedProduct = ""; renderAll(); },180);
  };
  $("#clear-filters").onclick = () => {
    clearTimeout(analysisSearchTimer);
    for (const key of ['selectedProduct','selectedProductType','selectedProductLine','selectedModel','selectedColor','selectedSize','selectedChannel','productSearch','explorerSearch','chartFilter']) state[key] = "";
    state.chartChannels = []; $("#product-search").value = ""; $("#explorer-search").value = ""; renderAll();
  };
  const sort = $("#explorer-sort");
  [['Pedidos anteriores','comparisonPedidos'],['Variacao de pedidos','deltaPedidos'],['Visitas anteriores','comparisonSessoes'],['Variacao de visitas','deltaSessoes'],['Receita anterior','comparisonReceita'],['Variacao de receita','deltaReceita'],['Conversao anterior','comparisonRate'],['Variacao de conversao','deltaRate']].forEach(([label,value]) => sort.add(new Option(label,value)));
}
setupEvents();
setupAnalysisEvents();
loadData();
