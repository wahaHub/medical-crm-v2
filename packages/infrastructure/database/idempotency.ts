import { sql } from 'drizzle-orm';
import type { CrmDb } from './crm-client.js';
import { ConflictError } from '@medical-crm/utils';

/**
 * Concurrency-safe idempotency guard using INSERT-first claim pattern.
 *
 * Flow:
 * 1. INSERT ... ON CONFLICT DO NOTHING (atomic claim attempt)
 * 2. If INSERT succeeded (we own the key) → execute fn(), UPDATE result
 * 3. If INSERT failed (key exists) → return cached result, or throw ConflictError if still processing
 * 4. If fn() throws → DELETE the claimed key so it can be retried
 */
export class IdempotencyGuard {
  constructor(private readonly db: CrmDb) {}

  async execute<T>(key: string, operation: string, fn: () => Promise<T>): Promise<T> {
    // Step 1: Atomically try to claim the key (result starts as NULL = "processing")
    const claimed = await this.db.execute(
      sql`INSERT INTO idempotency_keys (key, operation, result, created_at)
          VALUES (${key}, ${operation}, NULL, NOW())
          ON CONFLICT (key) DO NOTHING
          RETURNING key`,
    );

    if (claimed.length === 0) {
      // Key already exists — another request owns it
      const existing = await this.db.execute(
        sql`SELECT result FROM idempotency_keys WHERE key = ${key}`,
      );
      const row = existing[0] as { result: unknown } | undefined;
      if (row && row.result !== null) {
        return typeof row.result === 'string'
          ? JSON.parse(row.result) as T
          : row.result as T; // Completed — return cached result
      }
      // Still processing (result is NULL) — reject with 409
      throw new ConflictError('Request is already being processed');
    }

    // Step 2: We own the key — execute business logic
    try {
      const result = await fn();
      await this.db.execute(
        sql`UPDATE idempotency_keys SET result = ${JSON.stringify(result)}::jsonb WHERE key = ${key}`,
      );
      return result;
    } catch (err) {
      // Step 3: Clean up on failure so the key can be retried
      await this.db.execute(
        sql`DELETE FROM idempotency_keys WHERE key = ${key}`,
      );
      throw err;
    }
  }
}
