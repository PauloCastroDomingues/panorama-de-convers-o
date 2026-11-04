(() => {
  const button = document.querySelector('#reload-data');
  const feedback = document.querySelector('#growth-refresh-feedback');
  let busy = false, timer = null;
  const say = message => {feedback.textContent=message; feedback.hidden=!message;};
  const format = value => {
    const instant = new Date(value);
    return value && Number.isFinite(instant.getTime()) ? new Intl.DateTimeFormat('pt-BR', {
      timeZone:'America/Sao_Paulo', dateStyle:'short', timeStyle:'medium'
    }).format(instant) + ' (Brasilia)' : 'nao informada';
  };
  const renderTimestamp = () => {
    const entry = viewEntry(sourceKeyForView(state.selectedView));
    const node = document.querySelector('#growth-updated-at');
    node.textContent = 'Ultima atualizacao: ' + format(entry?.generatedAt);
    node.title = `Ultima coleta valida da visao ${state.selectedView}. Nao e o horario de abertura do painel.`;
  };
  const setBusy = value => {busy=value; button.disabled=value; button.setAttribute('aria-busy',String(value));};
  const fetchJson = async (url, options={}) => {
    const response = await fetch(url, {cache:'no-store',signal:AbortSignal.timeout(15000),...options});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 503 || response.status === 404) throw new Error('Coleta manual na nuvem ainda nao configurada. Ultima base preservada.');
      throw new Error('Nao foi possivel confirmar a coleta. Ultima base preservada.');
    }
    return result;
  };
  const fingerprint = () => (state.growthPayload?.data || []).map(view => `${view.view}:${view.generatedAt}`).join('|');
  const reload = async () => {
    if (window.PanoramaRelease?.enabled) await window.PanoramaRelease.refresh();
    await loadData();
    window.dispatchEvent(new CustomEvent('panorama:data-refreshed'));
  };
  const monitor = (run, local, before, started) => {
    timer = setTimeout(async () => {
      try {
        if (Date.now()-started > 45*60000) throw new Error('Coleta ainda nao confirmada. Confira a execucao antes de tentar novamente.');
        if (local) {
          const progress=await fetchJson('/api/local-refresh');
          if (progress.running) {say('Coletando Growth no SSOT...'); return monitor(run,local,before,started);}
        } else {
          const result=await fetchJson(`/api/growth-refresh?runId=${run.id}`);
          if (result.run.status !== 'completed') {
            say(result.run.status === 'in_progress' ? 'Coletando e validando Growth...' : 'Coleta de Growth na fila...');
            return monitor(run,local,before,started);
          }
          if (result.run.conclusion !== 'success') {
            await reload();
            throw new Error('A coleta nao concluiu com sucesso. Confira a cobertura; dados validos preservados.');
          }
        }
        await reload();
        say(fingerprint() !== before ? 'Growth atualizado. Confira a cobertura de cada visao.' : 'Sem nova coleta valida de Growth. Ultima base preservada.');
        setBusy(false);
      } catch (error) {say(error.message); setBusy(false);}
    }, 5000);
  };
  const request = async () => {
    if (busy) return;
    setBusy(true); say('Solicitando atualizacao de Growth...');
    const before=fingerprint(), started=Date.now();
    try {
      let local=false;
      if (!window.PanoramaRelease?.enabled && ['localhost','127.0.0.1'].includes(location.hostname)) {
        const capability=await fetchJson('/api/local-refresh');
        local=capability.available === true;
      }
      let result;
      if (local) {
        result=await fetchJson('/api/local-refresh?scope=growth', {method:'POST',headers:{'X-Panorama-Refresh':'1'}});
      } else {
        await fetchJson('/api/growth-refresh');
        result=await fetchJson('/api/growth-refresh', {method:'POST',headers:{'X-Panorama-Refresh':'1'}});
        if (result.cooldown) {
          await reload();
          say(`Ultima base carregada. Nova coleta disponivel em ${Math.ceil(result.retryAfter / 60)} min.`);
          setBusy(false); return;
        }
        if (!result.run?.id) throw new Error('Solicitacao enviada; acompanhamento indisponivel. Confira a execucao no GitHub antes de repetir.');
      }
      say(result.started === false ? 'Coleta ja em andamento. Acompanhando...' : 'Coleta de Growth solicitada...');
      monitor(result.run,local,before,started);
    } catch (error) {say(error.message); setBusy(false);}
  };
  window.GrowthRefresh={request,renderTimestamp};
  window.addEventListener('pagehide', () => clearTimeout(timer));
  renderTimestamp();
})();
