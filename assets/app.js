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
  { number: "09", key: "line", title: "Performance por linha", short: "Linha", question: "Como cada linha performa nos canais selecionados?", grain: "periodo + linha", product: true },
  { number: "10", key: "channel_line", title: "Canal + linha", short: "Canal + linha", question: "Como cada linha performa em cada canal?", grain: "periodo + canal + linha", product: true },
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
  selectedProductType: "",
  selectedProductLine: "",
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
  // Model codes and sizes must not match shorter names or adjacent numbers.
  return terms.every((term) => words.some((word) => /\d/.test(term) ? word === term
    : word.includes(term) || (term.length >= 4 && word.length >= 4 && editDistance(word, term) <= 2)));
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
const PRODUCT_TYPES = ["Tenis", "Mochilas", "Acessorios", "Vestuario", "Perfumes", "Kits", "Chinelos", "Sem classificacao"];
const NAMED_PRODUCT_LINES = ["Ambition", "Barcelona", "Manhattan", "Minimal", "Munich", "Madrid", "Milao", "NYC",
  "Dublin", "Stuttgart", "Workplace", "Zurich", "Monaco", "Brooklyn", "Denver", "Alcantara", "Velour",
  "Nord", "Vancouver", "Silverstone", "Suzuka", "Serie 1", "R8"];
