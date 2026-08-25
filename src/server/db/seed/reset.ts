import { createInterface } from 'node:readline';
import path from 'node:path';
import { destroyMigrateSeed, readExistingCounts, shouldProceed } from './reset-core';

/**
 * `npm run db:reset` CLI entrypoint (SPEC-003: "delete + migrate + seed
 * (destructive-confirm prompt, `--force` for CI)"). Thin wrapper: all the
 * testable logic lives in `reset-core.ts`, parameterized by path, so tests
 * never touch this file's hardcoded `./data/myrio.db` (SPEC-001: "No test
 * touches `./data/myrio.db`").
 */

const DB_PATH = path.join(process.cwd(), 'data', 'myrio.db');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads', 'seed');

function runDestroyMigrateSeed(): void {
  const summary = destroyMigrateSeed(DB_PATH, UPLOADS_DIR);
  // eslint-disable-next-line no-console
  console.log('Reset complete:', JSON.stringify(summary, null, 2));
}

function printExistingCounts(): void {
  const counts = readExistingCounts(DB_PATH);
  if (!counts) {
    // eslint-disable-next-line no-console
    console.log(`No existing database at ${DB_PATH} — nothing to destroy.`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`This will DESTROY the existing database at ${DB_PATH}:`);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(counts, null, 2));
}

function main(): void {
  const force = process.argv.includes('--force');

  if (force) {
    runDestroyMigrateSeed();
    return;
  }

  printExistingCounts();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Type 'y' to continue and destroy the above, anything else to abort: ", (answer) => {
    rl.close();
    if (!shouldProceed(answer)) {
      // eslint-disable-next-line no-console
      console.log('Aborted — nothing was changed.');
      process.exitCode = 1;
      return;
    }
    runDestroyMigrateSeed();
  });
}

main();
