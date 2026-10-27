(() => {
  const $crm = (selector) => document.querySelector(selector);
  const crmState = { data: null, channel: "all" };

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const int = (value) => value === null || value === undefined ? "Nao rastreado" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
  const money = (value) => value === null || value === undefined ? "Nao rastreado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
  const percent = (value) => value === null || value === undefined ? "Nao rastreado" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const multiple = (value) => value === null || value === undefined ? "Nao rastreado" : `${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  const formatValue = (value, format) => format === "money" ? money(value) : format === "percent" ? percent(value) : format === "multiple" ? multiple(value) : int(value);
  const formatDelta = (metric) => {
    if (metric.meta === null || metric.actual === null || metric.meta === 0) return { text: "Sem base de comparacao", tone: "neutral" };
    const difference = metric.actual - metric.meta;
    const relative = difference / Math.abs(metric.meta);
    const tone = metric.invertGood ? (difference <= 0 ? "good" : "bad") : (difference >= 0 ? "good" : "bad");
    if (metric.format === "percent") return { text: `${difference >= 0 ? "+" : ""}${(difference * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`, tone };
    return { text: `${relative >= 0 ? "+" : ""}${(relative * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs. meta`, tone };
  };
  const selectedChannels = () => {
    if (!crmState.data) return [];
    return crmState.channel === "all" ? crmState.data.channels : crmState.data.channels.filter((channel) => channel.id === crmState.channel);
  };
  const metricMap = (channel) => new Map(channel.metrics.map((metric) => [metric.key, metric]));
  const aggregate = (channels) => {
    const metrics = ["sessions", "orders", "revenue"].map((key) => {
      const rows = channels.map((channel) => metricMap(channel).get(key)).filter(Boolean);
      return { key, meta: rows.reduce((sum, row) => sum + row.meta, 0), actual: rows.reduce((sum, row) => sum + row.actual, 0), format: rows[0]?.format || "int" };
    });
    const sessions = metrics.find((metric) => metric.key === "sessions");
    const orders = metrics.find((metric) => metric.key === "orders");
    metrics.push({ key: "rate", meta: sessions?.meta ? orders.meta / sessions.meta : null, actual: sessions?.actual ? orders.actual / sessions.actual : null, format: "percent" });
    return metrics;
  };
  const renderMetricCells = (metrics) => metrics.map((metric) => {
    const delta = formatDelta(metric);
    return `<div class="crm-metric"><span>${esc(metric.label)}</span><strong>${formatValue(metric.actual, metric.format)}</strong><small>Meta ${formatValue(metric.meta, metric.format)}</small><em class="${delta.tone}">${esc(delta.text)}</em></div>`;
  }).join("");
  const renderSummary = () => {
    const metrics = aggregate(selectedChannels());
    $crm("#crm-summary-kpis").innerHTML = metrics.map((metric) => `<article class="kpi"><span>${esc(metric.key === "rate" ? "Conversao" : metric.key === "sessions" ? "Sessoes" : metric.key === "orders" ? "Pedidos" : "Receita")}</span><strong>${formatValue(metric.actual, metric.format)}</strong><small>Meta ${formatValue(metric.meta, metric.format)}</small></article>`).join("");
    const scopeLabel = crmState.channel === "all" ? "Todos os canais CRM" : selectedChannels()[0]?.name || "Canal CRM";
    $crm("#crm-summary-window").textContent = `${scopeLabel} · ${crmState.data.period.label}`;
  };
  const renderChannels = () => {
    $crm("#crm-channel-cards").innerHTML = selectedChannels().map((channel) => `<article class="crm-channel-card"><div class="crm-channel-head"><div><p class="eyebrow">Canal CRM</p><h3>${esc(channel.name)}</h3></div><span class="status-pill ${channel.id === "whatsapp-organico" ? "ok" : "warn"}">${channel.id === "whatsapp-organico" ? "Acima da meta" : "Investigar"}</span></div><div class="crm-metric-grid">${renderMetricCells(channel.metrics)}</div><p class="crm-reading">${esc(channel.note)}</p></article>`).join("");
  };
  const renderPriorities = () => {
    const cards = selectedChannels().map((channel) => {
      const metrics = metricMap(channel); const rate = metrics.get("rate"); const revenue = metrics.get("revenue");
      const issue = rate && rate.actual < rate.meta ? `Conversao ${percent(rate.actual)} contra ${percent(rate.meta)} da meta` : revenue && revenue.actual < revenue.meta ? `Receita ${money(revenue.actual)} contra ${money(revenue.meta)} da meta` : "Todas as metricas principais acima da meta";
      const action = channel.id === "email" ? "Separar automacoes de campanhas e revisar produto ou checkout." : channel.id === "whatsapp-oficial" ? "Reconciliar Marketing, Utilidade e a terceira origem antes de otimizar." : "Identificar quais posts e mensagens geraram a conversao acima da referencia.";
      const tone = rate && rate.actual >= rate.meta ? "good" : "warn";
      return `<article class="crm-priority ${tone}"><div><p class="eyebrow">${tone === "good" ? "Manter e aprender" : "Investigar primeiro"}</p><h3>${esc(channel.name)}</h3><strong>${esc(issue)}</strong></div><p>${esc(action)}</p></article>`;
    }).sort((left, right) => Number(right.includes("Investigar primeiro")) - Number(left.includes("Investigar primeiro")));
    $crm("#crm-priority-list").innerHTML = cards.join("");
  };
  const funnelRows = (segment) => {
    const actual = new Map(segment.actual.map((stage) => [stage.label, stage]));
    return segment.planned.map((stage) => {
      const observed = actual.get(stage.label); const actualValue = observed ? formatValue(observed.value, "int") : "Nao rastreado"; const target = formatValue(stage.value, "int"); const rate = observed?.rate !== undefined ? percent(observed.rate) : "";
      return `<tr><td>${esc(stage.label)}</td><td>${target}</td><td>${actualValue}</td><td>${rate || "-"}</td></tr>`;
    }).join("");
  };
  const renderFunnel = () => {
    $crm("#crm-funnel").innerHTML = selectedChannels().flatMap((channel) => channel.segments.map((segment) => `<article class="crm-funnel-card"><div class="crm-channel-head"><div><p class="eyebrow">${esc(channel.name)}</p><h3>${esc(segment.name)}</h3></div><span class="status-pill ${segment.actualShots >= segment.plannedShots ? "ok" : "warn"}">${int(segment.actualShots)} de ${int(segment.plannedShots)} disparos</span></div><div class="table-scroll"><table class="data-table crm-funnel-table"><thead><tr><th>Etapa</th><th>Planejado</th><th>Realizado</th><th>Taxa observada</th></tr></thead><tbody>${funnelRows(segment)}</tbody></table></div><p class="crm-diagnosis">${esc(segment.diagnosis)}</p></article>`)).join("");
  };
  const renderPacing = () => {
    const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
    const rows = selectedChannels().map((channel) => { const pacing = channel.pacing; const total = pacing.metaDaily.reduce((sum, value) => sum + value, 0); return `<tr><td><strong>${esc(channel.name)}</strong></td><td>${esc(pacing.metric)}</td>${pacing.metaDaily.map((value) => `<td>${int(value)}</td>`).join("")}<td>${int(total)}</td></tr>`; }).join("");
    $crm("#crm-pacing").innerHTML = `<table class="data-table crm-pacing-table"><thead><tr><th>Canal</th><th>Indicador</th>${days.map((day) => `<th>${day}</th>`).join("")}<th>Total meta</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  const renderAll = () => { renderSummary(); renderChannels(); renderPriorities(); renderFunnel(); renderPacing(); };
  const switchWorkspace = (workspace) => { const button = document.querySelector(`[data-workspace="${workspace}"]`); if (!button) return; document.querySelectorAll("[data-workspace]").forEach((item) => item.classList.toggle("active", item === button)); document.querySelectorAll(".workspace-panel").forEach((panel) => panel.classList.toggle("is-hidden", panel.id !== `${workspace}-workspace`)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const bindWorkspaceTabs = () => { document.querySelectorAll("[data-workspace]").forEach((button) => button.addEventListener("click", () => { const workspace = button.dataset.workspace; history.replaceState(null, "", workspace === "crm" ? "#crm" : "#growth"); switchWorkspace(workspace); })); if (location.hash === "#crm") switchWorkspace("crm"); };
  const boot = async () => {
    bindWorkspaceTabs();
    try {
      const response = await fetch("data/crm-weekly-reference.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      crmState.data = await response.json();
      $crm("#crm-period-label").textContent = crmState.data.period.label;
      $crm("#crm-period-note").textContent = crmState.data.period.label;
      const filter = $crm("#crm-channel-filter");
      filter.innerHTML = `<option value="all">Todos os canais CRM</option>${crmState.data.channels.map((channel) => `<option value="${esc(channel.id)}">${esc(channel.name)}</option>`).join("")}`;
      filter.addEventListener("change", (event) => { crmState.channel = event.target.value; renderAll(); });
      renderAll();
    } catch (error) {
      $crm("#crm-validation-banner").className = "callout validation-banner error";
      $crm("#crm-validation-banner strong").textContent = "Falha na leitura CRM";
      $crm("#crm-validation-banner span:not(.callout-mark)").textContent = error.message;
    }
  };
  boot();
})();
