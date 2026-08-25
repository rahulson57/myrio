import path from 'node:path';
import { createDbClient, runMigrations } from '../client';
import { seedDatabase } from './build';

/**
 * `npm run db:seed` entrypoint (SPEC-003). Seeds `./data/myrio.db` — a
 * freshly migrated, empty database — with the full deterministic corpus.
 * Never touches the network; every write goes through a Data Layer
 * repository function (see `build.ts`).
 */
function main(): void {
  const client = createDbClient();
  try {
    runMigrations(client.db);
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'seed');
    const summary = seedDatabase(client.db, 'full', uploadsDir);
    // eslint-disable-next-line no-console
    console.log('Seed complete:', JSON.stringify(summary, null, 2));
  } finally {
    client.close();
  }
}

main();
