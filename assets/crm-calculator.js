(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.CrmCalculator = api; api.mount(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const source = 'https://docs.google.com/spreadsheets/d/1NDwaGqsdCrOi5Qbo2PwduSveVVGc9BHqvFIvpLMHqJ0/edit';
  const channels = {
    email: {name: 'E-mail', icon: 'Mail', gid: 858609064, note: 'Taxas de referencia: medias de 2025, segundo a planilha.',
      values: {base: 50000, frequency: 4, delivery: 99.61, opening: 26.32, click: 1.67, session: 100, conversion: 2.69, ticket: 500, investment: null}},
    whatsapp: {name: 'WhatsApp', icon: 'MessageCircle', gid: 1202670752, note: 'Taxas de referencia: disparos documentados. Periodo nao especificado. Valores da tabela esquerda; nao do desenho divergente.',
      values: {base: 19372, frequency: 1, delivery: 89.05, opening: 40.95, click: 9.74, session: 100, conversion: 3.78, ticket: 535.26, investment: 20000}},
    groups: {name: 'Grupos VIP', icon: 'MessageCircle', gid: 1383956793, note: 'Taxas de referencia: janeiro, sem ano explicitado na planilha. Base sem validacao de participantes unicos entre grupos.',
      values: {base: 6772, frequency: 5, delivery: 99.5, opening: 69.09, click: 4.52, session: 100, conversion: 0.87, ticket: 500, investment: null}}
  };
  const fields = [
    {key: 'base', label: 'Base de contatos', unit: 'contatos', max: 1e9, step: 1, group: '01 / Alcance'},
    {key: 'frequency', label: 'Envios por contato', unit: '/ mes', max: 999, step: 1},
    {key: 'delivery', label: 'Taxa de entrega', unit: '%', max: 100, step: 0.01, group: '02 / Engajamento', denominator: 'dos envios'},
    {key: 'opening', label: 'Abertura / leitura', unit: '%', max: 100, step: 0.01, denominator: 'das entregas'},
    {key: 'click', label: 'Taxa de clique', unit: '%', max: 100, step: 0.01, denominator: 'das aberturas'},
    {key: 'session', label: 'Gera\u00e7\u00e3o de sess\u00e3o', unit: '%', max: 100, step: 0.01, denominator: 'dos cliques'},
    {key: 'conversion', label: 'Convers\u00e3o em pedido', unit: '%', max: 100, step: 0.01, group: '03 / Resultado comercial', denominator: 'das sess\u00f5es estimadas'},
    {key: 'ticket', label: 'Ticket m\u00e9dio', unit: 'R$', max: 1e9, step: 0.01},
    {key: 'investment', label: 'Investimento mensal', unit: 'R$', max: 1e9, step: 0.01, optional: true}
  ];
  const stages = [
    ['sent', 'Envios', null], ['delivered', 'Entregas', 'delivery'], ['opened', 'Aberturas / leituras', 'opening'],
    ['clicks', 'Cliques', 'click'], ['sessions', 'Sess\u00f5es estimadas', 'session'], ['orders', 'Pedidos estimados', 'conversion']
  ];
  const metricRows = [
    {key: 'base', label: 'Tamanho da base'},
    {key: 'frequency', label: 'Frequ\u00eancia de envios', note: 'mensal, por contato'},
    {key: 'sent', label: 'Volume de envios', formula: 'Base x frequencia'},
    {key: 'delivery', label: 'Taxa de entrega', loss: true},
    {key: 'delivered', label: 'Entregas', formula: 'Envios x taxa de entrega'},
    {key: 'opening', label: 'Taxa de abertura / leitura', loss: true},
    {key: 'opened', label: 'Aberturas / leituras', formula: 'Entregas x taxa de abertura'},
    {key: 'click', label: 'Taxa de clique', loss: true},
    {key: 'clicks', label: 'Cliques estimados', formula: 'Aberturas x taxa de clique'},
    {key: 'session', label: 'Gera\u00e7\u00e3o de sess\u00e3o', loss: true},
    {key: 'sessions', label: 'Sess\u00f5es estimadas', formula: 'Cliques x geracao de sessao'},
    {key: 'conversion', label: 'Taxa de convers\u00e3o', loss: true},
    {key: 'orders', label: 'Pedidos estimados', formula: 'Sessoes estimadas x taxa de conversao'},
    {key: 'ticket', label: 'Ticket m\u00e9dio'},
    {key: 'revenue', label: 'Receita estimada', formula: 'Pedidos estimados x ticket medio'},
    {key: 'investment', label: 'Investimento mensal'},
    {key: 'roas', label: 'ROAS estimado', formula: 'Receita / investimento'},
    {key: 'ordersPerBase', label: 'Pedidos / base', formula: 'Pedidos estimados / base x 100'}
  ];
  const formatResult = (key, value) => key === 'revenue' || key === 'ticket' || key === 'investment' ? money(value)
    : key === 'ordersPerBase' ? percent(value)
    : key === 'roas' ? (value === null ? '\u2014' : number(value, 2) + 'x')
    : number(value);
  const number = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('pt-BR', {maximumFractionDigits: digits}) : '\u2014';
  const money = value => Number.isFinite(value) ? value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : '\u2014';
  const percent = value => Number.isFinite(value) ? `${number(value, 2)}%` : '\u2014';
  const initial = key => ({...channels[key].values});
  const multiply = (a, b, scale = 1) => a === null || b === null ? null : a * b / scale;

  function calculate(values) {
    const clean = {}, errors = [];
    for (const field of fields) {
      const value = values[field.key];
      if (value === '' || value === null || value === undefined) {
        clean[field.key] = null;
        if (!field.optional) errors.push(field.key);
      } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > field.max || (field.step === 1 && !Number.isInteger(value))) {
        clean[field.key] = null; errors.push(field.key);
      } else clean[field.key] = value;
    }
    const sent = multiply(clean.base, clean.frequency);
    const delivered = multiply(sent, clean.delivery, 100);
    const opened = multiply(delivered, clean.opening, 100);
    const clicks = multiply(opened, clean.click, 100);
    const sessions = multiply(clicks, clean.session, 100);
    const orders = multiply(sessions, clean.conversion, 100);
    const revenue = multiply(orders, clean.ticket);
    const roas = clean.investment > 0 && revenue !== null ? revenue / clean.investment : null;
    const ordersPerBase = clean.base > 0 && orders !== null ? orders / clean.base * 100 : null;
    const lossRates = Object.fromEntries(stages.filter(([, , rate]) => rate).map(([, , rate]) =>
      [rate, clean[rate] === null ? null : 100 - clean[rate]]));
    return {sent, delivered, opened, clicks, sessions, orders, revenue, roas, ordersPerBase, lossRates, errors, inputs: clean};
  }

  function funnelModel(channel, result) {
    // Sequence from A2:A14 (and A15:A16 for WhatsApp), not the divergent drawing.
    const rows = [
      ['base', 'Tamanho da base', 'count'],
      ['frequency', 'Frequ\u00eancia de envios (mensal)', 'count'],
      ['sent', 'Volume de envios', 'count'],
      ['delivery', 'Taxa de entrega', 'rate'],
      ['delivered', 'Entrega', 'count'],
      ['opening', 'Taxa de abertura', 'rate'],
      ['opened', 'Aberturas', 'count'],
      ['click', 'Taxa de clique', 'rate'],
      ['sessions', 'Sess\u00f5es', 'count'],
      ['conversion', 'Taxa de convers\u00e3o', 'rate'],
      ['orders', 'Pedidos', 'count'],
      ['ticket', 'Ticket m\u00e9dio', 'money'],
      ['revenue', 'Receita', 'money']
    ];
    if (channel === 'whatsapp' || result.inputs.investment !== null) {
      rows.push(['investment', 'Investimento', 'money'], ['roas', 'ROAS', 'ratio']);
    }
    const descriptions = {
      base: 'Contatos considerados no cen\u00e1rio.',
      frequency: 'Quantidade mensal de envios por contato.',
      sent: 'Base \u00d7 frequ\u00eancia de envios.',
      delivery: 'Percentual dos envios que s\u00e3o entregues.',
      delivered: 'Volume de envios \u00d7 taxa de entrega.',
      opening: 'Percentual das entregas que gera abertura.',
      opened: 'Entregas \u00d7 taxa de abertura.',
      click: 'Percentual das aberturas que gera clique.',
      sessions: result.inputs.session === 100
        ? 'Aberturas \u00d7 taxa de clique; sess\u00f5es projetadas.'
        : result.inputs.session === null ? 'Proje\u00e7\u00e3o pendente: gera\u00e7\u00e3o de sess\u00e3o ausente.'
        : `Cliques \u00d7 ${percent(result.inputs.session)} de gera\u00e7\u00e3o de sess\u00e3o.`,
      conversion: 'Percentual das sess\u00f5es projetadas que gera pedido.',
      orders: 'Sess\u00f5es \u00d7 taxa de convers\u00e3o.',
      ticket: 'Receita m\u00e9dia prevista por pedido.',
      revenue: 'Pedidos \u00d7 ticket m\u00e9dio, com precis\u00e3o integral.',
      investment: 'Valor de investimento informado no cen\u00e1rio.',
      roas: 'Receita \u00f7 investimento. N\u00e3o representa lucro.'
    };
    return rows.map(([key, label, type]) => {
      const value = Object.hasOwn(result.inputs, key) ? result.inputs[key] : result[key];
      const formatted = !Number.isFinite(value) ? '\u2014' : type === 'money' ? money(value)
        : type === 'rate' || type === 'ratio' ? value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + (type === 'rate' ? '%' : 'x')
        : number(value);
      return {key, label, description: descriptions[key], type, value, formatted, loss: type === 'rate' ? result.lossRates[key] : null};
    });
  }

  function exportCsv(key, values) {
    const result = calculate(values);
    return '\ufeff' + [
      ['Tipo', 'SIMULACAO MENSAL - NAO REALIZADO'], ['Canal', channels[key].name],
      ['Fonte das premissas', source + '#gid=' + channels[key].gid],
      ...fields.map(field => [field.label + ' (' + field.unit + ')', result.inputs[field.key] ?? '']),
      ...stages.map(([field, label]) => [label, result[field] ?? '']),
      ['Receita estimada (R$)', result.revenue ?? ''], ['ROAS estimado (x)', result.roas ?? ''],
      ['Pedidos / base (%)', result.ordersPerBase ?? ''],
      ...stages.filter(([, , rate]) => rate).map(([, label, rate]) => ['Quebra - ' + label + ' (%)', result.lossRates[rate] ?? ''])
    ].map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  }

  function mount() {
    const root = document.querySelector('#crm-simulation-panel');
    if (!root) return;
    const storageKey = 'reise.crm.simulations.v1';
    const memoryKey = 'reise.crm.simulations.memory-open';
    const state = Object.fromEntries(Object.keys(channels).map(key => [key, initial(key)]));
    let active = 'email';
    let memoryOpen = false;
    try { memoryOpen = JSON.parse(localStorage.getItem(memoryKey)) === true; } catch { /* Default to the funnel. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      for (const key of Object.keys(channels)) {
        if (saved?.[key] && !calculate(saved[key]).errors.length) state[key] = {...calculate(saved[key]).inputs};
      }
    } catch { /* Storage is optional; the calculator also works in private sessions. */ }
    const icon = name => window.CrmIcons?.(name) || '';
    const tabs = [...document.querySelectorAll('[data-crm-view]')];
    function selectView(view, focus = false) {
      tabs.forEach(tab => { const selected = tab.dataset.crmView === view; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; if (selected && focus) tab.focus(); });
      document.querySelector('#crm-realized-panel').hidden = view !== 'realized';
      root.hidden = view !== 'simulation';
      document.querySelector('#crm-workspace').classList.toggle('is-simulating', view === 'simulation');
      document.querySelector('#crm-view-context').textContent = view === 'simulation' ? 'Proje\u00e7\u00e3o mensal / n\u00e3o realizado' : 'Resultados observados';
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectView(tab.dataset.crmView));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        selectView(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index].dataset.crmView, true);
      });
    });
    root.innerHTML = `
      <header class="sim-heading"><div><p class="eyebrow">Planejamento CRM</p><h2>Simuladores de convers\u00e3o</h2></div><span class="sim-label">PROJE\u00c7\u00c3O</span></header>
      <div class="sim-toolbar"><div class="sim-channels" role="tablist" aria-label="Canal da simulacao">
      ${Object.entries(channels).map(([key, channel]) => `<button type="button" role="tab" id="sim-tab-${key}" data-sim-channel="${key}" aria-selected="${key === active}" tabindex="${key === active ? 0 : -1}" aria-controls="sim-scenario">${icon(channel.icon)}${channel.name}</button>`).join('')}</div>
      <div class="sim-actions"><button type="button" class="sim-memory-toggle" data-sim-memory aria-expanded="false" aria-controls="sim-calculation-memory">${icon('ChevronRight')}<span>Mem\u00f3ria de c\u00e1lculo</span></button><button type="button" class="icon-command" data-sim-export title="Exportar simulacao CSV" aria-label="Exportar simulacao CSV" data-tooltip="Exportar CSV">${icon('Download')}</button><button type="button" class="icon-command" data-sim-reset title="Restaurar referencia deste canal" aria-label="Restaurar referencia deste canal" data-tooltip="Restaurar referencia"><img src="assets/icons/refresh-cw.svg" alt="" width="18" height="18"></button></div></div>
      <div id="sim-scenario" role="tabpanel" aria-labelledby="sim-tab-email" class="sim-layout">
        <div class="sim-overview"><div class="sim-result-heading"><h3>Resultado estimado <span>/ m\u00eas</span></h3><span id="sim-model-status" role="status"></span></div><div class="sim-kpis" aria-live="polite" aria-atomic="true"></div></div>
        <form id="sim-calculation-memory" class="sim-inputs" novalidate><div class="sim-input-heading"><h3>Mem\u00f3ria de c\u00e1lculo</h3><span id="sim-custom-status">Refer\u00eancia</span></div><div id="sim-fields"></div></form>
        <div class="sim-results">
          <div class="sim-funnel-heading"><h3>Da base \u00e0 receita</h3><span>Proje\u00e7\u00e3o mensal</span></div>
          <ol class="sim-funnel" aria-label="Etapas projetadas; desenho esquematico, sem escala"></ol>
          <p class="sim-assumption" id="sim-assumption"></p>
          <p class="sim-source-warning" id="sim-source-warning" hidden>WhatsApp: valores da tabela de c\u00e1lculo. O desenho da planilha diverge dessa tabela.</p>
          <details class="sim-method"><summary>Premissas e origem dos c\u00e1lculos</summary><div id="sim-method-content"></div></details>
        </div>
      </div><p class="sr-only" id="sim-feedback" role="status"></p>`;
    const fieldRoot = root.querySelector('#sim-fields');
    function renderMemoryVisibility() {
      root.querySelector('#sim-calculation-memory').hidden = !memoryOpen;
      root.querySelector('.sim-layout').classList.toggle('is-memory-collapsed', !memoryOpen);
      const toggle = root.querySelector('[data-sim-memory]');
      toggle.setAttribute('aria-expanded', String(memoryOpen));
      toggle.title = memoryOpen ? 'Recolher memoria de calculo' : 'Abrir memoria de calculo';
      toggle.innerHTML = `${icon(memoryOpen ? 'ChevronLeft' : 'ChevronRight')}<span>Mem\u00f3ria de c\u00e1lculo</span>`;
    }
    root.querySelector('[data-sim-memory]').addEventListener('click', () => {
      memoryOpen = !memoryOpen;
      renderMemoryVisibility();
      try { localStorage.setItem(memoryKey, JSON.stringify(memoryOpen)); } catch { /* Disclosure also works without storage. */ }
    });
    renderMemoryVisibility();
    function renderFields() {
      const groups = [];
      for (const row of metricRows) {
        const field = fields.find(field => field.key === row.key);
        if (field?.group) groups.push({ title: field.group, entries: [] });
        if (field) groups.at(-1).entries.push({ row, field, results: [] });
        else groups.at(-1).entries.at(-1).results.push(row);
      }
      fieldRoot.innerHTML = groups.map(group => `<fieldset class="sim-input-group"><legend>${group.title}</legend><div class="sim-field-grid">${group.entries.map(({ row, field, results }) => `
        <div class="sim-field">
          <div class="sim-premise" data-metric="${row.key}">
            <div class="sim-field-title"><label for="sim-${field.key}">${row.label}</label><small id="sim-${field.key}-context">${row.note || field.denominator || (field.optional ? 'opcional' : '')}</small></div>
            <div class="sim-input-wrap"><input id="sim-${field.key}" name="${field.key}" type="number" inputmode="${field.step === 1 ? 'numeric' : 'decimal'}" min="0" max="${field.max}" step="${field.step}" ${field.optional ? '' : 'required'} value="${state[active][field.key] ?? ''}" placeholder="${field.optional ? 'Opcional' : ''}" aria-describedby="sim-${field.key}-context sim-${field.key}-error"><span>${field.unit}</span></div>
            <small class="sim-field-error" id="sim-${field.key}-error" hidden></small>
          </div>
          ${results.map(result => `<div class="sim-derived" data-metric="${result.key}"><span id="sim-label-${result.key}">${result.label}</span><output data-calculated="${result.key}" aria-labelledby="sim-label-${result.key}" title="${result.formula}"></output></div>`).join('')}
          ${row.loss ? `<small class="sim-loss-note">Quebra <output data-table-loss="${row.key}" aria-label="Quebra de ${row.label}"></output></small>` : ''}
        </div>`).join('')}</div></fieldset>`).join('');
      root.querySelector('#sim-scenario').setAttribute('aria-labelledby', 'sim-tab-' + active);
      const channel = channels[active];
      root.querySelector('#sim-source-warning').hidden = active !== 'whatsapp';
      root.querySelector('#sim-method-content').innerHTML = `<p>${channel.note}</p><p>Premissas de referencia sem sincronizacao com a planilha. O cenario nao altera metas, filtros ou resultados do SSOT.</p><p>Envios = base x frequencia. Entregas = envios x taxa de entrega. Aberturas = entregas x taxa de abertura. Cliques = aberturas x taxa de clique. Sessoes estimadas = cliques x geracao de sessao. Pedidos = sessoes estimadas x conversao. Receita = pedidos x ticket medio. ROAS = receita / investimento; nao representa lucro.</p><p>Quebra = 100% menos a taxa de passagem da etapa. Pedidos / base = pedidos estimados / contatos; nao representa compradores unicos e pode superar 100% com envios recorrentes. Denominadores zerados ou ausentes nao geram uma taxa.</p><p>O modelo mantem as taxas constantes ao variar a frequencia. Nao desconta saturacao, sobreposicao de contatos, cancelamentos ou custos nao informados. Pedidos fracionarios representam expectativa; os calculos preservam a precisao.</p><a href="${source}#gid=${channel.gid}" target="_blank" rel="noopener noreferrer">Planilha de referencia</a>`;
      update();
    }
    function update() {
      const result = calculate(state[active]), baseline = calculate(initial(active));
      root.querySelectorAll('[data-calculated]').forEach(output => {
        output.textContent = formatResult(output.dataset.calculated, result[output.dataset.calculated]);
      });
      root.querySelectorAll('[data-table-loss]').forEach(output => {
        output.textContent = percent(result.lossRates[output.dataset.tableLoss]);
      });
      const custom = fields.some(field => state[active][field.key] !== channels[active].values[field.key]);
      root.querySelector('#sim-custom-status').textContent = custom ? 'Personalizado' : 'Refer\u00eancia';
      root.querySelector('#sim-model-status').textContent = result.errors.length ? 'Premissas incompletas' : 'Cen\u00e1rio calculado';
      root.querySelector('#sim-model-status').className = result.errors.length ? 'warn' : '';
      for (const field of fields) {
        const input = root.querySelector('#sim-' + field.key), error = root.querySelector('#sim-' + field.key + '-error');
        const invalid = result.errors.includes(field.key);
        input.setAttribute('aria-invalid', String(invalid)); error.hidden = !invalid;
        error.textContent = invalid ? (state[active][field.key] === null ? 'Informe uma premissa.' : `Use ${field.step === 1 ? 'um inteiro' : 'um valor'} entre 0 e ${number(field.max)}.`) : '';
      }
      const delta = result.revenue !== null && baseline.revenue > 0 ? (result.revenue / baseline.revenue - 1) * 100 : null;
      root.querySelector('.sim-kpis').innerHTML = [
        ['Receita estimada', money(result.revenue), delta === null ? 'Premissas pendentes' : `${delta > 0 ? '+' : ''}${percent(delta)} vs. refer\u00eancia`, 'revenue'],
        ['Pedidos estimados', number(result.orders), `Pedidos / base: ${percent(result.ordersPerBase)}`, 'orders'],
        ['Sess\u00f5es estimadas', number(result.sessions), 'Proje\u00e7\u00e3o, n\u00e3o SSOT', 'sessions'],
        ['ROAS estimado', result.roas === null ? '\u2014' : `${number(result.roas, 2)}x`, result.roas === null ? 'Requer investimento > 0' : 'Receita / investimento', 'roas']
      ].map(([label, value, note, key]) => `<div class="sim-kpi" data-result="${key}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
      root.querySelector('.sim-funnel').innerHTML = funnelModel(active, result).map(({key, label, description, type, value, formatted, loss}, index) => `<li data-stage="${key}" style="--stage-width:${100 - index * 3.5}%;--stage-opacity:${.08 + index * .014}" class="${type === 'rate' ? 'sim-rate-stage' : ''}"><div class="sim-stage-caption"><span class="sim-stage-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div class="sim-stage-label"><span>${label}</span><small class="sim-stage-description">${description}</small>${type === 'rate' ? `<small data-loss="${key}" title="100% menos a taxa desta etapa">Quebra: ${percent(loss)}</small>` : ''}</div></div><div class="sim-stage-bar"><div class="sim-stage-shape" aria-hidden="true"></div><strong${key === 'orders' ? ` title="Expectativa sem arredondamento: ${number(value, 8)}. Receita calculada com precisao integral."` : ''}>${formatted}</strong></div></li>`).join('');
      root.querySelector('#sim-assumption').textContent = result.inputs.session === null ? 'Gera\u00e7\u00e3o de sess\u00e3o n\u00e3o informada. Resultado comercial indispon\u00edvel.' : result.inputs.session === 100 ? 'Hip\u00f3tese da refer\u00eancia: 1 clique = 1 sess\u00e3o. N\u00e3o representa sess\u00f5es medidas.' : `Hip\u00f3tese do cen\u00e1rio: ${percent(result.inputs.session)} dos cliques geram sess\u00e3o. N\u00e3o representa sess\u00f5es medidas.`;
      root.querySelector('[data-sim-export]').disabled = result.errors.length > 0;
    }
    const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* No remote persistence. */ } };
    root.querySelector('form').addEventListener('submit', event => event.preventDefault());
    root.querySelector('form').addEventListener('input', event => {
      if (!fields.some(field => field.key === event.target.name)) return;
      state[active][event.target.name] = event.target.value === '' ? null : event.target.valueAsNumber;
      update(); save();
    });
    function selectChannel(key, focus = false) {
      active = key;
      root.querySelectorAll('[data-sim-channel]').forEach(tab => { const selected = tab.dataset.simChannel === key; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; if (selected && focus) tab.focus(); });
      renderFields();
    }
    root.querySelectorAll('[data-sim-channel]').forEach((tab, index) => {
      tab.addEventListener('click', () => selectChannel(tab.dataset.simChannel));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const keys = Object.keys(channels);
        const position = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
        selectChannel(keys[position], true);
      });
    });
    root.querySelector('[data-sim-reset]').addEventListener('click', () => {
      state[active] = initial(active); save(); renderFields();
      root.querySelector('#sim-feedback').textContent = `Referencia de ${channels[active].name} restaurada.`;
    });
    root.querySelector('[data-sim-export]').addEventListener('click', () => {
      if (calculate(state[active]).errors.length) return;
      const url = URL.createObjectURL(new Blob([exportCsv(active, state[active])], {type: 'text/csv;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = `reise-simulacao-${active}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    renderFields();
    if (new URLSearchParams(location.search).get('crmView') === 'simulation') selectView('simulation');
  }
  return {calculate, initial, exportCsv, funnelModel, mount};
});
