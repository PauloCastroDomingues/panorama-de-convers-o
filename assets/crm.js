(() => {
  const $crm = (selector) => document.querySelector(selector);
  const crmState = { data: null, channel: "whatsapp-oficial", campaigns: [], ssotPayload: null, ssotFallback: null, sendflow: null, sendflowError: "", sendflowPage: 0, sendflowSort: "sentAt", sendflowDirection: -1, rd: null, rdError: "", rdPage: 0, rdSort: "sentAt", rdDirection: -1, rdSearch: "", rdIssueFilter: "all", referenceData: null, availableStart: "", availableEnd: "", start: "", end: "", periodPreset: "current-day", compareMode: "previous", compareEnabled: true, compareStart: "", compareEnd: "" };
  const WHATSAPP_OFFICIAL_CSV_URL = "https://docs.google.com/spreadsheets/d/1vlkkrA52FBGk79k0ou3vch1XqM-AdHVDj42IXO7hIZo/export?format=csv&gid=404910707";
  const whatsappSource = { status: 'loading' };
  const SSOT_GROWTH_API_URL = "https://script.google.com/macros/s/AKfycby7GYHJIvpKE1hwh3hCq9atS_zKQXaz4oYQ6nzzzGFdvCr-h2sfMATeTst9qgdzghKE8w/exec";

  const parseCsv = (text) => {
    const rows = []; let row = []; let cell = ""; let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]; const next = text[index + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === "," && !quoted) { row.push(cell); cell = ""; continue; }
      if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(cell); rows.push(row); row = []; cell = ""; continue; }
      cell += char;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const headers = rows.shift()?.map((header) => header.trim()) || [];
    return rows.flatMap((values, sourceIndex) => values.some((value) => value.trim() !== "") ? [{ ...Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])), __sourceRow: sourceIndex + 2 }] : []);
  };
  const sourceNumber = (value) => {
    if (value === null || value === undefined || value === "" || value === "-" || String(value).startsWith("#")) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(String(value).replace(/\s/g, "").replace(/R\$/g, "").replace(/\./g, "").replace(",", ".").replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const sourceSum = (rows, key) => { const values = rows.map((row) => sourceNumber(row[key])).filter((value) => value !== null); return values.length ? values.reduce((total, value) => total + value, 0) : null; };
  const sourceChannelKey = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  const isWhatsAppOfficial = (value) => ["whatsapp", "whatsappp", "whasapp", "whtasapp"].includes(sourceChannelKey(value));
  const sourceDateKey = (value) => { const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})$/); return match ? Number(match[2]) * 100 + Number(match[1]) : null; };
  const sourceIsoDate = (value, year) => { const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})$/); return match ? `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}` : null; };
  const dateFromIso = (value) => new Date(`${value}T12:00:00`);
  const isoFromDate = (date) => date.toISOString().slice(0, 10);
  const shiftSourceDate = (value, days) => { const date = dateFromIso(value); date.setDate(date.getDate() + days); return isoFromDate(date); };
  const sourceDateLabel = (value) => { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; };
  const crmDateSpan = (start, end) => start && end ? Math.round((dateFromIso(end) - dateFromIso(start)) / 86400000) + 1 : 0;
  const crmShiftDate = (value, days) => { const date = dateFromIso(value); date.setDate(date.getDate() + days); return isoFromDate(date); };
  const crmShiftYear = (value, years) => { const date = dateFromIso(value); date.setFullYear(date.getFullYear() + years); return isoFromDate(date); };
  const crmApplyComparison = () => {
    if (!crmState.start || !crmState.end || crmState.compareMode === "custom") return;
    if (crmState.compareMode === "year-ago") { crmState.compareStart = crmShiftYear(crmState.start, -1); crmState.compareEnd = crmShiftYear(crmState.end, -1); return; }
    const days = crmDateSpan(crmState.start, crmState.end); crmState.compareEnd = crmShiftDate(crmState.start, -1); crmState.compareStart = crmShiftDate(crmState.compareEnd, -(days - 1));
  };
  const crmComparisonLabel = () => !crmState.compareEnabled ? "Sem comparacao" : crmState.compareStart && crmState.compareEnd ? `Comparacao: ${sourceDateLabel(crmState.compareStart)} a ${sourceDateLabel(crmState.compareEnd)}` : "Comparacao nao definida";
  const commercialSource = (channel) => CrmSendFlow.latestCommercialSource([crmState.ssotPayload, crmState.ssotFallback], channel);
  const commercialDates = () => {
    const channels = crmState.channel === 'all' ? ['email', 'whatsapp-oficial', 'whatsapp-organico'] : [crmState.channel];
    const calendars = channels.map((channel) => CrmSendFlow.availableDates(commercialSource(channel), channel));
    return calendars[0]?.filter((date) => calendars.every((calendar) => calendar.includes(date))).sort() || [];
  };
  const crmApplyPeriodPreset = (preset) => {
    const calendar = commercialDates();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const end = ['current-day', 'all'].includes(preset) ? calendar.at(-1) : today;
    if (!end || preset === "custom") return;
    const date = dateFromIso(end); let start = end; let finish = end;
    if (preset === "previous-day") start = finish = crmShiftDate(end, -1);
    if (preset === "week") { const day = date.getDay() || 7; start = crmShiftDate(end, -day + 1); }
    if (preset === "fortnight") start = isoFromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() <= 15 ? 1 : 16, 12));
    if (preset === "month") start = isoFromDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    if (preset === "quarter") { const month = Math.floor(date.getMonth() / 3) * 3; start = isoFromDate(new Date(date.getFullYear(), month, 1, 12)); }
    if (preset === "semester") start = isoFromDate(new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1, 12));
    if (preset === "year") start = isoFromDate(new Date(date.getFullYear(), 0, 1, 12));
    if (preset === "last-complete") { const last = new Date(date.getFullYear(), date.getMonth(), 0, 12); finish = isoFromDate(last); start = isoFromDate(new Date(last.getFullYear(), last.getMonth() - 11, 1, 12)); }
    if (preset === "all") { start = calendar[0]; finish = end; }
    crmState.start = start; crmState.end = finish; crmApplyComparison();
  };
  const sourceRowsWithDates = (rows) => {
    const dated = rows.filter((row) => sourceDateKey(row.Data) !== null); let year = new Date().getFullYear(); let previousKey = null;
    for (let index = dated.length - 1; index >= 0; index -= 1) { const key = sourceDateKey(dated[index].Data); if (previousKey !== null && key > previousKey) year -= 1; dated[index].isoDate ||= sourceIsoDate(dated[index].Data, year); previousKey = key; }
    return rows;
  };
  const consolidateWhatsAppRows = (csvRows) => {
    sourceRowsWithDates(csvRows);
    const groups = []; let current = null;
    csvRows.forEach((row) => { if (row.Tema) { current = { parent: row, children: [] }; groups.push(current); } else if (current) current.children.push(row); });
    return groups.map((group) => {
      const core = ["Sessões", "Pedidos", "Receita"]; const parentComplete = core.every((key) => sourceNumber(group.parent[key]) !== null); const metricRows = parentComplete ? [group.parent] : group.children.length ? group.children : [group.parent];
      return { date: group.parent.isoDate, theme: group.parent.Tema, category: group.parent.Categoria || "Sem categoria", segment: group.parent.Segmentação || "Sem segmentacao", time: group.parent.Hora || "", delivered: sourceSum(metricRows, "Total Entregue"), audience: sourceSum(metricRows, "Público"), opens: sourceSum(metricRows, "Aberturas"), clicks: sourceSum(metricRows, "Total de cliques"), sessions: sourceSum(metricRows, "Sessões"), orders: sourceSum(metricRows, "Pedidos"), revenue: sourceSum(metricRows, "Receita"), investment: sourceSum(metricRows, "Investimento"), trackingRecords: CrmWhatsApp.recordsForGroup(group, sourceNumber) };
    }).filter((row) => row.date);
  };
  const buildSsotWhatsAppReconciliation = (payload, periodStart, periodEnd) => {
    const input = CrmSendFlow.latestCommercialSource([payload, crmState.ssotFallback], 'whatsapp-oficial');
    const result = CrmSendFlow.commercial(input, "whatsapp-oficial", periodStart, periodEnd);
    return result.rows ? result : null;
  };
  const buildWhatsAppOfficialChannel = (campaigns, referenceChannel, ssotPayload, requestedStart, requestedEnd) => {
    if (!campaigns.length) return null;
    const latestDate = campaigns.map((row) => row.date).sort().at(-1); const latestDay = dateFromIso(latestDate).getDay(); const fallbackEnd = shiftSourceDate(latestDate, -(latestDay === 0 ? 7 : latestDay)); const fallbackStart = shiftSourceDate(fallbackEnd, -6); const periodStart = requestedStart || fallbackStart; const periodEnd = requestedEnd || fallbackEnd; const currentRows = campaigns.filter((row) => row.date >= periodStart && row.date <= periodEnd);
    const metric = (key) => sourceSum(currentRows, key); const sessions = metric("sessions"); const orders = metric("orders"); const revenue = metric("revenue"); const investment = metric("investment"); const sessionsComplete = currentRows.length > 0 && currentRows.every((row) => row.sessions !== null); const rate = sessionsComplete && sessions !== null && sessions > 0 && orders !== null ? orders / sessions : null; const roas = investment !== null && investment > 0 && revenue !== null ? revenue / investment : null; const cps = investment !== null && sessions !== null && sessions > 0 ? investment / sessions : null;
    const dailyMap = new Map();
    currentRows.forEach((row) => {
      const target = dailyMap.get(row.date) || { date: row.date, sessions: null, orders: null, revenue: null, investment: null };
      ["sessions", "orders", "revenue", "investment"].forEach((key) => { const value = sourceNumber(row[key]); if (value !== null) target[key] = (target[key] || 0) + value; });
      dailyMap.set(row.date, target);
    });
    const daily = [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date)).map((row) => ({ ...row, rate: row.sessions !== null && row.sessions > 0 && row.orders !== null ? row.orders / row.sessions : null }));
    const staticMetrics = new Map((referenceChannel.metrics || []).map((item) => [item.key, item])); const actualMetric = (key, label, actual, format, invertGood = false) => ({ key, label, meta: staticMetrics.get(key)?.meta ?? null, actual, format, invertGood });
    const categories = [...new Set(currentRows.map((row) => row.category).filter(Boolean))]; const segments = categories.map((category) => { const rows = currentRows.filter((row) => row.category === category); const planned = referenceChannel.segments?.find((segment) => segment.name === category); const actual = [["Publico", "audience"], ["Entregues", "delivered"], ["Aberturas", "opens"], ["Cliques", "clicks"]].map(([label, field]) => ({ label, value: sourceSum(rows, field), complete: rows.every(row => Number.isFinite(row[field])) })); actual.forEach((stage, index) => { const previous = actual[index - 1]; if (index > 0 && previous?.value > 0 && stage.value !== null) stage.rate = stage.value / previous.value; }); return { name: category, plannedShots: planned?.plannedShots ?? null, actualShots: rows.length, planned: planned?.planned || [], actual, diagnosis: `${rows.length} disparo(s) consolidados diretamente da planilha de WhatsApp Oficial. A conversao usa pedidos / sessoes somente quando as duas metricas existem.` }; });
    const sourceActivation = { resultLabel: "Pedidos", metaResult: staticMetrics.get("orders")?.meta ?? null, hint: "Funil observado na base de WhatsApp Oficial, separado por categoria de disparo.", segments: segments.map((segment) => { const segmentRows = currentRows.filter((row) => row.category === segment.name); const segmentOrders = sourceSum(segmentRows, "orders"); return { name: segment.name, shots: segment.actualShots, resultPerShot: segment.actualShots && segmentOrders !== null ? segmentOrders / segment.actualShots : null, stages: segment.actual }; }), tracking: referenceChannel.activation?.tracking || { slots: categories, inputs: [], outputs: [], result: "Pedidos", hint: "Leitura somente da planilha de WhatsApp Oficial." } };
    const periodLabel = `${sourceDateLabel(periodStart)} a ${sourceDateLabel(periodEnd)}`;
    const ssotReconciliation = buildSsotWhatsAppReconciliation(ssotPayload, periodStart, periodEnd);
    const missingSessionRows = currentRows.filter((row) => row.sessions === null).length;
    const conversionNote = missingSessionRows ? `Conversao indisponivel: ${missingSessionRows} disparo(s) do recorte nao possuem sessoes. Pedidos e receita permanecem visiveis.` : "Conversao calculada como pedidos / sessoes no mesmo recorte.";
    return { ...referenceChannel, metrics: [actualMetric("investment", "Investimento", investment, "money", true), actualMetric("revenue", "Receita", revenue, "money"), actualMetric("roas", "ROAS", roas, "multiple"), actualMetric("sessions", "Sessoes", sessions, "int"), actualMetric("orders", "Pedidos", orders, "int"), actualMetric("rate", "Conversao", rate, "percent"), actualMetric("cps", "CPS", cps, "money", true)], note: `${currentRows.length} disparos consolidados da planilha. Periodo analisado: ${periodLabel}. ${conversionNote}`, segments, daily, activation: sourceActivation, sourcePeriod: { start: periodStart, end: periodEnd, label: periodLabel }, ssotReconciliation, sourceLabel: "Planilha CRM · WhatsApp Oficial · somente leitura" };
  };
  const makeUnavailableChannel = (channel) => ({
    ...channel,
    metrics: (channel.metrics || []).map((metric) => ({ ...metric, actual: null, comparison: null })),
    segments: (channel.segments || []).map((segment) => ({ ...segment, actualShots: null, actual: [], diagnosis: "A fonte deste canal nao possui lancamentos diarios neste recorte." })),
    activation: { ...(channel.activation || {}), segments: [], combined: null },
    note: "Ativacao sem lancamentos carregados neste recorte. Isso nao representa ausencia de resultado comercial no SSOT.",
    sourcePeriod: { start: crmState.start, end: crmState.end, label: `${sourceDateLabel(crmState.start)} a ${sourceDateLabel(crmState.end)}` },
    ssotReconciliation: null,
  });
  const addPeriodComparison = (channel, comparisonChannel) => {
    if (!channel) return channel;
    const comparisonMetrics = new Map((comparisonChannel?.metrics || []).map((metric) => [metric.key, metric.actual]));
    return { ...channel, activationComparison: comparisonChannel?.activation ?? null, metrics: (channel.metrics || []).map((metric) => ({ ...metric, comparison: comparisonMetrics.has(metric.key) ? comparisonMetrics.get(metric.key) : null })) };
  };
  const rebuildCrmData = () => {
    const referenceChannels = crmState.referenceData.channels || [];
    const referencePeriod = crmState.referenceData.period || {};
    const currentWhatsApp = buildWhatsAppOfficialChannel(crmState.campaigns, referenceChannels.find((channel) => channel.id === "whatsapp-oficial"), crmState.ssotPayload, crmState.start, crmState.end);
    const comparisonWhatsApp = crmState.compareStart && crmState.compareEnd ? buildWhatsAppOfficialChannel(crmState.campaigns, referenceChannels.find((channel) => channel.id === "whatsapp-oficial"), crmState.ssotPayload, crmState.compareStart, crmState.compareEnd) : null;
    const sameReferenceWindow = crmState.start === referencePeriod.start && crmState.end === referencePeriod.end;
    const channels = referenceChannels.map((channel) => {
      const payload = commercialSource(channel.id);
      if (channel.id === "whatsapp-organico" && crmState.sendflow) return CrmSendFlow.buildChannel(crmState.sendflow, channel, payload, crmState.start, crmState.end, crmState.compareStart, crmState.compareEnd);
      if (channel.id === "email" && crmState.rd) {
        const operational = { ...makeUnavailableChannel(channel), metrics: [], operationalSource: "RD Station | piloto observado" };
        return { ...CrmSendFlow.withCommercial(operational, channel, payload, crmState.start, crmState.end, crmState.compareStart, crmState.compareEnd),
          rd: { snapshot: crmState.rd, current: CrmRd.selectPeriod(crmState.rd, crmState.start, crmState.end), comparison: CrmRd.selectPeriod(crmState.rd, crmState.compareStart, crmState.compareEnd) } };
      }
      const operational = channel.id === "whatsapp-oficial" ? addPeriodComparison(currentWhatsApp, comparisonWhatsApp) || makeUnavailableChannel(channel)
        : makeUnavailableChannel(channel);
      if (channel.id === "whatsapp-organico") operational.operationalSource = "SendFlow sem carga no recorte";
      return CrmSendFlow.withCommercial(operational, channel, payload, crmState.start, crmState.end, crmState.compareStart, crmState.compareEnd, sameReferenceWindow);
    });
    crmState.data = { ...crmState.referenceData, channels, period: { start: crmState.start, end: crmState.end, label: `${sourceDateLabel(crmState.start)} a ${sourceDateLabel(crmState.end)}` } };
    const active = crmState.data.channels.find((channel) => channel.id === crmState.channel);
    $crm("#crm-period-label").textContent = crmState.data.period.label;
    $crm("#crm-period-note").textContent = crmState.data.period.label;
    $crm("#crm-summary-window").textContent = `${crmState.channel === "all" ? "Todos os canais CRM" : crmState.data.channels.find((channel) => channel.id === crmState.channel)?.name || "Canal CRM"} · ${crmState.data.period.label}`;
    $crm("#crm-comparison-window").textContent = crmComparisonLabel();
    if (active) $crm("#crm-source-label").textContent = active.sourceLabel;
    renderAll();
  };

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const int = (value) => value === null || value === undefined ? "Indisponivel" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
  const money = (value) => value === null || value === undefined ? "Indisponivel" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
  const percent = (value) => value === null || value === undefined ? "Indisponivel" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const multiple = (value) => value === null || value === undefined ? "Indisponivel" : `${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  const formatValue = (value, format) => format === "money" ? money(value) : format === "percent" ? percent(value) : format === "multiple" ? multiple(value) : int(value);
  const formatDelta = (metric) => {
    if (metric.currentComplete === false) return { text: "Cobertura parcial no periodo", tone: "neutral" };
    if (metric.meta === null || metric.actual === null || metric.meta === 0) return { text: "Sem base de comparacao", tone: "neutral" };
    const difference = metric.actual - metric.meta;
    const relative = difference / Math.abs(metric.meta);
    const tone = metric.invertGood ? (difference <= 0 ? "good" : "bad") : (difference >= 0 ? "good" : "bad");
    if (metric.format === "percent") return { text: `${difference >= 0 ? "+" : ""}${(difference * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`, tone };
    return { text: `${relative >= 0 ? "+" : ""}${(relative * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs. meta`, tone };
  };
  const formatPeriodDelta = (metric) => {
    if (!crmState.compareEnabled) return { text: "", tone: "neutral", direction: "unknown" };
    return PerformanceDelta.describe(metric.actual, metric.comparison, {
      rate: metric.format === 'percent', lowerIsBetter: metric.invertGood,
      neutral: metric.key === 'investment',
      complete: metric.currentComplete !== false && metric.comparisonComplete !== false
    });
  };
  const periodMarkup = (metric) => crmState.compareEnabled ? PerformanceDelta.markup(formatPeriodDelta(metric)) : "";
  const selectedChannels = () => {
    if (!crmState.data) return [];
    return crmState.channel === "all" ? crmState.data.channels : crmState.data.channels.filter((channel) => channel.id === crmState.channel);
  };
  const metricMap = (channel) => new Map(channel.metrics.map((metric) => [metric.key, metric]));
  const aggregate = (channels) => CrmSendFlow.aggregateCommercial(channels);
  const renderMetricCells = (metrics) => metrics.map((metric) => {
    const delta = formatDelta(metric);
    const periodDelta = formatPeriodDelta(metric);
    return `<div class="crm-metric"><span>${esc(metric.label)}</span><strong>${formatValue(metric.actual, metric.format)}</strong>${metric.meta !== null ? `<small>Meta ${formatValue(metric.meta, metric.format)}</small><em class="${delta.tone}">${esc(delta.text)}</em>` : ""}${periodMarkup(metric)}</div>`;
  }).join("");
  const renderSummary = () => {
    const metrics = aggregate(selectedChannels());
    const orders = metrics.find((metric) => metric.key === 'orders'), revenue = metrics.find((metric) => metric.key === 'revenue');
    const ticket = (field, complete) => complete && orders[field] > 0 && revenue[field] !== null ? revenue[field] / orders[field] : null;
    metrics.push({ key: 'ticket', format: 'money', meta: null, actual: ticket('actual', orders.currentComplete && revenue.currentComplete), comparison: ticket('comparison', orders.comparisonComplete && revenue.comparisonComplete) });
    $crm("#crm-summary-kpis").innerHTML = metrics.map((metric) => `<article class="kpi"><span>${esc(metric.key === "rate" ? "Conversao SSOT" : metric.key === "sessions" ? metric.currentComplete === false ? "Sessoes conhecidas SSOT" : "Sessoes SSOT" : metric.key === "orders" ? "Pedidos SSOT" : "Receita SSOT")}</span><strong>${formatValue(metric.actual, metric.format)}</strong>${metric.meta !== null ? `<small>Meta ${formatValue(metric.meta, metric.format)}</small>` : ""}${periodMarkup(metric)}</article>`).join("");
    $crm('#crm-summary-kpis .kpi:last-child > span').textContent = 'Ticket medio SSOT';
    const calendar = commercialDates(), latest = calendar.at(-1);
    const sourceRoot = $crm('#crm-commercial-availability');
    sourceRoot.innerHTML = latest ? `<span>SSOT comercial ate <strong>${sourceDateLabel(latest)}</strong> · datas operacionais independentes</span>${crmState.end > latest ? '<button type="button" class="outline-button" id="crm-open-latest">Abrir ultimo dia SSOT</button>' : ''}` : '<span>A fonte comercial deste canal nao foi carregada.</span>';
    $crm('#crm-open-latest')?.addEventListener('click', () => { crmState.periodPreset = 'current-day'; crmApplyPeriodPreset('current-day'); syncCrmPeriodControls(); rebuildCrmData(); });
    const hasResult = metrics.some((metric) => metric.actual !== null);
    $crm('#crm-summary-kpis').hidden = !hasResult;
    sourceRoot.classList.toggle('warn', !hasResult);
    renderFreshness();
    const scopeLabel = crmState.channel === "all" ? "Todos os canais CRM" : selectedChannels()[0]?.name || "Canal CRM";
    $crm("#crm-summary-window").textContent = `${scopeLabel} · ${crmState.data.period.label}`;
  };
  const renderSourceReconciliation = () => {
    const root = $crm("#crm-ssot-reconciliation");
    if (!root) return;
    const channels = selectedChannels().filter((channel) => channel.ssotCommercial);
    if (!channels.length) { root.hidden = true; root.innerHTML = ""; return; }
    const singleChannel = channels.length === 1;
    const rows = channels.flatMap((channel) => channel.metrics.filter((metric) => ["sessions", "orders", "revenue", "rate"].includes(metric.key)).map((metric) => {
      const delta = formatPeriodDelta(metric);
      const label = { sessions: metric.currentComplete === false ? "Sessoes conhecidas" : "Sessoes", orders: "Pedidos", revenue: "Receita", rate: "Conversao" }[metric.key];
      return `<tr>${singleChannel ? "" : `<td>${esc(channel.name)}</td>`}<td>${label}</td><td>${formatValue(metric.actual, metric.format)}</td>${crmState.compareEnabled ? `<td>${formatValue(metric.comparison, metric.format)}</td><td>${periodMarkup(metric)}</td>` : ""}</tr>`;
    })).join("");
    const complete = channels.every((channel) => channel.ssotCommercial.complete);
    const channel = channels.length === 1 ? channels[0] : null;
    const operationalMetrics = channel?.operationalMetrics || [];
    const financialRows = operationalMetrics.filter((metric) => ["sessions", "orders", "revenue", "rate"].includes(metric.key) && metric.actual !== null && metric.actual !== undefined);
    const audit = financialRows.length ? `<h3>Conferencia da fonte operacional</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>Metrica</th><th>Fonte operacional</th><th>SSOT do canal</th><th>Diferenca</th></tr></thead><tbody>${financialRows.map((metric) => {
      const official = channel.ssotCommercial[metric.key];
      return `<tr><td>${esc(metric.label)}</td><td>${formatValue(metric.actual, metric.format)}</td><td>${formatValue(official, metric.format)}</td><td>${formatValue(official !== null ? metric.actual - official : null, metric.format)}</td></tr>`;
    }).join("")}</tbody></table></div>` : "";
    root.hidden = false;
    root.innerHTML = `<div class="crm-reconciliation-head"><div><p class="eyebrow">Cruzamento de fontes</p><h3>${channel?.id === "whatsapp-organico" ? "WhatsApp Organico: SSOT + SendFlow" : "Resultado comercial por canal no SSOT"}</h3><p>Canal e periodo sao as chaves da leitura comercial. A ativacao complementa o resultado; nao substitui as vendas nem comprova atribuicao por mensagem.</p></div><span class="status-pill ${complete ? "ok" : "warn"}">${complete ? "SSOT completo no recorte" : "Cobertura da extracao SSOT parcial"}</span></div><div class="table-scroll"><table class="data-table crm-reconciliation-table ${singleChannel ? "single-channel" : ""}"><thead><tr>${singleChannel ? "" : "<th>Canal</th>"}<th>Indicador</th><th>SSOT atual</th>${crmState.compareEnabled ? "<th>SSOT comparacao</th><th>Variacao</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div>${audit}${channels.map((item) => `<p class="crm-reconciliation-note">${esc(item.name)}: ${item.ssotCommercial.sessionsKnownDays}/${item.ssotCommercial.expectedDays} dias com sessoes; ${item.ssotCommercial.ordersKnownDays}/${item.ssotCommercial.expectedDays} com pedidos; ${item.ssotCommercial.revenueKnownDays}/${item.ssotCommercial.expectedDays} com receita. ${item.ssotCommercial.mode === "snapshot" ? "Snapshot SSOT" : "SSOT"}: ${esc(item.ssotCommercial.source)}, extraido em ${esc(item.ssotCommercial.generatedAt || "data nao informada")}. Ativacao: ${esc(item.operationalSource)}.</p>`).join("")}`;
  };
  const renderChannels = () => {
    $crm("#crm-channel-cards").innerHTML = selectedChannels().map((channel) => {
      const label = channel.ssotCommercial?.complete ? "SSOT no recorte" : "Cobertura SSOT parcial";
      const tone = channel.ssotCommercial?.complete ? "ok" : "warn";
      return `<article class="crm-channel-card"><div class="crm-channel-head"><div><p class="eyebrow">Canal CRM</p><h3>${esc(channel.name)}</h3></div><span class="status-pill ${tone}">${label}</span></div><div class="crm-metric-grid">${renderMetricCells(channel.metrics)}</div><p class="crm-reading">${esc(channel.note)}</p></article>`;
    }).join("");
  };
  const renderPriorities = () => {
    $crm("#crm-priority-list").innerHTML = selectedChannels().map(channel => {
      const reading = CrmDecision.analyze(channel, { compareEnabled: crmState.compareEnabled, days: crmDateSpan(crmState.start, crmState.end), previousDays: crmDateSpan(crmState.compareStart, crmState.compareEnd) });
      const drivers = reading.drivers.map(driver => `<div><span>${esc(driver.label)}</span><strong>${formatValue(driver.actual, driver.format)}</strong><small>Anterior: ${formatValue(driver.previous, driver.format)}</small>${PerformanceDelta.markup(PerformanceDelta.describe(driver.actual, driver.previous, { rate: driver.format === 'percent' }))}<small class="crm-driver-effect">Contribuicao: ${money(driver.effect)}</small></div>`).join('');
      const quality = channel.rd ? 'RD: cobertura operacional nao homologada; os contadores nao comprovam atribuicao de vendas.'
        : channel.sendflow ? (channel.sendflow.activity.available ? 'SendFlow: recibos e vinculo com vendas ainda precisam de validacao.' : 'SendFlow sem registros carregados neste recorte; isso nao significa ausencia de vendas no SSOT.')
        : 'Ativacao e resultado SSOT pertencem a bases distintas; nao ha atribuicao comprovada por disparo.';
      return `<article class="crm-decision" data-decision-status="${reading.status}"><header><h3>${esc(channel.name)}</h3><span class="status-pill ${reading.status === 'ready' ? 'ok' : 'warn'}">${reading.status === 'ready' ? 'SSOT: periodos completos' : reading.status === 'off' ? 'Comparacao desligada' : 'Leitura limitada'}</span></header><h4>${esc(reading.title)}</h4>${reading.status === 'ready' ? `<p class="crm-decision-change">Variacao da receita: <strong class="${reading.tone}">${money(reading.delta)}</strong></p><p class="crm-decision-method">Decomposicao matematica da variacao, nao atribuicao de vendas.</p><div class="crm-decision-drivers">${drivers}</div>` : ''}<p class="crm-decision-action"><strong>Proxima verificacao</strong> ${esc(reading.action)}</p><details class="crm-decision-evidence"><summary>Evidencia e limites</summary><p>${esc(quality)}</p><p>Receita = sessoes x conversao x ticket. As contribuicoes distribuem a variacao entre os tres fatores pela media das seis ordens de substituicao. Explicam a conta, nao a causa. Mesma duracao nao elimina sazonalidade nem comprova significancia estatistica.</p></details></article>`;
    }).join("");
  };
  const funnelRows = (segment) => {
    const actual = new Map(segment.actual.map((stage) => [stage.label, stage]));
    return segment.planned.map((stage) => {
      const observed = actual.get(stage.label); const actualValue = observed ? formatValue(observed.value, "int") : "Indisponivel"; const target = formatValue(stage.value, "int"); const rate = observed?.rate !== undefined ? percent(observed.rate) : null;
      return `<tr><td>${esc(stage.label)}</td><td>${target}</td><td>${actualValue}</td><td>${rate ?? "Indisponivel"}</td></tr>`;
    }).join("");
  };
  const renderFunnel = () => {
    $crm("#crm-funnel").innerHTML = selectedChannels().flatMap((channel) => channel.segments.map((segment) => {
      const hasPlan = Number.isFinite(segment.plannedShots);
      const planStatus = hasPlan && segment.actualShots >= segment.plannedShots ? "ok" : "warn";
      const planLabel = hasPlan ? `${int(segment.actualShots)} de ${int(segment.plannedShots)} disparos` : `${int(segment.actualShots)} disparos - meta nao informada`;
      return `<article class="crm-funnel-card"><div class="crm-channel-head"><div><p class="eyebrow">${esc(channel.name)}</p><h3>${esc(segment.name)}</h3></div><span class="status-pill ${planStatus}">${planLabel}</span></div><div class="table-scroll"><table class="data-table crm-funnel-table"><thead><tr><th>Etapa</th><th>Planejado</th><th>Realizado</th><th>Taxa observada</th></tr></thead><tbody>${funnelRows(segment)}</tbody></table></div><p class="crm-diagnosis">${esc(segment.diagnosis)}</p></article>`;
    })).join("");
    $crm("#crm-funnel").closest("section").hidden = !$crm("#crm-funnel").innerHTML;
  };
  const renderPacing = () => {
    const rows = selectedChannels().flatMap((channel) => (channel.daily || []).map((day) => `<tr><td><strong>${esc(channel.name)}</strong></td><td>${sourceDateLabel(day.date)}</td><td>${int(day.sessions)}</td><td>${int(day.orders)}</td><td>${money(day.revenue)}</td><td>${percent(day.rate)}</td></tr>`)).join("");
    $crm("#crm-pacing").innerHTML = rows ? `<table class="data-table crm-pacing-table"><thead><tr><th>Canal</th><th>Dia</th><th>Sessoes</th><th>Pedidos</th><th>Receita</th><th>Conversao</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="crm-detail-overview"><strong>Ritmo indisponivel</strong><span>O recorte selecionado nao possui lancamentos diarios na fonte CRM.</span></div>`;
  };
  const cumulative = (values) => { let total = 0; return values.map((value) => total += value); };
  const dailyFormat = (key, value) => key === "Receita" || key === "Investimento" ? money(value) : int(value);
  const renderConversionFunnel = (channel) => {
    const metrics = metricMap(channel); const sessions = metrics.get("sessions")?.actual ?? null; const orders = metrics.get("orders")?.actual ?? null; const rate = metrics.get("rate")?.actual ?? null;
    const rateLabel = channel.ssotCommercial ? "Conversao SSOT do canal" : "Conversao CRM";
    const rateNote = "Pedidos SSOT / sessoes SSOT no mesmo canal e periodo; independente do registro de disparos.";
    if (sessions === null && orders === null) return '<p class="crm-detail-hint">Sem cobertura comercial SSOT neste recorte. Consulte a data disponivel acima ou abra as metas do artefato abaixo.</p>';
    if (rate === null && channel.ssotCommercial) return `<div class="crm-funnel-visual"><div class="crm-funnel-label"><span>Sessoes conhecidas SSOT</span><strong>${int(sessions)}</strong></div><div class="crm-funnel-label"><span>Pedidos SSOT</span><strong>${int(orders)}</strong></div><p class="crm-funnel-note">A extracao possui sessoes em ${channel.ssotCommercial.sessionsKnownDays}/${channel.ssotCommercial.expectedDays} dias. Validar a cobertura da fonte SSOT antes de calcular a taxa; a ausencia de disparos nao impede esse cruzamento.</p></div>`;
    const ratio = rate !== null ? Math.max(Math.sqrt(rate), 0.05) : 0.05; const bottom = Math.max(88 * ratio, 6); const left = (100 - bottom) / 2;
    return `<div class="crm-funnel-visual"><div class="crm-funnel-label"><span>Sessoes</span><strong>${int(sessions)}</strong></div><div class="crm-funnel-shape"><svg viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label="Funil de sessoes para pedidos"><polygon points="6,0 94,0 ${100 - left},48 ${left},48" fill="var(--orange)" stroke="var(--orange)" stroke-width=".5"/></svg><div class="crm-funnel-rate"><strong>${percent(rate)}</strong><span>${esc(rateLabel)}</span></div></div><div class="crm-funnel-label"><span>Pedidos</span><strong>${int(orders)}</strong></div><small class="crm-funnel-note">${esc(rateNote)}</small></div>`;
  };
  const renderMetaChart = (channel) => {
    const values = channel.pacing.daily?.Receita || []; if (!values.length) return ""; const totals = cumulative(values); const max = Math.max(...totals, ...values, 1); const bars = values.map((value, index) => { const x = 18 + index * 88; const h = (value / max) * 118; return `<rect x="${x}" y="${140 - h}" width="46" height="${h}" rx="2" fill="#e2793f" fill-opacity=".62"><title>${days[index]}: ${money(value)}</title></rect>`; }).join(""); const points = totals.map((value, index) => `${18 + index * 88 + 23},${140 - (value / max) * 118}`).join(" "); return `<div class="crm-chart-box"><svg viewBox="0 0 650 180" role="img" aria-label="Grafico de meta diaria e acumulada"><line x1="12" y1="140" x2="638" y2="140" stroke="var(--line)"/><line x1="12" y1="20" x2="638" y2="20" stroke="var(--line)"/><g>${bars}</g><polyline points="${points}" fill="none" stroke="#f4934f" stroke-width="2.5"/><g>${totals.map((value, index) => `<circle cx="${18 + index * 88 + 23}" cy="${140 - (value / max) * 118}" r="3" fill="#f4934f"><title>${days[index]} acumulado: ${money(value)}</title></circle>`).join("")}</g>${days.map((label, index) => `<text x="${18 + index * 88 + 23}" y="162" text-anchor="middle">${label.split(" ")[0]}</text>`).join("")}</svg><div class="crm-chart-legend"><span><i class="crm-legend-bar"></i>Meta do dia: receita</span><span><i class="crm-legend-line"></i>Meta acumulada</span></div></div>`;
  };
  const renderPacingDetail = (channel) => {
    const rows = (channel.daily || []).map((day) => `<tr><td>${sourceDateLabel(day.date)}</td><td>${int(day.sessions)}</td><td>${int(day.orders)}</td><td>${money(day.revenue)}</td><td>${percent(day.rate)}</td></tr>`).join("");
    return `<div class="crm-detail-card"><h3>Ritmo diario</h3><p class="crm-detail-hint">Realizado no recorte selecionado. A conversao e calculada somente quando sessoes e pedidos existem no mesmo dia.</p><div class="table-scroll"><table class="data-table crm-daily-table"><thead><tr><th>Dia</th><th>Sessoes</th><th>Pedidos</th><th>Receita</th><th>Conversao</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="table-empty">Sem lancamentos diarios no recorte.</td></tr>`}</tbody></table></div></div>`;
  };
  const trackingKey = (channel) => `reise-crm-tracking-${channel.id}`;
  const readTracking = (channel) => { try { return JSON.parse(localStorage.getItem(trackingKey(channel)) || "{}"); } catch (error) { return {}; } };
  const trackingOutput = (channel, row) => {
    const values = row || {};
    if (channel.id === "email") {
      const rates = CrmEmail.activation({ selected: sourceNumber(values.Leads), delivered: sourceNumber(values.Entregues), opened: sourceNumber(values.Abertura), clicked: sourceNumber(values.Cliques) });
      return [rates.deliveryRate, rates.openRate, rates.clickToOpenRate];
    }
    if (channel.id === "whatsapp-organico") { const views = (values["Vis. Club"] || 0) + (values["Vis. Membership"] || 0); return [views || null, views && values.Sessoes ? values.Sessoes / views : null]; }
    return [values.Publico && values.Entregues ? values.Entregues / values.Publico : null, values.Entregues && values.Leitura ? values.Leitura / values.Entregues : null, values.Leitura && values.Cliques ? values.Cliques / values.Leitura : null];
  };
  const renderTracking = (channel) => { const activation = channel.activation; const values = readTracking(channel); const rows = activation.tracking.slots.map((slot, index) => { const row = values[index] || {}; const inputs = activation.tracking.inputs.map((field) => `<td><input type="number" min="0" data-track-row="${index}" data-track-field="${esc(field)}" value="${row[field] ?? ""}" aria-label="${esc(`${slot} ${field}`)}"></td>`).join(""); const outputs = trackingOutput(channel, row).map((value) => `<td class="crm-track-output">${value === null ? "Sem dado" : percent(value)}</td>`).join(""); return `<tr><td>${esc(slot)}</td>${inputs}${outputs}</tr>`; }).join(""); const hasEntries = activation.tracking.slots.some((slot, index) => activation.tracking.inputs.some((field) => values[index]?.[field] !== "" && values[index]?.[field] !== null && values[index]?.[field] !== undefined)); const total = hasEntries ? activation.tracking.slots.reduce((sum, slot, index) => { const row = values[index] || {}; const result = row[activation.tracking.result] || 0; return sum + Number(result); }, 0) : null; const totalLabel = total === null ? "Sem lancamentos" : int(total); return `<div class="crm-tracking-head"><div><h3>Acompanhamento</h3><p class="crm-detail-hint">${esc(activation.tracking.hint)} Os valores ficam salvos neste navegador.</p></div><div class="crm-tracking-actions"><button type="button" class="outline-button" data-track-action="export">Exportar</button><label class="outline-button" for="crm-track-import">Importar</label><input id="crm-track-import" type="file" accept="application/json" class="is-hidden"><button type="button" class="outline-button" data-track-action="reset">Limpar</button></div></div><div class="crm-tracking-summary"><strong>${totalLabel}</strong><span>${esc(activation.tracking.result)} registrados · meta ${int(activation.metaResult)} · preenchimento manual</span></div><div class="table-scroll"><table class="data-table crm-tracking-table"><thead><tr><th>Disparo</th>${activation.tracking.inputs.map((field) => `<th>${esc(field)}</th>`).join("")}${activation.tracking.outputs.map((field) => `<th>${esc(field)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`; };
  const sendflowDelta = (value, previous, comparable, invert = false) => {
    if (!crmState.compareEnabled) return "";
    return PerformanceDelta.markup(PerformanceDelta.describe(value, previous, { complete: comparable, lowerIsBetter: invert }));
  };
  const renderSendflowDetail = (channel) => {
    const { source, activity: current, comparison, commercial } = channel.sendflow;
    const comparable = crmState.compareEnabled && current.complete && comparison.complete;
    const observed = (value) => value === null ? "Nao informado" : int(value);
    const removalComplete = (value) => value.knownDays === value.expectedDays;
    const tiles = [["Acoes de envio", current.actions, comparison.actions, comparable], ["Mensagens", current.messages, comparison.messages, comparable],
      ["Leituras acumuladas", current.read, comparison.read, comparable],
      ["Saidas registradas", current.movement.remove.subtotal, comparison.movement.remove.subtotal, comparable && removalComplete(current.movement.remove) && removalComplete(comparison.movement.remove), true]];
    const max = Math.max(1, ...current.daily.map((day) => day.actions), ...(comparable ? comparison.daily.map((day) => day.actions) : []));
    const bars = current.daily.map((day) => {
      const offset = Math.round((Date.parse(day.date) - Date.parse(current.start)) / 86400000);
      const previousDate = new Date(Date.parse(comparison.start) + offset * 86400000).toISOString().slice(0, 10);
      const previous = comparable ? comparison.daily.find((item) => item.date === previousDate) : null;
      return `<div class="crm-sendflow-day"><div class="crm-sendflow-bars"><i style="height:${100 * day.actions / max}%" title="${sourceDateLabel(day.date)}: ${day.actions} acoes"></i>${previous ? `<i class="comparison" style="height:${100 * previous.actions / max}%" title="${sourceDateLabel(previous.date)}: ${previous.actions} acoes"></i>` : ""}</div><span>${day.date.slice(8)}</span></div>`;
    }).join("");
    const sorted = current.actionRows.slice().sort((a, b) => {
      const field = crmState.sendflowSort;
      const compared = typeof a[field] === "number" && typeof b[field] === "number" ? a[field] - b[field] : String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
      return compared * crmState.sendflowDirection;
    });
    const pages = Math.max(1, Math.ceil(sorted.length / 12));
    crmState.sendflowPage = Math.min(crmState.sendflowPage, pages - 1);
    const pageRows = sorted.slice(crmState.sendflowPage * 12, (crmState.sendflowPage + 1) * 12);
    const headings = [["sentAt", "Envio"], ["messageCount", "Mensagens"], ["recipients", "Destinatarios somados"], ["delivered", "Entregas"], ["read", "Leituras"], ["played", "Reproducoes"]];
    const actionRows = pageRows.map((row) => `<tr><td><time datetime="${esc(row.sentAt)}">${sourceDateLabel(row.date)}</time><small class="muted-note">${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(row.sentAt))}</small></td><td>${observed(row.messageCount)}</td><td>${observed(row.recipients)}</td><td>${observed(row.delivered)}</td><td>${observed(row.read)}</td><td>${observed(row.played)}</td><td><span class="status-pill ${row.read > row.delivered ? "warn" : "ok"}">${row.read > row.delivered ? "Recibos divergentes" : "Sem divergencia observada"}</span></td></tr>`).join("");
    const movementRows = [["Entradas", "add"], ["Saidas", "remove"], ["Cliques registrados", "clicks"]].map(([label, key]) => {
      const a = current.movement[key], b = comparison.movement[key];
      return `<tr><td>${label}</td><td>${observed(a.subtotal)}${a.subtotal !== null && !removalComplete(a) ? " (subtotal conhecido)" : ""}</td><td>${a.knownDays}/${a.expectedDays} dias</td>${crmState.compareEnabled ? `<td>${observed(b.subtotal)}</td><td>${sendflowDelta(a.subtotal, b.subtotal, comparable && removalComplete(a) && removalComplete(b), key === "remove")}</td>` : ""}</tr>`;
    }).join("");
    return `<div class="crm-sendflow-report">
      <div class="crm-sendflow-source"><div><p class="eyebrow">SendFlow | WhatsApp Organico</p><h3>${esc(source.releaseName)}</h3><p>Envios de ${sourceDateLabel(source.coverage.start)} a ${sourceDateLabel(source.coverage.end)}. Recibos acumulados consultados em ${esc(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(source.extractedAt)))}.</p></div><span class="status-pill warn">${source.mode === "live_sheet" ? "Leitura da planilha" : source.mode === "cached_sheet" ? "Ultima leitura em cache" : "Snapshot validado"}</span></div>
      <div class="crm-sendflow-kpis">${tiles.map(([label, value, previous, valid, invert]) => `<article class="kpi"><span>${label}</span><strong>${observed(value)}</strong>${sendflowDelta(value, previous, valid, invert)}</article>`).join("")}</div>
      <p class="crm-sendflow-warning">${current.available ? `${current.inconsistentReceipts} de ${current.messages} mensagens com leituras maiores que entregas. Contadores preservados; nao representam um funil validado nem pessoas unicas.` : "O recorte selecionado nao esta coberto por esta extracao. Nenhum resultado foi estimado."} ${!current.complete && current.available ? "Cobertura SendFlow parcial no periodo selecionado." : ""}</p>
      <div class="crm-sendflow-chart"><h3>Ritmo de envio</h3><p class="muted-note">Acoes pela data do primeiro envio, nao horarios de leitura. ${!crmState.compareEnabled ? "" : comparable ? "Laranja: periodo atual. Cinza: comparacao." : "Comparacao fora da cobertura desta extracao."}</p>${bars ? `<div class="crm-sendflow-timeline" role="img" aria-label="Acoes por dia de envio" style="grid-template-columns:repeat(${current.daily.length},minmax(6px,1fr))">${bars}</div>` : ""}</div>
      <h3>Movimentacao da campanha</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>Indicador</th><th>Atual</th><th>Cobertura atual</th>${crmState.compareEnabled ? "<th>Comparacao</th><th>Variacao</th>" : ""}</tr></thead><tbody>${movementRows}</tbody></table></div>
      <p class="muted-note">Datas sem valor nao foram convertidas em zero. Cliques nao representam sessoes. Subtotais incompletos nao recebem sinal de desempenho.</p>
      <div class="crm-sendflow-table-head"><h3>Acoes e recibos</h3><span>${current.actionRows.length} acoes | ${current.messages ?? 0} mensagens</span></div><div class="table-scroll"><table class="data-table crm-sendflow-actions"><thead><tr>${headings.map(([field, label]) => `<th aria-sort="${crmState.sendflowSort === field ? crmState.sendflowDirection > 0 ? "ascending" : "descending" : "none"}"><button type="button" data-sendflow-sort="${field}" title="Ordenar por ${label}">${label} ${crmState.sendflowSort === field ? crmState.sendflowDirection > 0 ? "&#8593;" : "&#8595;" : "&#8597;"}</button></th>`).join("")}<th>Qualidade dos recibos</th></tr></thead><tbody>${actionRows || '<tr><td colspan="7">Nenhuma acao na cobertura selecionada.</td></tr>'}</tbody></table></div>
      <div class="crm-sendflow-pagination"><span>Pagina ${crmState.sendflowPage + 1} de ${pages}</span><button type="button" data-sendflow-page="-1" title="Pagina anterior" aria-label="Pagina anterior" ${crmState.sendflowPage === 0 ? "disabled" : ""}>&larr;</button><button type="button" data-sendflow-page="1" title="Proxima pagina" aria-label="Proxima pagina" ${crmState.sendflowPage + 1 === pages ? "disabled" : ""}>&rarr;</button></div>
      <p class="crm-sendflow-commercial-note">SSOT do canal: pedidos em ${commercial.ordersKnownDays}/${commercial.expectedDays} dias; sessoes em ${commercial.sessionsKnownDays}/${commercial.expectedDays} dias. ${commercial.mode === "snapshot" ? "Snapshot SSOT consolidado" : "Fonte SSOT"}: ${esc(commercial.source)}, extraido em ${esc(commercial.generatedAt || "data nao informada")}. Os resultados comerciais acima nao sao atribuicao a esta campanha. Recibos de periodos diferentes podem ter tempos de maturacao distintos. ${esc(source.mode === "live_sheet" ? "" : "A extracao nao se atualiza sozinha; ponte diaria ainda nao ativada.")}</p>
    </div>`;
  };
  const bindSendflowDetail = () => {
    $crm("#crm-detail").querySelectorAll("[data-sendflow-sort]").forEach((button) => button.addEventListener("click", () => {
      const field = button.dataset.sendflowSort;
      crmState.sendflowDirection = crmState.sendflowSort === field ? -crmState.sendflowDirection : -1;
      crmState.sendflowSort = field; crmState.sendflowPage = 0; renderDetail();
    }));
    $crm("#crm-detail").querySelectorAll("[data-sendflow-page]").forEach((button) => button.addEventListener("click", () => {
      crmState.sendflowPage = Math.max(0, crmState.sendflowPage + Number(button.dataset.sendflowPage)); renderDetail();
    }));
  };
  const rdSearchKey = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const renderRdTable = (channel) => {
    const terms = rdSearchKey(crmState.rdSearch).split(/\s+/).filter(Boolean);
    const value = (row, field) => field === "name" || field === "sentAt" ? row[field] : row.counts[field] ?? row.provisionalRates[field];
    const rows = channel.rd.current.records.filter((row) => terms.every((term) => rdSearchKey(`${row.name} ${row.campaignId}`).includes(term)))
      .filter((row) => crmState.rdIssueFilter === "all" || (crmState.rdIssueFilter === "review" ? row.countIssues.length > 0 : row.countIssues.length === 0))
      .slice().sort((a, b) => {
        const left = value(a, crmState.rdSort), right = value(b, crmState.rdSort);
        if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
        if (right === null || right === undefined) return -1;
        return crmState.rdDirection * (typeof left === "number" ? left - right : String(left).localeCompare(String(right), "pt-BR"));
      });
    const pages = Math.max(1, Math.ceil(rows.length / 10));
    crmState.rdPage = Math.min(crmState.rdPage, pages - 1);
    const columns = [["name", "Campanha"], ["sentAt", "Envio"], ["selected", "Selecionados"], ["delivered", "Entregues"], ["opened", "Aberturas"], ["clicked", "Cliques"], ["deliveryRate", "Entrega"], ["openRate", "Abertura"], ["clickToOpenRate", "CTOR"]];
    const rateCell = (row, field) => row.countIssues.length ? '<span class="rd-review">Em revisao</span>' : row.provisionalRates[field] === null ? "Sem denominador valido" : percent(row.provisionalRates[field]);
    return `<div class="table-scroll"><table class="data-table crm-rd-table"><thead><tr>${columns.map(([field, label]) => `<th aria-sort="${crmState.rdSort === field ? crmState.rdDirection > 0 ? "ascending" : "descending" : "none"}"><button type="button" data-rd-sort="${field}" title="Ordenar por ${label}">${label} ${crmState.rdSort === field ? crmState.rdDirection > 0 ? "&#8593;" : "&#8595;" : "&#8597;"}</button></th>`).join("")}<th>Contadores</th></tr></thead><tbody>${rows.slice(crmState.rdPage * 10, crmState.rdPage * 10 + 10).map((row) => `<tr data-rd-id="${esc(row.campaignId)}"><td><strong>${esc(row.name || "Campanha sem nome na origem")}</strong><small class="muted-note">${esc(row.campaignId)}</small></td><td>${sourceDateLabel(row.date)}<small class="muted-note">${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(row.sentAt))}</small></td><td>${int(row.counts.selected)}</td><td>${int(row.counts.delivered)}</td><td>${int(row.counts.opened)}</td><td>${int(row.counts.clicked)}</td><td>${rateCell(row, "deliveryRate")}</td><td>${rateCell(row, "openRate")}</td><td>${rateCell(row, "clickToOpenRate")}</td><td><span class="status-pill ${row.countIssues.length ? "warn" : "ok"}">${row.countIssues.length ? "Revisar" : "Consistentes"}</span></td></tr>`).join("") || '<tr><td colspan="10">Nenhum registro recebido para este filtro.</td></tr>'}</tbody></table></div><div class="crm-sendflow-pagination"><span>${rows.length} registros | Pagina ${crmState.rdPage + 1} de ${pages}</span><button type="button" data-rd-page="-1" title="Pagina anterior" aria-label="Pagina anterior" ${crmState.rdPage === 0 ? "disabled" : ""}>&larr;</button><button type="button" data-rd-page="1" title="Proxima pagina" aria-label="Proxima pagina" ${crmState.rdPage + 1 === pages ? "disabled" : ""}>&rarr;</button></div>`;
  };
  const renderRdDetail = (channel) => {
    const { snapshot, current, comparison } = channel.rd;
    const clock = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(snapshot.observedAt));
    const comparisonText = comparison.records.length && comparison.withinQueryWindow
      ? `Comparativo observado: ${comparison.records.length} campanhas; ${comparison.countIssues} com ressalvas. Cobertura nao homologada; sem sinal de desempenho.`
      : "Sem extracao RD validada para o comparativo selecionado. Isso nao significa ausencia de envios.";
    const readLabel = snapshot.readMode === "live_sheet" ? "Base auxiliar conectada" : snapshot.readMode === "cached_sheet" ? "Ultima leitura valida" : "Snapshot local";
    return `<div class="crm-rd-report"><div class="crm-sendflow-source"><div><p class="eyebrow">E-mail | RD Station</p><h3>Campanhas e engajamento</h3><p>${readLabel}. Coleta de ${clock}. Envios de ${sourceDateLabel(snapshot.period.start)} a ${sourceDateLabel(snapshot.period.end)}; contadores observados por campanha.</p>${snapshot.readWarning ? `<p class="crm-rd-read-warning">${esc(snapshot.readWarning)}</p>` : ""}</div><span class="status-pill warn">Piloto | taxas provisorias</span></div>
      <div class="crm-sendflow-kpis"><article class="kpi"><span>Campanhas observadas</span><strong>${current.records.length}</strong><small>No recorte selecionado</small></article><article class="kpi"><span>Contadores consistentes</span><strong>${current.records.length - current.countIssues}</strong><small>Nao representa homologacao</small></article><article class="kpi"><span>Revisar contadores</span><strong>${current.countIssues}</strong><small>Zeros com atividade registrada</small></article><article class="kpi"><span>Cliques informados</span><strong>${current.receivedTotals.clicked === null ? "Sem coleta" : int(current.receivedTotals.clicked)}</strong><small>Subtotal recebido, nao audiencia unica</small></article></div>
      <p class="crm-sendflow-warning">${current.records.length ? `${current.countIssues} campanhas com ressalvas no recorte. Zeros recebidos preservados; taxas afetadas fora da leitura de desempenho.` : "O recorte nao possui registros nesta extracao; o resultado comercial continua separado no SSOT."} Cobertura total e equivalencia das contagens unicas no MCP ainda nao homologadas.</p>
      ${crmState.compareEnabled ? `<div class="crm-rd-comparison"><strong>${crmComparisonLabel()}</strong><p>${comparisonText}</p></div>` : ""}
      <div class="crm-rd-tools"><label><span>Campanha</span><input type="search" id="crm-rd-search" placeholder="Buscar por nome" value="${esc(crmState.rdSearch)}"></label><label><span>Contadores</span><select id="crm-rd-quality"><option value="all" ${crmState.rdIssueFilter === "all" ? "selected" : ""}>Todos</option><option value="consistent" ${crmState.rdIssueFilter === "consistent" ? "selected" : ""}>Consistentes</option><option value="review" ${crmState.rdIssueFilter === "review" ? "selected" : ""}>Revisar</option></select></label><button type="button" class="outline-button" data-rd-pilot>Ver periodo da coleta</button></div>
      <p class="crm-rd-rate-note">Taxas provisorias: entrega / selecionados; abertura / entregues; CTOR = cliques / aberturas. Nao sao a conversao comercial nem eventos de engajamento ocorridos no dia do envio.</p>
      <div id="crm-rd-table-root">${renderRdTable(channel)}</div>
      <p class="crm-sendflow-commercial-note">${snapshot.outsidePeriod.length} registro fora da janela do piloto, excluido dos totais. Atualizacao da origem nao informada; o horario acima e o da coleta. Automacoes separadas: conta ainda nao conciliada. Sessoes, pedidos, receita e conversao comercial permanecem no SSOT do canal, sem distribuicao por campanha.</p></div>`;
  };
  const bindRdDetail = (channel) => {
    const bindTable = () => {
      $crm("#crm-rd-table-root").querySelectorAll("[data-rd-sort]").forEach((button) => button.addEventListener("click", () => {
        crmState.rdDirection = crmState.rdSort === button.dataset.rdSort ? -crmState.rdDirection : -1;
        crmState.rdSort = button.dataset.rdSort; crmState.rdPage = 0; updateTable();
      }));
      $crm("#crm-rd-table-root").querySelectorAll("[data-rd-page]").forEach((button) => button.addEventListener("click", () => {
        crmState.rdPage = Math.max(0, crmState.rdPage + Number(button.dataset.rdPage)); updateTable();
      }));
    };
    const updateTable = () => { $crm("#crm-rd-table-root").innerHTML = renderRdTable(channel); bindTable(); };
    $crm("#crm-rd-search").addEventListener("input", (event) => { crmState.rdSearch = event.target.value; crmState.rdPage = 0; updateTable(); });
    $crm("#crm-rd-quality").addEventListener("change", (event) => { crmState.rdIssueFilter = event.target.value; crmState.rdPage = 0; updateTable(); });
    $crm("[data-rd-pilot]").addEventListener("click", () => {
      crmState.start = channel.rd.snapshot.period.start; crmState.end = channel.rd.snapshot.period.end; crmState.periodPreset = "custom"; crmState.rdPage = 0;
      crmApplyComparison(); syncCrmPeriodControls(); rebuildCrmData();
    });
    bindTable();
  };
  const renderDetailTabs = () => { const tabs = [{ id: "all", name: "Visao geral" }, ...(crmState.data?.channels || [])]; $crm("#crm-channel-tabs").innerHTML = tabs.map((tab) => `<button type="button" role="tab" aria-selected="${crmState.channel === tab.id}" class="crm-channel-tab ${crmState.channel === tab.id ? "active" : ""}" data-crm-tab="${esc(tab.id)}">${CrmIcons(tab.id === 'all' ? 'LayoutDashboard' : tab.id === 'email' ? 'Mail' : 'MessageCircle')}<span>${esc(tab.name)}</span></button>`).join(""); $crm("#crm-channel-tabs").querySelectorAll("[data-crm-tab]").forEach((button) => button.addEventListener("click", () => { crmState.channel = button.dataset.crmTab; $crm("#crm-channel-filter").value = crmState.channel; crmApplyPeriodPreset(crmState.periodPreset); syncCrmPeriodControls(); artifactOptions.pacingPage = artifactOptions.trackingPage = 0; rebuildCrmData(); })); };
  const bindTracking = (channel) => { const root = $crm("#crm-detail"); root.querySelectorAll("[data-track-field]").forEach((input) => input.addEventListener("input", (event) => { const values = readTracking(channel); const row = Number(event.target.dataset.trackRow); values[row] = values[row] || {}; values[row][event.target.dataset.trackField] = event.target.value === "" ? "" : Number(event.target.value); localStorage.setItem(trackingKey(channel), JSON.stringify(values)); renderDetail(); })); root.querySelector('[data-track-action="reset"]')?.addEventListener("click", () => { localStorage.removeItem(trackingKey(channel)); renderDetail(); }); root.querySelector('[data-track-action="export"]')?.addEventListener("click", () => { const blob = new Blob([JSON.stringify(readTracking(channel), null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `crm-${channel.id}-acompanhamento.json`; link.click(); URL.revokeObjectURL(link.href); }); root.querySelector("#crm-track-import")?.addEventListener("change", (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(reader.result); const imported = parsed?.data || parsed; if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error("Formato invalido"); localStorage.setItem(trackingKey(channel), JSON.stringify(imported)); renderDetail(); } catch (error) { window.alert("Arquivo de acompanhamento invalido."); } }; reader.readAsText(file); }); };
  const artifactOptions = { activationMode: 'actual', mode: 'actual', pacingPage: 0, trackingPage: 0 };
  const detailOpen = new Map();
  const renderDetail = () => {
    renderDetailTabs();
    const channel = selectedChannels()[0];
    if (crmState.channel === "all" || !channel) {
      $crm("#crm-detail").innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr><th>Canal</th><th>Receita SSOT</th><th>Pedidos</th><th>Sessoes</th><th>Conversao</th></tr></thead><tbody>${selectedChannels().map((item) => `<tr><th>${esc(item.name)}</th>${['revenue', 'orders', 'sessions', 'rate'].map((key) => { const metric = metricMap(item).get(key); return `<td>${formatValue(metric?.actual, metric?.format)}${periodMarkup(metric)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
      return;
    }
    const metrics = metricMap(channel);
    const reference = crmState.referenceData.channels.find((item) => item.id === channel.id);
    const options = { ...artifactOptions, compareEnabled: crmState.compareEnabled, start: crmState.start, end: crmState.end, compareStart: crmState.compareStart, compareEnd: crmState.compareEnd, referencePeriod: crmState.referenceData.period, sheetRecords: crmState.campaigns.flatMap((row) => row.trackingRecords || []), sheetStatus: whatsappSource.status };
    const orderMetric = metrics.get("orders"), revenueMetric = metrics.get("revenue");
    const ticket = orderMetric?.actual > 0 && revenueMetric?.actual !== null && orderMetric.currentComplete !== false && revenueMetric.currentComplete !== false ? revenueMetric.actual / orderMetric.actual : null;
    const activationHtml = CrmFunnel.render(channel, reference, options);
    const provider = channel.rd ? renderRdDetail(channel) : channel.sendflow ? renderSendflowDetail(channel) : '';
    $crm("#crm-detail").innerHTML = `<details class="crm-analysis-details" data-detail-key="conversion"><summary>Conversao comercial e ticket</summary><section data-crm-view="conversion" class="crm-artifact-conversion"><div><h3>Funil de conversao</h3><p class="crm-detail-hint">Realizado SSOT · ${crmState.data.period.label}</p>${renderConversionFunnel(channel)}</div><div class="crm-side-stats">${['revenue', 'ticket', 'rate'].map((key) => { const metric = key === 'ticket' ? { actual: ticket, comparison: channel.ssotComparison?.orders > 0 && channel.ssotComparison.complete ? channel.ssotComparison.revenue / channel.ssotComparison.orders : null, format: 'money' } : metrics.get(key); const delta = formatPeriodDelta(metric); return `<div><span>${{ revenue: 'Receita SSOT', ticket: 'Ticket medio SSOT', rate: 'Conversao SSOT' }[key]}</span><strong>${formatValue(metric.actual, metric.format)}</strong>${crmState.compareEnabled ? `<small>Anterior: ${formatValue(metric.comparison, metric.format)}</small>${periodMarkup(metric)}` : ""}</div>`; }).join('')}</div></section></details><details class="crm-analysis-details" data-detail-key="pacing"><summary>Ritmo diario e metas</summary>${CrmArtifact.pacing(channel, reference, options)}</details>${activationHtml}<details class="crm-analysis-details" data-detail-key="tracking"><summary>Acompanhamento dos envios</summary>${CrmArtifact.tracking(channel, reference, options)}</details>${provider ? `<details class="crm-provider-details" data-detail-key="provider"><summary>Dados operacionais · ${channel.rd ? 'RD Station' : 'SendFlow'}</summary>${provider}</details>` : ''}`;
    $crm('#crm-detail').querySelectorAll('details[data-detail-key]').forEach(detail => {
      const key = `${channel.id}:${detail.dataset.detailKey}`;
      detail.open = detailOpen.get(key) || false;
      detail.addEventListener('toggle', () => { if (detail.isConnected) detailOpen.set(key, detail.open); });
    });
    window.ReiseCharts?.prepare($crm('#crm-detail'));
    CrmArtifact.bind($crm('#crm-detail'), channel, reference, options, (patch) => { Object.assign(artifactOptions, patch); renderDetail(); });
    $crm('#crm-detail').querySelectorAll('button[data-activation-mode]').forEach(button => button.addEventListener('click', () => {
      artifactOptions.activationMode = button.dataset.activationMode;
      renderDetail();
      $crm('#crm-detail').querySelector('button[data-activation-mode][aria-pressed="true"]').focus({ preventScroll: true });
    }));
    if (channel.rd) bindRdDetail(channel);
    if (channel.sendflow) bindSendflowDetail();
  };
  const renderSideConversion = () => { const channel = selectedChannels()[0]; const cell = $crm("#crm-detail .crm-side-stats div:last-child"); if (!channel || !cell) return; const rate = metricMap(channel).get("rate")?.actual ?? null; cell.querySelector("span").textContent = channel.ssotCommercial ? "Conversao SSOT" : "Conversao CRM"; cell.querySelector("strong").textContent = percent(rate); };
  const renderAll = () => {
    renderSummary(); renderSourceReconciliation(); renderPriorities(); renderDetail(); renderSideConversion(); refreshCrmFilterSummary();
    renderSourceBanner();
  };
  const renderSourceBanner = () => {
    const channel = selectedChannels()[0];
    if (channel?.rd) {
      $crm("#crm-validation-banner").className = "callout validation-banner warn";
      $crm("#crm-validation-banner strong").textContent = "RD Station: piloto observado";
      $crm("#crm-validation-banner span:not(.callout-mark)").textContent = ` ${crmState.rd.records.length} campanhas na extracao; ${crmState.rd.countIssueRows} com ressalvas nos contadores. Cobertura nao homologada; resultado comercial separado no SSOT.`;
      $crm("#crm-source-label").textContent = channel.sourceLabel;
    } else if (channel?.sendflow) {
      $crm("#crm-validation-banner").className = "callout validation-banner warn";
      $crm("#crm-validation-banner strong").textContent = "SendFlow: extracao validada";
      $crm("#crm-validation-banner span:not(.callout-mark)").textContent = ` ${crmState.sendflow.actions.length} acoes; ${crmState.sendflow.messages.length} mensagens. Cobertura: ${sourceDateLabel(crmState.sendflow.source.coverage.start)} a ${sourceDateLabel(crmState.sendflow.source.coverage.end)}. SSOT e ativacao permanecem separados.`;
      $crm("#crm-source-label").textContent = channel.sourceLabel;
    } else {
      $crm("#crm-validation-banner").className = "callout validation-banner valid";
      $crm("#crm-validation-banner strong").textContent = "Fontes CRM independentes";
      $crm("#crm-validation-banner span:not(.callout-mark)").textContent = ` WhatsApp Oficial: planilha original somente leitura. SendFlow: ${crmState.sendflow ? "snapshot disponivel" : crmState.sendflowError || "indisponivel"}. RD Station: ${crmState.rd ? "piloto disponivel" : crmState.rdError || "sem carga"}.`;
      $crm("#crm-source-label").textContent = channel?.sourceLabel || "Fontes por canal";
    }
  };
  const switchWorkspace = (workspace) => { const button = document.querySelector(`[data-workspace="${workspace}"]`); if (!button) return; document.querySelectorAll("[data-workspace]").forEach((item) => item.classList.toggle("active", item === button)); document.querySelectorAll(".workspace-panel").forEach((panel) => panel.classList.toggle("is-hidden", panel.id !== `${workspace}-workspace`)); window.scrollTo({ top: 0, behavior: "auto" }); };
  const bindWorkspaceTabs = () => { document.querySelectorAll("[data-workspace]").forEach((button) => button.addEventListener("click", () => { const workspace = button.dataset.workspace; history.replaceState(null, "", workspace === "crm" ? "#crm" : "#growth"); switchWorkspace(workspace); })); if (location.hash === "#crm") switchWorkspace("crm"); };
  const syncCrmPeriodControls = () => {
    $crm("#crm-period-preset").value = crmState.periodPreset;
    $crm("#crm-date-start").value = crmState.start;
    $crm("#crm-date-end").value = crmState.end;
    $crm("#crm-compare-mode").value = crmState.compareMode;
    $crm("#crm-compare-enabled").checked = crmState.compareEnabled;
    for (const id of ['crm-compare-mode','crm-compare-start','crm-compare-end']) $crm('#' + id).disabled = !crmState.compareEnabled;
    $crm("#crm-compare-custom-fields").classList.toggle("is-hidden", crmState.compareMode !== "custom");
    $crm("#crm-compare-start").value = crmState.compareStart;
    $crm("#crm-compare-end").value = crmState.compareEnd;
    $crm("#crm-comparison-window").textContent = crmComparisonLabel();
    if (crmState.start && crmState.end) $crm('#crm-period-note').textContent = `${sourceDateLabel(crmState.start)} a ${sourceDateLabel(crmState.end)}`;
  };
  const crmFilterKeys = ['channel', 'start', 'end', 'periodPreset', 'compareMode', 'compareEnabled', 'compareStart', 'compareEnd'];
  let crmFilterDraft = null;
  const snapshotCrmFilters = () => Object.fromEntries(crmFilterKeys.map((key) => [key, crmState[key]]));
  const refreshCrmFilterSummary = () => {
    if (!crmState.start || !crmState.end) return;
    const channel = crmState.channel === 'all' ? 'Todos os canais CRM' : crmState.data?.channels.find((item) => item.id === crmState.channel)?.name || 'Canal CRM';
    $crm('#crm-filter-summary-period').textContent = `${sourceDateLabel(crmState.start)} a ${sourceDateLabel(crmState.end)}`;
    $crm('#crm-filter-summary-channel').textContent = channel;
    $crm('#crm-filter-summary-comparison').textContent = crmComparisonLabel();
    $crm('#crm-filter-count').textContent = crmState.channel === 'all' ? '1' : '2';
    $crm('#crm-summary-window').textContent = `${channel} / ${sourceDateLabel(crmState.start)} a ${sourceDateLabel(crmState.end)}`;
  };
  const editCrmDraft = (callback) => {
    const applied = snapshotCrmFilters();
    try {
      Object.assign(crmState, crmFilterDraft);
      crmApplyPeriodPreset(crmState.periodPreset);
      callback();
      crmFilterDraft = snapshotCrmFilters();
      syncCrmPeriodControls();
      $crm('#crm-channel-filter').value = crmState.channel;
    } finally { Object.assign(crmState, applied); }
  };
  const bindCrmPeriodControls = () => {
    const dialog = $crm('#crm-filter-dialog');
    const form = $crm('#crm-filter-form');
    const clearValidity = () => form.querySelectorAll('input[type="date"]').forEach((input) => input.setCustomValidity(''));
    const close = () => { crmFilterDraft = null; dialog.close(); clearValidity(); syncCrmPeriodControls(); $crm('#crm-channel-filter').value = crmState.channel; };
    $crm('#crm-open-filters').disabled = false;
    $crm('#crm-open-filters').onclick = () => { crmFilterDraft = snapshotCrmFilters(); clearValidity(); editCrmDraft(() => {}); dialog.showModal(); };
    $crm('#crm-close-filters').onclick = close;
    $crm('#crm-cancel-filters').onclick = close;
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    form.addEventListener('change', (event) => {
      if (!crmFilterDraft || !event.target.matches('select,input')) return;
      clearValidity();
      const { id, value } = event.target;
      editCrmDraft(() => {
        if (id === 'crm-channel-filter') { crmState.channel = value; crmApplyPeriodPreset(crmState.periodPreset); }
        if (id === 'crm-period-preset') { crmState.periodPreset = value; crmApplyPeriodPreset(value); }
        if (id === 'crm-date-start' || id === 'crm-date-end') {
          crmState[id.endsWith('start') ? 'start' : 'end'] = value;
          crmState.periodPreset = 'custom'; crmApplyComparison();
        }
        if (id === 'crm-compare-enabled') crmState.compareEnabled = event.target.checked;
        if (id === 'crm-compare-mode') { crmState.compareMode = value; crmApplyComparison(); }
        if (id === 'crm-compare-start' || id === 'crm-compare-end') {
          crmState[id.endsWith('start') ? 'compareStart' : 'compareEnd'] = value; crmState.compareMode = 'custom';
        }
      });
    });
    $crm('#crm-clear-filters').onclick = () => {
      clearValidity();
      editCrmDraft(() => { crmState.channel = 'whatsapp-oficial'; crmState.periodPreset = 'current-day'; crmState.compareMode = 'previous'; crmState.compareEnabled = true; crmApplyPeriodPreset('current-day'); });
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!crmFilterDraft) return;
      for (const [start,end,id] of [[crmFilterDraft.start,crmFilterDraft.end,'crm-date-end'],[crmFilterDraft.compareStart,crmFilterDraft.compareEnd,'crm-compare-end']]) {
        if (id === 'crm-compare-end' && !crmFilterDraft.compareEnabled) continue;
        const input = $crm(`#${id}`);
        input.setCustomValidity(!start || !end || start > end ? 'Informe um periodo valido, com fim igual ou posterior ao inicio.' : '');
        if (!input.reportValidity()) return;
      }
      Object.assign(crmState, crmFilterDraft);
      crmState.sendflowPage = 0;
      crmState.rdPage = 0;
      artifactOptions.pacingPage = artifactOptions.trackingPage = 0;
      crmFilterDraft = null; dialog.close(); syncCrmPeriodControls(); rebuildCrmData();
    });
  };
  const readSendflow = async () => {
    const configResponse = await fetch("data/crm-sendflow-config.json");
    if (!configResponse.ok) throw new Error("Configuracao SendFlow indisponivel");
    const config = await configResponse.json();
    const cacheKey = new URL("data/crm-sendflow-last-valid.json", location.href).href;
    try {
      if (config.endpoint) {
        if (config.endpoint !== "/api/crm-sendflow") throw new Error("Ponte SendFlow deve ser do mesmo projeto");
        const live = await fetch(config.endpoint, { signal: AbortSignal.timeout(15000) });
        if (live.ok) {
          const snapshot = CrmSendFlow.validate(await live.json());
          if (typeof caches !== "undefined") {
            try { const cache = await caches.open("panorama-crm-sendflow-v1"); await cache.put(cacheKey, new Response(JSON.stringify(snapshot), { headers: { "content-type": "application/json" } })); } catch (error) { /* Browser caching is optional. */ }
          }
          return snapshot;
        }
      }
    } catch (error) { /* An optional server bridge must not block the validated snapshot. */ }
    if (config.endpoint && typeof caches !== "undefined") {
      try {
        const cache = await caches.open("panorama-crm-sendflow-v1");
        const previous = await cache.match(cacheKey);
        if (previous) { const snapshot = CrmSendFlow.validate(await previous.json()); snapshot.source.mode = "cached_sheet"; return snapshot; }
      } catch (error) { /* Reject invalid caches and retain the packaged snapshot. */ }
    }
    const response = await fetch("data/crm-sendflow-snapshot.json", { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Snapshot SendFlow: HTTP ${response.status}`);
    return CrmSendFlow.validate(await response.json());
  };
  const readRd = async () => {
    let endpoint = "", accountId = "", warning = "";
    const packagedRequest = fetch("data/crm-rd-snapshot.json", { cache: "no-store", signal: AbortSignal.timeout(8000) }).then(async (response) => {
      if (!response.ok) throw new Error(`Snapshot RD: HTTP ${response.status}`);
      return { snapshot: CrmRd.sanitizeSnapshot(await response.json()) };
    }).catch((error) => ({ error }));
    const cacheKey = new URL("data/crm-rd-last-valid.json", location.href).href;
    try {
      const configResponse = await fetch("data/crm-rd-config.json", { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!configResponse.ok) throw new Error("Configuracao RD indisponivel; usando snapshot local.");
      const config = await configResponse.json();
      if (config.endpoint && config.endpoint !== "/api/crm-rd") throw new Error("Ponte RD deve ser do mesmo projeto.");
      if (config.endpoint && (typeof config.accountId !== "string" || !config.accountId.trim())) throw new Error("Conta RD nao configurada.");
      accountId = config.accountId;
      endpoint = config.endpoint || "";
    } catch (error) { warning = error.message; }
    const packaged = await packagedRequest;
    let cached = null;
    if (endpoint && typeof caches !== "undefined") {
      try {
        const cache = await caches.open("panorama-crm-rd-v1");
        const previous = await cache.match(cacheKey);
        if (previous) {
          const snapshot = CrmRd.sanitizeSnapshot(await previous.json());
          if (snapshot.source.accountId === accountId) cached = snapshot;
        }
      } catch (error) { /* An invalid browser cache is never promoted to a source. */ }
    }
    const previous = packaged.snapshot?.source.accountId === accountId && (!cached || Date.parse(packaged.snapshot.source.observedAt) > Date.parse(cached.source.observedAt)) ? packaged.snapshot : cached;
    if (endpoint) {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error("Ponte RD indisponivel.");
        const snapshot = CrmRd.sanitizeSnapshot(await response.json());
        if (snapshot.source.accountId !== accountId) throw new Error("Conta RD diferente da configurada.");
        if (previous && Date.parse(snapshot.source.observedAt) < Date.parse(previous.source.observedAt)) throw new Error("Coleta RD recebida nao substitui a ultima leitura valida.");
        if (typeof caches !== "undefined") {
          try {
            const cache = await caches.open("panorama-crm-rd-v1");
            await cache.put(cacheKey, new Response(JSON.stringify(snapshot), { headers: { "content-type": "application/json" } }));
          } catch (error) { /* Storage may be unavailable in private browsing. */ }
        }
        return { ...CrmRd.normalizeSnapshot(snapshot), readMode: "live_sheet", readWarning: "" };
      } catch (error) { warning = `${error.message} Exibindo a coleta anterior, sem atualizacao confirmada.`; }
      if (previous) return { ...CrmRd.normalizeSnapshot(previous), readMode: previous === cached ? "cached_sheet" : "snapshot", readWarning: warning };
    }
    if (!packaged.snapshot) throw packaged.error;
    if (accountId && packaged.snapshot.source.accountId !== accountId) throw new Error("Conta do snapshot RD diferente da configurada.");
    return { ...CrmRd.normalizeSnapshot(packaged.snapshot), readMode: "snapshot", readWarning: warning };
  };
  let refreshing = false;
  const readWhatsApp = async () => {
    try {
      const response = await fetch('data/crm-whatsapp-snapshot.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const snapshot = await response.json();
        if (snapshot.schemaVersion === 1 && snapshot.source?.spreadsheetId === '1vlkkrA52FBGk79k0ou3vch1XqM-AdHVDj42IXO7hIZo' && snapshot.rows?.length) return consolidateWhatsAppRows(snapshot.rows);
      }
    } catch (error) { /* The public read-only source remains a fallback. */ }
    const response = await fetch(WHATSAPP_OFFICIAL_CSV_URL, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Planilha operacional indisponivel');
    return consolidateWhatsAppRows(parseCsv(await response.text()));
  };
  let pendingRender = false;
  let lastRefreshAttempt = 0;
  const editingCrm = () => Boolean(crmFilterDraft || document.activeElement?.closest('#crm-workspace input, #crm-workspace select, #crm-workspace textarea'));
  const renderFreshness = () => {
    const ids = crmState.channel === 'all' ? ['email', 'whatsapp-oficial', 'whatsapp-organico'] : [crmState.channel];
    const checks = ids.map((id) => CrmSendFlow.freshness(commercialSource(id), id));
    const ready = checks.every((check) => check.status === 'current');
    const oldest = checks.map((check) => check.latest).filter(Boolean).sort()[0];
    const badge = $crm('#crm-freshness');
    badge.className = `status-pill ${ready ? 'ok' : 'warn'}`;
    badge.textContent = ready ? `SSOT ate ${sourceDateLabel(checks[0].target)} | D-1` : `${checks.some((check) => check.status === 'stale') ? 'Base atrasada' : 'Cobertura parcial'}${oldest ? ` | ate ${sourceDateLabel(oldest)}` : ''}`;
    badge.title = checks.map((check, index) => `${ids[index]}: ${check.status}; fechamento esperado ${check.target}`).join('\n');
  };
  const flushRefresh = () => {
    if (!pendingRender || editingCrm() || !crmState.referenceData) return;
    pendingRender = false;
    crmApplyPeriodPreset(crmState.periodPreset);
    syncCrmPeriodControls(); rebuildCrmData();
  };
  const readCommercialSnapshot = async () => {
    const response = await fetch('data/ssot-commercial-channels.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Falha ao ler a extracao SSOT');
    return CrmSendFlow.validateCommercialSnapshot(await response.json());
  };
  const refreshCrm = async (manual = false) => {
    if (!crmState.referenceData || refreshing || (!manual && (document.hidden || editingCrm() || $crm('#crm-workspace').classList.contains('is-hidden') || Date.now() - lastRefreshAttempt < 300000))) return;
    refreshing = true; lastRefreshAttempt = Date.now();
    const button = $crm('#crm-refresh'), feedback = $crm('#crm-refresh-result');
    button.disabled = true; button.textContent = 'Consultando...'; feedback.textContent = '';
    let failed = false;
    const commercial = readCommercialSnapshot().then((snapshot) => {
      for (const id of ['email', 'whatsapp-oficial', 'whatsapp-organico']) {
        const previous = CrmSendFlow.availableDates(crmState.ssotFallback, id).at(-1);
        const next = CrmSendFlow.availableDates(snapshot, id).at(-1);
        if (previous && (!next || next < previous)) throw new Error('Extracao SSOT recebida esta atrasada');
      }
      if (snapshot.extracted_at !== crmState.ssotFallback?.extracted_at) {
        crmState.ssotFallback = { ...snapshot, crmSourceMode: 'snapshot' }; pendingRender = true; flushRefresh();
      }
    }).catch(() => { failed = true; });
    const operational = [
      readRd().then((value) => { if (value.observedAt !== crmState.rd?.observedAt || value.readMode !== crmState.rd?.readMode || value.readWarning !== crmState.rd?.readWarning) { crmState.rd = value; pendingRender = true; } }),
      readSendflow().then((value) => { if (value.source.extractedAt !== crmState.sendflow?.source.extractedAt || value.source.mode !== crmState.sendflow?.source.mode) { crmState.sendflow = value; pendingRender = true; } }),
      readWhatsApp().then((rows) => {
        if (!rows.length) throw new Error('Planilha operacional vazia');
        if (whatsappSource.status !== 'ready') pendingRender = true;
        whatsappSource.status = 'ready';
        if (JSON.stringify(rows) !== JSON.stringify(crmState.campaigns)) { crmState.campaigns = rows; pendingRender = true; }
      }).catch(() => { whatsappSource.status = 'error'; pendingRender = true; throw new Error('Planilha operacional indisponivel'); }),
    ];
    const results = await Promise.allSettled([commercial, ...operational]);
    failed ||= results.some((result) => result.status === 'rejected');
    flushRefresh(); renderFreshness();
    refreshing = false; button.disabled = false; button.textContent = 'Atualizar leitura';
    feedback.textContent = failed ? 'Falha em uma fonte. Ultima leitura valida preservada.' : `Leitura conferida as ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
  };
  const boot = async () => {
    bindWorkspaceTabs();
    window.addEventListener("panorama:ssot", (event) => {
      const ids = crmState.channel === 'all' ? ['email', 'whatsapp-oficial', 'whatsapp-organico'] : [crmState.channel];
      const before = ids.map(commercialSource);
      crmState.ssotPayload = event.detail?.rows ? { ...event.detail, crmSourceMode: "snapshot" } : event.detail;
      const changed = ids.some((id, index) => {
        const next = commercialSource(id), previous = before[index];
        return (next?.extracted_at || next?.generatedAt) !== (previous?.extracted_at || previous?.generatedAt) || next?.source !== previous?.source;
      });
      if (changed && crmState.referenceData && crmState.start) { pendingRender = true; flushRefresh(); }
    });
    try {
      const operational = [
      readWhatsApp().catch(() => null),
        readSendflow().catch((error) => { crmState.sendflowError = error.message; return null; }),
        readRd().catch((error) => { crmState.rdError = error.message; return null; }),
      ];
      const [referenceResponse, ssotSnapshot] = await Promise.all([
        fetch("data/crm-weekly-reference.json", { cache: "no-store" }),
        readCommercialSnapshot().catch(() => null),
      ]);
      if (!referenceResponse.ok) throw new Error(`HTTP ${referenceResponse.status}`);
      crmState.referenceData = await referenceResponse.json();
      crmState.ssotFallback = ssotSnapshot ? { ...ssotSnapshot, crmSourceMode: "snapshot" } : null;
      crmState.ssotPayload = crmState.ssotPayload || (typeof state !== "undefined" ? state.growthPayload : null) || crmState.ssotFallback;
      const available = [...CrmSendFlow.availableDates(crmState.ssotPayload), ...CrmSendFlow.availableDates(crmState.ssotFallback)].sort();
      if (!available.length) throw new Error("As fontes CRM nao possuem datas validas para filtrar.");
      crmState.availableStart = available.at(0);
      crmState.availableEnd = available.at(-1);
      crmState.start = crmState.end = crmState.availableEnd;
      crmApplyPeriodPreset('current-day');
      crmApplyComparison();
      const filter = $crm("#crm-channel-filter");
      filter.innerHTML = `<option value="all">Todos os canais CRM</option>${crmState.referenceData.channels.map((channel) => `<option value="${esc(channel.id)}">${esc(channel.name)}</option>`).join("")}`; filter.value = crmState.channel;
      bindCrmPeriodControls();
      syncCrmPeriodControls();
      rebuildCrmData();
      if (location.hash === '#crm' && typeof hideLoadingScreen === 'function') hideLoadingScreen();
      $crm('#crm-refresh').disabled = false;
      $crm('#crm-refresh').addEventListener('click', () => window.PanoramaRefresh ? window.PanoramaRefresh.request() : refreshCrm(true));
      window.addEventListener('panorama:data-refreshed', () => refreshCrm(true));
      $crm('#crm-workspace').addEventListener('focusout', () => setTimeout(flushRefresh, 0));
      document.addEventListener('visibilitychange', () => refreshCrm());
      setInterval(() => refreshCrm(), 300000);
      const requested = new URLSearchParams(location.search).get('crmChannel');
      await Promise.all(operational.map(async (request, index) => {
        const value = await request;
        if (index === 0) { crmState.campaigns = value || []; whatsappSource.status = value?.length ? 'ready' : 'error'; }
        if (index === 1) crmState.sendflow = value;
        if (index === 2) crmState.rd = value;
        if (value && !editingCrm() && ((requested === 'whatsapp-organico' && index === 1) || (requested === 'email' && index === 2))) {
          const period = index === 1 ? value.source.coverage : value.period;
          crmState.channel = requested; crmState.start = period.start; crmState.end = period.end; crmState.periodPreset = 'custom'; crmApplyComparison();
        }
        const channelId = ['whatsapp-oficial', 'whatsapp-organico', 'email'][index];
        if (crmState.channel === channelId || crmState.channel === 'all') { pendingRender = true; flushRefresh(); }
        renderSourceBanner();
      }));
    } catch (error) {
      $crm("#crm-validation-banner").className = "callout validation-banner error";
      $crm("#crm-validation-banner strong").textContent = "Falha na leitura CRM";
      $crm("#crm-validation-banner span:not(.callout-mark)").textContent = error.message;
    }
  };
  boot();
})();
