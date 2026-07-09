import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Case, CaseNumber } from '@medical-crm/domain';
import { DrizzleCaseRepository } from '../../database/repositories/drizzle-case.repository.js';
import { testDb, cleanupTestCases } from './helpers.js';
import { users, hospitals } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';

// Shared IDs for the test suite
const TEST_PATIENT_ID = randomUUID();
const EXAMPLE_PATIENT_ID = randomUUID();
const TEST_HOSPITAL_ID = randomUUID();
const TEST_HOSPITAL_ID_2 = randomUUID();
const FILTER_TEST_HOSPITAL_ID = randomUUID();

let repo: DrizzleCaseRepository;

// Atomic counter to avoid case_number collisions across tests
let seq = 0;
function nextTestCaseNumber(): string {
  seq += 1;
  return `CASE-9999-${String(seq).padStart(4, '0')}`;
}

beforeAll(async () => {
  repo = new DrizzleCaseRepository(testDb);

  // Clean up any leftover test data from previous runs
  await cleanupTestCases();

  // Seed prerequisite records (cases FK -> users, hospitals)
  const now = new Date().toISOString();

  await testDb.insert(hospitals).values([
    {
      id: TEST_HOSPITAL_ID,
      name: 'Test Hospital A',
      status: 'ACTIVE',
      type: 'COSMETIC',
      updatedAt: now,
    },
    {
      id: TEST_HOSPITAL_ID_2,
      name: 'Test Hospital B',
      status: 'ACTIVE',
      type: 'COSMETIC',
      updatedAt: now,
    },
    {
      id: FILTER_TEST_HOSPITAL_ID,
      name: 'Example Filter Test Hospital',
      status: 'ACTIVE',
      type: 'COSMETIC',
      updatedAt: now,
    },
  ]).onConflictDoNothing();

  await testDb.insert(users).values({
    id: TEST_PATIENT_ID,
    email: `test-patient-${TEST_PATIENT_ID}@integration.test`,
    name: 'Test Patient',
    role: 'PATIENT',
    patientSite: 'china',
    preferredLanguage: 'en',
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(users).values({
    id: EXAMPLE_PATIENT_ID,
    email: `sample-${EXAMPLE_PATIENT_ID}@example.com`,
    name: 'Example Test Patient',
    role: 'PATIENT',
    patientSite: 'china',
    preferredLanguage: 'en',
    updatedAt: now,
  }).onConflictDoNothing();
});

afterAll(async () => {
  // Remove test cases (and cascading progress/documents)
  await cleanupTestCases();

  // Remove seeded users and hospitals
  await testDb.delete(users).where(eq(users.id, EXAMPLE_PATIENT_ID));
  await testDb.delete(users).where(eq(users.id, TEST_PATIENT_ID));
  await testDb.delete(hospitals).where(eq(hospitals.id, TEST_HOSPITAL_ID));
  await testDb.delete(hospitals).where(eq(hospitals.id, TEST_HOSPITAL_ID_2));
  await testDb.delete(hospitals).where(eq(hospitals.id, FILTER_TEST_HOSPITAL_ID));
});

function makeCase(overrides: Partial<{
  id: string;
  caseNumber: string;
  patientName: string;
  hospitalId: string | null;
  status: 'ACTIVE' | 'DRAFT';
  stage: 'PENDING_ASSIGNMENT' | 'TRANSFERRED_TO_HOSPITAL';
  patientId: string;
}> = {}): Case {
  const id = overrides.id ?? randomUUID();
  const cn = overrides.caseNumber ?? nextTestCaseNumber();
  return new Case({
    id,
    caseNumber: new CaseNumber(cn),
    patientId: overrides.patientId ?? TEST_PATIENT_ID,
    patientName: overrides.patientName ?? 'Integration Test Patient',
    patientCountry: 'US',
    patientLanguage: 'en',
    assignedHospitalId: overrides.hospitalId ?? TEST_HOSPITAL_ID,
    primaryDiagnosis: 'Test diagnosis',
    diagnosisCode: 'T00.0',
    symptoms: ['headache', 'fatigue'],
    medicalHistory: 'None',
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: 'LOW',
    status: overrides.status ?? 'ACTIVE',
    stage: overrides.stage ?? 'PENDING_ASSIGNMENT',
    assignedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('DrizzleCaseRepository integration', () => {
  it('save (insert) + findById round-trip', async () => {
    const cn = nextTestCaseNumber();
    const entity = makeCase({ caseNumber: cn });
    const saved = await repo.save(entity);

    expect(saved.id).toBe(entity.id);
    expect(saved.caseNumber.value).toBe(cn);

    const found = await repo.findById(entity.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(entity.id);
    expect(found!.caseNumber.value).toBe(cn);
    expect(found!.patientName).toBe('Integration Test Patient');
    expect(found!.patientCountry).toBe('US');
    expect(found!.patientLanguage).toBe('en');
    expect(found!.assignedHospitalId).toBe(TEST_HOSPITAL_ID);
    expect(found!.primaryDiagnosis).toBe('Test diagnosis');
    expect(found!.diagnosisCode).toBe('T00.0');
    expect(found!.symptoms).toEqual(['headache', 'fatigue']);
    expect(found!.medicalHistory).toBe('None');
    expect(found!.riskLevel).toBe('LOW');
    expect(found!.status).toBe('ACTIVE');
    expect(found!.stage).toBe('PENDING_ASSIGNMENT');
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
  });

  it('save (upsert) updates existing record', async () => {
    const entity = makeCase();
    await repo.save(entity);

    entity.patientName = 'Updated Name';
    entity.riskLevel = 'HIGH';
    const updated = await repo.save(entity);

    expect(updated.patientName).toBe('Updated Name');
    expect(updated.riskLevel).toBe('HIGH');

    const found = await repo.findById(entity.id);
    expect(found!.patientName).toBe('Updated Name');
    expect(found!.riskLevel).toBe('HIGH');
  });

  it('findById returns null for non-existent id', async () => {
    const found = await repo.findById(randomUUID());
    expect(found).toBeNull();
  });

  it('findMany filters by hospitalId', async () => {
    // Insert cases for two different hospitals
    const cnA1 = nextTestCaseNumber();
    const cnA2 = nextTestCaseNumber();
    const cnB1 = nextTestCaseNumber();
    await repo.save(makeCase({ caseNumber: cnA1, hospitalId: TEST_HOSPITAL_ID }));
    await repo.save(makeCase({ caseNumber: cnA2, hospitalId: TEST_HOSPITAL_ID }));
    await repo.save(makeCase({ caseNumber: cnB1, hospitalId: TEST_HOSPITAL_ID_2 }));

    const result = await repo.findMany(
      { page: 1, limit: 100, hospitalId: TEST_HOSPITAL_ID },
    );

    // All returned cases should belong to TEST_HOSPITAL_ID
    for (const c of result.data) {
      expect(c.assignedHospitalId).toBe(TEST_HOSPITAL_ID);
    }

    // Verify hospital B case is not in hospital A results
    const caseNumbers = result.data.map((c) => c.caseNumber.value);
    expect(caseNumbers).not.toContain(cnB1);
    expect(caseNumbers).toContain(cnA1);
    expect(caseNumbers).toContain(cnA2);
  });

  it('findMany with search (ilike on patientName)', async () => {
    await repo.save(makeCase({ patientName: 'Unique Searchable Name' }));
    await repo.save(makeCase({ patientName: 'Another Person' }));

    const result = await repo.findMany({
      page: 1,
      limit: 100,
      search: 'Unique Searchable',
    });

    const names = result.data.map((c) => c.patientName);
    expect(names).toContain('Unique Searchable Name');
    expect(names).not.toContain('Another Person');
  });

  it('findMany pagination', async () => {
    // Use a unique patient name to isolate these results
    const marker = `PaginationTest-${randomUUID().slice(0, 8)}`;
    await repo.save(makeCase({ patientName: marker }));
    await repo.save(makeCase({ patientName: marker }));
    await repo.save(makeCase({ patientName: marker }));

    const page1 = await repo.findMany({
      page: 1,
      limit: 2,
      search: marker,
    });

    expect(page1.data.length).toBe(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.totalPages).toBe(2);

    const page2 = await repo.findMany({
      page: 2,
      limit: 2,
      search: marker,
    });

    expect(page2.data.length).toBe(1);
    expect(page2.hasMore).toBe(false);
  });

  it('nextCaseNumber returns valid format', async () => {
    const caseNum = await repo.nextCaseNumber();

    // Should follow CASE-YYYY-NNNN format
    expect(caseNum.value).toMatch(/^CASE-\d{4}-\d{4,}$/);
  });

  it('countByFilters returns aggregated stats', async () => {
    const stats = await repo.countByFilters({ hospitalId: TEST_HOSPITAL_ID });

    expect(typeof stats.total).toBe('number');
    expect(typeof stats.unassigned).toBe('number');
    expect(typeof stats.assigned).toBe('number');
    expect(typeof stats.inTreatment).toBe('number');
    expect(typeof stats.postTreatment).toBe('number');
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.followUp).toBe('number');
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.unassigned).toBeGreaterThanOrEqual(0);
  });

  it('countByFilters without hospitalId returns global stats', async () => {
    const stats = await repo.countByFilters({});

    expect(stats.total).toBeGreaterThanOrEqual(0);
  });

  it('excludes cases owned by patients whose email ends with example.com from lists and stats', async () => {
    const marker = `ExampleDomainFilter-${randomUUID().slice(0, 8)}`;
    const visibleCaseNumber = nextTestCaseNumber();
    const exampleCaseNumber = nextTestCaseNumber();

    await repo.save(makeCase({
      caseNumber: visibleCaseNumber,
      patientName: marker,
      patientId: TEST_PATIENT_ID,
      hospitalId: FILTER_TEST_HOSPITAL_ID,
    }));
    await repo.save(makeCase({
      caseNumber: exampleCaseNumber,
      patientName: marker,
      patientId: EXAMPLE_PATIENT_ID,
      hospitalId: FILTER_TEST_HOSPITAL_ID,
    }));

    const result = await repo.findMany({
      page: 1,
      limit: 100,
      search: marker,
      excludedPatientEmailDomains: ['example.com'],
    });
    const caseNumbers = result.data.map((c) => c.caseNumber.value);

    expect(caseNumbers).toContain(visibleCaseNumber);
    expect(caseNumbers).not.toContain(exampleCaseNumber);
    expect(result.total).toBe(1);

    const stats = await repo.countByFilters({
      hospitalId: FILTER_TEST_HOSPITAL_ID,
      excludedPatientEmailDomains: ['example.com'],
    });

    expect(stats.total).toBe(1);
  });
});
