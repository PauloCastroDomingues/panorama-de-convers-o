(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CrmSendFlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DAY = 86400000;
  const number = (value) => value === null || value === undefined || value === "" ? null :
    typeof value === "number" && Number.isFinite(value) ? value :
      typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : null;
  const dates = (start, end) => {
    const result = [];
    for (let time = Date.parse(`${start}T00:00:00Z`); time <= Date.parse(`${end}T00:00:00Z`); time += DAY) result.push(new Date(time).toISOString().slice(0, 10));
    return result;
  };
  const inRange = (row, start, end) => row.date >= start && row.date <= end;
  const total = (rows, key) => {
    const values = rows.map((row) => number(row[key])).filter((value) => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const key = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const CHANNEL_KEYS = { "whatsapp-organico": ["whatsapporganico", "whatsappnaooficial"], "whatsapp-oficial": ["whatsappoficial"], email: ["email"] };
  const matchesChannel = (value, channel) => (CHANNEL_KEYS[channel] || []).includes(key(value));
  const channelRows = (payload) => payload?.data?.find((item) => item.view === "channel")?.rows || payload?.rows || [];
  const hasChannel = (payload, channel) => channelRows(payload).some((row) => matchesChannel(row.canal_detalhe || row.canal, channel));
  const sourceDate = (row) => String(row.data || row.date || '').match(/^\d{4}-\d{2}-\d{2}(?=$|T|\s)/)?.[0] || null;
  const availableDates = (payload, channel) => [...new Set(channelRows(payload).filter((row) => (channel ? [channel] : Object.keys(CHANNEL_KEYS)).some((id) => matchesChannel(row.canal_detalhe || row.canal, id))).map(sourceDate).filter(Boolean))].sort();
  function latestCommercialSource(payloads, channel) {
    return payloads.filter((payload) => hasChannel(payload, channel)).sort((a, b) => {
      const dateOrder = (availableDates(b, channel).at(-1) || '').localeCompare(availableDates(a, channel).at(-1) || '');
      return dateOrder || (Date.parse(b.extracted_at || b.generatedAt) || 0) - (Date.parse(a.extracted_at || a.generatedAt) || 0);
    })[0] || null;
  }
  function validateCommercialSnapshot(payload) {
    if (payload?.kind !== 'ssot_commercial_channel_daily_v1' || payload.source !== 'reise-ssot.mart_growth_us.aquisicao_por_canal_origem_daily_v'
      || !Array.isArray(payload.rows) || !payload.rows.length || typeof payload.metadata?.definition !== 'string'
      || !Number.isFinite(Date.parse(payload.extracted_at))) throw new Error('Extracao comercial SSOT invalida');
    for (const row of payload.rows) {
      const date = sourceDate(row);
      if (!date || !row.canal || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Linha comercial SSOT invalida');
      for (const field of ['sessoes', 'pedidos', 'receita']) {
        if (row[field] !== null && number(row[field]) === null) throw new Error('Metrica comercial SSOT invalida');
      }
    }
    return payload;
  }
  function freshness(payload, channel, now = new Date()) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const target = new Date(Date.parse(`${today}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
    const latest = availableDates(payload, channel).at(-1) || null;
    const result = commercial(payload, channel, target, target);
    return { target, latest, status: !latest ? 'missing' : latest < target ? 'stale' : result.complete && result.revenueKnownDays === 1 ? 'current' : 'partial' };
  }

  function validate(snapshot) {
    if (snapshot?.schemaVersion !== 1 || !snapshot.source?.coverage?.start || !snapshot.source?.coverage?.end) throw new Error("Contrato SendFlow invalido");
    for (const name of ["messages", "actions", "movement"]) if (!Array.isArray(snapshot[name])) throw new Error(`Tabela SendFlow ausente: ${name}`);
    const actionIds = new Set(); const messageIds = new Set(); const dayIds = new Set();
    const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!validDate(snapshot.source.coverage.start) || !validDate(snapshot.source.coverage.end) || snapshot.source.coverage.start > snapshot.source.coverage.end) throw new Error("Cobertura SendFlow invalida");
    if (!snapshot.source.extractedAt || !Number.isFinite(Date.parse(snapshot.source.extractedAt))) throw new Error("Data da extracao SendFlow invalida");
    for (const action of snapshot.actions) {
      const id = `${action.releaseId}:${action.actionId}`;
      if (!action.actionId || actionIds.has(id) || !validDate(action.date)) throw new Error("Acao SendFlow duplicada ou invalida");
      if (!Number.isInteger(action.messageCount) || action.messageCount < 0 || !Number.isFinite(Date.parse(action.sentAt))) throw new Error("Contrato da acao SendFlow invalido");
      actionIds.add(id);
    }
    for (const message of snapshot.messages) {
      const id = `${message.releaseId}:${message.messageKey}`;
      if (!message.messageKey || messageIds.has(id) || !actionIds.has(`${message.releaseId}:${message.actionId}`) || !validDate(message.date)) throw new Error("Mensagem SendFlow duplicada, orfa ou invalida");
      if (message.messageKey !== `${message.actionId}:${message.messageIndex}` || !Number.isInteger(message.messageIndex) || message.messageIndex < 0) throw new Error("Chave da mensagem SendFlow invalida");
      messageIds.add(id);
      for (const metric of ["recipients", "delivered", "read", "played"]) if (message[metric] !== null && (!Number.isInteger(message[metric]) || message[metric] < 0)) throw new Error(`Contagem SendFlow invalida: ${metric}`);
    }
    for (const day of snapshot.movement) {
      const id = `${day.releaseId}:${day.date}`;
      if (dayIds.has(id) || !validDate(day.date)) throw new Error("Movimentacao SendFlow duplicada ou invalida");
      dayIds.add(id);
      for (const metric of ["add", "remove", "clicks"]) if (day[metric] !== null && (!Number.isInteger(day[metric]) || day[metric] < 0)) throw new Error("Contagem diaria SendFlow invalida");
    }
    for (const action of snapshot.actions) {
      const messages = snapshot.messages.filter((row) => row.releaseId === action.releaseId && row.actionId === action.actionId);
      if (messages.length !== action.messageCount) throw new Error("Quantidade de mensagens nao reconcilia com a acao");
      for (const metric of ["recipients", "delivered", "read", "played"]) if (total(messages, metric) !== action[metric]) throw new Error(`Totais nao reconciliados: ${metric}`);
    }
    return snapshot;
  }

  function summarize(snapshot, start, end) {
    const messages = snapshot.messages.filter((row) => inRange(row, start, end));
    const actions = snapshot.actions.filter((row) => inRange(row, start, end));
    const movement = snapshot.movement.filter((row) => inRange(row, start, end));
    const expected = dates(start, end).length;
    const complete = snapshot.source.coverageComplete !== false && start >= snapshot.source.coverage.start && end <= snapshot.source.coverage.end;
    const daily = dates(start < snapshot.source.coverage.start ? snapshot.source.coverage.start : start, end > snapshot.source.coverage.end ? snapshot.source.coverage.end : end).map((date) => ({
      date, actions: actions.filter((row) => row.date === date).length || (complete ? 0 : null), messages: messages.filter((row) => row.date === date).length || (complete ? 0 : null),
      recipients: total(messages.filter((row) => row.date === date), "recipients"), read: total(messages.filter((row) => row.date === date), "read"),
    }));
    const movementMetric = (metric) => ({ subtotal: total(movement, metric), knownDays: new Set(movement.filter((row) => number(row[metric]) !== null).map((row) => row.date)).size, expectedDays: expected });
    return {
      start, end, complete, available: messages.length > 0 || movement.length > 0,
      actions: complete ? actions.length : actions.length || null,
      messages: complete ? messages.length : messages.length || null,
      recipients: total(messages, "recipients"), delivered: total(messages, "delivered"), read: total(messages, "read"), played: total(messages, "played"),
      inconsistentReceipts: messages.filter((row) => row.read !== null && row.delivered !== null && row.read > row.delivered).length,
      readRate: null, movement: { add: movementMetric("add"), remove: movementMetric("remove"), clicks: movementMetric("clicks") },
      daily, actionRows: actions.slice().sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    };
  }

  function commercial(payload, channel, start, end) {
    const view = payload?.data?.find((item) => item.view === "channel");
    const sourceRows = channelRows(payload);
    // This versioned SSOT extract unions order-only origins with channel-level sessions.
    const channelSessionLayout = payload?.kind === 'ssot_commercial_channel_daily_v1'
      && payload.source === 'reise-ssot.mart_growth_us.aquisicao_por_canal_origem_daily_v'
      && typeof payload.metadata?.definition === 'string';
    const byDate = new Map();
    for (const row of sourceRows) {
      const date = sourceDate(row);
      if (!date || date < start || date > end || !matchesChannel(row.canal_detalhe || row.canal, channel)) continue;
      const target = byDate.get(date) || { date, sessions: null, orders: null, revenue: null, missing: new Set() };
      for (const [metric, field] of [["sessions", "sessoes"], ["orders", "pedidos"], ["revenue", "receita"]]) {
        const value = number(row[field] ?? row[metric] ?? (metric === 'orders' ? row.pedidos_total : metric === 'revenue' ? row.vendas ?? row.receita_total : null));
        if (value === null) {
          if (!(channelSessionLayout && metric === 'sessions')) target.missing.add(metric);
        } else target[metric] = (target[metric] ?? 0) + value;
      }
      byDate.set(date, target);
    }
    const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => {
      for (const metric of row.missing) row[metric] = null;
      const { missing, ...values } = row;
      return { ...values, rate: values.sessions > 0 && values.orders !== null ? values.orders / values.sessions : null };
    });
    const expectedDays = dates(start, end).length;
    const complete = daily.length === expectedDays && daily.every((row) => row.sessions !== null && row.orders !== null);
    const sessions = total(daily, "sessions"), orders = total(daily, "orders"), revenue = total(daily, "revenue");
    return { source: view?.source || payload?.source || "SSOT canal", generatedAt: payload?.generatedAt || payload?.extracted_at || null,
      mode: payload?.crmSourceMode || "ssot", sessionsKnownDays: daily.filter((row) => row.sessions !== null).length, ordersKnownDays: daily.filter((row) => row.orders !== null).length, revenueKnownDays: daily.filter((row) => row.revenue !== null).length,
      rows: daily.length, expectedDays, complete, sessions, orders, revenue, rate: complete && sessions > 0 ? orders / sessions : null, daily };
  }

  const completeMetric = (result, metric) => metric === "rate" ? result.complete : result.expectedDays > 0 && result[`${metric}KnownDays`] === result.expectedDays;
  function withCommercial(operational, reference, payload, start, end, comparisonStart, comparisonEnd, useReferenceTargets = false) {
    const result = commercial(payload, reference.id, start, end);
    const comparison = commercial(payload, reference.id, comparisonStart, comparisonEnd);
    const targets = new Map((reference.metrics || []).map((metric) => [metric.key, metric.meta]));
    const definitions = [["revenue", "Receita", "money"], ["sessions", "Sessoes", "int"], ["orders", "Pedidos", "int"], ["rate", "Conversao", "percent"]];
    const metrics = definitions.map(([id, label, format]) => ({ key: id, label: `${label}${!completeMetric(result, id) && id !== "rate" ? id === "orders" ? " conhecidos" : " conhecidas" : ""} SSOT`, format,
      actual: result[id], comparison: completeMetric(comparison, id) ? comparison[id] : null,
      currentComplete: completeMetric(result, id), comparisonComplete: completeMetric(comparison, id),
      meta: useReferenceTargets ? targets.get(id) ?? null : null,
    }));
    const investment = operational.metrics?.find((metric) => metric.key === "investment");
    if (investment) {
      metrics.push({ ...investment, label: "Investimento operacional", meta: useReferenceTargets ? investment.meta : null });
    }
    if (investment && operational.costCoverageConfirmed === true) {
      const ratio = (amount, numerator, complete) => complete && amount > 0 && numerator !== null ? numerator / amount : null;
      metrics.push({ key: "roas", label: "ROAS do canal", format: "multiple", meta: null,
        actual: ratio(investment.actual, result.revenue, completeMetric(result, "revenue")), comparison: ratio(investment.comparison, comparison.revenue, completeMetric(comparison, "revenue")) });
      metrics.push({ key: "cps", label: "CPS do canal", format: "money", meta: null, invertGood: true,
        actual: result.sessions > 0 && completeMetric(result, "sessions") && investment.actual !== null ? investment.actual / result.sessions : null,
        comparison: comparison.sessions > 0 && completeMetric(comparison, "sessions") && investment.comparison !== null && investment.comparison !== undefined ? investment.comparison / comparison.sessions : null });
    }
    return { ...operational, id: reference.id, name: reference.name || operational.name,
      operationalMetrics: operational.metrics || [], operationalSource: operational.operationalSource || operational.sourceLabel || "Referencia operacional",
      operationalNote: operational.note || "", metrics, daily: result.daily, ssotCommercial: result, ssotComparison: comparison, ssotReconciliation: result,
      sourceLabel: `Resultado comercial: SSOT | Ativacao: ${operational.operationalSource || operational.sourceLabel || "fonte do canal"}`,
      note: "Sessoes, pedidos, receita e conversao pertencem ao canal no SSOT. A ausencia de disparos na fonte operacional nao elimina o resultado comercial.",
    };
  }

  function aggregateCommercial(channels) {
    const metrics = ["sessions", "orders", "revenue"].map((key) => {
      const rows = channels.map((channel) => channel.metrics.find((metric) => metric.key === key)).filter(Boolean);
      const sumField = (field) => rows.length === channels.length && rows.length > 0 && rows.every((row) => number(row[field]) !== null) ? rows.reduce((sum, row) => sum + number(row[field]), 0) : null;
      return { key, actual: sumField("actual"), meta: sumField("meta"), comparison: sumField("comparison"), format: key === "revenue" ? "money" : "int",
        currentComplete: rows.length === channels.length && rows.every((row) => row.currentComplete !== false),
        comparisonComplete: rows.length === channels.length && rows.every((row) => row.comparisonComplete !== false) };
    });
    const [sessions, orders] = metrics;
    const rate = (field, complete) => complete && sessions[field] > 0 && orders[field] !== null ? orders[field] / sessions[field] : null;
    metrics.push({ key: "rate", format: "percent", actual: rate("actual", sessions.currentComplete && orders.currentComplete),
      comparison: rate("comparison", sessions.comparisonComplete && orders.comparisonComplete), meta: rate("meta", true) });
    return metrics;
  }

  function buildChannel(snapshot, reference, payload, start, end, comparisonStart, comparisonEnd) {
    const activity = summarize(snapshot, start, end);
    const comparison = summarize(snapshot, comparisonStart, comparisonEnd);
    const channel = withCommercial({ ...reference, metrics: [], segments: [], operationalSource: "SendFlow", sourcePeriod: { start, end },
      activation: { segments: [], tracking: { slots: [], inputs: [], outputs: [], result: "" } },
    }, { ...reference, id: "whatsapp-organico", name: reference.name || "WhatsApp Organico" }, payload, start, end, comparisonStart, comparisonEnd);
    return { ...channel, note: `${snapshot.source.releaseName}: ${activity.actions === null ? "sem cobertura de acoes" : `${activity.actions} acoes`} no recorte. Resultados comerciais pertencem ao canal inteiro; nao sao vendas atribuidas a esta campanha.`,
      sendflow: { source: snapshot.source, activity, comparison, commercial: channel.ssotCommercial, comparisonCommercial: channel.ssotComparison } };
  }
  return { validate, summarize, commercial, buildChannel, hasChannel, withCommercial, aggregateCommercial, availableDates, latestCommercialSource, validateCommercialSnapshot, freshness };
});
