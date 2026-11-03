(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./crm-sendflow.js'), require('./crm-rd.js'));
  else root.PanoramaReleaseContract = factory(root.CrmSendFlow, root.CrmRd);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sendflow, rd) {
  const files = ['ssot-commercial-channels.json', 'ssot-growth-views.json', 'crm-whatsapp-snapshot.json',
    'crm-rd-snapshot.json', 'crm-sendflow-snapshot.json', 'crm-refresh-status.json', 'data-refresh-status.json'];
  const sourceIds = ['ssot', 'growth', 'whatsapp', 'rd', 'sendflow'];
  const activeViews = ['channel', 'campaign', 'ad_group', 'channel_product', 'campaign_product', 'ad_group_product'];
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const timestamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  function validate(bundle) {
    const fail = () => { throw new Error('Lote publicado incompleto ou invalido'); };
    if (bundle?.schemaVersion !== 1 || !bundle.releaseId || files.some(name => !bundle.files?.[name])) fail();
    const status = bundle.files['data-refresh-status.json'];
    if (status.runId !== bundle.releaseId || status.release?.id !== bundle.releaseId || status.status !== 'current'
        || status.readOnly !== true || !date(status.targetDate) || !timestamp(status.finishedAt)
        || !timestamp(status.startedAt) || Date.parse(status.startedAt) > Date.parse(status.finishedAt)
        || !Array.isArray(status.publicationBlockers) || status.publicationBlockers.length
        || !Array.isArray(status.sources) || status.sources.length !== sourceIds.length) fail();
    const sources = new Map(status.sources.map(source => [source.id, source]));
    for (const id of sourceIds) {
      const source = sources.get(id);
      if (!source || source.status !== 'current' || source.error) fail();
      if (['rd', 'sendflow'].includes(id)) {
        const snapshot = bundle.files[`crm-${id}-snapshot.json`].source;
        if (!source.collectionId || source.collectionId !== snapshot.collectionId
            || !date(source.coveredThrough) || source.coveredThrough < status.targetDate
            || source.coveredThrough !== snapshot.coveredThrough
            || source.coveredThrough !== (id === 'rd' ? snapshot.end : snapshot.coverage?.end)
            || !timestamp(source.observedAt)
            || source.observedAt !== (id === 'rd' ? snapshot.observedAt : snapshot.extractedAt)
            || Date.parse(source.observedAt) > Date.parse(status.finishedAt)
            || Date.parse(source.observedAt) < Date.parse(`${source.coveredThrough}T00:00:00-03:00`) + 86400000) fail();
      } else if (!date(source.latestDate) || source.latestDate < status.targetDate) fail();
    }
    sendflow.validateCommercialSnapshot(bundle.files['ssot-commercial-channels.json']);
    sendflow.validate(bundle.files['crm-sendflow-snapshot.json']);
    rd.sanitizeSnapshot(bundle.files['crm-rd-snapshot.json']);
    const wa = bundle.files['crm-whatsapp-snapshot.json'];
    if (wa.schemaVersion !== 1 || !Array.isArray(wa.rows) || !wa.rows.length || !wa.source?.spreadsheetId) fail();
    const growth = bundle.files['ssot-growth-views.json'];
    if (growth.ok !== true || !Array.isArray(growth.data) || !timestamp(growth.generatedAt)) fail();
    const views = new Map(growth.data.map(view => [view.view, view]));
    if (views.size !== growth.data.length || activeViews.some(id => !Array.isArray(views.get(id)?.rows))) fail();
    for (const view of views.values()) for (const row of view.rows) {
      if (!date(row.data)) fail();
      for (const metric of ['sessoes', 'pedidos', 'receita']) {
        if (row[metric] !== null && (row[metric] === '' || !['number', 'string'].includes(typeof row[metric]) || !Number.isFinite(Number(row[metric])))) fail();
      }
    }
    return bundle;
  }
  return {validate, files};
});
