const fs = require('node:fs');
const path = require('node:path');
const { generateBadges } = require('node-coverage-badges');

const summaryPath = path.resolve('coverage/coverage-summary.json');
const badgeDir = path.resolve('badges');

const expectedFiles = [
  'coverage-branches.svg',
  'coverage-functions.svg',
  'coverage-lines.svg',
  'coverage-statements.svg',
  'coverage-total.svg',
];

async function run() {
  if (!fs.existsSync(summaryPath)) {
    console.error(`Missing coverage summary: ${summaryPath}`);
    process.exit(1);
  }

  try {
    await generateBadges(summaryPath, badgeDir);
  } catch (err) {
    console.error('Badge generator threw an error:', err);
    process.exit(1);
  }

  const missing = expectedFiles.filter(
    (file) => !fs.existsSync(path.join(badgeDir, file))
  );

  if (missing.length > 0) {
    console.error(`Missing badge files: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('Coverage badges generated and verified.');
}

run().catch((err) => {
  console.error('Unexpected error during badge generation:', err);
  process.exit(1);
});
