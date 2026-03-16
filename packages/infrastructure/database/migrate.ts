// packages/infrastructure/database/migrate.ts
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

// Migrations that were applied to the live DB before _migrations tracking existed.
// Each entry maps a migration file to a SQL probe that returns TRUE if
// the migration's effects already exist in the database.
const PRE_EXISTING: Record<string, string> = {
  '001_ai_summary_columns.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'cases' AND column_name = 'ai_summary'
     ) AS applied`,
  '002_create_message_tasks.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = 'message_tasks'
     ) AS applied`,
};

async function migrate() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const sql = postgres(databaseUrl);

  // Create tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Bootstrap: for each pre-existing migration not yet tracked,
  // probe the real schema to decide whether to record or execute it.
  // - Old DB (schema exists, tracking empty): records without executing
  // - Fresh DB (schema missing, tracking empty): leaves it pending so it runs normally
  const rows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM _migrations`;
  const count = rows[0]?.count ?? '0';
  if (count === '0') {
    for (const [name, probe] of Object.entries(PRE_EXISTING)) {
      const probeRows = await sql.unsafe<{ applied: boolean }[]>(probe);
      const applied = probeRows[0]?.applied ?? false;
      if (applied) {
        await sql`INSERT INTO _migrations (name) VALUES (${name})`;
        console.log(`Bootstrap: ${name} — already applied, recorded.`);
      } else {
        console.log(`Bootstrap: ${name} — not found in schema, will execute normally.`);
      }
    }
  }

  // Get applied migrations
  const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
  const appliedSet = new Set(applied.map((r) => r.name));

  // Get pending files
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    console.log(`Applying: ${file}`);
    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');

    // CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    // Detect and run those files outside a transaction.
    // IMPORTANT: files containing CONCURRENTLY should ONLY contain
    // CONCURRENTLY statements — never mix with transactional DDL.
    // See the 003/003c split pattern below.
    const needsConcurrently = content.includes('CONCURRENTLY');

    if (needsConcurrently) {
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    } else {
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx.unsafe('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      });
    }
    console.log(`Applied: ${file}`);
  }

  console.log('All migrations applied.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
