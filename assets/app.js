const $ = (selector) => document.querySelector(selector);

const API_URL = "https://script.google.com/macros/s/AKfycby7GYHJIvpKE1hwh3hCq9atS_zKQXaz4oYQ6nzzzGFdvCr-h2sfMATeTst9qgdzghKE8w/exec";
const COLORS = ["#fb5d06", "#f4f4f4", "#a8c7a1", "#d6c87e", "#b7afa7", "#86b8dc", "#d39ca8", "#8e8178"];
const PAID_CHANNELS = [
  { key: "Meta Ads 1", label: "Meta Ads 1", raw: ["Meta Ads 1"] },
  { key: "Meta Ads 2", label: "Meta Ads 2", raw: ["Meta Ads 2"] },
  { key: "Google ADS", label: "Google Ads", raw: ["Google ADS"] },
];
const PAID_SOURCE_CHANNELS = [
  ...PAID_CHANNELS,
  { key: "Facebook (1 + 2)", label: "Facebook (1 + 2)", raw: ["Facebook (1 + 2)"] },
];
const PAID_RAW_CHANNELS = new Set(PAID_SOURCE_CHANNELS.flatMap((item) => item.raw));
const PAID_CHANNEL_VIEWS = [
  ...PAID_CHANNELS.filter((item) => item.key !== "Google ADS"),
  { key: "Facebook (1 + 2)", label: "Facebook (1 + 2)", raw: ["Meta Ads 1", "Meta Ads 2", "Facebook (1 + 2)"] },
  PAID_CHANNELS.find((item) => item.key === "Google ADS"),
  { key: "Total pago (Facebook + Google)", label: "Total pago (Facebook + Google)", raw: ["Meta Ads 1", "Meta Ads 2", "Facebook (1 + 2)", "Google ADS"] },
];
const CHANNEL_FILTERS = [
  { key: "", label: "Todos os canais pagos", raw: PAID_RAW_CHANNELS ? [...PAID_RAW_CHANNELS] : [] },
  { key: "group-meta", label: "Meta Ads (1 + 2)", raw: ["Meta Ads 1", "Meta Ads 2", "Facebook (1 + 2)"] },
  { key: "group-google", label: "Google Ads", raw: ["Google ADS"] },
  { key: "group-paid", label: "Total pago (Facebook + Google)", raw: [...PAID_RAW_CHANNELS] },
  ...PAID_CHANNELS,
];
const VIEWS = [
  { number: "00", key: "product", title: "Performance dos produtos", short: "Produtos", question: "Quais produtos avancaram ou perderam desempenho?", grain: "periodo + produto", product: true },
  { number: "01", key: "channel", title: "Taxa geral do canal", short: "Canal", question: "Qual canal trouxe resultado?", grain: "periodo + canal", product: false },
  { number: "02", key: "channel_product", title: "Canal + produto", short: "Canal + produto", question: "Quais produtos performam em cada canal?", grain: "periodo + canal + produto", product: true },
  { number: "03", key: "campaign", title: "Taxa das campanhas", short: "Campanha", question: "Quais campanhas geraram pedidos?", grain: "periodo + campanha", product: false },
  { number: "04", key: "ad_group", title: "Taxa dos grupos de anuncios", short: "Grupo", question: "Quais grupos sustentam a campanha?", grain: "periodo + grupo", product: false },
  { number: "05", key: "ad", title: "Taxa dos anuncios", short: "Criativo", question: "Quais criativos geraram resultado?", grain: "periodo + anuncio", product: false },
  { number: "06", key: "campaign_product", title: "Campanha + produto", short: "Campanha + produto", question: "Quais produtos cada campanha gera?", grain: "periodo + campanha + produto", product: true },
  { number: "07", key: "ad_group_product", title: "Grupo + produto", short: "Grupo + produto", question: "Quais grupos contribuem para cada produto?", grain: "periodo + grupo + produto", product: true },
  { number: "08", key: "ad_product", title: "Criativo + produto", short: "Criativo + produto", question: "Quais criativos geram cada produto?", grain: "periodo + anuncio + produto", product: true },
];
const state = {
  rows: [],
  commercial: null,
  growthPayload: null,
  growthViews: [],
  growthViewMap: new Map(),
  normalizedViewRows: new Map(),
  channelRowsCache: new Map(),
  alternativePayload: null,
  start: "",
  end: "",
  compareStart: "",
  compareEnd: "",
  compareMode: "previous",
  compareEnabled: true,
  availableStart: "",
  availableEnd: "",
  selectedChannel: "",
  productSearch: "",
  selectedModel: "",
  selectedProduct: "",
  selectedColor: "",
  selectedSize: "",
  selectedView: "product",
  selectedGranularity: "week",
  hourlyAvailable: false,
  rhythmMetric: "pedidos",
  chartMetric: "pedidos",
  chartChannels: [],
  chartFilter: "",
  explorerSort: "pedidos",
  explorerSortDirection: "desc",
  explorerSearch: "",
  channelSort: "pedidos",
  channelSortDirection: "desc",
  rhythmSort: "pedidos",
  rhythmSortDirection: "desc",
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
function fmtPoints(value) { return value === null || value === undefined || Number.isNaN(value) ? "Sem base de sessoes" : `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value * 100)} p.p.`; }
function dateKey(value) { const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/); return match ? match[1] : null; }
function monthKey(value) { return String(value).slice(0, 7); }
function monthLabel(value) { const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]; const [year, month] = value.split("-").map(Number); return `${names[month - 1]}/${String(year).slice(2)}`; }
function dayLabel(value) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year.slice(2)}`; }
function toDate(value) { return new Date(`${value}T12:00:00`); }
function isoDate(date) { return date.toISOString().slice(0, 10); }
function monthRange(start, end) { if (!start || !end) return []; const result = []; const cursor = toDate(start); const last = toDate(end); cursor.setDate(1); while (cursor <= last) { result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`); cursor.setMonth(cursor.getMonth() + 1); } return result; }
function hourKey(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 23) return String(Math.floor(Number(value)).padStart(2, "0"));
  const match = String(value).match(/(?:T|\s)(\d{1,2})(?::|$)/);
  return match && Number(match[1]) >= 0 && Number(match[1]) <= 23 ? String(Number(match[1]).toString().padStart(2, "0")) : null;
}
function fold(value) { return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function searchKey(value) { return fold(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    for (let column = 0; column <= right.length; column += 1) previous[column] = current[column];
  }
  return previous[right.length];
}
function fuzzyMatch(value, query) {
  const text = searchKey(value); const terms = searchKey(query).split(" ").filter(Boolean); if (!terms.length) return true;
  const words = text.split(" ").filter(Boolean);
  return terms.every((term) => words.some((word) => word.includes(term) || term.includes(word) || (term.length >= 4 && editDistance(word, term) <= 2)));
}
function productFilterLabel(value) { return cleanText(value).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim() || "Nao informado"; }
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
  const raw = cleanText(row.canal_detalhe || row.canal || row.origem || "");
  const key = fold(raw);
  const aliases = { "google": "Google ADS", "google ads": "Google ADS", "meta ads": "Facebook (1 + 2)", facebook: "Facebook (1 + 2)", "facebook (1 + 2)": "Facebook (1 + 2)", "whatsapp nao oficial": "WhatsApp Organico", "whatsapp organico": "WhatsApp Organico", "organico": "Organico" };
  return aliases[key] || raw;
}
function platform(row) { const value = fold(row.canal || row.origem); if (value.includes("google")) return "Google Ads"; if (value.includes("meta") || value.includes("facebook")) return "Meta Ads"; return displayChannel(row.canal || row.origem || "Nao identificada"); }

