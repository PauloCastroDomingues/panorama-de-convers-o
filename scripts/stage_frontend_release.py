"""Stage current frontend with the unchanged, validated production data bundle."""
import json
import shutil
from pathlib import Path
import requests
import cloud_refresh as cloud

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'output' / 'line-audit-release'

def get(path):
    response = requests.get(cloud.PRODUCTION + '/' + path, timeout=(10, 90),
                            headers={'Cache-Control': 'no-cache'})
    response.raise_for_status()
    return response.content

def main():
    STAGE.mkdir(parents=True, exist_ok=True)
    directory = STAGE / 'data'
    directory.mkdir(exist_ok=True)
    baseline = cloud.download_baseline(directory, get)
    (directory / 'panorama-release.json').write_bytes(get('data/panorama-release.json'))
    cloud.validate_bundle(directory / 'panorama-release.json')
    cloud.verify_release(get, directory)
    for name in ('assets', 'api'):
        shutil.copytree(ROOT / name, STAGE / name, dirs_exist_ok=True)
    (STAGE / 'assets/release-mode.js').write_text('window.PANORAMA_CLOUD_RELEASE = true;\n', encoding='utf-8')
    for name in ('index.html', 'vercel.json', '.vercelignore'):
        shutil.copy2(ROOT / name, STAGE / name)
    for name in cloud.STATIC_DATA:
        (directory / name).write_bytes(get('data/' + name))
    (STAGE / '.vercel').mkdir(exist_ok=True)
    (STAGE / '.vercel/project.json').write_text(json.dumps({
        'projectId': cloud.PROJECT, 'orgId': cloud.TEAM, 'projectName': 'panorama-de-conversao'
    }), encoding='utf-8')
    # Outside the deployed directory: promotion must still match this baseline.
    (STAGE.parent / 'line-audit-baseline.json').write_text(json.dumps({
        'statusHash': cloud.digest(baseline['status']), 'indexHash': cloud.digest(baseline['index'])
    }), encoding='utf-8')
    print(json.dumps({'stage': str(STAGE), 'dataRunId': json.loads(baseline['status'])['runId'],
                      'dataPreserved': True}))

if __name__ == '__main__':
    main()
