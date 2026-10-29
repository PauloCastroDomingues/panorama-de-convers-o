(function (root, factory) {
  const commonJS = typeof module === 'object' && module.exports;
  const api = factory(commonJS ? require('./crm-icons.js') : root.CrmIcons, commonJS ? require('./crm-whatsapp.js') : root.CrmWhatsApp, commonJS ? require('./performance-delta.js') : root.PerformanceDelta);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrmArtifact = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (icon, WhatsApp, PerformanceDelta) {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const num = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const ratio = (value, denominator) => num(value) !== null && denominator > 0 && value <= denominator ? value / denominator : null;
  const fmt = (value, type = 'int') => value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR', type === 'money' ? { style: 'currency', currency: 'BRL' } : type === 'percent' ? { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }).format(value);
  const shift = (date, days) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  const dateLabel = (date) => date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : '—';
  const dates = (start, end) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) return [];
    const result = [];
    for (let value = start; value <= end && result.length < 3660; value = shift(value, 1)) result.push(value);
    return result;
  };
  const sum = (values) => values.length && values.every((value) => num(value) !== null) ? values.reduce((total, value) => total + value, 0) : null;
  const subtotal = (values) => { const known = values.filter((value) => num(value) !== null); return known.length ? known.reduce((total, value) => total + value, 0) : null; };
  const difference = (value, previous, type) => PerformanceDelta.describe(value, previous, { rate: type === 'percent' });
  const outputs = (channel, row) => {
    if (channel === 'email') return [ratio(row.Entregues, row.Leads), ratio(row.Abertura, row.Entregues), ratio(row.Cliques, row.Abertura)];
    if (channel === 'whatsapp-organico') {
      const views = sum([row['Vis. Club'], row['Vis. Membership']]);
      return [views, ratio(row.Sessoes, views)];
    }
    return [ratio(row.Entregues, row.Publico), ratio(row.Leitura, row.Entregues), ratio(row.Cliques, row.Leitura)];
  };
  const outputFormat = (channel, index) => channel === 'whatsapp-organico' && index === 0 ? 'int' : 'percent';
  const key = (channel) => `reise-crm-tracking-v2-${channel}`;
  const rowKey = (date, index) => `${date}:${index}`;
  const validateTracking = (input, channel, cfg) => {
    if (input?.version !== 2 || input.channel !== channel || !input.rows || typeof input.rows !== 'object' || Array.isArray(input.rows)) throw new Error('Arquivo de outro canal ou formato sem datas.');
    const result = {};
    for (const [id, row] of Object.entries(input.rows)) {
      const match = id.match(/^(\d{4}-\d{2}-\d{2}):(\d+)$/);
      if (!match || Number(match[2]) >= cfg.slots.length || !row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Linha invalida.');
      const parsed = new Date(`${match[1]}T12:00:00Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1]) throw new Error('Data invalida.');
      result[id] = {};
      for (const [field, value] of Object.entries(row)) {
        if (!cfg.inputs.includes(field) || num(value) === null || !Number.isInteger(value)) throw new Error('Valor invalido.');
        result[id][field] = value;
      }
    }
    return result;
  };
  const load = (channel) => { try { const value = JSON.parse(localStorage.getItem(key(channel)) || '{}'); return value && !Array.isArray(value) && typeof value === 'object' ? value : {}; } catch { return {}; } };
  const trackingTotals = (channel, cfg, calendar, rows) => calendar.map((date) => ({ date, total: subtotal(cfg.slots.map((_, index) => rows[rowKey(date, index)]?.[cfg.result])) }));
  const dayCoverage = (cfg, date, rows) => {
    const counts = cfg.slots.map((_, index) => cfg.inputs.filter((field) => num(rows[rowKey(date, index)]?.[field]) !== null).length);
    const filled = counts.reduce((total, count) => total + count, 0), expected = cfg.slots.length * cfg.inputs.length;
    return { filled, expected, state: !filled ? 'empty' : filled === expected ? 'complete' : 'partial' };
  };
  const dayStatus = (cfg, date, rows, total) => total !== null ? `${fmt(total)} ${cfg.result.toLowerCase()}` : dayCoverage(cfg, date, rows).filled ? 'Parcial' : 'Sem registro';
  const trackingWindow = (calendar, options) => {
    const page = Math.min(Math.max(0, options.trackingPage || 0), Math.max(0, Math.ceil(calendar.length / 7) - 1));
    const visible = pageDates(calendar, page);
    const selected = visible.includes(options.trackingDate) ? options.trackingDate : visible[0];
    return { page, visible, selected, displayed: options.trackingMode === 'period' ? visible : selected ? [selected] : [] };
  };
  const trackingSummary = (channel, reference, options, rows) => {
    const cfg = reference.activation.tracking;
    const total = subtotal(trackingTotals(channel, cfg, dates(options.start, options.end), rows).map((day) => day.total));
    const previous = subtotal(trackingTotals(channel, cfg, dates(options.compareStart, options.compareEnd), rows).map((day) => day.total));
    // Click targets come from planned click stages, never from SSOT session targets.
    const goal = cfg.result === 'Sessoes' ? reference.activation.metaResult : sum(reference.activation.segments.map((segment) => num(segment.resultPerShot) !== null && num(segment.shots) !== null ? segment.resultPerShot * segment.shots : null));
    const matchesPlan = options.start === options.referencePeriod.start && options.end === options.referencePeriod.end;
    return { total, previous, goal, progress: matchesPlan && num(total) !== null && goal > 0 ? total / goal : null };
  };
  const pageDates = (calendar, page = 0) => calendar.slice(Math.max(0, page) * 7, Math.max(0, page) * 7 + 7);
  const pager = (name, calendar, page) => calendar.length > 7 ? `<nav class="crm-artifact-pager" aria-label="Dias do ${name}"><button type="button" data-artifact-page="${name}" data-step="-1" ${page <= 0 ? 'disabled' : ''} aria-label="Semana anterior" title="Semana anterior">${icon('ChevronLeft')}</button><span>${page * 7 + 1}–${Math.min(page * 7 + 7, calendar.length)} de ${calendar.length} dias</span><button type="button" data-artifact-page="${name}" data-step="1" ${(page + 1) * 7 >= calendar.length ? 'disabled' : ''} aria-label="Proxima semana" title="Proxima semana">${icon('ChevronRight')}</button></nav>` : '';
  const chart = (calendar, values, label) => {
    if (!values.some((value) => num(value) !== null)) return '';
    const cumulative = values.map((_, index) => sum(values.slice(0, index + 1)));
    const maxDaily = Math.max(...values.filter((value) => num(value) !== null), 1), maxTotal = Math.max(...cumulative.filter((value) => num(value) !== null), 1);
    const x = (index) => values.length === 1 ? 325 : 60 + index * (530 / Math.max(values.length - 1, 1));
    const bars = values.map((value, index) => num(value) === null ? '' : `<rect x="${x(index) - 15}" y="${150 - value / maxDaily * 110}" width="30" height="${value / maxDaily * 110}" fill="var(--orange)" opacity=".45"><title>${dateLabel(calendar[index])}: ${fmt(value, 'money')}</title></rect>`).join('');
    const points = cumulative.map((value, index) => value === null ? '' : `${x(index)},${150 - value / maxTotal * 110}`).filter(Boolean).join(' ');
    return `<figure class="crm-artifact-chart"><svg viewBox="0 0 660 190" role="img" aria-label="${esc(label)} diaria e acumulada, com escalas independentes"><line x1="40" y1="150" x2="615" y2="150" stroke="var(--line)"/><text x="4" y="16">Dia</text><text x="540" y="16">Acumulado</text><text x="4" y="32">${fmt(maxDaily, 'money')}</text><text x="540" y="32">${fmt(maxTotal, 'money')}</text>${bars}<polyline points="${points}" fill="none" stroke="var(--orange)" stroke-width="2.5"/>${cumulative.map((value, index) => value === null ? '' : `<circle cx="${x(index)}" cy="${150 - value / maxTotal * 110}" r="3" fill="var(--orange)"><title>Acumulado ${dateLabel(calendar[index])}: ${fmt(value, 'money')}</title></circle>`).join('')}${calendar.map((date, index) => `<text x="${x(index)}" y="178" text-anchor="middle">${dateLabel(date)}</text>`).join('')}</svg><figcaption><span>${esc(label)} do dia</span><span>Linha: acumulado da pagina</span></figcaption></figure>`;
  };
  function pacing(channel, reference, options) {
    const plan = options.mode === 'plan';
    const period = plan ? options.referencePeriod : options;
    const calendar = dates(period.start, period.end), page = Math.min(options.pacingPage || 0, Math.max(0, Math.ceil(calendar.length / 7) - 1));
    const visible = pageDates(calendar, page), actual = new Map((channel.daily || []).map((day) => [day.date, day]));
    const previous = new Map((channel.ssotComparison?.daily || []).map((day) => [day.date, day]));
    const definitions = plan ? Object.keys(reference.pacing.daily).map((label) => [label, label, ['Investimento', 'Receita'].includes(label) ? 'money' : 'int']) : [['Receita', 'revenue', 'money'], ['Pedidos', 'orders', 'int'], ['Sessoes', 'sessions', 'int'], ['Conversao', 'rate', 'percent']];
    const goals = [...reference.metrics];
    const revenueGoal = goals.find((metric) => metric.key === 'revenue')?.meta, ordersGoal = goals.find((metric) => metric.key === 'orders')?.meta;
    if (ordersGoal > 0 && num(revenueGoal) !== null) goals.push({ key: 'ticket', label: 'Ticket medio', format: 'money', meta: revenueGoal / ordersGoal });
    const get = (date, field) => plan ? reference.pacing.daily[field]?.[calendar.indexOf(date)] ?? null : actual.get(date)?.[field] ?? null;
    const body = definitions.map(([label, field, format]) => `<tr><th scope="row">${label}</th>${visible.map((date) => {
      const index = calendar.indexOf(date), value = get(date, field);
      const cum = format === 'percent' ? (() => { const sessions = sum(calendar.slice(0, index + 1).map((day) => get(day, 'sessions'))), orders = sum(calendar.slice(0, index + 1).map((day) => get(day, 'orders'))); return sessions > 0 && orders !== null ? orders / sessions : null; })() : sum(calendar.slice(0, index + 1).map((day) => get(day, field)));
      const comparisonDate = options.compareStart ? shift(options.compareStart, index) : null;
      const previousValue = comparisonDate && comparisonDate <= options.compareEnd ? previous.get(comparisonDate)?.[field] ?? null : null;
      const delta = difference(value, previousValue, format);
      return `<td><strong>${fmt(value, format)}</strong><small>acum. ${fmt(cum, format)}</small>${plan || options.compareEnabled === false ? '' : `<small>Anterior ${comparisonDate ? dateLabel(comparisonDate) : ''}: ${fmt(previousValue, format)}</small>${PerformanceDelta.markup(delta)}`}</td>`;
    }).join('')}</tr>`).join('');
    const referenceLabel = `${dateLabel(options.referencePeriod.start)} a ${dateLabel(options.referencePeriod.end)}/${options.referencePeriod.end.slice(0, 4)}`;
    const table = plan || actual.size ? `${pager('ritmo', calendar, page)}<div class="table-scroll"><table class="data-table crm-artifact-daily" style="min-width:${Math.max(330, 115 + visible.length * 135)}px"><thead><tr><th>Metrica</th>${visible.map((date) => `<th>${new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}<br>${dateLabel(date)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${chart(visible, visible.map((date) => get(date, plan ? 'Receita' : 'revenue')), plan ? 'Meta de receita' : 'Receita SSOT')}` : '<p class="crm-detail-hint">O SSOT carregado nao cobre este periodo. As metas do artefato continuam disponiveis separadamente.</p>';
    return `<section class="crm-artifact-pacing" data-crm-view="pacing"><header class="crm-artifact-heading"><div><h3>Ritmo diario</h3><p class="crm-detail-hint">${plan ? `Metas do artefato: ${referenceLabel}. Nao sao resultados realizados.` : `SSOT: ${dateLabel(options.start)} a ${dateLabel(options.end)}.${options.compareEnabled === false ? '' : ` Comparacao: ${dateLabel(options.compareStart)} a ${dateLabel(options.compareEnd)}.`}`}</p></div><div class="crm-artifact-modes" role="group" aria-label="Leitura do ritmo"><button type="button" data-artifact-mode="actual" aria-pressed="${!plan}">Realizado</button><button type="button" data-artifact-mode="plan" aria-pressed="${plan}">Metas do artefato</button></div></header>${plan ? `<div class="crm-artifact-goals">${goals.map((metric) => `<div><span>${esc(metric.label)} · meta</span><strong>${metric.format === 'multiple' ? `${metric.meta.toLocaleString('pt-BR')}x` : fmt(metric.meta, metric.format)}</strong></div>`).join('')}</div>` : ''}${table}</section>`;
  }
  const trackingSourceControl = (channel, source) => channel.id === 'whatsapp-oficial' ? `<div class="crm-artifact-modes" role="group" aria-label="Fonte do acompanhamento"><button type="button" data-tracking-source="sheet" aria-pressed="${source === 'sheet'}">Planilha</button><button type="button" data-tracking-source="local" aria-pressed="${source === 'local'}">Local</button></div>` : '';
  function sheetTracking(channel, options) {
    const records = options.sheetRecords || [], calendar = dates(options.start, options.end);
    const { page, visible, selected, displayed } = trackingWindow(calendar, options), periodMode = options.trackingMode === 'period';
    const current = WhatsApp.select(records, options.start, options.end);
    const latest = records.map((record) => record.date).sort().at(-1);
    const fields = Object.keys(WhatsApp.fields), labels = ['Publico', 'Entregues', 'Aberturas', 'Cliques'], outputLabels = ['Entrega', 'Abertura', 'Clique / abertura'];
    const categories = [...new Set([...WhatsApp.categories, ...current.groups.map((group) => group.category)])];
    const loaded = records.length > 0 || options.sheetStatus === 'ready';
    const getDay = (date) => current.primary.filter((record) => record.date === date);
    const dayLabel = (date) => {
      const rows = getDay(date);
      return rows.length ? `${rows.length} linha${rows.length === 1 ? '' : 's'}` : loaded ? 'Sem registro' : options.sheetStatus === 'loading' ? 'Carregando' : 'Indisponivel';
    };
    const dayState = (date) => {
      const rows = getDay(date);
      return !rows.length ? 'empty' : fields.every((field) => WhatsApp.metric(rows, field).value !== null) ? 'complete' : 'partial';
    };
    const cell = (metric) => `<span class="crm-sheet-value">${fmt(metric?.value ?? null)}</span>${metric?.expected > 0 && metric.known < metric.expected ? `<small class="crm-sheet-missing">${metric.known}/${metric.expected} linhas com valor</small>` : ''}`;
    const body = displayed.map((date) => categories.map((category, index) => {
      const group = current.groups.find((item) => item.date === date && item.category === category);
      const values = Object.fromEntries(fields.map((field) => [field, group?.metrics[field].value ?? null]));
      return `<tr data-sheet-date="${date}" data-sheet-category="${esc(category)}"><th scope="row">${index === 0 ? dateLabel(date) : ''}</th><td class="crm-track-slot">${esc(category)}<small>${group ? `${group.count} linha${group.count === 1 ? '' : 's'} ${group.count === 1 ? 'principal' : 'principais'}` : loaded ? 'Sem registro' : 'Sem leitura'}</small></td>${fields.map((field, fieldIndex) => `<td data-column="${labels[fieldIndex]}" data-sheet-field="${field}">${cell(group?.metrics[field])}</td>`).join('')}${WhatsApp.rates(values).map((value, index) => `<td class="crm-track-derived" data-column="${outputLabels[index]}" data-tracking-output="${index}">${fmt(value, 'percent')}</td>`).join('')}</tr>`;
    }).join('')).join('');
    const dayButtons = visible.map((date) => `<button type="button" data-tracking-select="${date}" data-record-state="${dayState(date)}" aria-pressed="${!periodMode && selected === date}" aria-label="Registros de ${dateLabel(date)}"><span>${new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</span><strong>${dateLabel(date)}</strong><small>${dayLabel(date)}</small></button>`).join('');
    const detailRows = current.records.filter((record) => displayed.includes(record.date));
    const details = detailRows.length ? `<details class="crm-sheet-details"><summary>Linhas da planilha · ${detailRows.length}</summary><div class="table-scroll"><table class="data-table crm-sheet-lines"><thead><tr><th>Data</th><th>Categoria</th><th>Linha</th><th>Vinculo</th>${labels.map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${detailRows.map((record) => `<tr><td>${dateLabel(record.date)}</td><td>${esc(record.category)}</td><td>${record.sourceRow ?? '—'}</td><td>${record.linked ? `Vinculada a ${record.parentRow ?? '—'}` : 'Principal'}</td>${fields.map((field) => `<td>${fmt(record.values[field])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : '';
    const message = options.sheetStatus === 'loading' ? 'Consultando a planilha integrada.' : options.sheetStatus === 'error' ? records.length ? 'Falha na ultima consulta. Leitura anterior da planilha preservada.' : 'Planilha indisponivel nesta leitura. Nenhum lancamento local foi usado como dado da fonte.' : '';
    return `<section data-crm-view="tracking" class="crm-artifact-tracking crm-sheet-tracking" data-tracking-view="${periodMode ? 'period' : 'day'}" data-tracking-origin="sheet">
      <header class="crm-tracking-head"><div><p class="eyebrow">Planilha integrada · somente leitura</p><h3>Acompanhamento</h3><p class="crm-detail-hint">${dateLabel(options.start)} a ${dateLabel(options.end)} · WhatsApp Oficial · Marketing e Utilidade</p></div><div class="crm-tracking-actions">${trackingSourceControl(channel, 'sheet')}<a class="outline-button" href="${WhatsApp.url}" target="_blank" rel="noopener noreferrer">Abrir planilha</a></div></header>
      <div class="crm-artifact-tracking-summary"><div><span>Cliques · linhas principais</span><strong data-sheet-total>${fmt(current.metrics.Cliques.value)}</strong><small>${current.metrics.Cliques.expected && current.metrics.Cliques.known < current.metrics.Cliques.expected ? `Parcial: ${current.metrics.Cliques.known}/${current.metrics.Cliques.expected} linhas com valor` : 'Categorias somadas, sem linhas vinculadas'}</small></div><div><span>Linhas principais no periodo</span><strong>${loaded ? current.primary.length : '—'}</strong><small>${loaded ? current.records.filter((record) => record.linked).length : '—'} vinculada(s), separadas em detalhe</small></div><div><span>Ultimo registro na planilha</span><strong>${latest ? `${dateLabel(latest)}/${latest.slice(0, 4)}` : '—'}</strong><small>Data da fonte operacional, independente do SSOT</small></div></div>
      ${message ? `<p class="crm-sheet-status" role="status">${message}</p>` : ''}
      <div class="crm-tracking-toolbar"><div class="crm-artifact-modes" role="group" aria-label="Visao do acompanhamento"><button type="button" data-tracking-mode="day" aria-pressed="${!periodMode}">Dia</button><button type="button" data-tracking-mode="period" aria-pressed="${periodMode}">Periodo completo</button></div>${pager('acompanhamento', calendar, page)}</div>
      <nav class="crm-tracking-calendar" aria-label="Datas do acompanhamento">${dayButtons}</nav>
      <div class="crm-tracking-editor-head"><strong>${icon('CalendarDays')}${periodMode ? `${dateLabel(visible[0])} a ${dateLabel(visible.at(-1))}` : dateLabel(selected)}</strong><span>${periodMode ? 'Linhas principais por dia e categoria' : dayLabel(selected)}</span><span class="crm-local-badge">Planilha</span></div>
      <div class="table-scroll crm-tracking-scroll"><table class="data-table crm-tracking-table"><thead><tr><th>Dia</th><th>Categoria</th>${labels.map((label) => `<th>${label}</th>`).join('')}${outputLabels.map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${details}
      <footer class="crm-tracking-foot"><span>Contadores somados por linha, nao pessoas unicas. Linhas vinculadas separadas; campos ausentes indisponiveis.</span><span>Pedidos, receita e sessoes: SSOT</span></footer></section>`;
  }
  function tracking(channel, reference, options) {
    if (channel.id === 'whatsapp-oficial' && options.trackingSource !== 'local') return sheetTracking(channel, options);
    const cfg = reference.activation.tracking, rows = load(channel.id), calendar = dates(options.start, options.end);
    const { page, visible, selected, displayed } = trackingWindow(calendar, options), periodMode = options.trackingMode === 'period';
    const totals = trackingTotals(channel.id, cfg, calendar, rows), summary = trackingSummary(channel.id, reference, options, rows), total = summary.total;
    const body = displayed.map((date) => cfg.slots.map((slot, index) => {
      const id = rowKey(date, index), row = rows[id] || {};
      return `<tr data-tracking-id="${id}"><th scope="row">${index === 0 ? dateLabel(date) : ''}</th><td class="crm-track-slot">${esc(slot)}</td>${cfg.inputs.map((field) => `<td data-column="${esc(field)}"><input type="number" min="0" step="1" inputmode="numeric" placeholder="—" data-artifact-track="${esc(field)}" value="${num(row[field]) ?? ''}" aria-label="${esc(`${dateLabel(date)} ${slot} ${field}`)}"></td>`).join('')}${outputs(channel.id, row).map((value, index) => `<td class="crm-track-derived" data-column="${esc(cfg.outputs[index])}" data-tracking-output="${index}">${fmt(value, outputFormat(channel.id, index))}</td>`).join('')}</tr>`;
    }).join('') + `<tr class="crm-track-subtotal"><th colspan="2">Subtotal / acumulado ${dateLabel(date)}</th><td colspan="${cfg.inputs.length + cfg.outputs.length}" data-tracking-day="${date}">${fmt(totals.find((row) => row.date === date)?.total)} no dia · acum. ${fmt(subtotal(totals.filter((row) => row.date <= date).map((row) => row.total)))}</td></tr>`).join('');
    const dayButtons = visible.map((date) => `<button type="button" data-tracking-select="${date}" data-record-state="${dayCoverage(cfg, date, rows).state}" aria-pressed="${!periodMode && selected === date}" aria-label="Registros de ${dateLabel(date)}"><span>${new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</span><strong>${dateLabel(date)}</strong><small data-tracking-day-status="${date}">${esc(dayStatus(cfg, date, rows, totals.find((row) => row.date === date).total))}</small></button>`).join('');
    const coverage = selected ? dayCoverage(cfg, selected, rows) : { filled: 0, expected: 0 };
    const toolbar = `<div class="crm-tracking-toolbar"><div class="crm-artifact-modes" role="group" aria-label="Visao do acompanhamento"><button type="button" data-tracking-mode="day" aria-pressed="${!periodMode}">Dia</button><button type="button" data-tracking-mode="period" aria-pressed="${periodMode}">Periodo completo</button></div>${pager('acompanhamento', calendar, page)}</div><nav class="crm-tracking-calendar" aria-label="Datas do acompanhamento">${dayButtons}</nav>`;
    return `<section data-crm-view="tracking" class="crm-artifact-tracking" data-tracking-view="${periodMode ? 'period' : 'day'}"><header class="crm-tracking-head"><div><p class="eyebrow">Operacao local</p><h3>Acompanhamento</h3><p class="crm-detail-hint">${dateLabel(options.start)} a ${dateLabel(options.end)} · ${esc(channel.name)} · registros manuais</p></div><div class="crm-tracking-actions">${trackingSourceControl(channel, 'local')}${[['export', 'Download', 'Exportar registros'], ['import', 'Upload', 'Importar registros'], ['reset', 'Trash2', 'Limpar recorte']].map(([action, glyph, label]) => `<button type="button" class="crm-icon-button" data-artifact-action="${action}" title="${label}" aria-label="${label}">${icon(glyph)}</button>`).join('')}<input id="crm-artifact-import" type="file" accept="application/json" class="is-hidden"></div></header><div class="crm-artifact-tracking-summary"><div><span>${esc(cfg.result)} registrados · periodo</span><strong data-tracking-total>${total === null ? 'Sem lancamentos' : fmt(total)}</strong><small data-tracking-comparison ${options.compareEnabled === false ? 'hidden' : ''}>${options.compareEnabled === false ? '' : `Anterior: ${fmt(summary.previous)}`}</small></div><div><span>Plano de ${esc(cfg.result.toLowerCase())} · ${dateLabel(options.referencePeriod.start)} a ${dateLabel(options.referencePeriod.end)}</span><strong>${fmt(summary.goal)}</strong><small>Referencia, nao meta vigente</small></div><div><span>Atingimento do plano</span><strong data-tracking-progress>${fmt(summary.progress, 'percent')}</strong><small>Mesmo periodo e unidade do plano</small></div></div>${toolbar}<div class="crm-tracking-editor-head"><strong>${icon('CalendarDays')}${periodMode ? `${dateLabel(visible[0])} a ${dateLabel(visible.at(-1))}` : selected ? dateLabel(selected) : 'Sem datas'}</strong><span ${periodMode ? 'hidden' : ''} data-tracking-coverage="${selected || ''}">${coverage.filled}/${coverage.expected} campos preenchidos</span><span class="crm-local-badge">Local</span></div><p data-tracking-status role="status"></p><div class="table-scroll crm-tracking-scroll"><table class="data-table crm-tracking-table"><thead><tr><th>Dia</th><th>Disparo</th>${cfg.inputs.map((field) => `<th>${esc(field)}</th>`).join('')}${cfg.outputs.map((field) => `<th>${esc(field)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><footer class="crm-tracking-foot"><span>${channel.id === 'whatsapp-organico' ? 'Visualizacoes: Club + Membership.' : 'Cliques registrados nao equivalem a sessoes SSOT.'}</span><span>Fonte local · nao altera planilhas ou SSOT</span></footer></section>`;
  }
  function bind(root, channel, reference, options, onChange) {
    const cfg = reference.activation.tracking;
    root.querySelectorAll('[data-artifact-mode]').forEach((button) => button.onclick = () => onChange({ mode: button.dataset.artifactMode, pacingPage: 0 }));
    const change = (patch, selector) => { onChange(patch); root.querySelector(selector)?.focus({ preventScroll: true }); };
    root.querySelectorAll('[data-artifact-page]').forEach((button) => button.onclick = () => { const field = button.dataset.artifactPage === 'ritmo' ? 'pacingPage' : 'trackingPage'; change({ [field]: Math.max(0, (options[field] || 0) + Number(button.dataset.step)) }, `[data-artifact-page="${button.dataset.artifactPage}"][data-step="${button.dataset.step}"]:not(:disabled)`); });
    root.querySelectorAll('[data-tracking-select]').forEach((button) => button.onclick = () => change({ trackingDate: button.dataset.trackingSelect, trackingMode: 'day' }, `[data-tracking-select="${button.dataset.trackingSelect}"]`));
    root.querySelectorAll('[data-tracking-mode]').forEach((button) => button.onclick = () => change({ trackingMode: button.dataset.trackingMode }, `[data-tracking-mode="${button.dataset.trackingMode}"]`));
    root.querySelectorAll('[data-tracking-source]').forEach((button) => button.onclick = () => change({ trackingSource: button.dataset.trackingSource }, `[data-tracking-source="${button.dataset.trackingSource}"]`));
    if (channel.id === 'whatsapp-oficial' && options.trackingSource !== 'local') return;
    const status = (message) => { root.querySelector('[data-tracking-status]').textContent = message; };
    const save = (rows) => { try { localStorage.setItem(key(channel.id), JSON.stringify(rows)); status(''); return true; } catch { status('Nao foi possivel salvar neste navegador. Exporte os registros antes de sair.'); return false; } };
    root.querySelectorAll('[data-artifact-track]').forEach((input) => input.addEventListener('input', () => {
      if (!input.validity.valid) return;
      const id = input.closest('[data-tracking-id]').dataset.trackingId, field = input.dataset.artifactTrack, rows = load(channel.id);
      rows[id] = rows[id] || {};
      if (input.value === '') delete rows[id][field]; else rows[id][field] = Number(input.value);
      if (!save(rows)) return;
      // Update derived cells only, so typing never replaces the focused input.
      input.closest('tr').querySelectorAll('[data-tracking-output]').forEach((cell, index) => { cell.textContent = fmt(outputs(channel.id, rows[id])[index], outputFormat(channel.id, index)); });
      const totals = trackingTotals(channel.id, cfg, dates(options.start, options.end), rows), summary = trackingSummary(channel.id, reference, options, rows), total = summary.total;
      root.querySelector('[data-tracking-total]').textContent = total === null ? 'Sem lancamentos' : fmt(total);
      root.querySelector('[data-tracking-comparison]').textContent = options.compareEnabled === false ? '' : `Anterior: ${fmt(summary.previous)}`;
      root.querySelector('[data-tracking-progress]').textContent = fmt(summary.progress, 'percent');
      root.querySelectorAll('[data-tracking-day]').forEach((cell) => { const date = cell.dataset.trackingDay; cell.textContent = `${fmt(totals.find((row) => row.date === date)?.total)} no dia · acum. ${fmt(subtotal(totals.filter((row) => row.date <= date).map((row) => row.total)))}`; });
      root.querySelectorAll('[data-tracking-day-status]').forEach((cell) => { const date = cell.dataset.trackingDayStatus; cell.textContent = dayStatus(cfg, date, rows, totals.find((row) => row.date === date).total); cell.closest('button').dataset.recordState = dayCoverage(cfg, date, rows).state; });
      const coverageNode = root.querySelector('[data-tracking-coverage]');
      const coverage = dayCoverage(cfg, coverageNode.dataset.trackingCoverage, rows);
      coverageNode.textContent = `${coverage.filled}/${coverage.expected} campos preenchidos`;
    }));
    root.querySelector('[data-artifact-action="import"]').onclick = () => root.querySelector('#crm-artifact-import').click();
    root.querySelector('[data-artifact-action="reset"]').onclick = () => {
      if (!window.confirm('Limpar apenas os lancamentos locais deste canal no periodo selecionado?')) return;
      const rows = load(channel.id);
      dates(options.start, options.end).forEach((date) => cfg.slots.forEach((_, index) => delete rows[rowKey(date, index)]));
      if (save(rows)) onChange({});
    };
    root.querySelector('[data-artifact-action="export"]').onclick = () => {
      const blob = new Blob([JSON.stringify({ version: 2, channel: channel.id, rows: load(channel.id) }, null, 2)], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `crm-${channel.id}-acompanhamento.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
    root.querySelector('#crm-artifact-import').onchange = async (event) => {
      try {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 2 * 1024 * 1024) throw new Error('Arquivo muito grande.');
        const rows = validateTracking(JSON.parse(await file.text()), channel.id, cfg), existing = load(channel.id);
        for (const [id, values] of Object.entries(rows)) existing[id] = { ...existing[id], ...values };
        if (save(existing)) onChange({});
      } catch (error) { status(`Importacao recusada: ${error.message}`); }
    };
  }
  return { dates, outputs, validateTracking, trackingTotals, trackingSummary, trackingWindow, dayCoverage, dayStatus, pacing, tracking, bind, difference };
});
