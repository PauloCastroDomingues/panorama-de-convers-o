const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require.resolve('../assets/crm.js'), 'utf8');
const sendflow = require('../assets/crm-sendflow.js');
const fixture = require('../data/crm-sendflow-snapshot.json');
const reader = code.slice(code.indexOf('  const readSendflow ='), code.indexOf('  const readRd ='));
const snapshot = (time) => ({ ...structuredClone(fixture), source: { ...fixture.source, extractedAt: time } });
const old = snapshot('2026-10-27T10:00:00Z');
const fresh = snapshot('2026-10-29T10:00:00Z');

async function read({ packaged = fresh, cached = old, live = null, configError = false }) {
  const writes = [];
  const context = vm.createContext({
    URL, Response, AbortSignal, CrmSendFlow: sendflow, location: { href: 'http://localhost:8021/' },
    caches: { open: async () => ({ match: async () => cached && new Response(JSON.stringify(cached)), put: async (_, response) => writes.push(await response.json()) }) },
    fetch: async (url, options) => {
      assert.equal(options.cache, 'no-store');
      if (url.includes('config')) {
        if (configError) throw new Error('Configuration unavailable');
        return new Response(JSON.stringify({ endpoint: '/api/crm-sendflow' }));
      }
      const value = url.includes('snapshot') ? packaged : live;
      return new Response(value ? JSON.stringify(value) : '', { status: value ? 200 : 503 });
    }
  });
  vm.runInContext(reader, context);
  return { value: await vm.runInContext('readSendflow()', context), writes };
}

async function refreshRecovery() {
  const section = code.slice(code.indexOf('  const refreshCrm ='), code.indexOf('  const boot ='));
  const button = {}, feedback = {};
  let reads = 0, renders = 0;
  const context = vm.createContext({
    Date, Intl, console, document: {},
    CrmSendFlow: { availableDates: () => [] },
    $crm: (selector) => selector === '#crm-refresh' ? button : feedback,
    editingCrm: () => false,
    readCommercialSnapshot: async () => { reads++; return { extracted_at: String(reads) }; },
    readRd: async () => { throw new Error('RD unavailable'); },
    readSendflow: async () => ({ source: { extractedAt: 'today' } }),
    readWhatsApp: async () => { throw new Error('Sheet unavailable'); },
    flushRefresh: () => { renders++; if (renders === 1) throw new Error('Render failed'); },
    renderFreshness: () => {},
  });
  vm.runInContext("let refreshing=false, lastRefreshAttempt=0, pendingRender=false; const whatsappSource={}; const crmState={referenceData:{},ssotFallback:null,rd:null,sendflow:null};", context);
  vm.runInContext(section, context);
  await vm.runInContext('refreshCrm(true)', context);
  assert.equal(button.disabled, false, 'A render failure must release the refresh button');
  assert.equal(vm.runInContext('refreshing', context), false);
  await vm.runInContext('refreshCrm(true)', context);
  assert.equal(reads, 2, 'A second refresh must remain possible');
  assert.equal(renders, 2, 'Each refresh renders once after all source attempts');
  assert.equal(vm.runInContext('crmState.ssotFallback.extracted_at', context), '2', 'Operational failures do not discard SSOT updates');
}

(async () => {
  assert.equal((await read({})).value.source.extractedAt, fresh.source.extractedAt, 'Old browser cache cannot mask a newer local source');
  assert.equal((await read({ packaged: old, cached: fresh })).value.source.extractedAt, fresh.source.extractedAt);
  assert.equal((await read({ live: old })).writes.length, 0, 'A regressed live response is not promoted to cache');
  assert.equal((await read({ configError: true })).value.source.extractedAt, fresh.source.extractedAt);
  assert.equal((await read({ packaged: null, cached: null, live: fresh })).value.source.extractedAt, fresh.source.extractedAt);
  await assert.rejects(read({ packaged: null, cached: null }), /Nenhuma leitura/);
  await refreshRecovery();
  console.log('CRM refresh recovery: newer snapshots, source isolation and retry after rendering failure passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
