const assert = require('node:assert/strict');
const {calculate, initial, exportCsv, funnelModel} = require('../assets/crm-calculator.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
near(calculate(initial('email')).revenue, 11777.62103896);
near(calculate(initial('whatsapp')).revenue, 13921.237308529502);
near(calculate(initial('groups')).revenue, 4576.704988350599);
near(calculate(initial('whatsapp')).roas, 0.6960618654264751);
const base = initial('email');
const expected = {
  email: [200000, 199220, 52434.704, 875.6595568, 23.55524207792],
  whatsapp: [19372, 17250.766, 7064.188677, 688.0519771398, 26.008364735884435],
  groups: [33860, 33690.7, 23276.90463, 1052.116089276, 9.153409976701198]
};
for (const [channel, values] of Object.entries(expected)) {
  const input = initial(channel), result = calculate(input);
  ['sent', 'delivered', 'opened', 'sessions', 'orders'].forEach((key, i) => near(result[key], values[i]));
  near(result.clicks, result.sessions);
  near(result.ordersPerBase, result.orders / input.base * 100);
  for (const rate of ['delivery', 'opening', 'click', 'session', 'conversion']) {
    near(result.lossRates[rate], 100 - input[rate]);
    assert.equal(calculate({...input, [rate]: null}).lossRates[rate], null);
    assert.equal(calculate({...input, [rate]: 101}).lossRates[rate], null);
    assert.equal(calculate({...input, [rate]: 0}).lossRates[rate], 100);
    assert.equal(calculate({...input, [rate]: 100}).lossRates[rate], 0);
  }
}
near(calculate(initial('whatsapp')).ordersPerBase, 0.134257509477);
assert.equal(calculate({...base, base: 0}).ordersPerBase, null);
assert.equal(calculate({...base, conversion: null}).ordersPerBase, null);
assert.equal(calculate({...base, conversion: 0}).ordersPerBase, 0);
assert.equal(calculate({...base, investment: 0}).roas, null);
near(calculate({...base, investment: 2000}).roas, calculate(base).revenue / 2000);
near(calculate({...base, ticket: 1000}).revenue, calculate(base).revenue * 2);
near(calculate({...base, delivery: 50}).delivered, 100000);
const half = calculate({...base, session: 50});
near(half.clicks, calculate(base).clicks);
near(half.sessions, calculate(base).sessions / 2);
near(half.revenue, calculate(base).revenue / 2);
near(calculate({...base, frequency: 8}).revenue, calculate(base).revenue * 2);
assert.equal(calculate({...base, session: null}).revenue, null);
assert.equal(calculate({...base, session: null}).clicks, calculate(base).clicks);
assert.equal(calculate({...base, base: 0}).revenue, 0);
assert.equal(calculate({...base, conversion: 0}).orders, 0);
assert.equal(calculate({...base, investment: 0}).roas, null);
assert.equal(calculate({...base, investment: null}).revenue, calculate(base).revenue);
for (const value of [-1, 101, Infinity, NaN, '50']) assert.ok(calculate({...base, conversion: value}).errors.includes('conversion'));
assert.ok(calculate({...base, frequency: 1.5}).errors.includes('frequency'));
assert.equal(calculate({...base, ticket: ''}).revenue, null);
assert.ok(exportCsv('email', base).includes('SIMULACAO MENSAL - NAO REALIZADO'));
assert.ok(exportCsv('email', base).includes('Quebra - Entregas (%)'));
assert.ok(exportCsv('whatsapp', initial('whatsapp')).includes('Pedidos / base (%)'));
assert.ok(exportCsv('email', {...base, session: null}).includes('"Sess\u00f5es estimadas";""'));
const clone = initial('email'); clone.base = 1;
assert.equal(initial('email').base, 50000);
const sourceOrder = ['base','frequency','sent','delivery','delivered','opening','opened','click','sessions','conversion','orders','ticket','revenue'];
for (const channel of ['email', 'whatsapp', 'groups']) {
  const rows = funnelModel(channel, calculate(initial(channel)));
  assert.ok(rows.every(row => typeof row.description === 'string' && row.description.length > 10));
  assert.deepEqual(rows.map(row => row.key), channel === 'whatsapp' ? [...sourceOrder, 'investment', 'roas'] : sourceOrder);
  assert.equal(rows.find(row => row.key === 'orders').formatted, {email:'24',whatsapp:'26',groups:'9'}[channel]);
  assert.equal(rows.find(row => row.key === 'sessions').formatted, {email:'876',whatsapp:'688',groups:'1.052'}[channel]);
  assert.equal(rows.find(row => row.key === 'revenue').formatted.replace(/\s/g, ''), {email:'R$11.777,62',whatsapp:'R$13.921,24',groups:'R$4.576,70'}[channel]);
}
assert.equal(funnelModel('whatsapp', calculate(initial('whatsapp'))).find(row => row.key === 'click').formatted, '9,74%');
assert.equal(funnelModel('email', calculate({...base, conversion:null})).find(row => row.key === 'orders').formatted, '\u2014');
assert.equal(funnelModel('email', calculate({...base, conversion:0})).find(row => row.key === 'orders').formatted, '0');
assert.equal(funnelModel('email', calculate({...base, investment:0})).at(-1).formatted, '\u2014');
assert.match(funnelModel('email', calculate({...base, session:50})).find(row => row.key === 'sessions').description, /50%/);
assert.match(funnelModel('email', calculate({...base, session:null})).find(row => row.key === 'sessions').description, /pendente/);
console.log('CRM calculators: reference reconciliation, independent sessions, missing/zero, validation and export passed.');
