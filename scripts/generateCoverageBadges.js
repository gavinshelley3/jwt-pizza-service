const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const summaryPath = 'coverage/coverage-summary.json';
const badgeDir = 'badges';

if (!fs.existsSync(summaryPath)) {
  console.error(`Missing coverage summary: ${summaryPath}`);
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const command = isWindows ? 'cmd.exe' : 'npx';
const args = isWindows
  ? ['/c', 'npx', 'generateBadges', '-c', summaryPath, '-o', badgeDir]
  : ['generateBadges', '-c', summaryPath, '-o', badgeDir];

const result = spawnSync(command, args, { stdio: 'inherit' });

if (result.error) {
  console.error(`Failed to run badge generator: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

const expectedFiles = [
  'coverage-branches.svg',
  'coverage-functions.svg',
  'coverage-lines.svg',
  'coverage-statements.svg',
  'coverage-total.svg',
];

const missing = expectedFiles.filter(
  (file) => !fs.existsSync(`${badgeDir}/${file}`)
);

if (missing.length > 0) {
  console.error(`Missing badge files: ${missing.join(', ')}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Badge generator exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('Coverage badges generated and verified.');
