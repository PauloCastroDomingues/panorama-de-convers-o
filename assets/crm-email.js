(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CrmEmail = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const fields = ["selected", "delivered", "opened", "clicked"];
  const count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const ratio = (numerator, denominator) => numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;

  function activation(input = {}) {
    const values = Object.fromEntries(fields.map((field) => [field, count(input[field])]));
    const issues = [];
    const boundedRate = (numerator, denominator, issue) => {
      if (values[numerator] !== null && values[denominator] !== null && values[numerator] > values[denominator]) {
        issues.push(issue);
        return null;
      }
      return ratio(values[numerator], values[denominator]);
    };
    return { ...values,
      deliveryRate: boundedRate("delivered", "selected", "delivered_above_selected"),
      openRate: boundedRate("opened", "delivered", "opened_above_delivered"),
      clickToOpenRate: boundedRate("clicked", "opened", "clicked_above_opened"),
      issues,
    };
  }

  // The caller supplies distinct send units, not subtotals or repeated observations.
  function aggregateActivation(rows) {
    const coverage = {};
    const totals = Object.fromEntries(fields.map((field) => {
      const values = rows.map((row) => count(row[field]));
      coverage[field] = { known: values.filter((value) => value !== null).length, expected: rows.length };
      const sum = values.reduce((total, value) => total + (value ?? 0), 0);
      return [field, rows.length > 0 && coverage[field].known === rows.length && Number.isSafeInteger(sum) ? sum : null];
    }));
    return { ...activation(totals), coverage };
  }

  function calculate(input, ssot = null, options = {}) {
    const result = activation(input);
    const complete = (field) => ssot?.expectedDays > 0 && ssot[`${field}KnownDays`] === ssot.expectedDays;
    const sessions = count(ssot?.sessions), orders = count(ssot?.orders);
    const revenue = typeof ssot?.revenue === "number" && Number.isFinite(ssot.revenue) && ssot.revenue >= 0 ? ssot.revenue : null;
    return { ...result,
      // Send cohorts and channel event dates are not automatically the same scope.
      sessionRate: options.sessionScopeMatched === true && complete("sessions") ? ratio(sessions, result.clicked) : null,
      conversionRate: ssot?.complete === true ? ratio(orders, sessions) : null,
      averageTicket: complete("orders") && complete("revenue") ? ratio(revenue, orders) : null,
    };
  }

  function median(values) {
    const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
  }

  function benchmark(periods) {
    const keys = ["deliveryRate", "openRate", "clickToOpenRate", "sessionRate", "conversionRate"];
    return Object.fromEntries(keys.map((key) => {
      const values = periods.map((period) => period[key]).filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
      return [key, { value: median(values), validPeriods: values.length, expectedPeriods: periods.length }];
    }));
  }

  function compareRates(current, previous) {
    const valid = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
    return { percentagePoints: valid(current) && valid(previous) ? (current - previous) * 100 : null,
      relativeChange: valid(current) && valid(previous) && previous > 0 ? current / previous - 1 : null };
  }

  return { activation, aggregateActivation, calculate, median, benchmark, compareRates };
});
