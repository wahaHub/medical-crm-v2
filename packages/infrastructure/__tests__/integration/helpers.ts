import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../database/schema/index.js';

// Uses DATABASE_URL from .env or .env.test pointing to test database
const testClient = postgres(process.env.DATABASE_URL!, { max: 5 });
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
