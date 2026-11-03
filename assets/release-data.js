(() => {
  const enabled = window.PANORAMA_CLOUD_RELEASE === true;
  const required = ['ssot-commercial-channels.json', 'ssot-growth-views.json',
    'crm-whatsapp-snapshot.json', 'crm-rd-snapshot.json', 'crm-sendflow-snapshot.json',
    'crm-refresh-status.json', 'data-refresh-status.json'];
  let current = null, pending = null;
  const refresh = () => {
    if (!pending) pending = (async () => {
      const response = await fetch('data/panorama-release.json', { cache: 'no-store', signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('Lote publicado indisponivel');
      const next = window.PanoramaReleaseContract.validate(await response.json());
      const status = next.files?.['data-refresh-status.json'];
      if (current && Date.parse(status.finishedAt) < Date.parse(current.files['data-refresh-status.json'].finishedAt)) {
        throw new Error('Lote recebido anterior ao atual');
      }
      // One atomic bundle carries both refreshed sources and explicitly retained ones.
      current = next;
      return current;
    })().finally(() => { pending = null; });
    return pending;
  };
  const load = () => current ? Promise.resolve(current) : refresh();
  window.PanoramaRelease = { enabled, load, refresh,
    read: async name => {
      const bundle = await load();
      if (!required.includes(name)) throw new Error('Fonte fora do lote');
      return bundle.files[name];
    } };
})();
