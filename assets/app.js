const $ = (selector) => document.querySelector(selector);

const API_URL = "https://script.google.com/macros/s/AKfycby7GYHJIvpKE1hwh3hCq9atS_zKQXaz4oYQ6nzzzGFdvCr-h2sfMATeTst9qgdzghKE8w/exec";
const COLORS = ["#ff762b", "#86b8dc", "#b69dd7", "#75b99b", "#d6c87e", "#d39ca8", "#9cb8cc", "#aa92b8"];
const PAID_CHANNELS = [
  { key: "Meta Ads 1", label: "Meta Ads 1", raw: ["Meta Ads 1"] },
  { key: "Meta Ads 2", label: "Meta Ads 2", raw: ["Meta Ads 2"] },
  { key: "Google ADS", label: "Google Ads", raw: ["Google ADS"] },
];
const PAID_RAW_CHANNELS = new Set(PAID_CHANNELS.flatMap((item) => item.raw));
const PAID_CHANNEL_VIEWS = [
  ...PAID_CHANNELS.filter((item) => item.key !== "Google ADS"),
  { key: "Facebook (1 + 2)", label: "Facebook (1 + 2)", raw: ["Meta Ads 1", "Meta Ads 2"] },
  PAID_CHANNELS.find((item) => item.key === "Google ADS"),
  { key: "Total pago (Facebook + Google)", label: "Total pago (Facebook + Google)", raw: ["Meta Ads 1", "Meta Ads 2", "Google ADS"] },
];
const CHANNEL_FILTERS = [
  { key: "", label: "Todos os canais pagos", raw: PAID_RAW_CHANNELS ? [...PAID_RAW_CHANNELS] : [] },
  { key: "group-meta", label: "Meta Ads (1 + 2)", raw: ["Meta Ads 1", "Meta Ads 2"] },
  { key: "group-google", label: "Google Ads", raw: ["Google ADS"] },
  { key: "group-paid", label: "Total pago (Facebook + Google)", raw: [...PAID_RAW_CHANNELS] },
  ...PAID_CHANNELS,
];
const VIEWS = [
  { number: "01", key: "channel", title: "Taxa geral do canal", short: "Canal", question: "Qual canal trouxe resultado?", grain: "periodo + canal", product: false },
  { number: "02", key: "campaign", title: "Taxa das campanhas", short: "Campanha", question: "Quais campanhas geraram pedidos?", grain: "periodo + campanha", product: false },
  { number: "03", key: "ad_group", title: "Taxa dos grupos de anuncios", short: "Grupo", question: "Quais grupos sustentam a campanha?", grain: "periodo + grupo", product: false },
  { number: "04", key: "ad", title: "Taxa dos anuncios", short: "Criativo", question: "Quais criativos geraram resultado?", grain: "periodo + anuncio", product: false },
  { number: "05", key: "channel_product", title: "Canal + produto", short: "Canal + produto", question: "Quais produtos performam em cada canal?", grain: "periodo + canal + produto", product: true },
  { number: "06", key: "campaign_product", title: "Campanha + produto", short: "Campanha + produto", question: "Quais produtos cada campanha gera?", grain: "periodo + campanha + produto", product: true },
  { number: "07", key: "ad_group_product", title: "Grupo + produto", short: "Grupo + produto", question: "Quais grupos contribuem para cada produto?", grain: "periodo + grupo + produto", product: true },
  { number: "08", key: "ad_product", title: "Criativo + produto", short: "Criativo + produto", question: "Quais criativos geram cada produto?", grain: "periodo + anuncio + produto", product: true },
];
const state = {
  rows: [],
  commercial: null,
  growthPayload: null,
  growthViews: [],
  alternativePayload: null,
  start: "",
  end: "",
  compareStart: "",
  compareEnd: "",
  selectedChannel: "",
  selectedModel: "",
  selectedColor: "",
  selectedSize: "",
  selectedView: "channel_product",
  selectedGranularity: "week",
  rhythmMetric: "pedidos",
  chartMetric: "pedidos",
  chartChannels: [],
  chartFilter: "",
  explorerSort: "pedidos",
  explorerSearch: "",
};

