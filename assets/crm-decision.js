(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrmDecision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const valid = value => Number.isFinite(value) && value >= 0;
  const actions = {
    sessions: 'Conferir volume de envios, cobertura e links na fonte operacional. Investigar a queda de visitas sem tratar cliques como sessoes nem atribuir vendas a disparos.',
    rate: 'Conferir mix de produtos e pedidos do canal no SSOT. O detalhamento de produto no CRM ainda nao esta disponivel. Estoque, oferta e checkout sao hipoteses a validar.',
    ticket: 'Conferir produtos e valor por pedido no SSOT. Descontos, kits e mix precisam de detalhe de itens para explicar o ticket.'
  };
  function analyze(channel, options = {}) {
    const metrics = new Map((channel.metrics || []).map(metric => [metric.key, metric]));
    const base = { status: 'limited', drivers: [], title: 'Validar cobertura antes de concluir',
      action: 'Conferir datas e cobertura SSOT deste canal. Valores conhecidos nao representam necessariamente o total do periodo.' };
    if (!options.compareEnabled) return { ...base, status: 'off', title: 'Leitura do periodo, sem comparacao', action: 'Ative a comparacao para investigar crescimento ou queda. Os valores atuais continuam disponiveis.' };
    const rows = ['sessions', 'orders', 'revenue'].map(key => metrics.get(key));
    if (rows.some(metric => !metric || metric.currentComplete !== true || metric.comparisonComplete !== true || !valid(metric.actual) || !valid(metric.comparison))) return base;
    if (options.days !== options.previousDays || !options.days) return { ...base, title: 'Periodos com duracoes diferentes', action: 'Ajustar as janelas para o mesmo numero de dias antes de interpretar a variacao de volume. Mesmo assim, conferir dias da semana e sazonalidade.' };
    const [sessions, orders, revenue] = rows;
    if (sessions.actual <= 0 || sessions.comparison <= 0 || orders.actual <= 0 || orders.comparison <= 0) return { ...base, title: 'Base sem volume para decompor a receita', action: 'Conferir sessoes e pedidos de cada periodo; taxa ou ticket sem denominador nao permitem decomposicao confiavel.' };
    const before = [sessions.comparison, orders.comparison / sessions.comparison, revenue.comparison / orders.comparison];
    const after = [sessions.actual, orders.actual / sessions.actual, revenue.actual / orders.actual];
    const effects = [0, 0, 0], product = values => values.reduce((total, value) => total * value, 1);
    // Average all six orders of substitution to allocate interactions symmetrically.
    for (const sequence of [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]]) {
      const values = [...before];
      for (const index of sequence) { const initial = product(values); values[index] = after[index]; effects[index] += (product(values) - initial) / 6; }
    }
    const drivers = ['sessions', 'rate', 'ticket'].map((key, index) => ({ key, label: ['Sessoes', 'Conversao', 'Ticket medio'][index], previous: before[index], actual: after[index], effect: effects[index], format: ['int', 'percent', 'money'][index] }));
    const ordered = [...drivers].sort((a, b) => a.effect - b.effect);
    const priority = ordered[0].effect < -.005 ? ordered[0] : ordered.at(-1);
    const delta = revenue.actual - revenue.comparison;
    const stable = Math.abs(delta) < .005 && drivers.every(driver => Math.abs(driver.effect) < .005);
    return { status: 'ready', drivers, delta, priority: priority.key, tone: delta < -.005 ? 'bad' : delta > .005 ? 'good' : 'neutral',
      title: stable ? 'Receita e fatores estaveis no recorte' : `${priority.label}: ${priority.effect < 0 ? 'maior pressao sobre a receita' : 'maior contribuicao para o crescimento'}`,
      action: stable ? 'Acompanhar o ritmo e conferir mudancas entre produtos; totais estaveis podem esconder movimentos de mix.' : actions[priority.key] };
  }
  return { analyze };
});
