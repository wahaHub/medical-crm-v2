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
  '030_ai_chat_process_explained.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'ai_chat_sessions' AND column_name = 'process_explained'
     ) AS applied`,
  '031_ai_chat_canonical_truth_flags.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'ai_chat_sessions' AND column_name = 'minimal_triage_complete'
     ) AS applied`,
  '031_patient_site_identity.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'patient_site'
     ) AS applied`,
  '032_ai_chat_canonical_truth_flags_nullable.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'ai_chat_sessions' AND column_name = 'handoff_active'
     ) AS applied`,
  '032_ai_chat_session_site_scope.sql':
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE tablename = 'ai_chat_sessions' AND indexname = 'ai_chat_sessions_session_id_site_key'
     ) AS applied`,
  '033_ai_chat_canonical_truth_flags_repair.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'ai_chat_sessions' AND column_name = 'handoff_active'
     ) AS applied`,
  '034_message_sender_overrides.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'messages' AND column_name = 'sender_name_override'
     ) AS applied`,
  '035_admin_patient_conversation_uniqueness.sql':
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE tablename = 'conversations' AND indexname IN (
         'conversations_admin_patient_case_unique',
         'conversations_admin_patient_case_unique_idx'
       )
     ) AS applied`,
  '035_conversation_assistant_mode.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'conversations' AND column_name = 'assistant_mode'
     ) AS applied`,
  '036_email_notification_cooldowns.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = 'email_notification_cooldowns'
     ) AS applied`,
};

async function recordPreExistingMigrationIfNeeded(
  sql: postgres.Sql,
  file: string,
): Promise<boolean> {
  const probe = PRE_EXISTING[file];
  if (!probe) {
    return false;
  }

  const probeRows = await sql.unsafe<{ applied: boolean }[]>(probe);
  const applied = probeRows[0]?.applied ?? false;
  if (!applied) {
    return false;
  }

  await sql`INSERT INTO _migrations (name) VALUES (${file}) ON CONFLICT (name) DO NOTHING`;
  console.log(`Recorded pre-existing migration: ${file}`);
  return true;
}

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

  // Get applied migrations
  const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
  const appliedSet = new Set(applied.map((r) => r.name));

  // Get pending files
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    if (await recordPreExistingMigrationIfNeeded(sql, file)) {
      appliedSet.add(file);
      continue;
    }
    console.log(`Applying: ${file}`);
    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');

    // CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    // Detect and run those files outside a transaction.
    // IMPORTANT: files containing CONCURRENTLY should ONLY contain
    // CONCURRENTLY statements — never mix with transactional DDL.
    // See the 003/003c split pattern below.
    const needsConcurrently = content.includes('CONCURRENTLY');

    if (needsConcurrently) {
      // Run each statement individually — postgres.js may wrap multi-statement calls.
      // Strip comment-only lines first, then split on ';' to get clean statements.
      const stripped = content
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n');
      const statements = stripped
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await sql.unsafe(stmt);
      }
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    } else {
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx.unsafe('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      });
    }
    appliedSet.add(file);
    console.log(`Applied: ${file}`);
  }

  console.log('All migrations applied.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