const PRODUCT_COLORS = ["azul marinho", "off white", "azul", "amarelo", "bege", "branco", "branca", "caqui", "cinza", "dourado", "marrom", "marinho", "oliva", "preto", "preta", "rosa", "verde", "vermelho", "vermelha", "whisky"];
const PRODUCT_SIZE_PATTERN = /(?:^|[\s/_-])(PP|P|M|G|GG|XG|XXG|U|UNICO|3[4-9]|4[0-9]|5[0-2])(?:$|[\s/_-])/i;
const NON_PRODUCT_PATTERN = /(?:\(not set\)|not set|nao informado|não informado|cupom|coupon|cartao de presente|cartão de presente|gift card|frete|shipping|taxa de entrega|desconto aplicado)/i;
function isMerchandiseProduct(row) {
  const name = cleanText(row.productName || row.product || row.produto || row.product_name || row.produto_nome || "");
  return Boolean(name && !NON_PRODUCT_PATTERN.test(fold(name)));
}
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
  return { model: productFilterLabel(model), color: productFilterLabel(color), size: productFilterLabel(size) };
}
function normalizeRow(row) {
  const productValue = row.product || row.produto || row.product_name || row.produto_nome || row.product_id || row.produto_id || row.sku || "";
  const attrs = productValue ? productAttributes(row) : { model: "", color: "", size: "" };
  const campaignId = cleanText(row.campaign_id || row.campanha_id || "");
  const campaignName = cleanText(row.campaign || row.campanha || row.campaign_name || row.campanha_nome || row.nome_campanha || row.utm_campaign || "");
  const groupId = cleanText(row.ad_group_id || row.grupo_anuncio_id || row.adgroup_id || "");
  const groupName = cleanText(row.ad_group || row.grupo_anuncio || row.ad_group_name || row.grupo_anuncio_nome || "");
  const adId = cleanText(row.ad_id || row.anuncio_id || row.creative_id || row.criativo_id || "");
  const adName = cleanText(row.ad || row.anuncio || row.ad_name || row.anuncio_nome || row.criativo_nome || "");
  const productId = cleanText(row.product_id || row.produto_id || row.sku || "");
  const productName = cleanText(row.product || row.produto || row.product_name || row.produto_nome || "");
  const rawDate = row.data || row.date || row.event_date;
  const rawTime = row.data_hora || row.datetime || row.timestamp || row.session_ts || row.hora || row.hour;
  return { data: dateKey(rawDate), hora: hourKey(rawTime), period: row.period || "current", canal: canonicalChannel(row), origem: cleanText(row.origem || "Sem origem").trim() || "Sem origem", sessoes: number(row.sessoes ?? row.sessions), pedidos: number(row.pedidos ?? row.orders ?? row.conversoes), receita: number(row.receita ?? row.revenue), campaignId, campaignName, campaignKey: campaignId || campaignName, groupId, groupName, groupKey: groupId || groupName, adId, adName, adKey: adId || adName, productId, productName, productKey: productId || productName, productModel: attrs.model, productColor: attrs.color, productSize: attrs.size };
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
  const rate = complete && cleanRows.every((row) => row.pedidos !== null) && sessions > 0 && orders !== null ? orders / sessions : null;
  return { rows: cleanRows.length, pedidos: orders, sessoes: sessions, receita: revenue, rate, coverage, complete, status: complete ? "Completa" : coverage > 0 ? "Parcial" : "Ausente" };
}
function periodBounds(period) { return period === "compare" ? { start: state.compareStart, end: state.compareEnd } : { start: state.start, end: state.end }; }
function inPeriod(row, period) { if (period === "compare" && state.compareEnabled === false) return false; const bounds = periodBounds(period); return Boolean(row.data && bounds.start && bounds.end && row.data >= bounds.start && row.data <= bounds.end); }
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
  if (period === "compare" && state.compareEnabled === false) return [];
  const bounds = periodBounds(period); const cacheKey = `${period}|${bounds.start}|${bounds.end}`;
  if (state.channelRowsCache.has(cacheKey)) return state.channelRowsCache.get(cacheKey);
  const entryRows = normalizedViewRows("channel").filter((row) => isPaidRawChannel(row.canal));
  const dateRows = entryRows.filter((row) => inPeriod(row, period));
  const labeledRows = dateRows.filter((row) => row.period === period || (period === "current" && (!row.period || row.period === "current")));
  const rowsForPeriod = dateRows.length ? dateRows : labeledRows;
  const consolidated = consolidatedChannelRows(rowsForPeriod);
  const result = consolidated.length && consolidated.some((row) => row.sessoes !== null)
    ? consolidated
    : consolidatedChannelRows(state.rows.filter((row) => isPaidRawChannel(row.canal) && inPeriod(row, period)));
  state.channelRowsCache.set(cacheKey, result); return result;
}
function scopeRows(scope, period) { return analysisSourceRows(period).filter((row) => scope.raw.includes(row.canal)); }
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
  if (filter) return PAID_SOURCE_CHANNELS.filter((scope) => filter.raw.some((raw) => scope.raw.includes(raw)));
  const exact = PAID_CHANNEL_VIEWS.find((scope) => scope.key === state.selectedChannel);
  return exact ? PAID_SOURCE_CHANNELS.filter((scope) => exact.raw.some((raw) => scope.raw.includes(raw))) : PAID_SOURCE_CHANNELS;
}
function selectedPaidRows(period) { return selectedMetricScopes().flatMap((scope) => scopeRows(scope, period)); }
function channelGroups(period) { return selectedScopes().map((scope) => ({ key: scope.key, dimension: scope.label, channel: scope.label, campaign: "", group: "", ad: "", product: "", ...summarize(scopeRows(scope, period)) })); }
function allChannelGroups(period) { return channelGroups(period); }

