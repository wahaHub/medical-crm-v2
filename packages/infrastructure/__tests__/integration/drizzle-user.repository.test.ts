import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DrizzleUserRepository } from '../../database/repositories/drizzle-user.repository.js';
import { testDb } from './helpers.js';
import { users } from '../../database/schema/index.js';

const TEST_USER_ID = randomUUID();
const MIXED_CASE_EMAIL = `UserLookup-${TEST_USER_ID}@Integration.test`;

let repo: DrizzleUserRepository;

beforeAll(async () => {
  repo = new DrizzleUserRepository(testDb);

  await testDb.insert(users).values({
    id: TEST_USER_ID,
    email: MIXED_CASE_EMAIL,
    name: 'Mixed Case Lookup User',
    role: 'PATIENT',
    patientSite: 'china',
    preferredLanguage: 'en',
    updatedAt: new Date().toISOString(),
  }).onConflictDoNothing();
});

afterAll(async () => {
  await testDb.delete(users).where(eq(users.id, TEST_USER_ID));
});

describe('DrizzleUserRepository integration', () => {
  it('finds a user by email case-insensitively', async () => {
    await expect(repo.findByEmail(MIXED_CASE_EMAIL.toLowerCase())).resolves.toMatchObject({
      id: TEST_USER_ID,
      email: MIXED_CASE_EMAIL,
      role: 'PATIENT',
      patientSite: 'china',
    });
  });
});
