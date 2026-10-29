(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./performance-delta.js') : root.PerformanceDelta);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrmFunnel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Delta) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const valid = value => Number.isFinite(value) && value >= 0;
  const count = value => valid(value) ? new Intl.NumberFormat('pt-BR').format(value) : 'Sem coleta';
  const percent = value => valid(value) ? new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : 'Sem base valida';
  const date = value => value ? value.split('-').reverse().join('/') : '';
  const ratio = (a, b) => valid(a) && b > 0 && a <= b ? a / b : null;

  function operational(channel, previous = false) {
    if (channel.rd) {
      const data = previous ? channel.rd.comparison : channel.rd.current;
      if (!data?.records.length) return [];
      const trusted = Boolean(data.consolidated) && !data.countIssues;
      return [{ name: 'Campanhas RD Station', shots: data.records.length,
        note: 'Contadores recebidos por campanha; nao sao pessoas unicas entre envios. Taxas dependem da validacao da origem.',
        stages: [['Selecionados', 'selected'], ['Entregues', 'delivered'], ['Aberturas', 'opened'], ['Cliques', 'clicked']]
          .map(([label, field]) => ({ label, value: data.receivedTotals[field], complete: trusted, ratesAllowed: trusted })) }];
    }
    if (channel.sendflow) {
      const data = previous ? channel.sendflow.comparison : channel.sendflow.activity;
      if (!data?.available) return [];
      return [{ name: 'Campanha SendFlow', shots: data.actions,
        note: 'Recibos acumulados nos envios do recorte. Sem vinculo validado entre cliques, mensagens e vendas.',
        stages: [['Destinatarios somados', 'recipients'], ['Entregues', 'delivered'], ['Leituras acumuladas', 'read']]
          .map(([label, field]) => ({ label, value: data[field], complete: data.complete && !data.inconsistentReceipts, ratesAllowed: false })) }];
    }
    const activation = previous ? channel.activationComparison : channel.activation;
    return (activation?.segments || []).map(segment => ({ ...segment,
      note: 'Registros da planilha de WhatsApp Oficial no periodo selecionado.' }));
  }

  function model(channel, reference, options) {
    const plan = options.activationMode === 'plan';
    const segments = plan ? reference.activation.segments : operational(channel);
    const previous = plan ? [] : operational(channel, true);
    const metrics = new Map((plan ? reference.metrics : channel.metrics).map(metric => [metric.key, metric]));
    return { plan, segments: segments.map(segment => ({ ...segment,
      stages: segment.stages.map((stage, index) => {
        // The original Club plan measures views against members, not deliveries.
        const denominator = plan && channel.id === 'whatsapp-organico' && index === 2 ? segment.stages[0] : segment.stages[index - 1];
        const comparable = previous.find(item => item.name === segment.name)?.stages.find(item => item.label === stage.label);
        const rate = plan ? stage.rate ?? null : stage.ratesAllowed === false || stage.complete === false || denominator?.complete === false ? null : ratio(stage.value, denominator?.value);
        return { ...stage, rate, denominator: denominator?.label, previous: comparable?.value,
          comparisonComplete: comparable?.complete !== false && stage.complete !== false };
      }) })),
      commercial: ['sessions', 'orders'].map(key => ({ key, ...metrics.get(key), value: metrics.get(key)?.[plan ? 'meta' : 'actual'] ?? null })),
      rate: plan ? ratio(metrics.get('orders')?.meta, metrics.get('sessions')?.meta) : metrics.get('rate')?.actual ?? null };
  }

  function graphic(stages, label) {
    // This is a stage diagram, not a quantitative area chart.
    const step = 60 / stages.length;
    return `<div class="crm-sliced-funnel" role="group" aria-label="${esc(label)}. Diagrama de etapas sem escala de volume.">${stages.map((stage, index) => {
      const top = 100 - index * step, bottom = top - step;
      return `<div class="crm-funnel-band" data-funnel-band="${esc(stage.label)}" style="--band-inset:${(100 - bottom) / 2}%;--band-opacity:${.12 + index * .04}">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${(100-top)/2},1 ${(100+top)/2},1 ${(100+bottom)/2},99 ${(100-bottom)/2},99"/></svg>
        <span>${esc(stage.label)}</span><strong>${count(stage.value)}</strong>${stage.caption || ''}
      </div>`;
    }).join('')}</div>`;
  }

  function render(channel, reference, options) {
    const data = model(channel, reference, options), { plan } = data;
    const window = plan ? options.referencePeriod : options;
    const comparison = metric => !plan && options.compareEnabled !== false
      ? `<small class="funnel-previous">Anterior: ${count(metric.previous)}</small>${Delta.markup(Delta.describe(metric.value, metric.previous, { complete: metric.comparisonComplete }))}` : '';
    const segments = data.segments.map(segment => `<section class="crm-step-column" aria-label="${esc(segment.name)}">
      <header><h4>${esc(segment.name)}</h4><span>${valid(segment.shots) ? `${count(segment.shots)} ${plan ? 'disparos previstos' : 'envios registrados'}` : ''}</span></header>
      <p class="crm-detail-hint">${plan ? 'Planejado por disparo' : 'Volumes observados no recorte'}</p>
      ${graphic(segment.stages.map(stage => ({ ...stage, caption: `<small>${stage.denominator ? stage.rate === null ? 'Taxa nao validada' : `${percent(stage.rate)} de ${esc(stage.denominator.toLowerCase())}` : 'Base de entrada'}</small>${!plan && options.compareEnabled !== false ? Delta.markup(Delta.describe(stage.value, stage.previous, { complete: stage.comparisonComplete })) : ''}` })), `Funil de ${segment.name}`)}
      <details class="crm-stage-details"><summary>Detalhes e bases das etapas</summary><ol class="crm-step-list">${segment.stages.map((stage, index) => `<li class="crm-funnel-step" data-funnel-stage="${esc(stage.label)}">
        <span class="crm-step-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <div class="crm-step-title"><span>${esc(stage.label)}</span>${stage.denominator ? `<small>${stage.rate === null ? 'Taxa nao validada' : `${percent(stage.rate)} de ${esc(stage.denominator.toLowerCase())}`}</small>` : '<small>Base de entrada</small>'}</div>
        <div class="crm-step-value"><strong>${count(stage.value)}</strong>${comparison(stage)}</div>
      </li>`).join('')}</ol></details>
      ${plan && valid(segment.resultPerShot) && valid(segment.shots) ? `<p class="crm-detail-hint">${count(segment.resultPerShot * segment.shots)} cliques previstos no periodo.</p>` : ''}
      <p class="crm-detail-hint">${esc(plan ? segment.source || '' : segment.note)}</p>
    </section>`).join('');
    const commercial = data.commercial.map((metric, index) => `<div class="crm-funnel-step crm-commercial-step" data-funnel-commercial="${metric.key}">
      <span class="crm-step-index" aria-hidden="true">${index + 1}</span><div class="crm-step-title"><span>${metric.key === 'sessions' ? 'Sessoes' : 'Pedidos'}</span>
      <small>${metric.key === 'orders' ? `${percent(data.rate)} de conversao` : plan ? 'Meta do canal' : metric.currentComplete === false ? 'SSOT: cobertura parcial' : 'SSOT: total do canal'}</small></div>
      <div class="crm-step-value"><strong>${valid(metric.value) ? count(metric.value) : 'Sem cobertura'}</strong>${comparison({ value: metric.value, previous: metric.comparison, comparisonComplete: metric.currentComplete !== false && metric.comparisonComplete !== false })}</div></div>`).join('');
    const combined = plan ? reference.activation.combined : null;
    const combinedHtml = combined ? `<dl class="crm-funnel-plan-bridge"><div><dt>${esc(combined.label)}</dt><dd>${count(combined.value)}</dd></div><div><dt>${esc(combined.nextLabel)} · referencia</dt><dd>${count(combined.nextValue)} <small>${percent(combined.rate)} das visualizacoes</small></dd></div></dl>` : '';
    return `<section data-crm-view="activation" class="crm-artifact-activation" data-activation-mode="${plan ? 'plan' : 'actual'}">
      <header class="crm-artifact-heading"><div><h3>Da ativacao ao pedido</h3><p class="crm-detail-hint">${plan ? 'Plano de referencia' : 'Realizado'} · ${date(window.start)} a ${date(window.end)}</p></div>
      <div class="crm-artifact-modes" role="group" aria-label="Leitura do funil"><button type="button" data-activation-mode="actual" aria-pressed="${!plan}">Realizado</button><button type="button" data-activation-mode="plan" aria-pressed="${plan}">Plano de referencia</button></div></header>
      ${segments ? `<div class="crm-step-columns">${segments}</div>` : '<p class="crm-funnel-gap">A fonte operacional nao tem registros carregados neste recorte. O resultado comercial abaixo permanece independente.</p>'}
      ${combinedHtml}
      <div class="crm-funnel-boundary"><div><h4>${plan ? 'Metas comerciais' : 'Resultado comercial'} · ${esc(channel.name)}</h4><p>${plan ? 'Metas do canal inteiro; cliques nao equivalem a sessoes.' : 'SSOT do canal inteiro. Sem atribuicao por tipo de disparo; cliques nao equivalem a sessoes.'}</p></div><span class="status-pill">${plan ? 'Plano' : 'SSOT'}</span></div>
      <div class="crm-commercial-funnel">${graphic(data.commercial.map(metric => ({ label: metric.key === 'sessions' ? 'Sessoes' : 'Pedidos', value: metric.value, caption: `<small>${metric.key === 'orders' ? `${percent(data.rate)} de conversao` : plan ? 'Meta do canal' : 'SSOT do canal'}</small>${!plan && options.compareEnabled !== false ? Delta.markup(Delta.describe(metric.value, metric.comparison, { complete: metric.currentComplete !== false && metric.comparisonComplete !== false })) : ''}` })), 'Funil comercial do canal')}<details class="crm-stage-details"><summary>Detalhes e bases comerciais</summary><div class="crm-commercial-steps">${commercial}</div></details></div>
    </section>`;
  }
  return { model, render, graphic };
});
