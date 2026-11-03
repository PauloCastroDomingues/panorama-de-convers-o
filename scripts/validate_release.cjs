const fs = require('node:fs');
const contract = require('../assets/release-contract.js');
try {
  contract.validate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  process.stdout.write('ok');
} catch {
  process.stderr.write('Invalid release bundle');
  process.exitCode = 1;
}