function viewEntry(viewKey) { return state.growthViewMap.get(viewKey) || null; }
function normalizedViewRows(viewKey) {
  if (state.normalizedViewRows.has(viewKey)) return state.normalizedViewRows.get(viewKey);
  const rows = normalizedRows(viewEntry(viewKey)?.rows || []);
  state.normalizedViewRows.set(viewKey, rows); return rows;
}
function readiness(viewKey) {
  if (viewKey === "product") return readiness("channel_product");
  if (viewKey === "channel" && viewEntry("channel")) return state.growthPayload?.readiness?.find((item) => item.view === viewKey) || { view: "channel", status: "Disponivel", source: viewEntry("channel").source || "SSOT" };
  if (viewKey === "channel" && state.rows.length) return { view: "channel", status: "Disponivel", source: state.commercial?.source || "SSOT comercial de canais" };
  return state.growthPayload?.readiness?.find((item) => item.view === viewKey) || null;
}
function viewRows(view, period) {
  const sourceKey = productFilterActive() ? ({ channel: "channel_product", campaign: "campaign_product", ad_group: "ad_group_product", ad: "ad_product" }[view.key] || view.key) : view.key;
  const entry = viewEntry(sourceKey === "product" ? "channel_product" : sourceKey);
  if (!Array.isArray(entry?.rows)) return [];
  return normalizedViewRows(sourceKey === "product" ? "channel_product" : sourceKey).filter((row) => {
    if (!isAnalysisRow(row)) return false;
    if (row.data && !inPeriod(row, period)) return false;
    if (!matchesSelectedChannel(row)) return false;
    if ((view.product || productFilterActive()) && !matchesProductFilter(row)) return false;
    return true;
  });
}
function dimensionKey(view, row) {
  const campaign = row.campaignKey || row.campaignName || "(campanha nao informada)";
  const group = row.groupKey || row.groupName || "(grupo nao informado)";
  const ad = row.adKey || row.adName || "(criativo nao informado)";
  const product = row.productKey || row.productName || "(produto nao informado)";
  const channel = row.canal || "(canal nao informado)";
  const keys = { product: [product], channel: [channel], campaign: [platform(row), campaign], ad_group: [platform(row), campaign, group], ad: [platform(row), campaign, group, ad], channel_product: [channel, product], campaign_product: [platform(row), campaign, product], ad_group_product: [platform(row), campaign, group, product], ad_product: [platform(row), campaign, group, ad, product] };
  return keys[view.key].join("|");
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

function sortRecords(records, sort, direction = state.explorerSortDirection) { const factor = direction === "asc" ? 1 : -1; return [...records].sort((a, b) => { const av = a[sort] === null || a[sort] === undefined ? null : a[sort]; const bv = b[sort] === null || b[sort] === undefined ? null : b[sort]; if (av === null && bv !== null) return 1; if (av !== null && bv === null) return -1; if (av !== null && bv !== null && av !== bv) return typeof av === "string" || typeof bv === "string" ? String(av).localeCompare(String(bv), "pt-BR") * factor : (av - bv) * factor; return a.dimension.localeCompare(b.dimension, "pt-BR"); }); }
function filterText(record) { return [record.dimension, record.channel, record.campaign, record.group, record.ad, record.product].join(" "); }
function coverageLabel(record) { if (record.source === "GA4 alternativa") return "GA4 / nao SSOT"; if (record.complete) return "Completa"; if (record.coverage > 0) return `${Math.round(record.coverage * 100)}% conhecida`; return "Ausente"; }
function comparisonValue(record, key) { return record?.compare ? record.compare[key] ?? null : null; }
function relativeComparison(current, previous) { return current !== null && current !== undefined && previous !== null && previous !== undefined && previous !== 0 ? current / previous - 1 : null; }

function shiftDate(value, days) { const date = toDate(value); date.setDate(date.getDate() + days); return isoDate(date); }
function shiftYear(value, years) { const date = toDate(value); date.setFullYear(date.getFullYear() + years); return isoDate(date); }
function dateSpan(start, end) { return start && end ? Math.round((toDate(end) - toDate(start)) / 86400000) + 1 : 0; }
function availableEnd() { return state.availableEnd || state.end || isoDate(new Date()); }
function applyComparison() {
  if (!state.start || !state.end || state.compareMode === "custom") return;
  if (state.compareMode === "year-ago") { state.compareStart = shiftYear(state.start, -1); state.compareEnd = shiftYear(state.end, -1); return; }
  const days = dateSpan(state.start, state.end); state.compareEnd = shiftDate(state.start, -1); state.compareStart = shiftDate(state.compareEnd, -(days - 1));
}
function applyPeriodPreset(preset) {
  const end = availableEnd(); if (!end || preset === "custom") return;
  const date = toDate(end); let start = end; let finish = end;
  if (preset === "previous-day") start = finish = shiftDate(end, -1);
  if (preset === "week") { const day = date.getDay() || 7; start = shiftDate(end, -day + 1); }
  if (preset === "fortnight") start = isoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() <= 15 ? 1 : 16, 12));
  if (preset === "month") start = isoDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  if (preset === "quarter") { const month = Math.floor(date.getMonth() / 3) * 3; start = isoDate(new Date(date.getFullYear(), month, 1, 12)); }
  if (preset === "semester") { const month = date.getMonth() < 6 ? 0 : 6; start = isoDate(new Date(date.getFullYear(), month, 1, 12)); }
  if (preset === "year") start = isoDate(new Date(date.getFullYear(), 0, 1, 12));
  if (preset === "last-complete") { const last = new Date(date.getFullYear(), date.getMonth(), 0, 12); finish = isoDate(last); start = isoDate(new Date(last.getFullYear(), last.getMonth() - 11, 1, 12)); }
  if (preset === "all") { start = state.availableStart || start; finish = availableEnd(); }
  state.start = start; state.end = finish; applyComparison();
  suggestGranularityForWindow();
}
function comparisonWindowLabel() { return state.compareEnabled === false ? "Sem comparacao" : state.compareStart && state.compareEnd ? `Comparacao: ${dayLabel(state.compareStart)} a ${dayLabel(state.compareEnd)}` : "Comparacao nao definida"; }
function suggestedGranularity() {
  const days = dateSpan(state.start, state.end);
  if (days <= 1) return state.hourlyAvailable ? "hour" : "day";
  if (days <= 14) return "day";
  if (days <= 90) return "week";
  if (days <= 366) return "month";
  if (days <= 730) return "quarter";
  return "year";
}
function suggestGranularityForWindow() {
  const next = suggestedGranularity();
  if (next && (state.start || state.end)) state.selectedGranularity = next;
}
function renderTemporalControls() {
  const hourButton = document.querySelector('[data-granularity="hour"]');
  if (!hourButton) return;
  hourButton.hidden = !state.hourlyAvailable;
  if (!state.hourlyAvailable && state.selectedGranularity === "hour") state.selectedGranularity = suggestedGranularity();
}
function setupFilters() {
  const channelSelect = $("#global-channel-filter"); const grouped = CHANNEL_FILTERS.filter((item) => item.key.startsWith("group-")); const individual = PAID_CHANNEL_VIEWS; channelSelect.innerHTML = `<option value="">Todos os canais pagos</option><optgroup label="Grupos de canal">${grouped.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</optgroup><optgroup label="Leituras declaradas">${individual.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</optgroup>`; channelSelect.value = state.selectedChannel; channelSelect.onchange = () => { state.selectedChannel = channelSelect.value; state.chartFilter = state.selectedChannel; state.chartChannels = selectedScopes().map((scope) => scope.key); renderAll(); };
  const compareMode = $("#compare-mode"); if (compareMode) { compareMode.value = state.compareMode; $("#compare-custom-fields")?.classList.toggle("is-hidden", state.compareMode !== "custom"); $("#compare-start").value = state.compareStart; $("#compare-end").value = state.compareEnd; $("#comparison-window").textContent = comparisonWindowLabel(); }
  const level = $("#explorer-level"); level.innerHTML = VIEWS.map((view) => `<option value="${view.key}">${view.number} · ${view.short}</option>`).join(""); level.value = state.selectedView; level.onchange = () => { state.selectedView = level.value; renderExplorer(); };
  filtersForProducts();
}
function metricValue(item, metric) { return metric === "rate" ? item.rate : item[metric]; }
function metricText(value, metric) { return metric === "rate" ? fmtPercent(value) : metric === "receita" ? fmtMoney(value) : fmtNumber(value); }
function metricLabel(metric) { return { pedidos: "pedidos", receita: "receita", sessoes: "sessoes", rate: "conversao" }[metric] || metric; }
function formatWindow() { return state.start ? `${dayLabel(state.start)} a ${dayLabel(state.end)}` : "Periodo nao definido"; }

