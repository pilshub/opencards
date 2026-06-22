import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const packagesDir = path.join(rootDir, 'packages');
const packageNames = ['app', 'core', 'effects', 'schema', 'simulator'];
const metrics = ['statements', 'branches', 'functions', 'lines'];
const threshold = 80;

const totals = Object.fromEntries(metrics.map((metric) => [metric, { covered: 0, total: 0 }]));

const formatPercent = (covered, total) => {
  if (total === 0) {
    return '100.00';
  }

  return ((covered / total) * 100).toFixed(2);
};

const rows = [];

for (const packageName of packageNames) {
  const summaryPath = path.join(packagesDir, packageName, 'coverage', 'coverage-summary.json');
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  const total = summary.total;

  rows.push({
    packageName,
    values: Object.fromEntries(
      metrics.map((metric) => [metric, formatPercent(total[metric].covered, total[metric].total)]),
    ),
  });

  for (const metric of metrics) {
    totals[metric].covered += total[metric].covered;
    totals[metric].total += total[metric].total;
  }
}

for (const row of rows) {
  console.log(
    `${row.packageName}: statements ${row.values.statements}% | branches ${row.values.branches}% | functions ${row.values.functions}% | lines ${row.values.lines}%`,
  );
}

const overall = Object.fromEntries(
  metrics.map((metric) => [
    metric,
    Number(formatPercent(totals[metric].covered, totals[metric].total)),
  ]),
);

console.log(
  `overall: statements ${overall.statements.toFixed(2)}% | branches ${overall.branches.toFixed(2)}% | functions ${overall.functions.toFixed(2)}% | lines ${overall.lines.toFixed(2)}%`,
);

const failures = metrics.filter((metric) => overall[metric] < threshold);

if (failures.length > 0) {
  console.error(`Overall coverage below ${threshold}% for: ${failures.join(', ')}.`);
  process.exit(1);
}
