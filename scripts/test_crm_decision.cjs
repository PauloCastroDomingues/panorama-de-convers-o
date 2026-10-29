const assert = require('node:assert/strict');
const { analyze } = require('../assets/crm-decision.js');
const channel = (before, after) => ({ metrics: ['sessions', 'orders', 'revenue'].map((key, i) => ({ key, actual: after[i], comparison: before[i], currentComplete: true, comparisonComplete: true })) });
const options = { compareEnabled: true, days: 7, previousDays: 7 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
for (const [before, after, priority] of [
  [[1000, 20, 2000], [500, 10, 1000], 'sessions'],
  [[1000, 20, 2000], [1000, 10, 1000], 'rate'],
  [[1000, 20, 2000], [1000, 20, 1000], 'ticket'],
  [[1000, 20, 2000], [2000, 40, 4000], 'sessions']
]) { const result = analyze(channel(before, after), options); assert.equal(result.priority, priority); close(result.drivers.reduce((sum, driver) => sum + driver.effect, 0), result.delta); }
for (let i = 1; i < 200; i++) {
  const source = channel([100+i, 10+i, 600+i*13], [200+i, 8+i, 500+i*17]);
  const copy = JSON.stringify(source), result = analyze(source, options);
  close(result.drivers.reduce((sum, driver) => sum+driver.effect, 0), result.delta);
  assert.equal(JSON.stringify(source), copy);
}
const source = channel([1000, 20, 2000], [500, 10, 1000]);
assert.equal(analyze(source, { ...options, compareEnabled: false }).status, 'off');
assert.equal(analyze(source, { ...options, previousDays: 8 }).status, 'limited');
for (const field of ['currentComplete', 'comparisonComplete']) {
  const bad = structuredClone(source); bad.metrics[0][field] = false;
  assert.equal(analyze(bad, options).status, 'limited');
}
for (const value of [null, undefined, NaN, -1]) {
  const bad = structuredClone(source); bad.metrics[0].actual = value;
  assert.equal(analyze(bad, options).status, 'limited');
}
assert.equal(analyze(channel([100, 0, 0], [100, 1, 50]), options).status, 'limited');
assert.match(analyze(channel([100, 1, 50], [100, 1, 50]), options).title, /estaveis/);
console.log('CRM decision: decomposition, coverage, zero, duration, comparison and immutability passed');