const PRODUCT_LINES = ["RS", "GT", "Avant", "Phantom", "Knit", "911", "Macan", ...NAMED_PRODUCT_LINES, "Sem classificacao"];
function productLineLabel(line) { return line === "Sem classificacao" ? "Sem linha no nome" : line; }
function matchesViewLine(viewKey, row) {
  return !['line', 'channel_line'].includes(viewKey)
    || Boolean(row.productLine && row.productLine !== 'Sem classificacao');
}
function productClassification(name) {
  const text = searchKey(name);
  // Name-based taxonomy: GT/Avant take precedence over RS; Carrera belongs to 911.
  const type = /\btenis\b/.test(text) ? "Tenis"
    : /\bmochila\b/.test(text) ? "Mochilas"
    : /\b(calca|camiseta)\b/.test(text) ? "Vestuario"
    : /\bperfume\b/.test(text) ? "Perfumes"
    : /\bchinelo\b/.test(text) ? "Chinelos"
    : /\bkit executivo\b/.test(text) ? "Kits"
    : /\b(carteira|case|cinto|desk pad|impermeabilizante|meia|cadarcos|limpa e hidrata|limpador|renovador|mala|necessaire|organizador|porta objetos|porta passaporte|gift bag|sneaker bag|relogio|oculos)\b/.test(text) ? "Acessorios" : "Sem classificacao";
  const line = /\bgt\b/.test(text) ? "GT"
    : /\bavant\b/.test(text) ? "Avant"
    : /\bphantom\b/.test(text) ? "Phantom"
    : /\bknit\b/.test(text) ? "Knit"
    : /\b911\b/.test(text) ? "911"
    : /\bmacan\b/.test(text) ? "Macan"
    : /\brs(?:\d+|x)?\b/.test(text) ? "RS"
    : NAMED_PRODUCT_LINES.find(value => (' ' + text + ' ').includes(' ' + searchKey(value) + ' ')) || "Sem classificacao";
  return { productType: type, productLine: line };
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
  return { data: dateKey(rawDate), hora: hourKey(rawTime), period: row.period || "current", canal: canonicalChannel(row), origem: cleanText(row.origem || "Sem origem").trim() || "Sem origem", sessoes: number(row.sessoes ?? row.sessions), pedidos: number(row.pedidos ?? row.orders ?? row.conversoes), receita: number(row.receita ?? row.revenue), campaignId, campaignName, campaignKey: campaignId || campaignName, groupId, groupName, groupKey: groupId || groupName, adId, adName, adKey: adId || adName, productId, productName, productKey: productId || productName, productModel: attrs.model, productColor: attrs.color, productSize: attrs.size, ...productClassification(productName) };
}
function rowProvenance(row) {
  const scope = row.provenanceScope;
  if (!scope) return null;
  const provisional = (scope === 'ad_group' || scope === 'ad') && row.identityValidated !== true;
  const known = typeof row.is_estimado === 'boolean' && (scope !== 'campaign' || typeof row.sessoes_real === 'boolean');
  return { rows: 1, estimated: row.is_estimado === true ? 1 : 0,
    sessionUnconfirmed: scope === 'campaign' && row.sessoes_real === false ? 1 : 0,
    unknown: !provisional && !known ? 1 : 0, provisional: provisional ? 1 : 0,
    validated: row.identityValidated === true ? 1 : 0,
    partialLinkage: row.partialLinkage === true ? 1 : 0,
    productOrdersNonAdditive: row.productOrdersNonAdditive === true ? 1 : 0,
    windows: row.validatedWindow ? [`${row.validatedWindow.start} a ${row.validatedWindow.end}`] : [],
    methods: row.metodo_rateio ? [String(row.metodo_rateio)] : [] };
}
function summarizeProvenance(rows) {
  const values = rows.map(row => row.provenance).filter(Boolean);
  if (!values.length) return null;
  const result = { methods: [...new Set(values.flatMap(value => value.methods || []))].slice(0, 3),
    windows: [...new Set(values.flatMap(value => value.windows || []))] };
  for (const key of ['rows', 'estimated', 'sessionUnconfirmed', 'unknown', 'provisional', 'validated', 'partialLinkage', 'productOrdersNonAdditive']) result[key] = values.reduce((total, value) => total + (value[key] || 0), 0);
  return result;
}
function provenanceNote(record) {
  const info = record?.provenance;
  if (!info?.rows) return '';
  const notes = ['Fonte: SSOT.'];
  if (info.estimated) notes.push(`${info.estimated} de ${info.rows} registros com estimativa/rateio declarado na origem. O marcador se aplica ao registro; nao significa que todas as suas metricas sejam estimadas.`);
  if (info.sessionUnconfirmed) notes.push(`${info.sessionUnconfirmed} registros com sessoes nao classificadas como reais pelo SSOT. O denominador pode incluir estimativa ou ausencia de vinculo; consulte o metodo.`);
  if (info.provisional) notes.push('Agrupamento provisorio por UTM, sem vinculo homologado com grupo/criativo e sem sessoes neste grao.');
  if (info.validated) notes.push('Vinculos de identidade por IDs conferidos. Catalogos de midia identificam entidades; pedidos e valores vem do SSOT, sem atribuicao causal comprovada.');
  if (info.partialLinkage) notes.push('Cobertura parcial: somente pedidos com vinculo comprovado. Ausencias de vinculo nao sao zero. Sem sessoes ou conversao neste grao. Variacoes percentuais nao homologadas entre subconjuntos.');
  if (info.productOrdersNonAdditive) notes.push('Pedidos identificados com produto de valor positivo apos desconto conhecido. Brindes e descontos ausentes ficam separados; receita por produto nao liberada. Um pedido pode conter varios produtos: nao somar como pedidos unicos.');
  if (info.windows?.length) notes.push(`Janela conferida dos catalogos de IDs: ${info.windows.join(' / ')}. Fora dela, dados nao homologados. A janela nao comprova vigencia diaria do anuncio.`);
  if (info.unknown) notes.push(`${info.unknown} registros sem metadados completos de procedencia nesta leitura. Nao classificados como observados ou estimados.`);
  if (!info.validated && !info.estimated && !info.sessionUnconfirmed && !info.provisional && !info.unknown) notes.push('Sem estimativa declarada nos marcadores recebidos. Isso nao comprova atribuicao causal.');
  if (info.methods.length) notes.push(`Metodos informados (ate 3): ${info.methods.join(' / ')}`);
  notes.push('Valores preservados da fonte; sem substituicao por GA4.');
  return notes.join('\n\n');
}
function provenanceMarkup(record, context = '') {
  const note = provenanceNote(record);
  if (!note) return '';
  const label = `Procedencia dos dados${context ? `: ${context}` : ''}`;
  return `<button type="button" class="source-info" data-source-note="${escapeHtml(note)}" aria-label="${escapeHtml(label)}" aria-haspopup="dialog" aria-expanded="false">${typeof CrmIcons === 'function' ? CrmIcons('Info') : 'i'}</button>`;
}
function normalizedRows(rows) { return (Array.isArray(rows) ? rows : []).map(row => ({ ...normalizeRow(row), provenance: rowProvenance(row) })).filter((row) => row.data); }
function summarize(rows) {
  const cleanRows = Array.isArray(rows) ? rows : [];
  const orders = sum(cleanRows.map((row) => row.pedidos));
  const revenue = sum(cleanRows.map((row) => row.receita));
  const sessionValues = cleanRows.map((row) => row.sessoes);
  const knownSessions = sessionValues.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  const sessions = knownSessions.length ? sum(knownSessions) : null;
  const coverage = cleanRows.length ? knownSessions.length / cleanRows.length : null;
  const complete = cleanRows.length > 0 && knownSessions.length === cleanRows.length && cleanRows.every((row) => Number.isFinite(row.pedidos));
  const rate = complete && sessions > 0 && orders !== null ? orders / sessions : null;
  const observed = cleanRows.filter(row => Number.isFinite(row.pedidos) && Number.isFinite(row.sessoes));
  // A partial rate is descriptive only: never discard a known unpaired numerator.
  const onlyCalendarGaps = cleanRows.every(row => (Number.isFinite(row.pedidos) && Number.isFinite(row.sessoes))
    || (row.pedidos == null && row.sessoes == null && row.receita == null));
  const observedSessions = sum(observed.map(row => row.sessoes));
  const expectedDays = new Set(cleanRows.map(row => row.data).filter(Boolean)).size;
  const incompleteDays = new Set(cleanRows.filter(row => !Number.isFinite(row.pedidos) || !Number.isFinite(row.sessoes)).map(row => row.data).filter(Boolean));
  const observedDays = expectedDays - incompleteDays.size;
  const observedRate = !complete && onlyCalendarGaps && observedSessions > 0
    && observed.every(row => !incompleteDays.has(row.data))
    ? sum(observed.map(row => row.pedidos)) / observedSessions : null;
  return { rows: cleanRows.length, pedidos: orders, sessoes: sessions, receita: revenue, rate, observedRate, expectedDays, observedDays, coverage, complete, provenance: summarizeProvenance(cleanRows), status: complete ? "Completa" : coverage > 0 ? "Parcial" : "Ausente" };
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
  const select = (rows) => consolidatedChannelRows(rows.filter((row) => isPaidRawChannel(row.canal) && inPeriod(row, period)));
  const growthRows = select(normalizedViewRows("channel"));
  const snapshotRows = select(state.rows);
  const growthTime = Date.parse(viewEntry("channel")?.generatedAt || state.growthPayload?.generatedAt) || 0;
  const snapshotTime = Date.parse(state.commercial?.extracted_at) || 0;
  // Keep one whole observation per channel/day. Never add two extracts of the same SSOT.
  const ordered = snapshotTime > growthTime ? [growthRows, snapshotRows] : [snapshotRows, growthRows];
  const observations = new Map();
  ordered.flat().forEach((row) => observations.set(`${row.data}|${row.canal}`, row));
  const channels = new Set([...normalizedViewRows('channel'), ...state.rows].filter((row) => isPaidRawChannel(row.canal)).map((row) => row.canal));
  // A missing calendar day is unknown, not a zero or a complete denominator.
  for (let date = bounds.start; date && date <= bounds.end; date = shiftDate(date, 1)) {
    channels.forEach((canal) => {
      const key = `${date}|${canal}`;
      if (!observations.has(key)) observations.set(key, { data: date, canal, sessoes: null, pedidos: null, receita: null });
    });
  }
  const result = [...observations.values()];
  state.channelRowsCache.set(cacheKey, result); return result;
}
function consolidatedPaidHistory(period) {
  if (period === 'compare' && state.compareEnabled === false) return [];
  const entry = state.commercial?.paid_channel_totals;
  if (!['reise-ssot.mart_growth_us.aquisicao_por_canal8_daily', 'reise-ssot.mart_growth_us.aquisicao_por_canal_origem_daily_v'].includes(entry?.source) || !Array.isArray(entry.rows)) return null;
  const bounds = periodBounds(period);
  const key = `paid-totals|${bounds.start}|${bounds.end}`;
  if (state.channelRowsCache.has(key)) return state.channelRowsCache.get(key);
  const observations = new Map(normalizedRows(entry.rows).filter(row => inPeriod(row, period))
    .map(row => [`${row.data}|${row.canal}`, row]));
  // Consolidated Meta is an alternative grain, never an extra account to sum.
  for (let date = bounds.start; date && date <= bounds.end; date = shiftDate(date, 1)) {
    ['Facebook (1 + 2)', 'Google ADS'].forEach(canal => {
      const key = `${date}|${canal}`;
      if (!observations.has(key)) observations.set(key, { data: date, canal, sessoes: null, pedidos: null, receita: null });
    });
  }
  const rows = [...observations.values()];
  state.channelRowsCache.set(key, rows); return rows;
}
function scopeRows(scope, period, ignoreProduct = false) {
  const rows = (ignoreProduct ? channelSourceRows(period) : analysisSourceRows(period)).filter((row) => scope.raw.includes(row.canal));
  if (!ignoreProduct && productFilterActive()) return rows;
  const totals = consolidatedPaidHistory(period);
  if (totals === null) return rows;
  const meta = scope.raw.includes('Meta Ads 1') && scope.raw.includes('Meta Ads 2');
  const google = scope.raw.includes('Google ADS');
  if (!meta && !google) return rows;
  return totals.filter(row => (meta && row.canal === 'Facebook (1 + 2)') || (google && row.canal === 'Google ADS'));
}
function displayScopesForFilter(filterKey) {
  if (filterKey === "group-meta") return PAID_CHANNEL_VIEWS.filter((scope) => ["Meta Ads 1", "Meta Ads 2", "Facebook (1 + 2)"].includes(scope.key));
  if (filterKey === "group-google") return PAID_CHANNEL_VIEWS.filter((scope) => scope.key === "Google ADS");
  if (filterKey === "group-paid" || !filterKey) return PAID_CHANNEL_VIEWS;
  const exact = PAID_CHANNEL_VIEWS.find((scope) => scope.key === filterKey);
  return exact ? [exact] : PAID_CHANNEL_VIEWS;
}
function selectedScopes() {
  const scopes = displayScopesForFilter(state.selectedChannel);
  if (!productFilterActive()) return scopes;
  const channels = new Set(contextualProductRows('', false).map(row => row.canal));
  return scopes.filter(scope => scope.raw.some(raw => channels.has(raw)));
}
function selectedMetricScopes() {
  const filter = CHANNEL_FILTERS.find((scope) => scope.key === state.selectedChannel);
  if (filter) return PAID_SOURCE_CHANNELS.filter((scope) => filter.raw.some((raw) => scope.raw.includes(raw)));
  const exact = PAID_CHANNEL_VIEWS.find((scope) => scope.key === state.selectedChannel);
  return exact ? PAID_SOURCE_CHANNELS.filter((scope) => exact.raw.some((raw) => scope.raw.includes(raw))) : PAID_SOURCE_CHANNELS;
}
function selectedPaidRows(period) {
  const raw = [...new Set(selectedMetricScopes().flatMap(scope => scope.raw))];
  return scopeRows({ raw }, period);
}
function channelGroups(period) { return selectedScopes().map((scope) => ({ key: scope.key, dimension: scope.label, channel: scope.label, campaign: "", group: "", ad: "", product: "", ...summarize(scopeRows(scope, period)) })); }
function allChannelGroups(period) { return channelGroups(period); }

