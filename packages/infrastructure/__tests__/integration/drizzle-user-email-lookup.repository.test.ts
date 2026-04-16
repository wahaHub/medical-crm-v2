import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DrizzleUserEmailLookupRepository } from '../../database/repositories/drizzle-user-email-lookup.repository.js';
import { testDb } from './helpers.js';
import { users } from '../../database/schema/index.js';

const TEST_PATIENT_ID = randomUUID();
const TEST_ADMIN_ID = randomUUID();
const PATIENT_EMAIL = `lookup-patient-${TEST_PATIENT_ID}@integration.test`;
const ADMIN_EMAIL = `lookup-admin-${TEST_ADMIN_ID}@integration.test`;

let repo: DrizzleUserEmailLookupRepository;

beforeAll(async () => {
  repo = new DrizzleUserEmailLookupRepository(testDb);

  const now = new Date().toISOString();

  await testDb.insert(users).values([
    {
      id: TEST_PATIENT_ID,
      email: PATIENT_EMAIL,
      name: 'Lookup Patient',
      role: 'PATIENT',
      patientSite: 'china',
      preferredLanguage: 'en',
      updatedAt: now,
    },
    {
      id: TEST_ADMIN_ID,
      email: ADMIN_EMAIL,
      name: 'Lookup Admin',
      role: 'ADMIN',
      preferredLanguage: 'en',
      updatedAt: now,
    },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await testDb.delete(users).where(eq(users.id, TEST_PATIENT_ID));
  await testDb.delete(users).where(eq(users.id, TEST_ADMIN_ID));
});

describe('DrizzleUserEmailLookupRepository integration', () => {
  it('returns NONE when no user exists for the email', async () => {
    await expect(repo.findEmailState(`lookup-missing-${randomUUID()}@integration.test`, 'beauty')).resolves.toEqual({
      state: 'NONE',
    });
  });

  it('returns PATIENT when the email belongs to a patient', async () => {
    await expect(repo.findEmailState(PATIENT_EMAIL, 'china')).resolves.toEqual({
      state: 'PATIENT',
      userId: TEST_PATIENT_ID,
      site: 'china',
    });
  });

  it('returns ADMIN when the email belongs to a non-patient role', async () => {
    await expect(repo.findEmailState(ADMIN_EMAIL, 'beauty')).resolves.toEqual({
      state: 'ADMIN',
      userId: TEST_ADMIN_ID,
    });
  });
});