function cleanText(value) {
  return String(value ?? "")
    .replaceAll("Ã¢", "a").replaceAll("Ã£", "a").replaceAll("Ã¡", "a").replaceAll("Ã©", "e")
    .replaceAll("Ã­", "i").replaceAll("Ã³", "o").replaceAll("Ãº", "u").replaceAll("Ã§", "c")
    .replaceAll("Ã‰", "E").replaceAll("Â", "").trim();
}
function escapeHtml(value) { return cleanText(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function number(value) { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function sum(values) { const available = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value)); return available.length ? available.reduce((total, value) => total + value, 0) : null; }
function fmtNumber(value) { return value === null || value === undefined || Number.isNaN(value) ? "Sem dado SSOT" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value); }
function fmtMoney(value) { return value === null || value === undefined || Number.isNaN(value) ? "Sem dado SSOT" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value); }
function fmtPercent(value) { return value === null || value === undefined || Number.isNaN(value) ? "Sem base de sessoes" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function dateKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null; }
function monthKey(value) { return String(value).slice(0, 7); }
function monthLabel(value) { const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]; const [year, month] = value.split("-").map(Number); return `${names[month - 1]}/${String(year).slice(2)}`; }
function dayLabel(value) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year.slice(2)}`; }
function toDate(value) { return new Date(`${value}T12:00:00`); }
function isoDate(date) { return date.toISOString().slice(0, 10); }
function monthRange(start, end) { if (!start || !end) return []; const result = []; const cursor = toDate(start); const last = toDate(end); cursor.setDate(1); while (cursor <= last) { result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`); cursor.setMonth(cursor.getMonth() + 1); } return result; }
function fold(value) { return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function displayChannel(value) { const key = fold(value); return { "google ads": "Google Ads", "meta ads 1": "Meta Ads 1", "meta ads 2": "Meta Ads 2", "whatsapp nao oficial": "WhatsApp Organico", "whatsapp organico": "WhatsApp Organico", "organico": "Organico" }[key] || cleanText(value); }
function isPaidRawChannel(value) { const key = fold(value); return [...PAID_RAW_CHANNELS].some((raw) => fold(raw) === key); }
function isAnalysisRow(row) { return isPaidRawChannel(row.canal || row.origem); }
function matchesSelectedChannel(row) {
  if (!state.selectedChannel) return true;
  const scope = CHANNEL_FILTERS.find((item) => item.key === state.selectedChannel) || PAID_CHANNEL_VIEWS.find((item) => item.key === state.selectedChannel);
  if (!scope) return true;
  const value = fold(row.canal || row.origem);
  return scope.raw.includes(row.canal) || (scope.key === "group-meta" && value === "meta ads") || (scope.key === "group-google" && value === "google ads");
}
function canonicalChannel(row) {
  const raw = cleanText(row.canal_detalhe || row.canal || "");
  const key = fold(raw);
  const aliases = { "google ads": "Google ADS", "whatsapp nao oficial": "WhatsApp Organico", "whatsapp organico": "WhatsApp Organico", "organico": "Organico" };
  return aliases[key] || raw;
}
function platform(row) { const value = fold(row.canal || row.origem); if (value.includes("google")) return "Google Ads"; if (value.includes("meta") || value.includes("facebook")) return "Meta Ads"; return displayChannel(row.canal || row.origem || "Nao identificada"); }

const PRODUCT_COLORS = ["azul marinho", "off white", "azul", "amarelo", "bege", "branco", "branca", "caqui", "cinza", "dourado", "marrom", "marinho", "oliva", "preto", "preta", "rosa", "verde", "vermelho", "vermelha", "whisky"];
const PRODUCT_SIZE_PATTERN = /(?:^|[\s/_-])(PP|P|M|G|GG|XG|XXG|U|UNICO|3[4-9]|4[0-9]|5[0-2])(?:$|[\s/_-])/i;
function productAttributes(row) {
  const name = cleanText(row.product || row.produto || row.product_name || row.produto_nome || "");
  const explicitModel = cleanText(row.model || row.modelo || row.product_model || "");
  const explicitColor = cleanText(row.color || row.cor || "");
  const explicitSize = cleanText(row.size || row.tamanho || "");
  const folded = fold(name);
  const color = explicitColor || PRODUCT_COLORS.find((item) => folded.includes(fold(item))) || "";
  const size = explicitSize || name.match(PRODUCT_SIZE_PATTERN)?.[1] || "";
  let model = explicitModel || name;
  if (!explicitModel && color) model = model.replace(new RegExp(`\\b${color.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "ig"), "");
  if (!explicitModel && size) model = model.replace(new RegExp(`(?:^|[\\s/_-])${String(size).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?=$|[\\s/_-])`, "ig"), " ");
  return { model: model.replace(/\s{2,}/g, " ").trim() || "Nao informado", color: color || "Nao informado", size: size || "Nao informado" };
}
function normalizeRow(row) {
  const attrs = productAttributes(row);
  const campaignId = cleanText(row.campaign_id || row.campanha_id || "");
  const campaignName = cleanText(row.campaign || row.campanha || row.campaign_name || row.campanha_nome || row.nome_campanha || row.utm_campaign || "");
  const groupId = cleanText(row.ad_group_id || row.grupo_anuncio_id || row.adgroup_id || "");
  const groupName = cleanText(row.ad_group || row.grupo_anuncio || row.ad_group_name || row.grupo_anuncio_nome || "");
  const adId = cleanText(row.ad_id || row.anuncio_id || row.creative_id || row.criativo_id || "");
  const adName = cleanText(row.ad || row.anuncio || row.ad_name || row.anuncio_nome || row.criativo_nome || "");
  const productId = cleanText(row.product_id || row.produto_id || row.sku || "");
  const productName = cleanText(row.product || row.produto || row.product_name || row.produto_nome || "");
  return { data: dateKey(row.data || row.date || row.event_date), period: row.period || "current", canal: canonicalChannel(row), origem: cleanText(row.origem || "Sem origem").trim() || "Sem origem", sessoes: number(row.sessoes ?? row.sessions), pedidos: number(row.pedidos ?? row.orders ?? row.conversoes), receita: number(row.receita ?? row.revenue), campaignId, campaignName, campaignKey: campaignId || campaignName, groupId, groupName, groupKey: groupId || groupName, adId, adName, adKey: adId || adName, productId, productName, productKey: productId || productName, productModel: attrs.model, productColor: attrs.color, productSize: attrs.size };
}
function normalizedRows(rows) { return (Array.isArray(rows) ? rows : []).map(normalizeRow).filter((row) => row.data); }
function summarize(rows) {
  const cleanRows = Array.isArray(rows) ? rows : [];
  const orders = sum(cleanRows.map((row) => row.pedidos));
  const revenue = sum(cleanRows.map((row) => row.receita));
  const sessionValues = cleanRows.map((row) => row.sessoes);
  const knownSessions = sessionValues.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  const sessions = knownSessions.length ? sum(knownSessions) : null;
  const coverage = cleanRows.length ? knownSessions.length / cleanRows.length : null;
  const complete = cleanRows.length > 0 && knownSessions.length === cleanRows.length;
  const rate = sessions !== null && sessions > 0 && orders !== null ? orders / sessions : null;
  return { rows: cleanRows.length, pedidos: orders, sessoes: sessions, receita: revenue, rate, coverage, complete, status: complete ? "Completa" : coverage > 0 ? "Parcial" : "Ausente" };
}
function periodBounds(period) { return period === "compare" ? { start: state.compareStart, end: state.compareEnd } : { start: state.start, end: state.end }; }
function inPeriod(row, period) { const bounds = periodBounds(period); return Boolean(row.data && bounds.start && bounds.end && row.data >= bounds.start && row.data <= bounds.end); }
function consolidatedChannelRows(rows) {
  const groups = new Map();
  (rows || []).forEach((row) => {
    if (!row.data || !row.canal) return;
    const key = `${row.data}|${row.canal}`;
    if (!groups.has(key)) groups.set(key, { ...row, sessoes: null, pedidos: null, receita: null, _knownSessions: false });
    const target = groups.get(key);
    if (row.sessoes !== null && row.sessoes !== undefined && Number.isFinite(row.sessoes)) {
      target.sessoes = (target.sessoes || 0) + row.sessoes;
      target._knownSessions = true;
    }
    if (row.pedidos !== null && row.pedidos !== undefined && Number.isFinite(row.pedidos)) target.pedidos = (target.pedidos || 0) + row.pedidos;
    if (row.receita !== null && row.receita !== undefined && Number.isFinite(row.receita)) target.receita = (target.receita || 0) + row.receita;
  });
  return [...groups.values()].map((row) => { delete row._knownSessions; return row; });
}
function channelSourceRows(period) {
  const entryRows = normalizedRows(viewEntry("channel")?.rows || []).filter((row) => isPaidRawChannel(row.canal) && (row.period === period || (!row.period || row.period === "current") && inPeriod(row, period)));
  const consolidated = consolidatedChannelRows(entryRows);
  if (consolidated.length && consolidated.some((row) => row.sessoes !== null)) return consolidated;
  return consolidatedChannelRows(state.rows.filter((row) => isPaidRawChannel(row.canal) && inPeriod(row, period)));
}
function scopeRows(scope, period) { return channelSourceRows(period).filter((row) => scope.raw.includes(row.canal)); }
function displayScopesForFilter(filterKey) {
  if (filterKey === "group-meta") return PAID_CHANNEL_VIEWS.filter((scope) => ["Meta Ads 1", "Meta Ads 2", "Facebook (1 + 2)"].includes(scope.key));
  if (filterKey === "group-google") return PAID_CHANNEL_VIEWS.filter((scope) => scope.key === "Google ADS");
  if (filterKey === "group-paid" || !filterKey) return PAID_CHANNEL_VIEWS;
  const exact = PAID_CHANNEL_VIEWS.find((scope) => scope.key === filterKey);
  return exact ? [exact] : PAID_CHANNEL_VIEWS;
}
function selectedScopes() { return displayScopesForFilter(state.selectedChannel); }
function selectedMetricScopes() {
  const filter = CHANNEL_FILTERS.find((scope) => scope.key === state.selectedChannel);
  if (filter) return PAID_CHANNELS.filter((scope) => filter.raw.some((raw) => scope.raw.includes(raw)));
  const exact = PAID_CHANNEL_VIEWS.find((scope) => scope.key === state.selectedChannel);
  return exact ? PAID_CHANNELS.filter((scope) => exact.raw.some((raw) => scope.raw.includes(raw))) : PAID_CHANNELS;
}
function selectedPaidRows(period) { return selectedMetricScopes().flatMap((scope) => scopeRows(scope, period)); }
function channelGroups(period) { return selectedScopes().map((scope) => ({ key: scope.key, dimension: scope.label, channel: scope.label, campaign: "", group: "", ad: "", product: "", ...summarize(scopeRows(scope, period)) })); }
function allChannelGroups(period) { return channelGroups(period); }

function viewEntry(viewKey) { return state.growthViews.find((entry) => entry.view === viewKey) || null; }
function readiness(viewKey) {
  if (viewKey === "channel" && viewEntry("channel")) return state.growthPayload?.readiness?.find((item) => item.view === viewKey) || { view: "channel", status: "Disponivel", source: viewEntry("channel").source || "SSOT" };
  if (viewKey === "channel" && state.rows.length) return { view: "channel", status: "Disponivel", source: state.commercial?.source || "SSOT comercial de canais" };
  return state.growthPayload?.readiness?.find((item) => item.view === viewKey) || null;
}
function viewRows(view, period) {
  const entry = viewEntry(view.key);
  if (!Array.isArray(entry?.rows)) return [];
  const raw = entry.rows;
  const hasPeriod = raw.some((row) => row.period === "current" || row.period === "compare");
  return normalizedRows(raw).filter((row) => {
    if (!isAnalysisRow(row)) return false;
    if (hasPeriod && row.period !== period) return false;
    if (!hasPeriod && period === "compare") return false;
    if (!matchesSelectedChannel(row)) return false;
    if (view.product && state.selectedModel && row.productModel !== state.selectedModel) return false;
    if (view.product && state.selectedColor && row.productColor !== state.selectedColor) return false;
    if (view.product && state.selectedSize && row.productSize !== state.selectedSize) return false;
    return hasPeriod || inPeriod(row, period);
  });
}
function dimensionKey(view, row) {
  const campaign = row.campaignKey || row.campaignName || "(campanha nao informada)";
  const group = row.groupKey || row.groupName || "(grupo nao informado)";
  const ad = row.adKey || row.adName || "(criativo nao informado)";
  const product = row.productKey || row.productName || "(produto nao informado)";
  const channel = row.canal || "(canal nao informado)";
  const keys = { channel: [channel], campaign: [platform(row), campaign], ad_group: [platform(row), campaign, group], ad: [platform(row), campaign, group, ad], channel_product: [channel, product], campaign_product: [platform(row), campaign, product], ad_group_product: [platform(row), campaign, group, product], ad_product: [platform(row), campaign, group, ad, product] };
  return keys[view.key].join("|");
}
function dimensions(view, row) {
  const product = row.productName || row.productKey || "";
  const campaign = row.campaignName || row.campaignKey || "";
  const group = row.groupName || row.groupKey || "";
  const ad = row.adName || row.adKey || "";
  const dimension = view.key === "channel" ? displayChannel(row.canal) : view.key === "campaign" ? `${platform(row)} · ${campaign || "Campanha nao informada"}` : view.key === "ad_group" ? group || "Grupo nao informado" : view.key === "ad" ? ad || "Criativo nao informado" : view.key === "channel_product" ? `${displayChannel(row.canal)} · ${product || "Produto nao informado"}` : view.key === "campaign_product" ? `${platform(row)} · ${campaign || "Campanha nao informada"} · ${product || "Produto nao informado"}` : view.key === "ad_group_product" ? `${group || "Grupo nao informado"} · ${product || "Produto nao informado"}` : `${ad || "Criativo nao informado"} · ${product || "Produto nao informado"}`;
  return { dimension, channel: displayChannel(row.canal), campaign, group, ad, product };
}
function groups(view, period) {
  if (view.key === "channel") return allChannelGroups(period);
  const grouped = new Map();
  viewRows(view, period).forEach((row) => { const key = dimensionKey(view, row); if (!grouped.has(key)) grouped.set(key, { rows: [], first: row }); grouped.get(key).rows.push(row); });
  return [...grouped.values()].map((item) => ({ ...dimensions(view, item.first), key: dimensionKey(view, item.first), ...summarize(item.rows) })).sort((a, b) => (b.pedidos || 0) - (a.pedidos || 0) || a.dimension.localeCompare(b.dimension, "pt-BR"));
}
function delta(current, compare) { return current?.rate !== null && current?.rate !== undefined && compare?.rate !== null && compare?.rate !== undefined ? current.rate - compare.rate : null; }
function relativeDelta(current, compare) { return current !== null && compare !== null && compare !== 0 ? current / compare - 1 : null; }

function alternativeRows(viewKey) {
  const encoded = state.alternativePayload?.views?.[viewKey];
  if (!encoded?.rows || !encoded.dictionaries) return [];
  const dimensionCount = encoded.fields.length;
  return encoded.rows.map((values) => {
    const row = {};
    encoded.fields.forEach((field, index) => { const dictionaryIndex = values[index]; row[field] = dictionaryIndex < 0 ? null : encoded.dictionaries[field][dictionaryIndex]; });
    encoded.metrics.forEach((field, index) => { row[field] = values[dimensionCount + index]; });
    return row;
  });
}
function alternativeRate(row, product) { const numerator = product ? row.itens_comprados : row.pedidos; const denominator = product ? row.visualizacoes_item : row.sessoes; return denominator > 0 ? numerator / denominator : null; }
function alternativeRecords(view) {
  const product = view.product;
  return alternativeRows(view.key).map((row) => {
    const dimension = product ? (row.produto || row.produto_id || "Produto nao informado") : view.key === "campaign" ? (row.campanha || row.campanha_id || "Campanha nao informada") : view.key === "ad_group" ? (row.grupo_anuncio || row.grupo_anuncio_id || "Grupo nao informado") : (row.anuncio || row.anuncio_id || "Anuncio nao informado");
    const record = { dimension: cleanText(dimension), channel: displayChannel(row.canal || ""), campaign: cleanText(row.campanha || row.campanha_id || ""), group: cleanText(row.grupo_anuncio || row.grupo_anuncio_id || ""), ad: cleanText(row.anuncio || row.anuncio_id || ""), product: cleanText(row.produto || row.produto_id || ""), pedidos: number(product ? row.itens_comprados : row.pedidos), sessoes: number(product ? row.visualizacoes_item : row.sessoes), receita: number(product ? row.receita_item : row.receita), rate: alternativeRate(row, product), coverage: null, status: "GA4 alternativa", source: "GA4 alternativa" };
    return record;
  }).filter((row) => !state.selectedChannel || !row.channel || selectedScopes().some((scope) => {
    const channel = fold(row.channel);
    return scope.label === row.channel || scope.raw.includes(row.channel) || (scope.key.startsWith("Meta Ads") && (channel.includes("paid social") || channel.includes("facebook") || channel === "meta ads")) || (scope.key === "Google ADS" && (channel.includes("paid search") || channel.includes("paid shopping") || channel.includes("cross-network") || channel.includes("google")));
  }));
}

function sortRecords(records, sort) { return [...records].sort((a, b) => { const av = a[sort] === null || a[sort] === undefined ? -1 : a[sort]; const bv = b[sort] === null || b[sort] === undefined ? -1 : b[sort]; return bv - av || a.dimension.localeCompare(b.dimension, "pt-BR"); }); }
function filterText(record) { return [record.dimension, record.channel, record.campaign, record.group, record.ad, record.product].join(" ").toLowerCase(); }
function coverageLabel(record) { if (record.source === "GA4 alternativa") return "GA4 / nao SSOT"; if (record.complete) return "Completa"; if (record.coverage > 0) return `${Math.round(record.coverage * 100)}% conhecida`; return "Ausente"; }

function filtersForProducts() {
  const officialRows = VIEWS.filter((view) => view.product).flatMap((view) => normalizedRows(viewEntry(view.key)?.rows || []));
  const alternativeProductRows = VIEWS.filter((view) => view.product).flatMap((view) => alternativeRows(view.key)).map((row) => { const attrs = productAttributes(row); return { productModel: attrs.model, productColor: attrs.color, productSize: attrs.size }; });
  const rows = [...officialRows, ...alternativeProductRows];
  const configs = [["product-model-filter", "selectedModel", "Todos os modelos", "productModel"], ["product-color-filter", "selectedColor", "Todas as cores", "productColor"], ["product-size-filter", "selectedSize", "Todos os tamanhos", "productSize"]];
  configs.forEach(([id, key, empty, field]) => { const select = $(`#${id}`); const values = [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")); select.innerHTML = `<option value="">${empty}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`; select.value = values.includes(state[key]) ? state[key] : ""; state[key] = select.value; select.onchange = () => { state[key] = select.value; renderExplorer(); }; });
}
function setupFilters() {
  const channelSelect = $("#global-channel-filter"); const grouped = CHANNEL_FILTERS.filter((item) => item.key.startsWith("group-")); const individual = PAID_CHANNEL_VIEWS; channelSelect.innerHTML = `<option value="">Todos os canais pagos</option><optgroup label="Grupos de canal">${grouped.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</optgroup><optgroup label="Leituras declaradas">${individual.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</optgroup>`; channelSelect.value = state.selectedChannel; channelSelect.onchange = () => { state.selectedChannel = channelSelect.value; state.chartFilter = state.selectedChannel; state.chartChannels = selectedScopes().map((scope) => scope.key); renderAll(); };
  const level = $("#explorer-level"); level.innerHTML = VIEWS.map((view) => `<option value="${view.key}">${view.number} · ${view.short}</option>`).join(""); level.value = state.selectedView; level.onchange = () => { state.selectedView = level.value; renderExplorer(); };
  filtersForProducts();
}
function metricValue(item, metric) { return metric === "rate" ? item.rate : item[metric]; }
function metricText(value, metric) { return metric === "rate" ? fmtPercent(value) : metric === "receita" ? fmtMoney(value) : fmtNumber(value); }
function metricLabel(metric) { return { pedidos: "pedidos", receita: "receita", sessoes: "sessoes", rate: "conversao" }[metric] || metric; }
function formatWindow() { return state.start ? `${dayLabel(state.start)} a ${dayLabel(state.end)}` : "Periodo nao definido"; }

function renderSummary() {
  const total = summarize(selectedPaidRows("current"));
  $("#metric-orders").textContent = fmtNumber(total.pedidos); $("#metric-sessions").textContent = fmtNumber(total.sessoes); $("#metric-revenue").textContent = fmtMoney(total.receita); $("#metric-rate").textContent = fmtPercent(total.rate); $("#summary-window").textContent = formatWindow();
  $("#metric-sessions-note").textContent = total.complete ? "Denominador completo" : total.coverage > 0 ? `${Math.round(total.coverage * 100)}% das linhas com sessoes` : "Denominador ausente";
  $("#metric-rate-note").textContent = total.complete ? "Pedidos / sessoes SSOT" : total.coverage > 0 ? "Pedidos / sessoes conhecidas" : "Sem sessoes no recorte";
  const status = total.complete ? "Sessoes completas no recorte." : total.coverage > 0 ? "Conversao calculada com as sessoes conhecidas; dias sem sessao ficam fora do denominador." : "Sem sessoes conhecidas no recorte.";
  $("#summary-status").innerHTML = `<span class="status-dot ${total.complete ? "ok" : "warn"}"></span><span>${status}</span>`;
}

function periodBucket(date, granularity) {
  const value = toDate(date);
  if (granularity === "day" || granularity === "day-over-day") return { key: date, label: dayLabel(date) };
  if (granularity === "month") return { key: monthKey(date), label: monthLabel(monthKey(date)) };
  if (granularity === "quarter") { const quarter = Math.floor(value.getMonth() / 3) + 1; return { key: `${value.getFullYear()}-Q${quarter}`, label: `T${quarter}/${value.getFullYear()}` }; }
  if (granularity === "semester") { const semester = value.getMonth() < 6 ? 1 : 2; return { key: `${value.getFullYear()}-S${semester}`, label: `S${semester}/${value.getFullYear()}` }; }
  if (granularity === "year") return { key: String(value.getFullYear()), label: String(value.getFullYear()) };
  const monday = new Date(value); const day = monday.getDay() || 7; monday.setDate(monday.getDate() - day + 1); const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6); const start = isoDate(monday); const end = isoDate(sunday); return { key: start, label: `${dayLabel(start)} - ${dayLabel(end)}` };
}
function aggregatePeriods(rows, granularity) {
  const map = new Map(); rows.forEach((row) => { const bucket = periodBucket(row.data, granularity); if (!map.has(bucket.key)) map.set(bucket.key, { key: bucket.key, label: bucket.label, rows: [] }); map.get(bucket.key).rows.push(row); });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map((item) => ({ ...item, ...summarize(item.rows) }));
}
function periodReading(item) { if (!item) return "Sem dados"; if (!item.complete) return item.coverage > 0 ? "Cobertura parcial" : "Sessoes ausentes"; if (item.rate === null) return "Sem denominador valido"; return item.rate >= 0.02 ? "Acima de 2%" : "Acompanhar conversao"; }
function periodLimit(granularity) { return { day: 31, "day-over-day": 31, week: 12, month: 12, quarter: 8, semester: 6, year: 5 }[granularity] || 12; }
function granularityLabel(granularity) { return { day: "dia", "day-over-day": "dia a dia", week: "semana", month: "mes", quarter: "trimestre", semester: "semestre", year: "ano" }[granularity] || granularity; }
function chartMax(metric, known) { const observedMax = Math.max(...known, 0); if (metric === "rate") return Math.max(0.01, observedMax + 0.01); return Math.max(1, observedMax * 1.15); }
function renderRhythmChart(periods) {
  const box = $("#rhythm-chart"); const metric = state.rhythmMetric; const visible = periods.slice(-12); const values = visible.map((item) => metricValue(item, metric));
  if (!visible.length || !values.some((value) => value !== null)) { box.innerHTML = `<div class="empty-state">${metric === "rate" ? "Conversao indisponivel por cobertura de sessoes." : "Sem dados para este indicador."}</div>`; return; }
  const width = Math.max(box.clientWidth - 18, 620); const height = 280; const margin = { top: 18, right: 18, bottom: 48, left: 58 }; const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom; const known = values.filter((value) => value !== null); const max = chartMax(metric, known); const x = (index) => margin.left + (visible.length === 1 ? plotWidth / 2 : index / (visible.length - 1) * plotWidth); const y = (value) => margin.top + plotHeight - value / max * plotHeight; const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metricLabel(metric)} por periodo">`];
  for (let tick = 0; tick <= 4; tick += 1) { const value = max / 4 * tick; const yy = y(value); svg.push(`<line x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}" stroke="#303843"/><text x="${margin.left - 9}" y="${yy + 4}" text-anchor="end" fill="#8d98a6" font-size="9">${escapeHtml(metricText(value, metric))}</text>`); }
  visible.forEach((item, index) => svg.push(`<text x="${x(index)}" y="${height - 15}" text-anchor="middle" fill="#8d98a6" font-size="9">${escapeHtml(item.label)}</text>`));
  const points = visible.map((item, index) => metricValue(item, metric) === null ? null : { x: x(index), y: y(metricValue(item, metric)), value: metricValue(item, metric), label: item.label }).filter(Boolean); svg.push(`<path d="${points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#ff762b" stroke-width="2.6" stroke-linecap="round"/>`); points.forEach((point) => svg.push(`<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#ff762b" stroke="#191e25" stroke-width="1.4"><title>${escapeHtml(point.label)} · ${escapeHtml(metricText(point.value, metric))}</title></circle>`)); svg.push("</svg>"); box.innerHTML = svg.join("");
}
function renderMiniPeriod(id, item, metric) { $(`#${id}-label`).textContent = item?.label || "Periodo nao definido"; $(`#${id}-value`).textContent = item ? metricText(metricValue(item, metric), metric) : "Sem dado SSOT"; $(`#${id}-note`).textContent = item ? `${fmtNumber(item.pedidos)} pedidos · ${coverageLabel(item)}` : "Sem observacao"; }
function renderRhythm() {
  const rows = selectedPaidRows("current"); const periods = aggregatePeriods(rows, state.selectedGranularity); const visible = periods.slice(-periodLimit(state.selectedGranularity)); $("#rhythm-window").textContent = `${visible.length} ${granularityLabel(state.selectedGranularity)}(s) · ${metricLabel(state.rhythmMetric)}`; renderRhythmChart(visible);
  $("#rhythm-body").innerHTML = visible.length ? [...visible].reverse().map((item) => `<tr><td><strong>${escapeHtml(item.label)}</strong></td><td>${fmtNumber(item.pedidos)}</td><td>${fmtNumber(item.sessoes)}</td><td>${fmtMoney(item.receita)}</td><td class="${item.rate === null ? "rate-pending" : "coverage"}">${fmtPercent(item.rate)}</td><td>${coverageLabel(item)}</td><td>${escapeHtml(periodReading(item))}</td></tr>`).join("") : `<tr><td colspan="7" class="table-empty">Nenhum dado no periodo selecionado.</td></tr>`;
  const lastDay = aggregatePeriods(rows, "day").at(-1); const lastWeek = aggregatePeriods(rows, "week").at(-1); const lastMonth = aggregatePeriods(rows, "month").at(-1); renderMiniPeriod("last-day", lastDay, state.rhythmMetric); renderMiniPeriod("last-week", lastWeek, state.rhythmMetric); renderMiniPeriod("last-month", lastMonth, state.rhythmMetric);
  document.querySelectorAll("[data-granularity]").forEach((button) => button.classList.toggle("active", button.dataset.granularity === state.selectedGranularity));
}

function compareText(current, previous) { const change = relativeDelta(current?.pedidos, previous?.pedidos); if (change === null) return "Sem comparacao"; return `${change >= 0 ? "+" : ""}${fmtPercent(change)} pedidos`; }
function renderChannelTable() {
  const current = allChannelGroups("current"); const previous = new Map(allChannelGroups("compare").map((item) => [item.key, item])); const total = summarize(selectedPaidRows("current")); const available = current.filter((item) => item.pedidos !== null).length; $("#channel-status").textContent = `${available} canais com pedidos`; $("#channel-status").className = `status-pill ${available ? "ok" : "pending"}`;
  $("#channel-body").innerHTML = current.map((item) => { const compare = previous.get(item.key); const action = item.status === "Ausente" ? "Sem dados" : item.complete && total.rate !== null && item.rate > total.rate ? "Acima do total" : item.status === "Parcial" ? "Corrigir cobertura" : "Acompanhar"; return `<tr><td><button type="button" class="channel-link channel-open" data-channel="${escapeHtml(item.key)}">${escapeHtml(item.label || item.dimension)}</button></td><td>${fmtNumber(item.pedidos)}</td><td>${fmtNumber(item.sessoes)}</td><td>${fmtMoney(item.receita)}</td><td class="${item.rate === null ? "rate-pending" : "coverage"}">${fmtPercent(item.rate)}</td><td>${coverageLabel(item)}</td><td>${escapeHtml(compareText(item, compare))}</td><td><span class="table-status ${item.status === "Completa" ? "ok" : "warn"}">${escapeHtml(action)}</span></td></tr>`; }).join("");
  document.querySelectorAll(".channel-open").forEach((button) => { button.onclick = () => { state.selectedChannel = button.dataset.channel; state.chartFilter = state.selectedChannel; state.chartChannels = selectedScopes().map((scope) => scope.key); $("#global-channel-filter").value = state.selectedChannel; renderAll(); document.querySelector("#growth-views")?.scrollIntoView({ behavior: "smooth", block: "start" }); }; });
}

function chartRows(scope, granularity) { return aggregatePeriods(scopeRows(scope, "current"), granularity); }
function renderChart() {
  const select = $("#chart-channel-filter"); const chartFilters = CHANNEL_FILTERS.slice(0, 4); const chartFilter = state.chartFilter || state.selectedChannel || ""; const defaultChannels = displayScopesForFilter(chartFilter).map((scope) => scope.key); const selected = state.chartChannels.length ? state.chartChannels : defaultChannels; select.innerHTML = chartFilters.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join(""); select.value = chartFilter; select.onchange = () => { state.chartFilter = select.value; state.chartChannels = displayScopesForFilter(select.value).map((scope) => scope.key); renderChart(); };
  const metric = state.chartMetric; const months = monthRange(state.start, state.end); const series = selected.map((key, index) => { const scope = PAID_CHANNEL_VIEWS.find((item) => item.key === key); if (!scope) return null; const values = new Map(chartRows(scope, "month").map((item) => [item.key, metricValue(item, metric)])); return { key, label: scope.label, color: COLORS[index % COLORS.length], values }; }).filter((item) => item && [...item.values.values()].some((value) => value !== null)); $("#chart-window").textContent = `${monthLabel(months[0] || "2025-01")} a ${monthLabel(months.at(-1) || "2026-10")}`;
  const box = $("#line-chart"); if (!series.length) { box.innerHTML = `<div class="empty-state">${metric === "rate" ? "Conversao sem sessoes conhecidas no recorte." : "Sem dados para os canais selecionados."}</div>`; return; }
  const width = Math.max(box.clientWidth - 18, 720); const height = 310; const margin = { top: 15, right: 20, bottom: 48, left: 62 }; const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom; const known = series.flatMap((item) => [...item.values.values()].filter((value) => value !== null)); const max = chartMax(metric, known); const x = (index) => margin.left + (months.length === 1 ? plotWidth / 2 : index / (months.length - 1) * plotWidth); const y = (value) => margin.top + plotHeight - value / max * plotHeight; const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metricLabel(metric)} por canal e mes">`]; for (let tick = 0; tick <= 4; tick += 1) { const value = max / 4 * tick; const yy = y(value); svg.push(`<line x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}" stroke="#303843"/><text x="${margin.left - 9}" y="${yy + 4}" text-anchor="end" fill="#8d98a6" font-size="9">${escapeHtml(metricText(value, metric))}</text>`); } months.forEach((month, index) => svg.push(`<text x="${x(index)}" y="${height - 15}" text-anchor="middle" fill="#8d98a6" font-size="9">${monthLabel(month)}</text>`)); series.forEach((item) => { const points = months.map((month, index) => item.values.get(month) === null ? null : { x: x(index), y: y(item.values.get(month)), value: item.values.get(month), month }).filter(Boolean); if (!points.length) return; svg.push(`<path d="${points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")}" fill="none" stroke="${item.color}" stroke-width="2.2" stroke-linecap="round"/>`); points.forEach((point) => svg.push(`<circle cx="${point.x}" cy="${point.y}" r="3" fill="${item.color}" stroke="#191e25" stroke-width="1.3"><title>${escapeHtml(item.label)} · ${monthLabel(point.month)} · ${escapeHtml(metricText(point.value, metric))}</title></circle>`)); }); svg.push("</svg>"); box.innerHTML = svg.join(""); const unavailable = selected.filter((key) => !series.some((item) => item.key === key)); $("#chart-note").textContent = unavailable.length ? "Alguns canais nao possuem sessoes conhecidas para este indicador." : "";
}

