const assert=require('node:assert/strict');
const handler=require('../api/growth-refresh.js');
const origin='https://panorama-de-conversao.vercel.app';
const calls=[];
async function call(method='POST', headers={}, query={}) {
  const response={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method,headers,query},response);
  return response;
}
(async()=>{
  const originalFetch=global.fetch;
  const env={...process.env};
  try {
    delete process.env.PANORAMA_GITHUB_REFRESH_TOKEN;
    assert.equal((await call()).code,503);
    process.env.PANORAMA_GITHUB_REFRESH_TOKEN='server-only-github-token';
    delete process.env.PANORAMA_REFRESH_KEY;
    global.fetch=async(url,options)=>{
      calls.push({url,options});
      return {ok:true,status:200,json:async()=>url.includes('/dispatches') ? {workflow_run_id:42} : {workflow_runs:[]}};
    };
    assert.equal((await call()).code,403);
    assert.equal(calls.length,0);
    const headers={origin,'x-panorama-refresh':'1'};
    assert.equal((await call('POST',{...headers,origin:'https://attacker.test'})).code,403);
    assert.equal(calls.length,0);
    const response=await call('POST',headers);
    assert.equal(response.code,202);
    assert.equal(response.body.run.id,42);
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), {ref:'main',inputs:{publish:true,scope:'growth'},return_run_details:true});
    assert.ok(!JSON.stringify(response.body).includes('token'));
    global.fetch=async()=>({ok:true,status:200,json:async()=>({workflow_runs:[{id:99,status:'in_progress'}]})});
    assert.equal((await call('POST',headers)).body.started,false);
    global.fetch=async()=>({ok:true,status:200,json:async()=>({workflow_runs:[{id:99,status:'completed',created_at:new Date().toISOString()}]})});
    const recent=await call('POST',headers);
    assert.equal(recent.body.cooldown,true);
    assert.ok(recent.body.retryAfter>0 && recent.body.retryAfter<=600);
    global.fetch=async()=>({ok:true,status:200,json:async()=>({workflow_runs:[{id:99,status:'completed'}]})});
    assert.equal((await call('POST',headers)).code,502,'Unknown timestamps cannot bypass cooldown');
    assert.equal((await call('GET',headers,{runId:'../x'})).code,400);
    assert.equal((await call('DELETE',headers)).code,405);
    console.log('Growth refresh API: no user key, origin, cooldown, fixed scope and reuse passed');
  } finally {global.fetch=originalFetch;process.env=env;}
})().catch(error=>{console.error(error);process.exitCode=1;});
