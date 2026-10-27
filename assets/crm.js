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
  const days = ["Seg 19/10", "Ter 20/10", "Qua 21/10", "Qui 22/10", "Sex 23/10", "Sab 24/10", "Dom 25/10"];
  const cumulative = (values) => { let total = 0; return values.map((value) => total += value); };
  const dailyFormat = (key, value) => key === "Receita" || key === "Investimento" ? money(value) : int(value);
  const renderConversionFunnel = (channel) => {
    const metrics = metricMap(channel); const sessions = metrics.get("sessions")?.actual || 0; const orders = metrics.get("orders")?.actual || 0; const rate = metrics.get("rate")?.actual || 0; const ratio = sessions ? Math.max(Math.sqrt(orders / sessions), 0.05) : 0.05; const bottom = Math.max(88 * ratio, 6); const left = (100 - bottom) / 2;
    return `<div class="crm-funnel-visual"><div class="crm-funnel-label"><span>Sessoes</span><strong>${int(sessions)}</strong></div><svg viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label="Funil de sessoes para pedidos"><defs><linearGradient id="crm-funnel-${esc(channel.id)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4934f" stop-opacity=".85"/><stop offset="1" stop-color="#e2793f" stop-opacity=".28"/></linearGradient></defs><polygon points="6,0 94,0 ${100 - left},48 ${left},48" fill="url(#crm-funnel-${esc(channel.id)})" stroke="#f4934f" stroke-width=".5"/><text x="50" y="27" text-anchor="middle" fill="#fff" font-size="5">${percent(rate)} conversao</text></svg><div class="crm-funnel-label"><span>Pedidos</span><strong>${int(orders)}</strong></div></div>`;
  };
  const renderMetaChart = (channel) => {
    const values = channel.pacing.daily?.Receita || []; if (!values.length) return ""; const totals = cumulative(values); const max = Math.max(...totals, ...values, 1); const bars = values.map((value, index) => { const x = 18 + index * 88; const h = (value / max) * 118; return `<rect x="${x}" y="${140 - h}" width="46" height="${h}" rx="2" fill="#e2793f" fill-opacity=".62"><title>${days[index]}: ${money(value)}</title></rect>`; }).join(""); const points = totals.map((value, index) => `${18 + index * 88 + 23},${140 - (value / max) * 118}`).join(" "); return `<div class="crm-chart-box"><svg viewBox="0 0 650 180" role="img" aria-label="Grafico de meta diaria e acumulada"><line x1="12" y1="140" x2="638" y2="140" stroke="var(--line)"/><line x1="12" y1="20" x2="638" y2="20" stroke="var(--line)"/><g>${bars}</g><polyline points="${points}" fill="none" stroke="#f4934f" stroke-width="2.5"/><g>${totals.map((value, index) => `<circle cx="${18 + index * 88 + 23}" cy="${140 - (value / max) * 118}" r="3" fill="#f4934f"><title>${days[index]} acumulado: ${money(value)}</title></circle>`).join("")}</g>${days.map((label, index) => `<text x="${18 + index * 88 + 23}" y="162" text-anchor="middle">${label.split(" ")[0]}</text>`).join("")}</svg><div class="crm-chart-legend"><span><i class="crm-legend-bar"></i>Meta do dia: receita</span><span><i class="crm-legend-line"></i>Meta acumulada</span></div></div>`;
  };
  const renderPacingDetail = (channel) => {
    const rows = Object.entries(channel.pacing.daily || {}).map(([key, values]) => `<tr><td>${esc(key)}</td>${values.map((value, index) => `<td>${dailyFormat(key, value)}<small>acum. ${dailyFormat(key, cumulative(values)[index])}</small></td>`).join("")}</tr>`).join("");
    return `<div class="crm-detail-card"><h3>Ritmo diario</h3><p class="crm-detail-hint">Meta do dia e meta acumulada da semana.</p><div class="table-scroll"><table class="data-table crm-daily-table"><thead><tr><th>Metrica</th>${days.map((day) => `<th>${day.split(" ")[0]}<small>${day.split(" ")[1]}</small></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>${renderMetaChart(channel)}</div>`;
  };
  const renderActivationGraphic = (activation) => {
    const segmentHtml = activation.segments.map((segment) => { const max = segment.stages[0]?.value || 1; const bands = segment.stages.slice(0, -1).map((stage, index) => { const next = segment.stages[index + 1]; const top = Math.max(88 * Math.sqrt(stage.value / max), 5); const bottom = Math.max(88 * Math.sqrt(next.value / max), 5); const topLeft = (100 - top) / 2; const bottomLeft = (100 - bottom) / 2; return `<polygon points="${topLeft},${index * 28} ${topLeft + top},${index * 28} ${bottomLeft + bottom},${(index + 1) * 28} ${bottomLeft},${(index + 1) * 28}" fill="#e2793f" fill-opacity="${Math.max(.3, .82 - index * .16)}" stroke="#f4934f" stroke-width=".35"/>`; }).join(""); const expected = segment.resultPerShot && segment.shots ? segment.resultPerShot * segment.shots : null; return `<div class="crm-chain-column"><div class="crm-chain-head"><strong>${esc(segment.name)}</strong><span>${segment.shots ? `${int(segment.shots)}x na semana` : ""}</span></div><div class="crm-chain-stages">${segment.stages.map((stage) => `<div><span>${esc(stage.label)}</span><b>${int(stage.value)}${stage.rate !== undefined ? ` <small>${percent(stage.rate)}</small>` : ""}</b></div>`).join("")}</div><svg viewBox="0 0 100 ${(segment.stages.length - 1) * 28}" preserveAspectRatio="none" aria-label="Funil de ativacao de ${esc(segment.name)}">${bands}</svg>${segment.resultPerShot ? `<p class="crm-chain-result">Aproximadamente <strong>${int(segment.resultPerShot)}</strong> ${esc(activation.resultLabel.toLowerCase())} por disparo${expected ? ` x ${int(segment.shots)} = <strong>${int(expected)}</strong> esperados` : ""}.</p>` : ""}${segment.source ? `<p class="crm-detail-hint">${esc(segment.source)}</p>` : ""}</div>`; }).join("");
    const totalShots = activation.segments.reduce((sum, segment) => sum + Number(segment.shots || 0), 0);
    const expected = activation.combined ? Number(activation.combined.nextValue || 0) * totalShots : activation.segments.reduce((sum, segment) => sum + Number(segment.resultPerShot || 0) * Number(segment.shots || 0), 0);
    const meta = Number(activation.metaResult || 0); const diff = expected - meta; const delta = meta ? `${diff >= 0 ? "+" : ""}${int(Math.round(diff))} ${esc(activation.resultLabel.toLowerCase())} ${diff >= 0 ? "acima" : "abaixo"} da meta (${percent(diff / meta)})` : "Meta nao informada";
    const combined = activation.combined ? `<div class="crm-combined-result"><span>${esc(activation.combined.label)}</span><strong>${int(activation.combined.value)}</strong><span>${esc(activation.combined.nextLabel)}</span><strong>${int(activation.combined.nextValue)}</strong><small>${percent(activation.combined.rate)}</small></div>` : "";
    return `<div class="crm-chain-grid">${segmentHtml}</div>${combined}<div class="crm-activation-summary"><div class="crm-activation-summary-row"><span>Total esperado de ${esc(activation.resultLabel.toLowerCase())} na semana</span><strong>${int(Math.round(expected))}</strong></div><div class="crm-progress"><span style="width:${Math.min(meta ? (expected / meta) * 100 : 0, 100)}%"></span></div><div class="crm-activation-summary-row"><span class="${diff >= 0 ? "good" : "bad"}">${delta}</span><span>Meta: ${int(meta)} ${esc(activation.resultLabel.toLowerCase())}</span></div></div>`;
  };
  const trackingKey = (channel) => `reise-crm-tracking-${channel.id}`;
  const readTracking = (channel) => { try { return JSON.parse(localStorage.getItem(trackingKey(channel)) || "{}"); } catch (error) { return {}; } };
  const trackingOutput = (channel, row) => { const values = row || {}; if (channel.id === "email") return [values.Leads && values.Entregues ? values.Entregues / values.Leads : null, values.Entregues && values.Abertura ? values.Abertura / values.Entregues : null, values.Abertura && values.Cliques ? values.Cliques / values.Abertura : null]; if (channel.id === "whatsapp-organico") { const views = (values["Vis. Club"] || 0) + (values["Vis. Membership"] || 0); return [views || null, views && values.Sessoes ? values.Sessoes / views : null]; } return [values.Publico && values.Entregues ? values.Entregues / values.Publico : null, values.Entregues && values.Leitura ? values.Leitura / values.Entregues : null, values.Leitura && values.Cliques ? values.Cliques / values.Leitura : null]; };
  const renderTracking = (channel) => { const activation = channel.activation; const values = readTracking(channel); const rows = activation.tracking.slots.map((slot, index) => { const row = values[index] || {}; const inputs = activation.tracking.inputs.map((field) => `<td><input type="number" min="0" data-track-row="${index}" data-track-field="${esc(field)}" value="${row[field] ?? ""}" aria-label="${esc(`${slot} ${field}`)}"></td>`).join(""); const outputs = trackingOutput(channel, row).map((value) => `<td class="crm-track-output">${value === null ? "-" : percent(value)}</td>`).join(""); return `<tr><td>${esc(slot)}</td>${inputs}${outputs}</tr>`; }).join(""); const total = activation.tracking.slots.reduce((sum, slot, index) => { const row = values[index] || {}; const result = row[activation.tracking.result] || 0; return sum + Number(result); }, 0); return `<div class="crm-tracking-head"><div><h3>Acompanhamento</h3><p class="crm-detail-hint">${esc(activation.tracking.hint)} Os valores ficam salvos neste navegador.</p></div><div class="crm-tracking-actions"><button type="button" class="outline-button" data-track-action="export">Exportar</button><label class="outline-button" for="crm-track-import">Importar</label><input id="crm-track-import" type="file" accept="application/json" class="is-hidden"><button type="button" class="outline-button" data-track-action="reset">Limpar</button></div></div><div class="crm-tracking-summary"><strong>${int(total)}</strong><span>${esc(activation.tracking.result)} registrados · meta ${int(activation.metaResult)}</span></div><div class="table-scroll"><table class="data-table crm-tracking-table"><thead><tr><th>Disparo</th>${activation.tracking.inputs.map((field) => `<th>${esc(field)}</th>`).join("")}${activation.tracking.outputs.map((field) => `<th>${esc(field)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`; };
  const renderDetailTabs = () => { const tabs = [{ id: "all", name: "Visao geral" }, ...(crmState.data?.channels || [])]; $crm("#crm-channel-tabs").innerHTML = tabs.map((tab) => `<button type="button" role="tab" class="crm-channel-tab ${crmState.channel === tab.id ? "active" : ""}" data-crm-tab="${esc(tab.id)}">${esc(tab.name || tab.name)}</button>`).join(""); $crm("#crm-channel-tabs").querySelectorAll("[data-crm-tab]").forEach((button) => button.addEventListener("click", () => { crmState.channel = button.dataset.crmTab; $crm("#crm-channel-filter").value = crmState.channel; renderAll(); })); };
  const bindTracking = (channel) => { const root = $crm("#crm-detail"); root.querySelectorAll("[data-track-field]").forEach((input) => input.addEventListener("input", (event) => { const values = readTracking(channel); const row = Number(event.target.dataset.trackRow); values[row] = values[row] || {}; values[row][event.target.dataset.trackField] = event.target.value === "" ? "" : Number(event.target.value); localStorage.setItem(trackingKey(channel), JSON.stringify(values)); renderDetail(); })); root.querySelector('[data-track-action="reset"]')?.addEventListener("click", () => { localStorage.removeItem(trackingKey(channel)); renderDetail(); }); root.querySelector('[data-track-action="export"]')?.addEventListener("click", () => { const blob = new Blob([JSON.stringify(readTracking(channel), null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `crm-${channel.id}-acompanhamento.json`; link.click(); URL.revokeObjectURL(link.href); }); root.querySelector("#crm-track-import")?.addEventListener("change", (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(reader.result); const imported = parsed?.data || parsed; if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error("Formato invalido"); localStorage.setItem(trackingKey(channel), JSON.stringify(imported)); renderDetail(); } catch (error) { window.alert("Arquivo de acompanhamento invalido."); } }; reader.readAsText(file); }); };
  const renderDetail = () => { renderDetailTabs(); const channel = selectedChannels()[0]; if (crmState.channel === "all" || !channel) { $crm("#crm-detail").innerHTML = `<div class="crm-detail-overview"><strong>Visao geral ativa</strong><span>Selecione um canal acima para abrir literalmente todos os detalhes do racional: conversao, ritmo, funil de ativacao e acompanhamento preenchivel.</span></div>`; return; } const metrics = metricMap(channel); const activation = channel.activation; $crm("#crm-detail").innerHTML = `<div class="crm-detail-grid"><div class="crm-detail-card"><h3>Funil de conversao</h3><p class="crm-detail-hint">Sessoes para pedidos, com a taxa calculada sobre o realizado.</p>${renderConversionFunnel(channel)}<div class="crm-side-stats"><div><span>Receita</span><strong>${money(metrics.get("revenue")?.actual)}</strong></div><div><span>Ticket medio</span><strong>${money(metrics.get("orders")?.actual ? metrics.get("revenue").actual / metrics.get("orders").actual : null)}</strong></div><div><span>Conversao</span><strong>${percent(metrics.get("rate")?.actual)}</strong></div></div></div>${renderPacingDetail(channel)}</div><div class="crm-detail-card"><h3>Funil completo de ativacao</h3><p class="crm-detail-hint">${esc(activation.hint)}</p>${renderActivationGraphic(activation)}</div><div class="crm-detail-card">${renderTracking(channel)}</div>`; bindTracking(channel); };
  const renderAll = () => { renderSummary(); renderChannels(); renderPriorities(); renderFunnel(); renderPacing(); renderDetail(); };
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