function periodBucket(date, granularity, row) {
  const value = toDate(date);
  if (granularity === "hour" && row?.hora) return { key: `${date}T${row.hora}`, label: `${dayLabel(date)} ${row.hora}h` };
  if (granularity === "day" || granularity === "day-over-day") return { key: date, label: dayLabel(date) };
  if (granularity === "month") return { key: monthKey(date), label: monthLabel(monthKey(date)) };
  if (granularity === "quarter") { const quarter = Math.floor(value.getMonth() / 3) + 1; return { key: `${value.getFullYear()}-Q${quarter}`, label: `T${quarter}/${value.getFullYear()}` }; }
  if (granularity === "semester") { const semester = value.getMonth() < 6 ? 1 : 2; return { key: `${value.getFullYear()}-S${semester}`, label: `S${semester}/${value.getFullYear()}` }; }
  if (granularity === "year") return { key: String(value.getFullYear()), label: String(value.getFullYear()) };
  const monday = new Date(value); const day = monday.getDay() || 7; monday.setDate(monday.getDate() - day + 1); const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6); const start = isoDate(monday); const end = isoDate(sunday); return { key: start, label: `${dayLabel(start)} - ${dayLabel(end)}` };
}
function aggregatePeriods(rows, granularity) {
  const map = new Map(); rows.forEach((row) => { const bucket = periodBucket(row.data, granularity, row); if (!map.has(bucket.key)) map.set(bucket.key, { key: bucket.key, label: bucket.label, rows: [] }); map.get(bucket.key).rows.push(row); });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map((item) => ({ ...item, ...summarize(item.rows) }));
}
function periodReading(item) { if (!item) return "Sem dados"; if (!item.complete) return item.coverage > 0 ? "Cobertura parcial" : "Sessoes ausentes"; if (item.rate === null) return "Sem denominador valido"; return item.rate >= 0.02 ? "Acima de 2%" : "Acompanhar conversao"; }
function periodLimit(granularity) { return { hour: 48, day: 31, "day-over-day": 31, week: 12, month: 12, quarter: 8, semester: 6, year: 5 }[granularity] || 12; }
function granularityLabel(granularity) { return { hour: "hora", day: "dia", "day-over-day": "dia a dia", week: "semana", month: "mes", quarter: "trimestre", semester: "semestre", year: "ano" }[granularity] || granularity; }
function chartMax(metric, known) { const observedMax = Math.max(...known, 0); if (metric === "rate") return Math.max(0.01, observedMax + 0.01); return Math.max(1, observedMax * 1.15); }

