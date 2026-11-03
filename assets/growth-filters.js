const filterKeys = ['start','end','compareStart','compareEnd','compareMode','compareEnabled','selectedChannel','selectedProduct','selectedModel','selectedColor','selectedSize','productSearch','selectedView','selectedGranularity','chartFilter','chartChannels','chartMetric','rhythmMetric'];
let filterDraft = null;
let filterSearchTimer = null;
let filterOriginalPreset = 'current-day';
const filterDialog = $("#growth-filter-dialog");
const filterForm = $("#growth-filter-form");
function snapshotFilters() {
  return { values: Object.fromEntries(filterKeys.map((key) => [key, structuredClone(state[key])])), entities: structuredClone(entityState), preset: $("#period-preset").value };
}
// Reuse the catalog/date controls against a draft without changing the applied scope.
function inFilterDraft(callback) {
  const saved = snapshotFilters();
  try {
    Object.assign(state, filterDraft.values);
    Object.assign(entityState, structuredClone(filterDraft.entities));
    callback();
    filterDraft.values = Object.fromEntries(filterKeys.map((key) => [key, structuredClone(state[key])]));
    filterDraft.entities = structuredClone(entityState);
  } finally {
    Object.assign(state, saved.values);
    Object.assign(entityState, saved.entities);
  }
}
function refreshFilterSummary() {
  $("#filter-summary-period").textContent = formatWindow();
  $("#filter-summary-comparison").textContent = comparisonWindowLabel();
  const channel = growthChannelLabel();
  $("#filter-summary-scope").textContent = `${productFilterActive() ? analysisScopeLabel() : 'Todos os produtos'} / ${channel}${entityState.charts ? ' / Graficos A/B' : ''}`;
  $("#filter-count").textContent = 1 + Number(Boolean(entityState.charts)) + ['selectedChannel','selectedProduct','selectedModel','selectedColor','selectedSize','productSearch'].filter((key) => state[key]).length;
}
function renderFilterDraft() {
  for (const input of filterForm.querySelectorAll('input[type="date"]')) input.setCustomValidity('');
  inFilterDraft(() => {
    setupFilters(true);
    $("#compare-enabled").checked = state.compareEnabled;
    for (const id of ['compare-mode','compare-start','compare-end']) $(`#${id}`).disabled = !state.compareEnabled;
    $("#period-preset").value = filterDraft.preset;
    $("#date-start").value = state.start; $("#date-end").value = state.end;
    $("#product-search").value = state.productSearch;
    $("#filter-view").innerHTML = growthViewOptions();
    $("#filter-view").value = state.selectedView;
    $("#filter-metric").value = state.chartMetric;
    renderEntityComparison(true);
    for (const side of ['a','b']) $(`#entity-${side}-search`).value = entityState[side].query;
    const issue = growthFilterIssue();
    $("#growth-filter-warning").textContent = issue;
    $("#growth-filter-warning").hidden = !issue;
    $("#apply-filters").disabled = Boolean(issue);
  });
  window.ReiseSearch?.refresh();
}
function growthFilterIssue() {
  const availability = viewAvailability(state.selectedView);
  if (!availability.available) return `${availability.reason} Ajuste o canal, o produto ou a visao.`;
  for (const id of ['product-filter','product-model-filter','product-color-filter','product-size-filter']) {
    const select = $(`#${id}`);
    if (select.value && select.selectedOptions[0]?.disabled) return 'Selecao de produto fora do recorte. Ajuste ou limpe o filtro para continuar.';
  }
  return '';
}
function openGrowthFilters() {
  clearTimeout(analysisSearchTimer);
  filterDraft = snapshotFilters();
  filterOriginalPreset = filterDraft.preset;
  renderFilterDraft();
  if (!filterDialog.open) filterDialog.showModal();
}
function closeGrowthFilters() {
  window.ReiseSearch?.close();
  clearTimeout(filterSearchTimer);
  filterDraft = null;
  filterDialog.close();
  // Restore the control values too, so later opens start from the applied recorte.
  setupFilters();
  $("#period-preset").value = filterOriginalPreset;
  $("#date-start").value = state.start; $("#date-end").value = state.end;
}
function handleFilterEdit(event) {
  const node = event.target;
  if (!node.matches('input,select')) return;
  event.stopImmediatePropagation();
  if (!filterDraft) return;
  if (node.type === 'date') for (const input of filterForm.querySelectorAll('input[type="date"]')) input.setCustomValidity('');
  if (event.type === 'input' && node.type !== 'search') return;
  const keyMap = { 'product-filter':'selectedProduct', 'product-model-filter':'selectedModel', 'product-color-filter':'selectedColor', 'product-size-filter':'selectedSize', 'global-channel-filter':'selectedChannel', 'product-search':'productSearch', 'filter-view':'selectedView' };
  const key = keyMap[node.id];
  if (key) {
    const changed = filterDraft.values[key] !== node.value;
    filterDraft.values[key] = node.value;
    if (key === 'selectedProduct') for (const attr of ['selectedModel','selectedColor','selectedSize']) filterDraft.values[attr] = '';
    if (key === 'productSearch' && changed) filterDraft.values.selectedProduct = '';
    if (key === 'selectedChannel') { filterDraft.values.chartFilter = node.value; filterDraft.values.chartChannels = []; }
  } else if (node.id === 'filter-metric') {
    filterDraft.values.chartMetric = node.value; filterDraft.values.rhythmMetric = node.value;
  } else if (node.id === 'entity-charts') {
    filterDraft.entities.charts = node.checked;
  } else if (node.id === 'entity-scope') {
    filterDraft.entities.scope = node.value;
  } else if (node.id.startsWith('entity-')) {
    const [,side,field] = node.id.split('-');
    filterDraft.entities[side][field === 'search' ? 'query' : field] = node.value;
    if (field === 'key' && node.value) filterDraft.entities.charts = true;
    if (field === 'view') { filterDraft.entities[side].key = ''; filterDraft.entities[side].query = ''; }
  } else {
    inFilterDraft(() => {
      if (node.id === 'period-preset') { filterDraft.preset = node.value; applyPeriodPreset(node.value); }
      if (node.id === 'compare-mode') { state.compareMode = node.value; applyComparison(); }
      if (node.id === 'compare-enabled') state.compareEnabled = node.checked;
      if (node.id === 'date-start' || node.id === 'date-end') {
        state[node.id === 'date-start' ? 'start' : 'end'] = node.value;
        filterDraft.preset = 'custom'; applyComparison(); suggestGranularityForWindow();
      }
      if (node.id === 'compare-start' || node.id === 'compare-end') {
        state.compareMode = 'custom'; state[node.id === 'compare-start' ? 'compareStart' : 'compareEnd'] = node.value;
      }
    });
  }
  clearTimeout(filterSearchTimer);
  if (node.type === 'search') filterSearchTimer = setTimeout(renderFilterDraft, 180);
  else renderFilterDraft();
}
filterForm.addEventListener('input', handleFilterEdit, true);
filterForm.addEventListener('change', handleFilterEdit, true);
filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(filterSearchTimer);
  let issue = '';
  inFilterDraft(() => { issue = growthFilterIssue(); });
  if (issue) { renderFilterDraft(); return; }
  const values = filterDraft.values;
  for (const [start,end,id] of [[values.start,values.end,'date-end'], [values.compareStart,values.compareEnd,'compare-end']]) {
    if (id === 'compare-end' && !values.compareEnabled) continue;
    const node = $(`#${id}`);
    node.setCustomValidity(!start || !end || start > end ? 'Informe um periodo valido, com fim igual ou posterior ao inicio.' : '');
    if (!node.reportValidity()) return;
  }
  const preset = filterDraft.preset;
  const entitiesChanged = JSON.stringify(entityState) !== JSON.stringify(filterDraft.entities);
  Object.assign(state, structuredClone(values)); Object.assign(entityState, structuredClone(filterDraft.entities));
  $("#period-preset").value = preset;
  $("#rhythm-metric").value = state.rhythmMetric; $("#chart-metric").value = state.chartMetric;
  $("#explorer-search").value = ''; state.explorerSearch = '';
  filterDraft = null; filterDialog.close(); renderAll();
  if (entitiesChanged) $("#entity-comparison").open = true;
});
$("#clear-filters").onclick = () => {
  clearTimeout(filterSearchTimer);
  for (const key of ['selectedProduct','selectedModel','selectedColor','selectedSize','selectedChannel','productSearch','chartFilter']) filterDraft.values[key] = '';
  filterDraft.values.chartChannels = [];
  filterDraft.values.compareMode = 'previous';
  filterDraft.values.compareEnabled = true;
  filterDraft.entities = { scope:'global', charts:false, a:{view:'channel',key:'Meta Ads 1',query:''}, b:{view:'channel',key:'Google ADS',query:''} };
  filterDraft.values.selectedView = 'channel_product';
  filterDraft.preset = 'current-day';
  inFilterDraft(() => applyPeriodPreset('current-day'));
  renderFilterDraft();
};
$("#open-filters").onclick = openGrowthFilters;
$("#close-filters").onclick = closeGrowthFilters;
$("#cancel-filters").onclick = closeGrowthFilters;
filterDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeGrowthFilters(); });
document.querySelector('.product-filter-shortcut').onclick = (event) => { event.preventDefault(); openGrowthFilters(); $("#product-search").focus(); };
const comparisonPickers = document.querySelector('.comparison-pickers');
const comparisonDetails = document.createElement('details');
comparisonDetails.className = 'filter-entity-options';
comparisonDetails.innerHTML = '<summary>Comparar canais, produtos e combinacoes</summary>';
comparisonDetails.append(comparisonPickers);
$("#filter-entities-section").append(comparisonDetails);
refreshFilterSummary();

