"""Publish a tested frontend without collecting or replacing production data."""
import json
import re
from stage_frontend_release import STAGE, get
import cloud_refresh as cloud

def main():
    baseline = json.loads((STAGE.parent / 'line-audit-baseline.json').read_text())
    def unchanged():
        if cloud.digest(get('data/data-refresh-status.json')) != baseline['statusHash'] or cloud.digest(get('')) != baseline['indexHash']:
            raise RuntimeError('Production changed: restage and revalidate before publication.')
    unchanged()
    response = json.loads(cloud.cli('deploy', '--prod', '--skip-domain', '--yes', '--json', cwd=STAGE))
    deployment = response.get('deployment', response)
    url = deployment['url']
    if deployment['readyState'] != 'READY' or not re.fullmatch(r'https://panorama-de-conversao-[a-z0-9]+-reise-team\.vercel\.app', url):
        raise RuntimeError('Unexpected deployment target or state.')
    print(json.dumps({'stagedDeployment':url,'state':'READY'}), flush=True)
    deployed = lambda name: cloud.cli('curl', url + '/' + name, cwd=STAGE)
    cloud.verify_release(deployed, STAGE / 'data')
    for name in ['index.html','assets/app.js','assets/growth-analysis.js','assets/styles.css','assets/release-mode.js']:
        if cloud.digest(deployed('' if name == 'index.html' else name)) != cloud.digest((STAGE / name).read_bytes()):
            raise RuntimeError('Deployed frontend differs from tested files: ' + name)
    unchanged()
    cloud.cli('promote', url, '--yes', cwd=STAGE)
    cloud.verify_promoted_release(get, STAGE / 'data')
    if cloud.digest(get('assets/app.js')) != cloud.digest((STAGE / 'assets/app.js').read_bytes()):
        raise RuntimeError('Promoted frontend not verified.')
    print(json.dumps({'published':cloud.PRODUCTION,'deployment':url,'state':'READY','dataPreserved':True}),flush=True)

if __name__ == '__main__':
    main()
