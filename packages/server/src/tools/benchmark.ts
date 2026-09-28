/**
 * Measures the API against the real 10,000-employee database.
 *
 * Run with: npm run benchmark --workspace @acme/server
 *
 * Numbers quoted in docs/performance.md come from this script, so they can be
 * reproduced rather than taken on trust. It starts its own server on a spare port,
 * warms each endpoint, then reports p50/p95/max over a fixed number of iterations.
 */
import { openDatabase } from '../db/connection';
import { createApp } from '../http/app';

const ITERATIONS = 50;
const WARMUP = 5;

const ENDPOINTS: Array<[label: string, path: string]> = [
  ['Directory, first page', '/api/employees?pageSize=25'],
  ['Directory, page 200', '/api/employees?pageSize=25&page=200'],
  ['Directory, search', '/api/employees?search=priya&pageSize=25'],
  [
    'Directory, 3 filters + salary sort',
    '/api/employees?country=IN&department=Engineering&sort=salary&direction=desc&pageSize=25',
  ],
  ['Directory, below band', '/api/employees?bandPosition=below&pageSize=25'],
  ['Employee profile + history', '/api/employees/4242'],
  ['Reference data', '/api/reference'],
  ['Analytics: overview', '/api/analytics/overview'],
  ['Analytics: by country', '/api/analytics/breakdown?dimension=country'],
  ['Analytics: by level', '/api/analytics/breakdown?dimension=level'],
  ['Analytics: pay gap', '/api/analytics/pay-gap?groupBy=department'],
  ['Analytics: band health', '/api/analytics/band-health'],
  ['Analytics: distribution', '/api/analytics/distribution?bucketCount=12'],
  ['Analytics: payroll trend (24m)', '/api/analytics/payroll-trend?months=24'],
  ['CSV export, whole org', '/api/employees/export'],
];

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;

async function main(): Promise<void> {
  const databasePath = process.env.DATABASE_PATH ?? 'data/salary.sqlite';
  const handle = openDatabase({ location: databasePath, migrate: false });

  const counts = handle.sqlite
    .prepare(
      `SELECT (SELECT COUNT(*) FROM employees) AS employees,
              (SELECT COUNT(*) FROM compensation_records) AS records`,
    )
    .get() as { employees: number; records: number };

  if (counts.employees === 0) {
    console.error('No data. Run "npm run seed" first.');
    process.exitCode = 1;
    return;
  }

  const app = createApp({ db: handle.db });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No port assigned.');
  const origin = `http://127.0.0.1:${address.port}`;

  console.info(
    `\n  ${counts.employees.toLocaleString()} employees, ` +
      `${counts.records.toLocaleString()} compensation records` +
      `\n  ${ITERATIONS} iterations per endpoint, ${WARMUP} warm-up\n`,
  );
  console.info(
    `  ${'Endpoint'.padEnd(38)}${'p50'.padStart(8)}${'p95'.padStart(8)}${'max'.padStart(8)}   bytes`,
  );
  console.info(`  ${'-'.repeat(38)}${'-'.repeat(26)}`);

  for (const [label, path] of ENDPOINTS) {
    let bytes = 0;
    for (let i = 0; i < WARMUP; i += 1) await fetch(`${origin}${path}`).then((r) => r.text());

    const timings: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const startedAt = performance.now();
      const body = await fetch(`${origin}${path}`).then((response) => response.text());
      timings.push(performance.now() - startedAt);
      bytes = body.length;
    }

    timings.sort((a, b) => a - b);
    console.info(
      `  ${label.padEnd(38)}` +
        `${percentile(timings, 0.5).toFixed(1).padStart(7)}m` +
        `${percentile(timings, 0.95).toFixed(1).padStart(7)}m` +
        `${(timings.at(-1) ?? 0).toFixed(1).padStart(7)}m` +
        `   ${(bytes / 1024).toFixed(0)} KB`,
    );
  }

  console.info('');
  server.close();
  await handle.close();
}

void main();
