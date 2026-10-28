(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./crm-email.js"));
  else root.CrmRd = factory(root.CrmEmail);
})(typeof globalThis !== "undefined" ? globalThis : this, function (email) {
  "use strict";
  const countFields = { selected: "contacts_count", delivered: "email_delivered_count", opened: "email_opened_count", clicked: "email_clicked_count",
    bounced: "email_bounced_count", dropped: "email_dropped_count", unsubscribed: "email_unsubscribed_count", spam: "email_spam_reported_count" };
  const identifier = (value) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
    throw new Error("invalid_or_unsafe_rd_identifier");
  };
  const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value) && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
  const localDate = (value) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${date.year}-${date.month}-${date.day}`;
  };

  function normalizeCampaigns(rows, context) {
    if (!Array.isArray(rows) || !context?.accountId || !timestamp(context.observedAt) || !validDate(context.start) || !validDate(context.end) || context.start > context.end) throw new Error("invalid_rd_collection_context");
    const accountId = identifier(context.accountId);
    if (context.uniqueCountsConfirmed === true && !context.uniqueCountsEvidence) throw new Error("missing_unique_counts_evidence");
    if (context.scopeComplete === true && !context.coverageEvidence) throw new Error("missing_rd_coverage_evidence");
    const records = [], outsidePeriod = [], seen = new Map();
    let duplicateRows = 0;
    for (const row of rows) {
      if (row.account_id !== undefined && row.account_id !== null && identifier(row.account_id) !== accountId) throw new Error("rd_account_mismatch");
      if (!row.campaign_id || !timestamp(row.send_at)) throw new Error("invalid_rd_campaign_identity_or_timestamp");
      const campaignId = identifier(row.campaign_id);
      const counts = {};
      for (const [name, field] of Object.entries(countFields)) {
        const value = row[field] ?? null;
        if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`invalid_rd_count:${field}`);
        counts[name] = value;
      }
      const sentAt = new Date(row.send_at).toISOString();
      const id = JSON.stringify([accountId, campaignId, sentAt]);
      const fingerprint = JSON.stringify(counts);
      if (seen.has(id)) {
        if (seen.get(id) !== fingerprint) throw new Error("conflicting_rd_observations");
        duplicateRows += 1;
        continue;
      }
      seen.set(id, fingerprint);
      const date = localDate(row.send_at);
      if (date < context.start || date > context.end) {
        outsidePeriod.push({ campaignId, sentAt, date });
        continue;
      }
      const issues = email.activation(counts).issues.slice();
      const suspiciousZero = counts.delivered === 0 && [counts.opened, counts.clicked, counts.unsubscribed, counts.spam].some((value) => value > 0);
      if (suspiciousZero) issues.push("zero_delivery_with_activity");
      if (context.uniqueCountsConfirmed !== true) issues.push("unique_counts_unconfirmed");
      const trustedCounts = { selected: counts.selected,
        delivered: suspiciousZero || issues.includes("delivered_above_selected") ? null : counts.delivered,
        opened: suspiciousZero || context.uniqueCountsConfirmed !== true || issues.includes("opened_above_delivered") ? null : counts.opened,
        clicked: suspiciousZero || context.uniqueCountsConfirmed !== true || issues.includes("clicked_above_opened") ? null : counts.clicked };
      const countIssues = issues.filter((issue) => issue !== "unique_counts_unconfirmed");
      const provisionalRates = countIssues.length ? { deliveryRate: null, openRate: null, clickToOpenRate: null } : email.activation(counts);
      records.push({ key: id, accountId, campaignId,
        name: typeof row.campaign_name === "string" ? row.campaign_name : null,
        sentAt, originalSentAt: row.send_at, date, observedAt: context.observedAt, sourceUpdatedAt: null,
        counts, trustedCounts, rates: email.activation(trustedCounts), provisionalRates, countIssues, issues });
    }
    const observed = email.aggregateActivation(records.map((row) => row.trustedCounts));
    return { source: "RD Station Marketing", kind: "campaign", accountId,
      period: { start: context.start, end: context.end, timeZone: "America/Sao_Paulo", basis: "send_at" },
      observedAt: context.observedAt, sourceUpdatedAt: null, records, outsidePeriod, duplicateRows, receivedRows: rows.length,
      countTimeBasis: "campaign_snapshot", interactionEventDatesKnown: false,
      scopeComplete: context.scopeComplete === true, observed,
      consolidated: context.scopeComplete === true ? observed : null,
      qualityIssueRows: records.filter((row) => row.issues.length > 0).length,
      countIssueRows: records.filter((row) => row.countIssues.length > 0).length,
      coverageEvidence: context.scopeComplete === true ? context.coverageEvidence : null,
      uniqueCountsEvidence: context.uniqueCountsConfirmed === true ? context.uniqueCountsEvidence : null };
  }

  function normalizeSnapshot(snapshot) {
    if (snapshot?.schemaVersion !== 1 || snapshot.source?.tool !== "emails_by_campaign_analytics" || !Array.isArray(snapshot.campaigns) || !Array.isArray(snapshot.outsideCampaigns)) throw new Error("invalid_rd_snapshot");
    const source = snapshot.source;
    const normalized = normalizeCampaigns([...snapshot.campaigns, ...snapshot.outsideCampaigns], {
      accountId: source.accountId, start: source.start, end: source.end, observedAt: source.observedAt,
      uniqueCountsConfirmed: source.uniqueCountsConfirmed === true, uniqueCountsEvidence: source.uniqueCountsEvidence,
      scopeComplete: source.scopeComplete === true, coverageEvidence: source.coverageEvidence,
    });
    return { ...normalized, snapshotSource: { name: "RD Station Marketing", mode: source.mode === "auxiliary_sheet" ? "auxiliary_sheet" : "pilot_snapshot", tool: source.tool,
      observedAt: source.observedAt, sourceUpdatedAt: null, start: source.start, end: source.end,
      coverageStatus: normalized.scopeComplete ? "verified" : "not_proven", uniqueCountsConfirmed: source.uniqueCountsConfirmed === true,
      workflowsStatus: "not_integrated_account_unverified" } };
  }

  function sanitizeSnapshot(snapshot) {
    const model = normalizeSnapshot(snapshot);
    if (model.duplicateRows) throw new Error("duplicate_rd_observations");
    const fields = ["campaign_id", "campaign_name", "send_at", ...Object.values(countFields)];
    const clean = (row) => Object.fromEntries(fields.map((field) => [field, field === "campaign_name" ? (typeof row[field] === "string" ? row[field] : null) : field === "campaign_id" ? identifier(row[field]) : row[field] ?? null]));
    if ((model.coverageEvidence !== null && typeof model.coverageEvidence !== "string") || (model.uniqueCountsEvidence !== null && typeof model.uniqueCountsEvidence !== "string")) throw new Error("invalid_rd_evidence");
    return { schemaVersion: 1, source: {
      name: "RD Station Marketing", tool: "emails_by_campaign_analytics", accountId: model.accountId,
      observedAt: model.observedAt, sourceUpdatedAt: null, start: model.period.start, end: model.period.end,
      timeZone: "America/Sao_Paulo", mode: model.snapshotSource.mode,
      scopeComplete: model.scopeComplete, coverageEvidence: model.coverageEvidence,
      uniqueCountsConfirmed: snapshot.source.uniqueCountsConfirmed === true, uniqueCountsEvidence: model.uniqueCountsEvidence,
    }, campaigns: snapshot.campaigns.map(clean), outsideCampaigns: snapshot.outsideCampaigns.map(clean) };
  }

  function selectPeriod(snapshot, start, end) {
    if (!validDate(start) || !validDate(end) || start > end) throw new Error("invalid_rd_selection");
    const records = snapshot.records.filter((record) => record.date >= start && record.date <= end);
    const total = (field) => records.length && records.every((row) => row.counts[field] !== null) ? records.reduce((sum, row) => sum + row.counts[field], 0) : null;
    const withinQueryWindow = start >= snapshot.period.start && end <= snapshot.period.end;
    return { start, end, records, countIssues: records.filter((row) => row.countIssues.length > 0).length,
      withinQueryWindow,
      receivedTotals: { selected: total("selected"), delivered: total("delivered"), opened: total("opened"), clicked: total("clicked") },
      consolidated: snapshot.scopeComplete && withinQueryWindow ? email.aggregateActivation(records.map((row) => row.trustedCounts)) : null };
  }

  return { normalizeCampaigns, normalizeSnapshot, sanitizeSnapshot, selectPeriod };
});
