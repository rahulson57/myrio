import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config (SPEC-002). `src/server/db/schema.ts` is the single
 * owner of the schema; `npm run db:migrate` (drizzle-kit migrate) applies
 * the migrations generated from it into `./data/myrio.db`. The generated
 * `.sql` files under `drizzle/**` are an internal artifact of this module,
 * not a contract with other modules — no raw `CREATE TABLE` lives outside
 * them.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './data/myrio.db',
  },
  strict: true,
  verbose: true,
});
