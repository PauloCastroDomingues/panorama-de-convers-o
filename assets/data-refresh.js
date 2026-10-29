(() => {
  let lastFinished = null, requesting = false, manifest = null, local = false;
  const summary = document.querySelector('#base-refresh-summary');
  const body = document.querySelector('#base-refresh-body');
  const feedback = document.querySelector('#base-refresh-feedback');
  const date = (value) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Nao confirmado';
  const labels = { current: 'Leitura atual', stale: 'Origem atrasada', error: 'Falha na leitura', running: 'Consultando', queued: 'Na fila' };
  const errors = { sheet_read_access_required: 'Autorizar leitura Google Sheets', authentication_failed: 'Renovar login Google',
    sheets_oauth_setup_required: 'Configurar OAuth proprio para Sheets', sheets_own_oauth_client_required: 'Cliente Google Cloud nao serve para este login Sheets',
    sheets_readonly_scope_required: 'Autorizar somente leitura de Sheets',
    operational_observation_regression: 'Planilha anterior a ultima coleta preservada', growth_schema_mismatch: 'Revisar contrato SSOT',
    operational_contract_invalid: 'Conferir contrato da origem' };
  const get = async (url) => { const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('Leitura indisponivel'); return response.json(); };
  const render = () => {
    if (!manifest) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const expected = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const recent = manifest.targetDate >= expected;
    const busy = manifest.status === 'running' && Date.now() - Date.parse(manifest.startedAt) < 30 * 60000;
    const ready = manifest.sources.filter((source) => source.status === 'current' && recent).length;
    summary.textContent = busy ? 'Atualizando toda a base...' : `${ready}/${manifest.sources.length} fontes com leitura ate D-1`;
    summary.setAttribute('aria-busy', String(busy || requesting));
    body.replaceChildren();
    for (const source of manifest.sources) {
      const row = document.createElement('tr');
      const state = source.status === 'current' && !recent ? 'stale' : source.status;
      const text = [source.label, date(source.latestDate), labels[state] || 'Pendente',
        errors[source.error] || (source.error ? 'Ultima leitura valida preservada' : source.note || (source.coverageComplete === false ? 'Cobertura parcial' : ''))];
      for (const value of text) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
      row.dataset.status = state;
      body.append(row);
    }
    document.querySelectorAll('#base-refresh, #reload-data, #crm-refresh').forEach((button) => {
      button.disabled = busy || requesting;
      button.textContent = busy ? 'Atualizando...' : local ? 'Atualizar base' : 'Atualizar leitura';
    });
    summary.dataset.state = ready === manifest.sources.length ? 'ok' : 'warn';
  };
  const poll = async () => {
    try {
      manifest = await get('data/data-refresh-status.json');
      render();
      if (manifest.finishedAt && manifest.status !== 'running') {
        if (lastFinished && lastFinished !== manifest.finishedAt) window.dispatchEvent(new CustomEvent('panorama:data-refreshed'));
        lastFinished = manifest.finishedAt;
      }
    } catch (error) { summary.textContent = 'Estado da atualizacao nao confirmado'; }
  };
  const request = async () => {
    if (requesting) return;
    requesting = true; feedback.textContent = ''; render();
    try {
      if (!local) {
        window.dispatchEvent(new CustomEvent('panorama:data-refreshed'));
        feedback.textContent = 'Relendo as bases publicadas. Coleta automatica no servidor nao configurada.';
        return;
      }
      const response = await fetch('/api/local-refresh', { method: 'POST', headers: { 'X-Panorama-Refresh': '1' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Nao foi possivel iniciar a coleta. Ultima base preservada.');
      feedback.textContent = 'Coleta iniciada para todas as fontes.';
      await poll();
    } catch (error) { feedback.textContent = error.message; }
    finally { requesting = false; render(); }
  };
  window.PanoramaRefresh = { request };
  document.querySelector('#base-refresh').addEventListener('click', request);
  if (['127.0.0.1', 'localhost'].includes(location.hostname)) get('/api/local-refresh').then((result) => { local = result.available === true; render(); }).catch(() => {});
  poll();
  setInterval(() => { if (!document.hidden) poll(); }, 10000);
})();