function growthSearchOptions(selectId, input) {
  return Array.from($(`#${selectId}`).options).filter(option => option.value && !option.disabled)
    .filter(option => fuzzyMatch(option.textContent, input.value))
    .map(option => ({ value: option.value, label: option.textContent,
      inputValue: option.value.startsWith(ENTITY_PRODUCT_SEARCH) ? input.value : option.textContent }));
}
window.ReiseSearch.attach($('#product-search'), {
  options: () => growthSearchOptions('product-filter', $('#product-search')),
  select: item => {
    if (!filterDraft) return;
    clearTimeout(filterSearchTimer);
    Object.assign(filterDraft.values, { selectedProduct: item.value, productSearch: item.label, selectedModel: '', selectedColor: '', selectedSize: '' });
    renderFilterDraft();
  },
});
for (const side of ['a', 'b']) {
  const input = $(`#entity-${side}-search`);
  window.ReiseSearch.attach(input, {
    options: () => growthSearchOptions(`entity-${side}-key`, input),
    select: item => {
      if (!filterDraft) return;
      clearTimeout(filterSearchTimer);
      Object.assign(filterDraft.entities[side], { key: item.value, query: item.inputValue });
      filterDraft.entities.charts = true;
      renderFilterDraft();
    },
  });
}
window.ReiseSearch.attach($('#explorer-search'), {
  options: query => recordsForDisplay(VIEWS.find(view => view.key === state.selectedView)).records
    .filter(row => fuzzyMatch(filterText(row), query)).map(row => ({ value: row.key, label: row.dimension })),
  select: item => { state.explorerSearch = item.label; renderExplorer(); },
});
