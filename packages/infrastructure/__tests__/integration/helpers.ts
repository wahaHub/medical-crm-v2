import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../database/schema/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const envCandidates = [
  resolve(repoRoot, '.env'),
  resolve(repoRoot, '../..', '.env'),
];

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  if (typeof process.loadEnvFile === 'function') {
    for (const envPath of envCandidates) {
      if (!existsSync(envPath)) continue;
      process.loadEnvFile(envPath);
      if (process.env.DATABASE_URL) break;
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for integration tests');
  }

  return process.env.DATABASE_URL;
}

// Uses DATABASE_URL from .env or .env.test pointing to test database
const testClient = postgres(ensureDatabaseUrl(), { max: 5 });
export const testDb = drizzle(testClient, { schema });

/**
 * Cleans up test data identified by case_number LIKE 'CASE-9999-%'.
 * Year 9999 is reserved for integration test data.
 */
export async function cleanupTestCases() {
  await testDb.execute(`
    DELETE FROM case_progress WHERE case_id IN (SELECT id FROM cases WHERE case_number LIKE 'CASE-9999-%');
    DELETE FROM documents WHERE case_id IN (SELECT id FROM cases WHERE case_number LIKE 'CASE-9999-%');
    DELETE FROM cases WHERE case_number LIKE 'CASE-9999-%';
  `);
}

/** Close the test database connection. Call in afterAll of the last test suite. */
export async function teardownDb() {
  await testClient.end();
}
