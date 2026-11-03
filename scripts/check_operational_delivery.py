"""Read-only diagnostic of RD/SendFlow deliveries. Does not update snapshots or publish."""
import argparse
from datetime import datetime
import json

import refresh_crm_ssot as ssot
import refresh_operational as operational


def inspect(source, read, target):
    try:
        _, status = read()
        covered = status.get('coveredThrough')
        ready = bool(status.get('collectionId') and covered and covered >= target)
        return {'source': source, 'targetDate': target, 'deliveryReady': ready,
                'collectionId': status.get('collectionId'), 'coveredThrough': covered,
                'latestEventDate': status.get('latestEventDate', status.get('latestDate')),
                'observedAt': status.get('observedAt'), 'rows': status['rows'],
                'historicalCoverageComplete': False,
                'nextAction': None if ready else 'Confirmar tarefa do chat e contrato de coleta concluida'}
    except Exception as error:
        return {'source': source, 'targetDate': target, 'deliveryReady': False, 'error': ssot.safe_error(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=['rd', 'sendflow', 'all'], default='all')
    args = parser.parse_args()
    target = ssot.yesterday().isoformat()
    results = [inspect(name, read, target) for name, read in
               [('rd', operational.read_rd), ('sendflow', operational.read_sendflow)]
               if args.source in ('all', name)]
    print(json.dumps({'checkedAt': datetime.now(ssot.TIMEZONE).isoformat(), 'readOnly': True, 'sources': results}, indent=2))
    return 0 if all(row['deliveryReady'] for row in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