function viewEntry(viewKey) { return state.growthViewMap.get(viewKey) || null; }
function normalizedViewRows(viewKey) {
  if (state.normalizedViewRows.has(viewKey)) return state.normalizedViewRows.get(viewKey);
  const scope = ['campaign', 'channel_product', 'ad_group', 'ad', 'campaign_product', 'ad_group_product'].includes(viewKey) ? viewKey : null;
  const entry = viewEntry(viewKey);
  const rows = normalizedRows((entry?.rows || []).map(row => ({ ...row, provenanceScope: scope, validatedWindow: entry.validatedWindow })));
  state.normalizedViewRows.set(viewKey, rows); return rows;
}
function readiness(viewKey) {
  if (["product", "line", "channel_line"].includes(viewKey)) return readiness("channel_product");
  if (viewKey === "channel" && viewEntry("channel")) return state.growthPayload?.readiness?.find((item) => item.view === viewKey) || { view: "channel", status: "Disponivel", source: viewEntry("channel").source || "SSOT" };
  if (viewKey === "channel" && state.rows.length) return { view: "channel", status: "Disponivel", source: state.commercial?.source || "SSOT comercial de canais" };
  return state.growthPayload?.readiness?.find((item) => item.view === viewKey) || null;
}
function viewRows(view, period) {
  const sourceKey = sourceKeyForView(view.key);
  const entry = viewEntry(sourceKey);
  if (!Array.isArray(entry?.rows)) return [];
  return normalizedViewRows(sourceKey).filter((row) => {
    if (!isAnalysisRow(row)) return false;
    if (!matchesViewLine(view.key, row)) return false;
    if ((view.product || productFilterActive()) && !isMerchandiseProduct(row)) return false;
    if (!inPeriod(row, period)) return false;
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
  const line = row.productLine || "Sem classificacao";
  const keys = { line: [line], channel_line: [channel, line], product: [product], channel: [channel], campaign: [platform(row), campaign], ad_group: [platform(row), campaign, group], ad: [platform(row), campaign, group, ad], channel_product: [channel, product], campaign_product: [platform(row), campaign, product], ad_group_product: [platform(row), campaign, group, product], ad_product: [platform(row), campaign, group, ad, product] };
  return keys[view.key].join("|");
}

function groups(view, period) {
  if (view.key === "channel") return allChannelGroups(period);
  const grouped = new Map();
  viewRows(view, period).forEach((row) => { const key = dimensionKey(view, row); if (!grouped.has(key)) grouped.set(key, { rows: [], first: row }); grouped.get(key).rows.push(row); });
  return [...grouped.values()].map((item) => ({ ...dimensions(view, item.first), key: dimensionKey(view, item.first), ...summarize(item.rows),
    ...(['line', 'channel_line'].includes(view.key) ? { products: [...new Set(item.rows.map(row => row.productName))].sort((a,b)=>a.localeCompare(b,'pt-BR')) } : {}) }))
    .sort((a, b) => (b.pedidos || 0) - (a.pedidos || 0) || a.dimension.localeCompare(b.dimension, "pt-BR"));
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
function growthToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function calendarPeriod(preset, today = growthToday()) {
  const date = new Date(`${today}T12:00:00Z`);
  const relative = days => { const shifted = new Date(date); shifted.setUTCDate(shifted.getUTCDate() + days); return isoDate(shifted); };
  const monthDay = (offset, day) => isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, day, 12)));
  const yesterday = relative(-1);
  if (preset === 'today') return [today, today];
  if (preset === 'yesterday') return [yesterday, yesterday];
  if (preset === 'last-7' || preset === 'last-30') return [relative(preset === 'last-7' ? -7 : -30), yesterday];
  if (preset === 'mtd') return date.getUTCDate() === 1 ? null : [monthDay(0, 1), yesterday];
  if (preset === 'last-month') return [monthDay(-1, 1), monthDay(0, 0)];
  return null;
}
function applyComparison() {
  if (!state.start || !state.end || state.compareMode === "custom") return;
  if (state.compareMode === "year-ago") { state.compareStart = shiftYear(state.start, -1); state.compareEnd = shiftYear(state.end, -1); return; }
  const days = dateSpan(state.start, state.end); state.compareEnd = shiftDate(state.start, -1); state.compareStart = shiftDate(state.compareEnd, -(days - 1));
}
function applyPeriodPreset(preset) {
  const calendar = calendarPeriod(preset);
  if (calendar) { [state.start, state.end] = calendar; applyComparison(); suggestGranularityForWindow(); return; }
  if (preset === 'mtd') return;
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
function comparisonWindowLabel() { return state.compareEnabled === false ? "Sem comparacao temporal" : state.compareStart && state.compareEnd ? `Comparacao: ${dayLabel(state.compareStart)} a ${dayLabel(state.compareEnd)}` : "Comparacao nao definida"; }
function suggestedGranularity() {
  const days = dateSpan(state.start, state.end);
  if (days <= 1) return state.hourlyAvailable ? "hour" : "day";
  if (days <= 31) return "day";
  if (days <= 92) return "week";
  if (days <= 366) return "month";
  if (days <= 730) return "quarter";
  return "year";
}
function suggestGranularityForWindow() {
  const next = suggestedGranularity();
  if (next && (state.start || state.end)) state.selectedGranularity = next;
}
function renderTemporalControls() {
  suggestGranularityForWindow();
}
function setupFilters(draft = false) {
  const channelSelect = $("#global-channel-filter"); const grouped = CHANNEL_FILTERS.filter((item) => item.key.startsWith("group-")); const individual = PAID_CHANNEL_VIEWS; channelSelect.innerHTML = `<option value="">Todos os canais pagos</option><optgroup label="Grupos de canal">${grouped.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</optgroup><optgroup label="Leituras declaradas">${individual.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</optgroup>`; channelSelect.value = state.selectedChannel; channelSelect.onchange = () => { state.selectedChannel = channelSelect.value; state.chartFilter = state.selectedChannel; state.chartChannels = selectedScopes().map((scope) => scope.key); renderAll(); };
  const compareMode = $("#compare-mode"); if (compareMode) { compareMode.value = state.compareMode; $("#compare-custom-fields")?.classList.toggle("is-hidden", state.compareMode !== "custom"); $("#compare-start").value = state.compareStart; $("#compare-end").value = state.compareEnd; $("#comparison-window").textContent = comparisonWindowLabel(); }
  configureChannelOptions(channelSelect);
  if (!draft) {
    const level = $("#explorer-level"); level.innerHTML = growthViewOptions(true); level.value = state.selectedView; level.onchange = () => { state.selectedView = level.value; renderAll(); };
  }
  for (const id of draft ? ['filter-metric'] : ['filter-metric', 'chart-metric', 'rhythm-metric']) {
    const select = $(`#${id}`);
    const productMetric = productFilterActive() || (entityState.charts && entitySelection('a').productGrain && entitySelection('b').productGrain);
    for (const option of select.options) {
      if (option.value === 'pedidos') option.textContent = productMetric ? 'Pedidos por produto' : 'Pedidos';
      if (option.value === 'sessoes') option.textContent = productMetric ? 'Visitas ao produto' : 'Sessoes';
    }
  }
  filtersForProducts();
}
function metricValue(item, metric) { return metric === "rate" ? item.rate : item[metric]; }
function metricText(value, metric) { return metric === "rate" ? fmtPercent(value) : metric === "receita" ? fmtMoney(value) : fmtNumber(value); }
function metricLabel(metric) {
  if (productFilterActive() && metric === 'sessoes') return 'visitas ao produto';
  if (productFilterActive() && metric === 'pedidos') return 'pedidos por produto';
  return { pedidos: "pedidos", receita: "receita", sessoes: "sessoes", rate: "conversao" }[metric] || metric;
}
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
function clippedPeriodLabel(item, granularity, bounds) {
  if (!bounds || ['hour', 'day', 'day-over-day'].includes(granularity)) return item;
  const date = toDate(item.rows[0].data);
  let start, end;
  if (granularity === 'week') {
    start = item.key; end = shiftDate(start, 6);
  } else {
    const span = { month: 1, quarter: 3, semester: 6, year: 12 }[granularity];
    if (!span) return item;
    const month = Math.floor(date.getMonth() / span) * span;
    start = isoDate(new Date(date.getFullYear(), month, 1, 12));
    end = isoDate(new Date(date.getFullYear(), month + span, 0, 12));
  }
  const clippedStart = start < bounds.start ? bounds.start : start;
  const clippedEnd = end > bounds.end ? bounds.end : end;
  const partial = start !== clippedStart || end !== clippedEnd;
  const rangeLabel = clippedStart === clippedEnd ? dayLabel(clippedStart) : `${dayLabel(clippedStart)} a ${dayLabel(clippedEnd)}`;
  return { ...item, partial, rangeLabel, label: partial ? `${rangeLabel} (parcial)` : item.label };
}
function aggregatePeriods(rows, granularity, bounds = null) {
  const map = new Map(); rows.forEach((row) => { const bucket = periodBucket(row.data, granularity, row); if (!map.has(bucket.key)) map.set(bucket.key, { key: bucket.key, label: bucket.label, rows: [] }); map.get(bucket.key).rows.push(row); });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map((item) => ({ ...clippedPeriodLabel(item, granularity, bounds), ...summarize(item.rows) }));
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

function viewQuality(view) {
  const sourceKey = sourceKeyForView(view.key);
  const declaration = readiness(sourceKey);
  const source = declaration?.source || viewEntry(sourceKey)?.source || '';
  const rows = period => sourceKey === 'channel' ? selectedPaidRows(period) : viewRows(view, period);
  const current = rows('current'); const previous = rows('compare');
  const observed = current.some(hasGrowthObservation);
  const historical = previous.some(hasGrowthObservation);
  const provisional = /provisorio|utm/i.test(declaration?.status || '');
  const loaded = sourceKey === 'channel' ? state.rows.length || viewEntry(sourceKey)?.rows?.length : viewEntry(sourceKey)?.rows?.length;
  const alternative = Boolean(state.alternativePayload?.views?.[sourceKey]);
  if (!loaded) return { source: source || 'Sem fonte SSOT validada', status: 'Pendente', tone: 'pending',
    note: `${declaration?.reason || 'Cruzamento SSOT nao validado.'}${alternative ? ' GA4 historico disponivel em arquivo, sem homologacao para os filtros atuais.' : ''}` };
  const periodGap = viewPeriodGap(view, 'current') || viewPeriodGap(view, 'compare');
  if (periodGap && observed && !provisional) return { source: source || 'SSOT', status: 'Periodo incompleto', tone: 'warn', note: periodGap };
  if (!observed) return { source: source || 'SSOT', status: 'Sem dados no recorte', tone: 'warn',
    note: (historical ? 'Observacoes apenas no periodo comparado; atual indisponivel.' : 'Fonte carregada, sem observacoes para os filtros e datas selecionados.') + (periodGap ? ` ${periodGap}.` : '') };
  const totals = summarize(current); const oldTotals = summarize(previous);
  const comparison = state.compareEnabled === false ? '' : oldTotals.rate === null ? ' Comparacao sem base completa de conversao.' : ' Comparacao com denominador conhecido.';
  return { source: source || 'SSOT', status: provisional ? 'SSOT provisorio / UTM' : totals.rate === null ? 'SSOT parcial' : 'SSOT no recorte',
    tone: provisional || totals.rate === null ? 'warn' : 'ok',
    note: (provisional ? 'Pedidos e receita por UTM; vinculo com grupo/criativo nao homologado. Sem conversao oficial.'
      : totals.rate === null ? 'Indicadores conhecidos preservados; conversao sem base completa.'
      : view.product || productFilterActive() ? 'Pedidos por produto / visitas ao produto; pedidos nao deduplicados entre produtos.'
      : 'Pedidos / sessoes do SSOT no mesmo recorte.') + comparison + (periodGap ? ` ${periodGap}.` : '') + (totals.provenance ? ` ${provenanceNote(totals)}` : '') };
}
function renderQuality() {
  const entries = VIEWS.map(view => ({ view, ...viewQuality(view) }));
  const valid = entries.filter(item => item.tone === 'ok').length;
  const partial = entries.filter(item => item.tone === 'warn').length;
  $('#quality-count').textContent = `${valid} com base / ${partial} com ressalvas`;
  const total = summarize(selectedPaidRows('current'));
  const cards = [
    { type: valid ? 'ok' : 'warn', title: 'Recorte SSOT', text: `${formatWindow()} / ${growthChannelLabel()}. ${valid} visoes com denominador conhecido.` },
    { type: total.rate !== null ? 'ok' : 'warn', title: 'Conversao oficial', text: total.rate !== null ? 'Pedidos e sessoes conhecidos no mesmo recorte.' : 'Conversao indisponivel; indicadores conhecidos preservados, sem preencher ausencias.' },
    { type: 'warn', title: 'Complemento GA4', text: 'Nao incorporado aos indicadores oficiais. Cruzamentos e cobertura temporal ainda precisam de homologacao.' },
  ];
  $('#quality-list').innerHTML = cards.map(item => `<div class="quality-item ${item.type}"><i></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div></div>`).join('');
  $('#catalog-body').innerHTML = entries.map(item => `<tr><td><strong>${item.view.number} / ${escapeHtml(item.view.short)}</strong></td><td>${escapeHtml(item.source)}</td><td class="${item.tone}">${escapeHtml(item.status)}</td><td>${escapeHtml(item.note)}</td></tr>`).join('');
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
    compareEnabled: state.compareEnabled, compareMode: state.compareMode, compareStart: state.compareStart, compareEnd: state.compareEnd } : null;
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
  $("#reload-data").onclick = () => window.GrowthRefresh?.request();
  $("#clear-filters").onclick = () => { state.selectedChannel = ""; state.selectedModel = ""; state.selectedColor = ""; state.selectedSize = ""; state.productSearch = ""; state.chartChannels = []; state.chartFilter = ""; state.explorerSearch = ""; $("#explorer-search").value = ""; renderAll(); };
  $("#period-preset").onchange = (event) => { applyPeriodPreset(event.target.value); $("#date-start").value = state.start; $("#date-end").value = state.end; renderAll(); };
  $("#date-start").onchange = (event) => { state.start = event.target.value; $("#period-preset").value = "custom"; applyComparison(); suggestGranularityForWindow(); renderAll(); };
  $("#date-end").onchange = (event) => { state.end = event.target.value; $("#period-preset").value = "custom"; applyComparison(); suggestGranularityForWindow(); renderAll(); };
  $("#compare-mode").onchange = (event) => { state.compareMode = event.target.value; applyComparison(); renderAll(); };
  $("#compare-start").onchange = (event) => { state.compareMode = "custom"; state.compareStart = event.target.value; renderAll(); };
  $("#compare-end").onchange = (event) => { state.compareMode = "custom"; state.compareEnd = event.target.value; renderAll(); };
  $("#product-search").oninput = (event) => { state.productSearch = event.target.value; filtersForProducts(); renderExplorer(); };
  $("#rhythm-metric").onchange = (event) => { state.rhythmMetric = event.target.value; renderRhythm(); };
  $("#chart-metric").onchange = (event) => { state.chartMetric = event.target.value; renderChart(); };
  $("#explorer-sort").onchange = (event) => { state.explorerSort = event.target.value; state.explorerSortDirection = "desc"; renderExplorer(); };
  $("#explorer-search").oninput = (event) => { state.explorerSearch = event.target.value; renderExplorer(); };
}
let growthLoadPromise = null;
function loadData(options = {}) {
  if (!growthLoadPromise) growthLoadPromise = performLoadData(options).finally(() => { growthLoadPromise = null; });
  return growthLoadPromise;
}
async function performLoadData({ background = false } = {}) {
  if (!background) showLoadingScreen();
  $("#source-status").textContent = "Carregando SSOT";
  $("#source-pill").textContent = "Validando fonte";
  $("#source-pill").className = "status-pill pending";
  let cachedGrowth = null;
  let commercial = state.commercial;
  try {
    if (window.PanoramaRelease?.enabled) {
      const bundle = await window.PanoramaRelease.load();
      hydrateData(bundle.files['ssot-commercial-channels.json'], bundle.files['ssot-growth-views.json'], null, false);
      return;
    }
    const [localGrowth, loadedCommercial] = await Promise.all([
      loadJson('data/ssot-growth-views.json', 5000).catch(() => null),
      loadJson('data/ssot-commercial-channels.json', 10000).catch(() => null),
    ]);
    commercial = loadedCommercial || commercial;
    if (localGrowth?.ok && Array.isArray(localGrowth.data)) {
      hydrateData(commercial, localGrowth, null, false);
      return;
    }
    setLoadingStep("01", "Verificando a ultima leitura");
    cachedGrowth = await readGrowthCache();
    if (state.growthPayload && (!cachedGrowth || Date.parse(state.growthPayload.generatedAt) >= Date.parse(cachedGrowth.generatedAt))) cachedGrowth = state.growthPayload;
    const cacheIsAlreadyDisplayed = cachedGrowth?.generatedAt && cachedGrowth.generatedAt === state.growthPayload?.generatedAt
      && commercial?.extracted_at === state.commercial?.extracted_at;
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
    hydrateData(commercial, cachedGrowth, null, Boolean(cachedGrowth));
  } catch (error) {
    if (window.PanoramaRelease?.enabled) {
      $('#source-status').textContent = 'Lote publicado indisponivel';
      $('#source-pill').textContent = 'Atualizacao pendente';
      $('#source-pill').className = 'status-pill warn';
      $('#validation-summary').textContent = error.message;
      return;
    }
    if (cachedGrowth?.ok && Array.isArray(cachedGrowth.data)) {
      $("#source-status").textContent = "SSOT em cache";
      $("#source-pill").textContent = "Cache local";
      $("#source-pill").className = "status-pill warn";
      $("#validation-title").textContent = "Atualizacao pendente";
      $("#validation-summary").textContent = `A leitura ao vivo falhou: ${error.message}. Exibindo a ultima leitura validada.`;
    } else {
      try {
        commercial = commercial || await loadJson("data/ssot-commercial-channels.json");
        setLoadingStep("03", "Aplicando leitura de contingencia");
        hydrateData(commercial, state.growthPayload, null, Boolean(state.growthPayload));
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
    if (!pendingGrowthRefresh || document.querySelector('#growth-filter-dialog')?.open || document.activeElement?.closest('#growth-workspace input, #growth-workspace select, #growth-workspace textarea')) return;
    pendingGrowthRefresh = false;
    loadData({ background: true });
  };
  window.addEventListener('panorama:data-refreshed', () => { pendingGrowthRefresh = true; flushGrowthRefresh(); });
  document.addEventListener('focusout', () => setTimeout(flushGrowthRefresh, 0));
  document.querySelector('#growth-filter-dialog')?.addEventListener('close', flushGrowthRefresh);
}
