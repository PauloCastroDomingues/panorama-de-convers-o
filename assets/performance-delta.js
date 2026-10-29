(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PerformanceDelta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function describe(current, previous, { rate = false, lowerIsBetter = false, neutral = false, complete = true } = {}) {
    if (!complete || !Number.isFinite(current) || !Number.isFinite(previous)) return { text: 'Sem base comparavel', tone: 'neutral', direction: 'unknown' };
    const change = current - previous;
    if (change === 0) return { text: 'Sem variacao', tone: 'neutral', direction: 'flat' };
    const direction = change > 0 ? 'up' : 'down';
    const tone = neutral || (!rate && previous === 0) ? 'neutral' : (change > 0) !== lowerIsBetter ? 'good' : 'bad';
    const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const text = rate ? `${change > 0 ? '+' : ''}${number.format(change * 100)} p.p.`
      : previous === 0 ? 'Base anterior zero' : `${change > 0 ? '+' : ''}${number.format(change / Math.abs(previous) * 100)}%`;
    return { text, tone, direction };
  }
  function markup(result) {
    const symbol = { up: '&#8593;', down: '&#8595;', flat: '=', unknown: '' }[result.direction];
    return `<span class="performance-delta ${result.tone}" data-direction="${result.direction}"><span aria-hidden="true">${symbol}</span>${result.text}</span>`;
  }
  return { describe, markup };
});