function compareText(current, previous) {
  if (!previous) return "Sem comparacao";
  const parts = [];
  const orderChange = relativeDelta(current?.pedidos, previous?.pedidos);
  if (orderChange !== null) parts.push(`${orderChange >= 0 ? "+" : ""}${fmtPercent(orderChange)} pedidos`);
  const revenueChange = relativeDelta(current?.receita, previous?.receita);
  if (revenueChange !== null) parts.push(`${revenueChange >= 0 ? "+" : ""}${fmtPercent(revenueChange)} receita`);
  if (current?.rate !== null && current?.rate !== undefined && previous?.rate !== null && previous?.rate !== undefined) parts.push(`${fmtPoints(current.rate - previous.rate)} conversao`);
  return parts.length ? parts.join(" · ") : "Sem comparacao";
}

function chartRows(scope, granularity) { return aggregatePeriods(scopeRows(scope, "current"), granularity); }

function explorerCell(record, key) {
  if (key === "pedidos") return fmtNumber(record.pedidos);
  if (key === "comparisonPedidos") return fmtNumber(record.comparisonPedidos);
  if (key === "deltaPedidos") return escapeHtml(comparisonLabel(record.pedidos, record.comparisonPedidos));
  if (key === "sessoes") return fmtNumber(record.sessoes);
  if (key === "comparisonSessoes") return fmtNumber(record.comparisonSessoes);
  if (key === "deltaSessoes") return escapeHtml(comparisonLabel(record.sessoes, record.comparisonSessoes));
  if (key === "receita") return fmtMoney(record.receita);
  if (key === "comparisonReceita") return fmtMoney(record.comparisonReceita);
  if (key === "deltaReceita") return escapeHtml(comparisonLabel(record.receita, record.comparisonReceita));
  if (key === "rate") return `<span class="${record.rate === null ? "rate-pending" : "coverage"}">${fmtPercent(record.rate)}</span>`;
  if (key === "comparisonRate") return `<span class="${record.comparisonRate === null ? "rate-pending" : "coverage"}">${fmtPercent(record.comparisonRate)}</span>`;
  if (key === "deltaRate") return `<span class="${record.deltaRate === null ? "rate-pending" : record.deltaRate >= 0 ? "coverage" : "missing"}">${record.deltaRate === null ? "Sem comparacao" : fmtPoints(record.deltaRate)}</span>`;
  if (key === "semaphore") { const semaphore = recordSemaphore(record); return `<span class="semaphore ${semaphore.tone}" title="${escapeHtml(semaphore.title)}"><i></i>${escapeHtml(semaphore.label)}</span>`; }
  if (key === "nextIndicator") return escapeHtml(nextIndicator(record));
  if (key === "coverage") return escapeHtml(coverageLabel(record));
  if (key === "source") return `<span class="table-status ${record.source === "GA4 alternativa" ? "warn" : "ok"}">${escapeHtml(record.source || "SSOT")}</span>`;
  return escapeHtml(record[key] || "Sem identificacao");
}

