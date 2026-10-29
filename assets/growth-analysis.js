// Shared Growth scope and period comparison. CRM owns its own filters and data.
const entityState = {
  a: { view: "channel", key: "Meta Ads 1", query: "" },
  b: { view: "channel", key: "Google ADS", query: "" },
};
let productCatalogCache = null;
let entityCatalogCache = new Map();
let analysisSearchTimer = null;
VIEWS.forEach((view, index) => { view.number = String(index + 1).padStart(2, "0"); });

function productFilterActive() {
  return Boolean(state.selectedProduct || state.selectedModel || state.selectedColor || state.selectedSize || state.productSearch);
}
function matchesProductFilter(row, exclude = "") {
  return (!state.selectedProduct || exclude === "productKey" || row.productKey === state.selectedProduct)
    && (!state.selectedModel || exclude === "productModel" || row.productModel === state.selectedModel)
    && (!state.selectedColor || exclude === "productColor" || row.productColor === state.selectedColor)
    && (!state.selectedSize || exclude === "productSize" || row.productSize === state.selectedSize)
    && (!state.productSearch || fuzzyMatch(row.productName, state.productSearch));
}
function productCatalog() {
  if (productCatalogCache?.payload === state.growthPayload) return productCatalogCache.rows;
  const entries = new Map();
  normalizedViewRows("channel_product").filter(isMerchandiseProduct).forEach((row) => {
    if (row.productKey && !entries.has(row.productKey)) entries.set(row.productKey, row);
  });
  const rows = [...entries.values()].sort((a, b) => a.productName.localeCompare(b.productName, "pt-BR"));
  productCatalogCache = { payload: state.growthPayload, rows };
  entityCatalogCache.clear();
  return rows;
}
function analysisSourceRows(period) {
  if (!productFilterActive()) return channelSourceRows(period);
  return normalizedViewRows("channel_product").filter((row) => isAnalysisRow(row) && inPeriod(row, period) && matchesProductFilter(row));
}
function dimensions(view, row) {
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
    ["product-filter", "selectedProduct", "Todos os produtos", "productKey"],
    ["product-model-filter", "selectedModel", "Todos os modelos", "productModel"],
    ["product-color-filter", "selectedColor", "Todas as cores", "productColor"],
    ["product-size-filter", "selectedSize", "Todos os tamanhos", "productSize"],
  ];
  configs.forEach(([id, stateKey, empty, field]) => {
    const select = $(`#${id}`);
    const choices = new Map();
    catalog.filter((row) => matchesProductFilter(row, field)).forEach((row) => {
      const value = row[field];
      if (value && value !== "Nao informado") choices.set(value, productFilterLabel(field === "productKey" ? row.productName : value));
    });
    const selected = state[stateKey];
    if (selected && !choices.has(selected)) {
      const original = catalog.find((row) => row[field] === selected);
      choices.set(selected, productFilterLabel(field === "productKey" ? original?.productName || selected : selected));
    }
    select.innerHTML = `<option value="">${empty}</option>${[...choices].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}`;
    select.value = selected;
    select.onchange = () => {
      state[stateKey] = select.value;
      if (field === "productKey") { state.selectedModel = ""; state.selectedColor = ""; state.selectedSize = ""; }
      renderAll();
    };
    select.disabled = !catalog.length;
  });
  const active = catalog.filter((row) => matchesProductFilter(row));
  $("#active-product-filter").textContent = productFilterActive() ? `${active.length} produto(s) no filtro` : `${catalog.length} produtos`;
}
function withComparison(current, compare) {
  const base = current || { ...summarize([]), dimension: compare?.dimension || "", key: compare?.key || "" };
  return { ...base, compare,
    comparisonPedidos: compare?.pedidos ?? null, comparisonSessoes: compare?.sessoes ?? null,
    comparisonReceita: compare?.receita ?? null, comparisonRate: compare?.rate ?? null,
    deltaPedidos: relativeComparison(base.pedidos, compare?.pedidos),
    deltaSessoes: relativeComparison(base.sessoes, compare?.sessoes),
    deltaReceita: relativeComparison(base.receita, compare?.receita), deltaRate: delta(base, compare),
  };
}
function recordsForDisplay(view) {
  const current = new Map(groups(view, "current").map((row) => [row.key, row]));
  const previous = new Map(groups(view, "compare").map((row) => [row.key, row]));
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const records = [...keys].map((key) => {
    const item = current.get(key) || { ...previous.get(key), ...summarize([]) };
    return withComparison(item, previous.get(key) || null);
  });
  return { records, official: true, sourceLabel: "SSOT" };
}
function recordSemaphore(record) {
  if (record?.rate == null) return { tone: "warn", label: "Validar base", title: "A conversao exige pedidos e visitas completos no mesmo recorte." };
  const previous = record.compare;
  if (previous?.rate == null) return { tone: "neutral", label: "Sem historico", title: "Nao ha base comparavel para avaliar a variacao." };
  const change = record.rate - previous.rate;
  if (change >= 0.002) return { tone: "good", label: "Avancou", title: "Conversao subiu pelo menos 0,20 p.p. no recorte; sinal descritivo, sem teste de significancia." };
  if (change <= -0.002) return { tone: "bad", label: "Recuou", title: "Conversao caiu pelo menos 0,20 p.p. no recorte; sinal descritivo, sem teste de significancia." };
  return { tone: "neutral", label: "Estavel", title: "Variacao de conversao inferior a 0,20 p.p." };
}
function nextIndicator(record) {
  if (record.rate == null) return "Validar cobertura de visitas e pedidos";
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
  const previous = record.compare?.[key] ?? null;
  const change = comparisonLabel(record[key], previous, key === "rate" ? "rate" : "number");
  return `<div class="metric-pair"><strong>${metricText(record[key], key)}</strong><small>Anterior: ${metricText(previous, key)}</small><span class="metric-change">${escapeHtml(change)}</span></div>`;
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
  return name || [state.selectedModel, state.selectedColor, state.selectedSize, state.productSearch].filter(Boolean).join(" / ");
}
function renderSummary() {
  const total = withComparison(summarize(selectedPaidRows("current")), summarize(selectedPaidRows("compare")));
  const ids = { pedidos: "metric-orders", sessoes: "metric-sessions", receita: "metric-revenue", rate: "metric-rate" };
  Object.entries(ids).forEach(([key, id]) => {
    const node = $(`#${id}`); node.textContent = metricText(total[key], key);
    let compare = node.parentElement.querySelector(".kpi-comparison");
    if (!compare) { compare = document.createElement("div"); compare.className = "kpi-comparison"; node.after(compare); }
    compare.innerHTML = `<span>Anterior: ${metricText(total.compare[key], key)}</span><b>${escapeHtml(comparisonLabel(total[key], total.compare[key], key === "rate" ? "rate" : "number"))}</b>`;
  });
  $("#metric-sessions").parentElement.firstElementChild.textContent = productFilterActive() ? "Visitas ao produto" : "Sessoes SSOT";
  $("#metric-orders").parentElement.firstElementChild.textContent = productFilterActive() ? "Pedidos por produto" : "Pedidos";
  $("#metric-sessions-note").textContent = coverageLabel(total);
  $("#metric-rate-note").textContent = total.complete ? "Pedidos / visitas do mesmo recorte" : "Cobertura incompleta; validar a fonte";
  $("#summary-window").textContent = `${formatWindow()} / ${comparisonWindowLabel()}`;
  const productNote = productFilterActive() ? " Pedidos por produto nao sao pedidos unicos entre produtos." : "";
  $("#summary-status").innerHTML = `${semaphoreMarkup(total)}<span><strong>${escapeHtml(analysisScopeLabel())}</strong> / ${escapeHtml(nextIndicator(total))}.${productNote}</span>`;
}