function renderExplorerLegacy() {
  const view = VIEWS.find((item) => item.key === state.selectedView) || VIEWS[0]; const info = readiness(view.key); const official = view.key === "channel" || String(info?.status || "").toLowerCase().includes("dispon"); let records = official ? groups(view, "current") : alternativeRecords(view); const query = state.explorerSearch.trim().toLowerCase(); if (query) records = records.filter((record) => filterText(record).includes(query)); records = sortRecords(records, state.explorerSort); const total = records.length; const visible = records.slice(0, 25); const sourceLabel = official ? "SSOT" : "GA4 alternativa"; $("#explorer-status").textContent = official ? "SSOT" : "Diagnostico GA4"; $("#explorer-status").className = `status-pill ${official ? "ok" : "warn"}`; $("#explorer-count").textContent = `${total} resultado(s) · Top ${Math.min(25, total)}`; $("#explorer-summary").innerHTML = `<span><strong>${escapeHtml(view.title)}</strong> · ${escapeHtml(view.question)}</span><span>Fonte: <b>${sourceLabel}</b> · ${escapeHtml(view.grain)}</span>`;
  $("#explorer-body").innerHTML = visible.length ? visible.map((record) => `<tr><td><strong>${escapeHtml(record.dimension)}</strong></td><td>${escapeHtml(record.channel || "Sem identificacao")}</td><td>${escapeHtml(record.campaign || "Sem identificacao")}</td><td>${escapeHtml(record.group || "Sem identificacao")}</td><td>${escapeHtml(record.ad || "Sem identificacao")}</td><td>${escapeHtml(record.product || "Sem identificacao")}</td><td>${fmtNumber(record.pedidos)}</td><td>${fmtNumber(record.sessoes)}</td><td>${fmtMoney(record.receita)}</td><td class="${record.rate === null ? "rate-pending" : "coverage"}">${fmtPercent(record.rate)}</td><td>${escapeHtml(coverageLabel(record))}</td><td><span class="table-status ${official ? "ok" : "warn"}">${sourceLabel}</span></td></tr>`).join("") : `<tr><td colspan="12" class="table-empty">${escapeHtml(info?.reason || "Nenhuma linha encontrada para os filtros selecionados.")}</td></tr>`;
}

