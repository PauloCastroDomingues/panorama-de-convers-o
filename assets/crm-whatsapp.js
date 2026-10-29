(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrmWhatsApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const url = 'https://docs.google.com/spreadsheets/d/1vlkkrA52FBGk79k0ou3vch1XqM-AdHVDj42IXO7hIZo/edit?gid=404910707#gid=404910707';
  const fields = { Publico: 'Público', Entregues: 'Total Entregue', Aberturas: 'Aberturas', Cliques: 'Total de cliques' };
  const categories = ['Marketing', 'Utilidade'];
  const count = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const category = (value) => categories.find((name) => name.toLowerCase() === String(value || '').trim().toLowerCase()) || String(value || '').trim() || 'Sem categoria';
  const recordsForGroup = (group, parseNumber) => [group.parent, ...group.children].map((row, index) => ({
    date: group.parent.isoDate,
    category: category(group.parent.Categoria),
    sourceRow: row.__sourceRow,
    parentRow: group.parent.__sourceRow,
    linked: index > 0,
    values: Object.fromEntries(Object.entries(fields).map(([key, header]) => [key, count(parseNumber(row[header]))])),
  }));
  const metric = (records, field) => {
    const known = records.map((record) => count(record.values[field])).filter((value) => value !== null);
    const subtotal = known.length ? known.reduce((total, value) => total + value, 0) : null;
    return { value: records.length && known.length === records.length ? subtotal : null, subtotal, known: known.length, expected: records.length };
  };
  const select = (records, start, end) => {
    const selected = records.filter((record) => record.date >= start && record.date <= end);
    const primary = selected.filter((record) => !record.linked);
    const groups = [];
    for (const date of [...new Set(primary.map((record) => record.date))].sort()) {
      for (const name of [...new Set(primary.filter((record) => record.date === date).map((record) => record.category))]) {
        const members = primary.filter((record) => record.date === date && record.category === name);
        groups.push({ date, category: name, count: members.length, metrics: Object.fromEntries(Object.keys(fields).map((field) => [field, metric(members, field)])) });
      }
    }
    return { records: selected, primary, groups, metrics: Object.fromEntries(Object.keys(fields).map((field) => [field, metric(primary, field)])) };
  };
  const rates = (values) => {
    const ratio = (value, denominator) => count(value) !== null && denominator > 0 && value <= denominator ? value / denominator : null;
    return [ratio(values.Entregues, values.Publico), ratio(values.Aberturas, values.Entregues), ratio(values.Cliques, values.Aberturas)];
  };
  return { url, fields, categories, recordsForGroup, metric, select, rates };
});
