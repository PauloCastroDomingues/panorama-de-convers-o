const {timingSafeEqual} = require('node:crypto');
const REPO = 'PauloCastroDomingues/panorama-de-convers-o';
const WORKFLOW = 'refresh-data.yml';
const active = run => run.status !== 'completed';
const publicRun = run => ({id:run.id, status:run.status, conclusion:run.conclusion || null});

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store');
  if (!['GET','POST'].includes(request.method)) {
    response.setHeader('Allow','GET, POST');
    return response.status(405).json({error:'method_not_allowed'});
  }
  const token = process.env.PANORAMA_GITHUB_REFRESH_TOKEN;
  const secret = process.env.PANORAMA_REFRESH_KEY;
  if (!token || !secret || secret.length < 32) return response.status(503).json({error:'refresh_not_configured'});
  if (request.method === 'GET' && !request.query?.runId) return response.status(200).json({available:true});
  const key = Buffer.from(String(request.headers['x-panorama-refresh-key'] || ''));
  const expected = Buffer.from(secret);
  if (key.length !== expected.length || !timingSafeEqual(key, expected)) return response.status(401).json({error:'refresh_authorization_required'});
  if (request.method === 'POST') {
    const origins = ['https://panorama-de-conversao.vercel.app'];
    if (process.env.VERCEL_URL) origins.push('https://' + process.env.VERCEL_URL);
    if (!origins.includes(request.headers.origin) || request.headers['x-panorama-refresh'] !== '1') {
      return response.status(403).json({error:'same_origin_required'});
    }
  }
  const github = async (path, options={}) => {
    const result = await fetch(`https://api.github.com/repos/${REPO}/actions/${path}`, {
      ...options, signal:AbortSignal.timeout(10000),
      headers:{Accept:'application/vnd.github+json', Authorization:`Bearer ${token}`,
        'X-GitHub-Api-Version':'2026-03-10', 'Content-Type':'application/json'}
    });
    if (!result.ok) throw new Error('workflow_unavailable');
    return result.status === 204 ? null : result.json();
  };
  try {
    if (request.method === 'GET') {
      const id = String(request.query.runId);
      if (!/^\d{1,20}$/.test(id)) return response.status(400).json({error:'invalid_run'});
      const run = await github(`runs/${id}`);
      if (run.path !== `.github/workflows/${WORKFLOW}` || run.head_branch !== 'main') return response.status(404).json({error:'run_not_found'});
      return response.status(200).json({run:publicRun(run)});
    }
    const list = await github(`workflows/${WORKFLOW}/runs?branch=main&per_page=10`);
    const running = list.workflow_runs.find(active);
    if (running) return response.status(202).json({started:false, run:publicRun(running)});
    // Credentials stay server-side; repository, branch and operation cannot be supplied by visitors.
    const result = await github(`workflows/${WORKFLOW}/dispatches`, {
      method:'POST', body:JSON.stringify({ref:'main', inputs:{publish:true, scope:'growth'}, return_run_details:true})
    });
    return response.status(202).json({started:true, run:result?.workflow_run_id ? {id:result.workflow_run_id,status:'queued',conclusion:null} : null});
  } catch {
    return response.status(502).json({error:'workflow_unavailable'});
  }
};