function explorerColumns(view) {
  const dimensions = {
    channel: [["Canal", "channel"]],
    campaign: [["Campanha", "dimension"], ["Canal", "channel"]],
    ad_group: [["Grupo", "dimension"], ["Campanha", "campaign"], ["Canal", "channel"]],
    ad: [["Criativo", "dimension"], ["Grupo", "group"], ["Campanha", "campaign"], ["Canal", "channel"]],
    channel_product: [["Produto", "product"], ["Canal", "channel"]],
    campaign_product: [["Produto", "product"], ["Campanha", "campaign"], ["Canal", "channel"]],
    ad_group_product: [["Produto", "product"], ["Grupo", "group"], ["Canal", "channel"]],
    ad_product: [["Produto", "product"], ["Criativo", "ad"], ["Campanha", "campaign"], ["Canal", "channel"]],
  };
  return [...(dimensions[view.key] || dimensions.channel), ["Pedidos", "pedidos"], [view.product ? "Itens vistos" : "Sessoes", "sessoes"], ["Receita", "receita"], ["Conversao", "rate"], ["Cobertura", "coverage"], ["Fonte", "source"]];
}
function explorerCell(record, key) {
  if (key === "pedidos") return fmtNumber(record.pedidos);
  if (key === "sessoes") return fmtNumber(record.sessoes);
  if (key === "receita") return fmtMoney(record.receita);
  if (key === "rate") return `<span class="${record.rate === null ? "rate-pending" : "coverage"}">${fmtPercent(record.rate)}</span>`;
  if (key === "coverage") return escapeHtml(coverageLabel(record));
  if (key === "source") return `<span class="table-status ${record.source === "GA4 alternativa" ? "warn" : "ok"}">${escapeHtml(record.source || "SSOT")}</span>`;
  return escapeHtml(record[key] || "Sem identificacao");
}
function recordsForDisplay(view) {
  const officialRecords = view.key === "channel" ? groups(view, "current") : groups(view, "current");
  const complementaryRecords = view.key === "channel" ? [] : alternativeRecords(view);
  const officialHasCompleteMetrics = officialRecords.length > 0 && officialRecords.every((record) => record.pedidos !== null && record.sessoes !== null && record.receita !== null);
  if (complementaryRecords.length && !officialHasCompleteMetrics) return { records: complementaryRecords, official: false, sourceLabel: "Camada complementar" };
  return { records: officialRecords, official: true, sourceLabel: "SSOT" };
}
function renderExplorer() {
  const view = VIEWS.find((item) => item.key === state.selectedView) || VIEWS[0]; const info = readiness(view.key); const selection = recordsForDisplay(view); let records = selection.records; const query = state.explorerSearch.trim().toLowerCase(); if (query) records = records.filter((record) => filterText(record).includes(query)); records = sortRecords(records, state.explorerSort); const total = records.length; const visible = records.slice(0, 25); const columns = explorerColumns(view); $("#explorer-head").innerHTML = `<tr>${columns.map(([label]) => `<th>${label}</th>`).join("")}</tr>`; $("#explorer-status").textContent = selection.sourceLabel; $("#explorer-status").className = `status-pill ${selection.official ? "ok" : "warn"}`; $("#explorer-count").textContent = `${total} resultado(s) · Top ${Math.min(25, total)}`; $("#explorer-summary").innerHTML = `<span><strong>${escapeHtml(view.title)}</strong> · ${escapeHtml(view.question)}</span><span>Fonte: <b>${selection.sourceLabel}</b> · ${escapeHtml(view.grain)}</span>`;
  $("#explorer-body").innerHTML = visible.length ? visible.map((record) => `<tr>${columns.map(([, key]) => `<td>${key === "dimension" ? `<strong>${escapeHtml(record.dimension)}</strong>` : explorerCell(record, key)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" class="table-empty">${escapeHtml(info?.reason || "Nenhuma linha encontrada para os filtros selecionados.")}</td></tr>`;
}

function renderQuality() {
  const officialViews = VIEWS.filter((view) => view.key === "channel" || String(readiness(view.key)?.status || "").toLowerCase().includes("dispon")); const alternativeViews = VIEWS.filter((view) => !officialViews.includes(view) && state.alternativePayload?.views?.[view.key]); const pendingViews = VIEWS.filter((view) => !officialViews.includes(view) && !alternativeViews.includes(view)); $("#quality-count").textContent = `${officialViews.length} oficiais · ${alternativeViews.length} diagnosticos`;
  const total = summarize(selectedPaidRows("current")); const cards = [{ type: officialViews.length ? "ok" : "warn", title: "Camada oficial", text: `${officialViews.length} visao(oes) com leitura SSOT.` }, { type: total.rate !== null ? "ok" : "warn", title: "Sessoes do canal", text: total.complete ? "Denominador completo para conversao." : total.coverage > 0 ? "Conversao calculada sobre sessoes conhecidas." : "Sem sessoes conhecidas no recorte." }, { type: alternativeViews.length ? "warn" : "pending", title: "Camada diagnostica", text: alternativeViews.length ? `${alternativeViews.length} visao(oes) usam GA4 e nao substituem SSOT.` : "Nenhuma alternativa carregada." }]; $("#quality-list").innerHTML = cards.map((item) => `<div class="quality-item ${item.type}"><i></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div></div>`).join("");
  const decisions = { channel: "Comparar canais e ritmo", campaign: "Comparar campanhas", ad_group: "Diagnostico GA4; nao conversao oficial", ad: "Diagnostico GA4; nao conversao oficial", channel_product: "Comparar produto por canal", campaign_product: "Diagnostico GA4; nao conversao oficial", ad_group_product: "Diagnostico GA4; nao conversao oficial", ad_product: "Diagnostico GA4; nao conversao oficial" };
  $("#catalog-body").innerHTML = VIEWS.map((view) => { const official = view.key === "channel" || String(readiness(view.key)?.status || "").toLowerCase().includes("dispon"); const alternative = Boolean(state.alternativePayload?.views?.[view.key]); const status = official ? "SSOT disponivel" : alternative ? "Diagnostico GA4" : "Pendente"; return `<tr><td><strong>${view.number} · ${escapeHtml(view.short)}</strong></td><td>${official ? escapeHtml(readiness(view.key)?.source || "SSOT") : alternative ? "ga4-growth-alternative.json" : "Fonte nao encontrada"}</td><td class="${official ? "ok" : alternative ? "warn" : "pending"}">${status}</td><td>${escapeHtml(decisions[view.key])}</td></tr>`; }).join("");
}

function renderAll() { setupFilters(); renderSummary(); renderRhythm(); renderChannelTable(); renderChart(); renderExplorer(); renderQuality(); }
async function loadJson(url, timeout = 18000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout); try { const response = await fetch(url, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); } finally { clearTimeout(timer); } }
async function loadGrowth() { try { return await loadJson(`${API_URL}?view=growth_views&_ts=${Date.now()}`, 120000); } catch (remoteError) { return { ok: false, error: `Ponte growth_views indisponivel: ${remoteError.message}` }; } }
async function loadAlternative() { try { return await loadJson("data/ga4-growth-alternative.json"); } catch (error) { return { ok: false, error: error.message }; } }
function defaultWindow(rows) { const dates = rows.map((row) => row.data).filter(Boolean).sort(); const end = dates.at(-1) || ""; if (!end) return { start: "", end: "" }; const last = toDate(end); const first = new Date(last.getFullYear(), last.getMonth() - 11, 1, 12); return { start: isoDate(first), end }; }
async function loadData() {
  $("#source-status").textContent = "Carregando SSOT"; $("#source-pill").textContent = "Validando fonte"; $("#source-pill").className = "status-pill pending";
  try {
    const [commercial, growth, alternative] = await Promise.all([loadJson("data/ssot-commercial-channels.json"), loadGrowth(), loadAlternative()]); state.commercial = commercial; state.rows = normalizedRows(commercial.rows || []); state.growthPayload = growth && growth.ok !== false && Array.isArray(growth.data) ? growth : null; state.growthViews = state.growthPayload?.data || []; state.alternativePayload = alternative && alternative.ok !== false ? alternative : null;
    const fallback = defaultWindow(state.rows); state.start = growth?.window?.start || fallback.start; state.end = growth?.window?.end || fallback.end; state.compareStart = growth?.window?.compareStart || ""; state.compareEnd = growth?.window?.compareEnd || ""; if (!state.compareStart && state.start) { const start = toDate(state.start); const end = toDate(state.end); const days = Math.round((end - start) / 86400000) + 1; state.compareEnd = isoDate(new Date(start.getTime() - 86400000)); state.compareStart = isoDate(new Date(start.getTime() - days * 86400000)); }
    $("#date-start").value = state.start; $("#date-end").value = state.end; $("#source-name").textContent = commercial.source || "SSOT"; $("#extracted-at").textContent = commercial.extracted_at || growth?.generatedAt || "Atualizacao nao informada"; $("#source-status").textContent = state.growthPayload ? "SSOT conectado" : "SSOT de canais conectado"; $("#source-pill").textContent = state.growthPayload ? "Fonte conectada" : "Canais conectados"; $("#source-pill").className = `status-pill ${state.growthPayload ? "ok" : "warn"}`; $("#validation-title").textContent = "Base carregada"; $("#validation-summary").textContent = `${state.rows.length.toLocaleString("pt-BR")} linhas de canais; ${state.growthViews.length} visoes growth; pedidos e receita continuam disponiveis mesmo com cobertura parcial.`; $("#validation-banner").className = "validation-banner valid"; renderAll();
  } catch (error) { $("#source-status").textContent = "Fonte indisponivel"; $("#source-pill").textContent = "Erro de fonte"; $("#source-pill").className = "status-pill error"; $("#validation-title").textContent = "Falha na leitura"; $("#validation-summary").textContent = error.message; $("#validation-banner").className = "validation-banner error"; }
}
function setupEvents() {
  $("#reload-data").onclick = loadData;
  $("#clear-filters").onclick = () => { state.selectedChannel = ""; state.selectedModel = ""; state.selectedColor = ""; state.selectedSize = ""; state.chartChannels = []; state.chartFilter = ""; state.explorerSearch = ""; $("#explorer-search").value = ""; renderAll(); };
  $("#period-preset").onchange = (event) => { const value = event.target.value; if (value === "last-complete") { const max = toDate(state.end); const last = new Date(max.getFullYear(), max.getMonth(), 0, 12); const first = new Date(last.getFullYear(), last.getMonth() - 11, 1, 12); state.start = isoDate(first); state.end = isoDate(last); } else if (value === "year-2026") { state.start = "2026-01-01"; state.end = "2026-12-31"; } else if (value === "year-2025") { state.start = "2025-01-01"; state.end = "2025-12-31"; } else if (value === "all") { const dates = state.rows.map((row) => row.data).filter(Boolean).sort(); state.start = dates[0]; state.end = dates.at(-1); } $("#date-start").value = state.start; $("#date-end").value = state.end; renderAll(); };
  $("#date-start").onchange = (event) => { state.start = event.target.value; $("#period-preset").value = "custom"; renderAll(); };
  $("#date-end").onchange = (event) => { state.end = event.target.value; $("#period-preset").value = "custom"; renderAll(); };
  document.querySelectorAll("[data-granularity]").forEach((button) => { button.onclick = () => { state.selectedGranularity = button.dataset.granularity; renderRhythm(); }; });
  $("#rhythm-metric").onchange = (event) => { state.rhythmMetric = event.target.value; renderRhythm(); };
  $("#chart-metric").onchange = (event) => { state.chartMetric = event.target.value; renderChart(); };
  $("#explorer-sort").onchange = (event) => { state.explorerSort = event.target.value; renderExplorer(); };
  $("#explorer-search").oninput = (event) => { state.explorerSearch = event.target.value; renderExplorer(); };
}
setupEvents();
loadData();