function renderQuality() {
  const officialViews = VIEWS.filter((view) => view.key === "channel" || String(readiness(view.key)?.status || "").toLowerCase().includes("dispon")); const alternativeViews = VIEWS.filter((view) => !officialViews.includes(view) && state.alternativePayload?.views?.[view.key]); const pendingViews = VIEWS.filter((view) => !officialViews.includes(view) && !alternativeViews.includes(view)); $("#quality-count").textContent = `${officialViews.length} oficiais · ${alternativeViews.length} diagnosticos`;
  const total = summarize(selectedPaidRows("current")); const cards = [{ type: officialViews.length ? "ok" : "warn", title: "Camada oficial", text: `${officialViews.length} visao(oes) com leitura SSOT.` }, { type: total.rate !== null ? "ok" : "warn", title: "Sessoes do canal", text: total.complete ? "Denominador completo para conversao." : total.coverage > 0 ? "Conversao calculada sobre sessoes conhecidas." : "Sem sessoes conhecidas no recorte." }, { type: alternativeViews.length ? "warn" : "pending", title: "Camada diagnostica", text: alternativeViews.length ? `${alternativeViews.length} visao(oes) usam GA4 e nao substituem SSOT.` : "Nenhuma alternativa carregada." }]; $("#quality-list").innerHTML = cards.map((item) => `<div class="quality-item ${item.type}"><i></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div></div>`).join("");
  const decisions = { channel: "Comparar canais e ritmo", campaign: "Comparar campanhas", ad_group: "Diagnostico GA4; nao conversao oficial", ad: "Diagnostico GA4; nao conversao oficial", channel_product: "Comparar produto por canal", campaign_product: "Diagnostico GA4; nao conversao oficial", ad_group_product: "Diagnostico GA4; nao conversao oficial", ad_product: "Diagnostico GA4; nao conversao oficial" };
  $("#catalog-body").innerHTML = VIEWS.map((view) => { const official = view.key === "channel" || String(readiness(view.key)?.status || "").toLowerCase().includes("dispon"); const alternative = Boolean(state.alternativePayload?.views?.[view.key]); const status = official ? "SSOT disponivel" : alternative ? "Diagnostico GA4" : "Pendente"; return `<tr><td><strong>${view.number} · ${escapeHtml(view.short)}</strong></td><td>${official ? escapeHtml(readiness(view.key)?.source || "SSOT") : alternative ? "ga4-growth-alternative.json" : "Fonte nao encontrada"}</td><td class="${official ? "ok" : alternative ? "warn" : "pending"}">${status}</td><td>${escapeHtml(decisions[view.key])}</td></tr>`; }).join("");
}

function reorderGrowthSections() {
  const summary = $("#resumo"); const product = $("#growth-views");
  if (summary && product && summary.nextElementSibling !== product) summary.after(product);
  const numbers = { resumo: "01", "growth-views": "02", ritmo: "03", canais: "04", evolucao: "05", quality: "06" };
  Object.entries(numbers).forEach(([id, number]) => { const node = document.querySelector(`#${id} .section-number`); if (node) node.textContent = number; });
}

function setLoadingStep(stage, message) {
  const stageNode = $("#data-loader-stage"); const messageNode = $("#data-loader-message");
  if (stageNode) stageNode.textContent = stage;
  if (messageNode) messageNode.textContent = message;
}
function showLoadingScreen() {
  const loader = $("#data-loader"); if (!loader) return;
  loader.classList.remove("is-complete"); loader.setAttribute("aria-hidden", "false"); document.body.classList.add("is-loading");
  setLoadingStep("01", "Conectando ao SSOT");
}
function hideLoadingScreen() {
  const loader = $("#data-loader"); if (!loader) return;
  setLoadingStep("03", "Leitura pronta");
  loader.classList.add("is-complete"); loader.setAttribute("aria-hidden", "true"); document.body.classList.remove("is-loading");
}
async function loadJson(url, timeout = 18000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout); try { const response = await fetch(url, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json(); } finally { clearTimeout(timer); } }
async function loadGrowth() { try { return await loadJson(`${API_URL}?view=growth_views&_ts=${Date.now()}`, 120000); } catch (remoteError) { return { ok: false, error: `Ponte growth_views indisponivel: ${remoteError.message}` }; } }
async function loadAlternative() { try { return await loadJson("data/ga4-growth-alternative.json"); } catch (error) { return { ok: false, error: error.message }; } }
function defaultWindow(rows) { const dates = rows.map((row) => row.data).filter(Boolean).sort(); const end = dates.at(-1) || ""; if (!end) return { start: "", end: "" }; const last = toDate(end); const first = new Date(last.getFullYear(), last.getMonth() - 11, 1, 12); return { start: isoDate(first), end }; }