// Compare elapsed days rather than pairing arrays: missing days must keep their place.
function pairedPeriods(rows, previousRows, granularity) {
  const offset = Math.round((toDate(state.start) - toDate(state.compareStart)) / 86400000);
  const current = new Map(aggregatePeriods(rows, granularity).map((row) => [row.key, row]));
  const projected = previousRows.map((row) => ({ ...row, data: shiftDate(row.data, offset), originalDate: row.data }));
  const originalBounds = new Map();
  projected.forEach((row) => {
    const key = periodBucket(row.data, granularity, row).key;
    const bounds = originalBounds.get(key);
    originalBounds.set(key, bounds ? [row.originalDate < bounds[0] ? row.originalDate : bounds[0], row.originalDate > bounds[1] ? row.originalDate : bounds[1]] : [row.originalDate, row.originalDate]);
  });
  const previous = new Map(aggregatePeriods(projected, granularity).map((row) => {
    const bounds = originalBounds.get(row.key);
    return [row.key, { ...row, axisLabel: row.label, label: bounds ? `${dayLabel(bounds[0])} a ${dayLabel(bounds[1])}` : row.label }];
  }));
  return [...new Set([...current.keys(), ...previous.keys()])].sort().map((key) => {
    const currentPeriod = current.get(key);
    const previousPeriod = previous.get(key);
    return { ...withComparison(currentPeriod || { ...summarize([]), key, label: previousPeriod?.axisLabel }, previousPeriod || null), key };
  });
}
function drawPeriodChart(box, series, metric) {
  const axis = [...new Set(series.flatMap((item) => item.periods.map((period) => period.key)))].sort();
  const labels = new Map();
  // Current periods define the shared axis; original comparison dates stay in the tooltip.
  series.forEach((item) => item.periods.forEach((period) => { if (!labels.has(period.key)) labels.set(period.key, period.label); }));
  const known = series.flatMap((item) => item.periods.map((period) => metricValue(period, metric))).filter(Number.isFinite);
  if (!axis.length || !known.length) { box.innerHTML = '<div class="empty-state">Sem base valida para este indicador no recorte.</div>'; return; }
  const width = Math.max(box.clientWidth, 640); const height = 280;
  const margin = { left: 76, right: 24, top: 20, bottom: 42 };
  const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom;
  const max = chartMax(metric, known);
  const x = (i) => margin.left + (axis.length === 1 ? plotWidth / 2 : i / (axis.length - 1) * plotWidth);
  const y = (value) => margin.top + plotHeight - value / max * plotHeight;
  const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metricLabel(metric)} no periodo atual e comparado">`];
  for (let tick = 0; tick <= 4; tick++) {
    const value = max / 4 * tick;
    svg.push(`<line x1="${margin.left}" y1="${y(value)}" x2="${width - margin.right}" y2="${y(value)}" stroke="var(--line)"/><text x="${margin.left - 10}" y="${y(value) + 4}" text-anchor="end" fill="var(--muted)" font-size="10">${escapeHtml(metricText(value, metric))}</text>`);
  }
  const interval = Math.max(1, Math.ceil(axis.length / 7));
  axis.forEach((key, i) => { if (i % interval === 0 || i === axis.length - 1) svg.push(`<text x="${x(i)}" y="${height - 12}" text-anchor="middle" fill="var(--muted)" font-size="10">${escapeHtml(labels.get(key))}</text>`); });
  series.forEach((item) => {
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
  box.innerHTML = `<div class="chart-legend">${series.map((item) => `<span><i style="border-color:${item.color};border-top-style:${item.dashed ? 'dashed' : 'solid'}"></i>${escapeHtml(item.label)}</span>`).join("")}</div>${svg.join("")}`;
  window.ReiseCharts?.prepare(box);
}
function periodSeries(pairs, label, color) {
  return [
    { label: `${label} / Atual`, color, periods: pairs },
    { label: `${label} / Comparado`, color, dashed: true, periods: pairs.map((row) => ({ ...summarize([]), ...row.compare, key: row.key })) },
  ];
}
function renderRhythmChart(periods) { drawPeriodChart($("#rhythm-chart"), periodSeries(periods, metricLabel(state.rhythmMetric), COLORS[0]), state.rhythmMetric); }
function renderMiniPeriod(id, item, metric) {
  $(`#${id}-label`).textContent = item?.label || "Fora da cobertura";
  $(`#${id}-value`).textContent = metricText(item?.[metric] ?? null, metric);
  $(`#${id}-note`).textContent = item ? `Anterior: ${metricText(item.compare?.[metric] ?? null, metric)} / ${comparisonLabel(item[metric], item.compare?.[metric], metric === "rate" ? "rate" : "number")}` : "Sem observacao na fonte";
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
  return [["Pedidos", "pedidos"], [productFilterActive() ? "Visitas ao produto" : "Visitas", "sessoes"], ["Receita", "receita"], ["Conversao", "rate"]]
    .map(([label, key]) => tableSortHeader(label, key, target, state[`${target}Sort`], state[`${target}SortDirection`])).join("");
}
function renderRhythm() {
  const rows = selectedPaidRows("current"); const previous = selectedPaidRows("compare");
  const pairs = pairedPeriods(rows, previous, state.selectedGranularity).slice(-periodLimit(state.selectedGranularity));
  renderRhythmChart(pairs);
  $("#rhythm-window").textContent = `${formatWindow()} / ${comparisonWindowLabel()}`;
  $("#ritmo thead tr").innerHTML = `${tableSortHeader("Periodo", "key", "rhythm", state.rhythmSort, state.rhythmSortDirection)}${metricHeaders("rhythm")}<th>Sinal</th><th>Proximo indicador</th>`;
  const sorted = sortRecords(pairs.map((row) => ({ ...row, dimension: row.label })), state.rhythmSort, state.rhythmSortDirection);
  $("#rhythm-body").innerHTML = sorted.length ? sorted.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong><small class="cell-note">Comparado: ${escapeHtml(row.compare?.label || 'Fora da cobertura')}</small></td>${['pedidos','sessoes','receita','rate'].map((key) => `<td>${metricComparisonCell(row, key)}</td>`).join("")}<td>${semaphoreMarkup(row)}</td><td>${escapeHtml(nextIndicator(row))}</td></tr>`).join("") : '<tr><td colspan="7" class="table-empty">Nao ha observacoes para o recorte selecionado.</td></tr>';
  bindTableSort("rhythm", renderRhythm);
  [["last-day", "day"], ["last-week", "week"], ["last-month", "month"]].forEach(([id, granularity]) => renderMiniPeriod(id, pairedPeriods(rows, previous, granularity).filter((row) => row.rows > 0).at(-1), state.rhythmMetric));
  document.querySelectorAll("[data-granularity]").forEach((button) => button.classList.toggle("active", button.dataset.granularity === state.selectedGranularity));
}
function renderChannelTable() {
  const previous = new Map(allChannelGroups("compare").map((row) => [row.key, row]));
  const rows = allChannelGroups("current").map((row) => withComparison(row, previous.get(row.key)));
  $("#channel-window").textContent = `${formatWindow()} / ${comparisonWindowLabel()}`;
  $("#channel-status").textContent = `${rows.filter((row) => row.pedidos !== null).length} canais com observacoes`;
  $("#canais thead tr").innerHTML = `<th>Canal</th>${metricHeaders("channel")}<th>Sinal</th><th>Proximo indicador</th>`;
  $("#channel-body").innerHTML = sortRecords(rows, state.channelSort, state.channelSortDirection).map((row) => `<tr><td><button type="button" class="channel-link channel-open" data-channel="${escapeHtml(row.key)}">${escapeHtml(row.dimension)}</button></td>${['pedidos','sessoes','receita','rate'].map((key) => `<td>${metricComparisonCell(row, key)}</td>`).join("")}<td>${semaphoreMarkup(row)}</td><td>${escapeHtml(nextIndicator(row))}</td></tr>`).join("");
  bindTableSort("channel", renderChannelTable);
  document.querySelectorAll(".channel-open").forEach((button) => { button.onclick = () => { state.selectedChannel = button.dataset.channel; renderAll(); $("#growth-views").scrollIntoView({ behavior: "smooth" }); }; });
}
function renderChart() {
  const select = $("#chart-channel-filter");
  select.innerHTML = CHANNEL_FILTERS.slice(0, 4).map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
  select.value = state.chartFilter || "";
  select.onchange = () => { state.chartFilter = select.value; renderChart(); };
  const scopes = displayScopesForFilter(state.chartFilter || state.selectedChannel);
  const series = scopes.flatMap((scope, index) => periodSeries(pairedPeriods(scopeRows(scope, "current"), scopeRows(scope, "compare"), state.selectedGranularity), scope.label, COLORS[index % COLORS.length]));
  drawPeriodChart($("#line-chart"), series, state.chartMetric);
  $("#chart-window").textContent = `${formatWindow()} / ${comparisonWindowLabel()}`;
  $("#chart-note").textContent = `Atual: ${formatWindow()}. Comparado: ${dayLabel(state.compareStart)} a ${dayLabel(state.compareEnd)}. Datas alinhadas pela posicao no recorte.${dateSpan(state.start,state.end) !== dateSpan(state.compareStart,state.compareEnd) ? ' Os recortes tem duracoes diferentes.' : ''}`;
}
function explorerColumns(view) {
  const columns = { product: [["Produto", "product"]], channel: [["Canal", "channel"]], campaign: [["Campanha", "campaign"], ["Canal", "channel"]], ad_group: [["Grupo", "group"], ["Campanha", "campaign"]], ad: [["Criativo", "ad"], ["Campanha", "campaign"]], channel_product: [["Produto", "product"], ["Canal", "channel"]], campaign_product: [["Produto", "product"], ["Campanha", "campaign"], ["Canal", "channel"]], ad_group_product: [["Produto", "product"], ["Grupo", "group"]], ad_product: [["Produto", "product"], ["Criativo", "ad"]] };
  return [...columns[view.key], ["Pedidos", "pedidos"], [view.product ? "Visitas ao produto" : "Visitas", "sessoes"], ["Receita", "receita"], ["Conversao", "rate"], ["Sinal", "semaphore"], ["Proximo indicador", "nextIndicator"]];
}
function renderExplorer() {
  const view = VIEWS.find((item) => item.key === state.selectedView) || VIEWS[0];
  let { records } = recordsForDisplay(view);
  if (state.explorerSearch) records = records.filter((row) => fuzzyMatch(filterText(row), state.explorerSearch));
  const sorted = sortRecords(records, state.explorerSort, state.explorerSortDirection);
  const visible = sorted.slice(0, 50); const columns = explorerColumns(view);
  $("#explorer-head").innerHTML = `<tr>${columns.map(([label,key]) => ['semaphore','nextIndicator'].includes(key) ? `<th>${label}</th>` : tableSortHeader(label, key, "explorer", state.explorerSort, state.explorerSortDirection)).join("")}</tr>`;
  $("#explorer-status").textContent = "SSOT";
  $("#explorer-status").className = "status-pill ok";
  $("#explorer-count").textContent = `${records.length} resultados / ${visible.length} exibidos`;
  $("#explorer-summary").innerHTML = `<span><strong>${escapeHtml(view.title)}</strong> / ${escapeHtml(analysisScopeLabel())}</span><span>Atual: ${formatWindow()} / ${comparisonWindowLabel()}</span>`;
  const reason = productFilterActive() && !view.product ? "A fonte ainda nao tem o cruzamento de produto neste nivel." : readiness(view.key)?.reason || "Nao ha observacoes da fonte para este recorte.";
  $("#explorer-body").innerHTML = visible.length ? visible.map((row) => `<tr>${columns.map(([,key]) => `<td>${['pedidos','sessoes','receita','rate'].includes(key) ? metricComparisonCell(row, key) : key === 'semaphore' ? semaphoreMarkup(row) : key === 'nextIndicator' ? escapeHtml(nextIndicator(row)) : escapeHtml(row[key] || 'Nao identificado')}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" class="table-empty">${escapeHtml(reason)}</td></tr>`;
  bindTableSort("explorer", renderExplorer);
}

function entityCatalog(viewKey) {
  productCatalog();
  if (entityCatalogCache.has(viewKey)) return entityCatalogCache.get(viewKey);
  const view = VIEWS.find((item) => item.key === viewKey);
  if (viewKey === "channel") return PAID_CHANNEL_VIEWS.map((scope) => ({ key: scope.key, label: scope.label, scope }));
  const source = normalizedViewRows(viewKey === "product" ? "channel_product" : viewKey);
  const choices = new Map();
  source.filter(isAnalysisRow).forEach((row) => {
    if (view.product && !isMerchandiseProduct(row)) return;
    const key = dimensionKey(view, row);
    const description = dimensions(view, row);
    if (!choices.has(key)) choices.set(key, { key, label: productFilterLabel(description.dimension), rows: [] });
    choices.get(key).rows.push(row);
  });
  const result = [...choices.values()].sort((a,b) => a.label.localeCompare(b.label,"pt-BR"));
  entityCatalogCache.set(viewKey,result); return result;
}
function entitySelection(side) {
  const choice = entityState[side];
  const entry = entityCatalog(choice.view).find((item) => item.key === choice.key);
  const rows = (period) => entry?.scope ? channelSourceRows(period).filter((row) => entry.scope.raw.includes(row.canal)) : (entry?.rows || []).filter((row) => inPeriod(row, period));
  return { label: entry?.label || "Selecione um item", ...withComparison(summarize(rows("current")), summarize(rows("compare"))), view: choice.view };
}
function renderEntityComparison(pickersOnly = false) {
  for (const side of ['a','b']) {
    const selection = entityState[side];
    const viewSelect = $(`#entity-${side}-view`);
    viewSelect.innerHTML = VIEWS.map((view) => `<option value="${view.key}">${view.short}</option>`).join("");
    viewSelect.value = selection.view;
    viewSelect.onchange = () => { selection.view = viewSelect.value; selection.key = ""; selection.query = ""; $(`#entity-${side}-search`).value = ""; renderEntityComparison(); };
    const options = entityCatalog(selection.view).filter((item) => (item.scope || item.rows.some((row) => inPeriod(row, "current") || inPeriod(row, "compare"))) && (!selection.query || fuzzyMatch(item.label, selection.query)));
    options.sort((left, right) => {
      const leftCurrent = left.scope || left.rows.some((row) => inPeriod(row, "current"));
      const rightCurrent = right.scope || right.rows.some((row) => inPeriod(row, "current"));
      return Number(Boolean(rightCurrent)) - Number(Boolean(leftCurrent)) || left.label.localeCompare(right.label, "pt-BR");
    });
    const select = $(`#entity-${side}-key`);
    select.innerHTML = `<option value="">${options.length ? 'Selecione' : 'Sem observacoes na fonte'}</option>${options.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}`;
    if (!options.some((item) => item.key === selection.key)) selection.key = options[side === 'b' && options.length > 1 ? 1 : 0]?.key || "";
    select.value = selection.key;
    select.onchange = () => { selection.key = select.value; renderEntityResults(); };
    $(`#entity-${side}-search`).oninput = (event) => { clearTimeout(analysisSearchTimer); const query = event.target.value; analysisSearchTimer = setTimeout(() => { selection.query = query; renderEntityComparison(); },180); };
  }
  if (!pickersOnly) renderEntityResults();
}
function renderEntityResults() {
  const a = entitySelection('a'); const b = entitySelection('b');
  const aProduct = VIEWS.find((view) => view.key === a.view).product;
  const bProduct = VIEWS.find((view) => view.key === b.view).product;
  const sameGrain = a.view === b.view || (aProduct && bProduct && ['product','channel_product'].includes(a.view) && ['product','channel_product'].includes(b.view));
  const measures = [["Pedidos", "pedidos"], ["Visitas", "sessoes"], ["Receita", "receita"], ["Conversao", "rate"]];
  $("#entity-results").innerHTML = `<p class="comparison-period">Atual: ${formatWindow()} / ${comparisonWindowLabel()}</p><div class="table-scroll"><table class="data-table entity-table"><thead><tr><th>Indicador</th><th>A / ${escapeHtml(a.label)}</th><th>B / ${escapeHtml(b.label)}</th><th>B em relacao a A</th></tr></thead><tbody>${measures.map(([label,key]) => `<tr><th scope="row">${label}</th><td>${metricComparisonCell(a,key)}</td><td>${metricComparisonCell(b,key)}</td><td>${!sameGrain && ['rate','sessoes'].includes(key) ? 'Bases diferentes' : escapeHtml(comparisonLabel(b[key],a[key],key === 'rate' ? 'rate' : 'number'))}</td></tr>`).join("")}<tr><th>Sinal</th><td>${semaphoreMarkup(a)}</td><td>${semaphoreMarkup(b)}</td><td></td></tr><tr><th>Proximo indicador</th><td>${escapeHtml(nextIndicator(a))}</td><td>${escapeHtml(nextIndicator(b))}</td><td></td></tr></tbody></table></div>${!sameGrain ? '<p class="comparison-period">As selecoes usam bases de visitas ou regras de atribuicao diferentes.</p>' : ''}`;
}
function renderAll() {
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
    for (const key of ['selectedProduct','selectedModel','selectedColor','selectedSize','selectedChannel','productSearch','explorerSearch','chartFilter']) state[key] = "";
    state.chartChannels = []; $("#product-search").value = ""; $("#explorer-search").value = ""; renderAll();
  };
  const sort = $("#explorer-sort");
  [['Pedidos anteriores','comparisonPedidos'],['Variacao de pedidos','deltaPedidos'],['Visitas anteriores','comparisonSessoes'],['Variacao de visitas','deltaSessoes'],['Receita anterior','comparisonReceita'],['Variacao de receita','deltaReceita'],['Conversao anterior','comparisonRate'],['Variacao de conversao','deltaRate']].forEach(([label,value]) => sort.add(new Option(label,value)));
}
setupEvents();
setupAnalysisEvents();
loadData();
