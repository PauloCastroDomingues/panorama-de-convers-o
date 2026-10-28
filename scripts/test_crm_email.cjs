const assert = require('node:assert/strict');
const email = require('../assets/crm-email.js');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

// Read-only reference: JANEIRO!H2:N2, not a live RD extraction.
const january = email.activation({ selected: 33577, delivered: 33267, opened: 9027, clicked: 104 });
close(january.deliveryRate, 0.9907674896506538);
close(january.openRate, 0.27134998647308145);
close(january.clickToOpenRate, 0.01152099257782209);
assert.notEqual(january.clickToOpenRate, 104 / 33267, 'CTOR is not clicks / delivered');

// OUTUBRO!H2:N8: six individual sends and the separately calculated subtotal.
const october = [
  [17832, 17516, 7954, 75], [22110, 21355, 7901, 59],
  [39831, 38700, 15566, 95], [25009, 24883, 3526, 44],
  [13417, 13369, 11549, 28], [39742, 38457, 12300, 83],
].map(([selected, delivered, opened, clicked]) => ({ selected, delivered, opened, clicked }));
const saved = JSON.stringify(october);
const week = email.aggregateActivation(october);
assert.equal(JSON.stringify(october), saved, 'Reference data are not mutated');
assert.deepEqual([week.selected, week.delivered, week.opened, week.clicked], [157941, 154280, 58796, 384]);
close(week.deliveryRate, 0.9768204582723928);
close(week.openRate, 0.3810992999740731);
close(week.clickToOpenRate, 0.0065310565344581266);
assert.notEqual(week.openRate, october.map((row) => email.activation(row).openRate).reduce((a, b) => a + b) / october.length);
assert.equal(email.activation({ selected: 100, delivered: 100, opened: 0, clicked: 0 }).openRate, 0);
assert.equal(email.activation({ selected: 100, delivered: 100, opened: 0, clicked: 0 }).clickToOpenRate, null);
assert.equal(email.activation({ selected: 100, delivered: 100, opened: 20, clicked: 0 }).clickToOpenRate, 0);
assert.equal(email.activation({ selected: 100, delivered: null, opened: 20, clicked: 2 }).openRate, null);
assert.equal(email.activation({ selected: '100', delivered: 90 }).deliveryRate, null, 'Normalize raw API values explicitly before calculation');
const incomplete = email.aggregateActivation([october[0], { ...october[1], opened: null }]);
assert.equal(incomplete.opened, null);
assert.equal(incomplete.openRate, null);
assert.equal(incomplete.clickToOpenRate, null);
assert.equal(incomplete.coverage.opened.known, 1);
assert.equal(email.aggregateActivation([]).selected, null);
const invalid = email.activation({ selected: 100, delivered: 90, opened: 95, clicked: 2 });
assert.equal(invalid.opened, 95, 'Inconsistencies preserve raw counts');
assert.equal(invalid.openRate, null);
assert.ok(invalid.issues.includes('opened_above_delivered'));

// MEDIANAS!B2:L4. These are reference values, not verified SSOT data.
const reference = [
  [980538, 944696, 344331, 3429, 3091, 93],
  [1166067, 1148475, 496045, 2727, 1000, 110],
  [1437524, 1388541, 556878, 4438, 3200, 71],
].map(([selected, delivered, opened, clicked, sessions, orders]) => email.calculate(
  { selected, delivered, opened, clicked },
  { sessions, orders, revenue: null, expectedDays: 1, sessionsKnownDays: 1, ordersKnownDays: 1, revenueKnownDays: 0, complete: true },
  { sessionScopeMatched: true },
));
const benchmark = email.benchmark(reference);
close(benchmark.deliveryRate.value, 0.9659254384622448);
close(benchmark.openRate.value, 0.40105261565917033);
close(benchmark.clickToOpenRate.value, 0.007969429569851924);
close(benchmark.sessionRate.value, 0.7210455159981974);
close(benchmark.conversionRate.value, 0.03008735037204788);
assert.equal(benchmark.sessionRate.validPeriods, 3);
assert.equal(email.median([0, null, 2, 4]), 2);
assert.equal(email.median([0, 2]), 1);
assert.equal(email.median([]), null);
assert.equal(email.benchmark([{ openRate: 0 }, {}]).openRate.validPeriods, 1);
assert.equal(email.median([268, 152, 187, 319, 127]), 187, 'Media de Clique!B8 uses a median');

const commercial = { sessions: 300, orders: 3, revenue: 900, expectedDays: 3, sessionsKnownDays: 3, ordersKnownDays: 3, revenueKnownDays: 3, complete: true };
assert.equal(email.calculate(october[0], commercial).sessionRate, null, 'Matching calendar dates alone does not prove session/click scope');
assert.equal(email.calculate(october[0], commercial, { sessionScopeMatched: true }).sessionRate, 4, 'Session/click is not capped at 100 percent');
assert.equal(email.calculate(october[0], commercial).conversionRate, .01);
assert.equal(email.calculate(october[0], commercial).averageTicket, 300);
const partial = email.calculate(october[0], { ...commercial, complete: false, sessionsKnownDays: 2 }, { sessionScopeMatched: true });
assert.equal(partial.sessionRate, null);
assert.equal(partial.conversionRate, null);
assert.equal(partial.averageTicket, 300, 'Ticket depends on orders and revenue, not sessions');
assert.equal(email.calculate(october[0]).conversionRate, null);
const compared = email.compareRates(.03, .02);
close(compared.percentagePoints, 1);
close(compared.relativeChange, .5);
assert.equal(email.compareRates(.02, 0).relativeChange, null);
assert.equal(email.compareRates(0, .02).relativeChange, -1);
assert.equal(email.compareRates(null, .02).percentagePoints, null);
console.log('CRM E-mail: formulas, weighted aggregation, medians, coverage and SSOT scope passed.');