const GROWTH_CACHE_NAME = "panorama-growth-v2";
function localDateKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function growthCacheUrl() { return `${API_URL}?view=growth_views&day=${localDateKey()}`; }
async function readGrowthCache() {
  if (typeof caches === "undefined") return null;
  try { const cache = await caches.open(GROWTH_CACHE_NAME); const response = await cache.match(growthCacheUrl()); return response ? response.json() : null; } catch (error) { return null; }
}
async function loadGrowthNetwork() {
  const url = growthCacheUrl(); const payload = await loadJson(url, 15000);
  const response = new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  const copy = response.clone();
  if (typeof caches !== "undefined") { try { const cache = await caches.open(GROWTH_CACHE_NAME); await cache.put(url, copy); } catch (error) { /* Cache is optional. */ } }
  return payload;
}
function hydrateData(commercial, growth, alternative, cached = false) {
  const previousPeriod = state.start ? { preset: $("#period-preset").value, start: state.start, end: state.end,
    compareEnabled: state.compareEnabled, compareMode: state.compareMode, compareStart: state.compareStart, compareEnd: state.compareEnd, selectedGranularity: state.selectedGranularity } : null;
  state.commercial = commercial || null;
  state.rows = normalizedRows(commercial?.rows || []);
  state.growthPayload = growth && growth.ok !== false && Array.isArray(growth.data) ? growth : null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("panorama:ssot", { detail: commercial || state.growthPayload }));
  state.growthViews = state.growthPayload?.data || [];
  state.growthViewMap = new Map(state.growthViews.map((view) => [view.view, view]));
  state.normalizedViewRows.clear();
  state.channelRowsCache.clear();
  state.alternativePayload = alternative && alternative.ok !== false ? alternative : null;
  const liveRawRows = state.growthViews.flatMap((view) => Array.isArray(view.rows) ? view.rows : []);
  const liveDates = liveRawRows.map((row) => dateKey(row.data || row.date || row.event_date)).filter(Boolean);
  state.hourlyAvailable = state.rows.some((row) => row.hora !== null && row.hora !== undefined) || liveRawRows.some((row) => hourKey(row.data_hora || row.datetime || row.timestamp || row.session_ts || row.hora || row.hour) !== null);
  const availableDates = [...state.rows.map((row) => row.data), ...liveDates].filter(Boolean).sort();
  state.availableStart = availableDates[0] || "";
  state.availableEnd = availableDates.at(-1) || "";
  const fallback = state.rows.length ? defaultWindow(state.rows) : { start: state.availableStart, end: state.availableEnd };
  state.start = growth?.window?.start || fallback.start;
  state.end = growth?.window?.end || fallback.end;
  state.compareMode = "previous";
  applyPeriodPreset("current-day");
  $("#period-preset").value = "current-day";
  $("#date-start").value = state.start;
  $("#date-end").value = state.end;
  if (previousPeriod) {
    Object.assign(state, previousPeriod);
    if (previousPeriod.preset !== 'custom') applyPeriodPreset(previousPeriod.preset);
    state.selectedGranularity = previousPeriod.selectedGranularity;
    $("#period-preset").value = previousPeriod.preset;
    $("#date-start").value = state.start; $("#date-end").value = state.end;
  }
  const liveChannel = viewEntry("channel");
  const liveChannelRows = normalizedViewRows("channel");
  const liveMaxDate = liveChannelRows.map((row) => row.data).filter(Boolean).sort().at(-1) || state.availableEnd;
  const liveSource = liveChannel?.source || commercial?.source || "SSOT";
  const updatedAt = liveChannel?.generatedAt || commercial?.extracted_at || growth?.generatedAt || "Atualizacao nao informada";
  const businessToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const expectedDate = new Date(Date.parse(`${businessToday}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const staleSource = !liveMaxDate || liveMaxDate < expectedDate;
  $("#source-name").textContent = liveSource;
  $("#extracted-at").textContent = `${updatedAt} · ultimo dado ${liveMaxDate ? dayLabel(liveMaxDate) : "nao informado"}`;
  $("#source-status").textContent = staleSource ? `Atualizacao pendente: esperado ate ${dayLabel(expectedDate)}` : cached ? "SSOT em cache; validando atualizacao" : state.growthPayload ? "Leitura SSOT conectada" : "Snapshot de canais";
  $("#source-pill").textContent = staleSource ? "Base atrasada" : cached ? "Cache local" : state.growthPayload ? "SSOT conectado" : "Snapshot";
  $("#source-pill").className = `status-pill ${staleSource || cached ? "warn" : state.growthPayload ? "ok" : "warn"}`;
  $("#validation-title").textContent = staleSource ? "Atualizacao pendente" : cached ? "Ultima leitura carregada" : state.growthPayload ? "Leitura SSOT carregada" : "SSOT ao vivo indisponivel";
  $("#validation-summary").textContent = state.growthPayload
    ? `${liveChannelRows.length.toLocaleString("pt-BR")} linhas de canais ${cached ? "em cache" : "ao vivo"}; ultimo dado em ${liveMaxDate ? dayLabel(liveMaxDate) : "data nao informada"}. ${state.growthViews.length} visoes growth carregadas.`
    : `A leitura ao vivo falhou. Exibindo o snapshot de ${commercial?.extracted_at || "data nao informada"}; atualize novamente antes de decidir.`;
  $("#validation-banner").className = `validation-banner ${state.growthPayload ? staleSource || cached ? "warn" : "valid" : "error"}`;
  renderAll();
}

function setupEvents() {
  $("#reload-data").onclick = () => window.PanoramaRefresh ? window.PanoramaRefresh.request() : loadData();
  $("#clear-filters").onclick = () => { state.selectedChannel = ""; state.selectedModel = ""; state.selectedColor = ""; state.selectedSize = ""; state.productSearch = ""; state.chartChannels = []; state.chartFilter = ""; state.explorerSearch = ""; $("#explorer-search").value = ""; renderAll(); };
  $("#period-preset").onchange = (event) => { applyPeriodPreset(event.target.value); $("#date-start").value = state.start; $("#date-end").value = state.end; renderAll(); };
  $("#date-start").onchange = (event) => { state.start = event.target.value; $("#period-preset").value = "custom"; applyComparison(); suggestGranularityForWindow(); renderAll(); };
  $("#date-end").onchange = (event) => { state.end = event.target.value; $("#period-preset").value = "custom"; applyComparison(); suggestGranularityForWindow(); renderAll(); };
  $("#compare-mode").onchange = (event) => { state.compareMode = event.target.value; applyComparison(); renderAll(); };
  $("#compare-start").onchange = (event) => { state.compareMode = "custom"; state.compareStart = event.target.value; renderAll(); };
  $("#compare-end").onchange = (event) => { state.compareMode = "custom"; state.compareEnd = event.target.value; renderAll(); };
  $("#product-search").oninput = (event) => { state.productSearch = event.target.value; filtersForProducts(); renderExplorer(); };
  document.querySelectorAll("[data-granularity]").forEach((button) => { button.onclick = () => { if (button.dataset.granularity === "hour" && !state.hourlyAvailable) return; state.selectedGranularity = button.dataset.granularity; renderAll(); }; });
  $("#rhythm-metric").onchange = (event) => { state.rhythmMetric = event.target.value; renderRhythm(); };
  $("#chart-metric").onchange = (event) => { state.chartMetric = event.target.value; renderChart(); };
  $("#explorer-sort").onchange = (event) => { state.explorerSort = event.target.value; state.explorerSortDirection = "desc"; renderExplorer(); };
  $("#explorer-search").oninput = (event) => { state.explorerSearch = event.target.value; renderExplorer(); };
}
async function loadData({ background = false } = {}) {
  if (!background) showLoadingScreen();
  $("#source-status").textContent = "Carregando SSOT";
  $("#source-pill").textContent = "Validando fonte";
  $("#source-pill").className = "status-pill pending";
  let cachedGrowth = null;
  try {
    const [localGrowth, commercial] = await Promise.all([
      loadJson('data/ssot-growth-views.json', 5000).catch(() => null),
      loadJson('data/ssot-commercial-channels.json', 10000).catch(() => null),
    ]);
    if (localGrowth?.ok && Array.isArray(localGrowth.data)) {
      hydrateData(commercial, localGrowth, null, false);
      return;
    }
    setLoadingStep("01", "Verificando a ultima leitura");
    cachedGrowth = await readGrowthCache();
    const cacheIsAlreadyDisplayed = cachedGrowth?.generatedAt && cachedGrowth.generatedAt === state.growthPayload?.generatedAt;
    if (cachedGrowth?.ok && Array.isArray(cachedGrowth.data) && !cacheIsAlreadyDisplayed) {
      setLoadingStep("02", "Atualizando dados do periodo");
      hydrateData(commercial, cachedGrowth, null, true);
    }
    setLoadingStep("02", "Atualizando dados do periodo");
    const growth = await loadGrowthNetwork();
    if (growth?.ok && Array.isArray(growth.data)) {
      setLoadingStep("03", "Organizando indicadores");
      hydrateData(commercial, growth, null, false);
      return;
    }
    if (!commercial) throw new Error('Snapshot comercial indisponivel');
    setLoadingStep("03", "Aplicando leitura de contingencia");
    hydrateData(commercial, null, null, false);
  } catch (error) {
    if (cachedGrowth?.ok && Array.isArray(cachedGrowth.data)) {
      $("#source-status").textContent = "SSOT em cache";
      $("#source-pill").textContent = "Cache local";
      $("#source-pill").className = "status-pill warn";
      $("#validation-title").textContent = "Atualizacao pendente";
      $("#validation-summary").textContent = `A leitura ao vivo falhou: ${error.message}. Exibindo a ultima leitura validada.`;
    } else {
      try {
        const commercial = await loadJson("data/ssot-commercial-channels.json");
        setLoadingStep("03", "Aplicando leitura de contingencia");
        hydrateData(commercial, null, null, false);
      } catch (fallbackError) {
        $("#source-status").textContent = "Fonte indisponivel";
        $("#source-pill").textContent = "Erro de fonte";
        $("#source-pill").className = "status-pill error";
        $("#validation-title").textContent = "Falha na leitura";
        $("#validation-summary").textContent = fallbackError.message;
        $("#validation-banner").className = "validation-banner error";
      }
    }
  } finally {
    if (!background) hideLoadingScreen();
  }
}
if (typeof window !== 'undefined') {
  let pendingGrowthRefresh = false;
  const flushGrowthRefresh = () => {
    if (!pendingGrowthRefresh || document.activeElement?.closest('#growth-workspace input, #growth-workspace select, #growth-workspace textarea')) return;
    pendingGrowthRefresh = false;
    loadData({ background: true });
  };
  window.addEventListener('panorama:data-refreshed', () => { pendingGrowthRefresh = true; flushGrowthRefresh(); });
  document.addEventListener('focusout', () => setTimeout(flushGrowthRefresh, 0));
}
