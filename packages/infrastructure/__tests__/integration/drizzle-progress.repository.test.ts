import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CaseProgress, Case, CaseNumber } from '@medical-crm/domain';
import { DrizzleCaseProgressRepository } from '../../database/repositories/drizzle-case-progress.repository.js';
import { DrizzleCaseRepository } from '../../database/repositories/drizzle-case.repository.js';
import { testDb, cleanupTestCases } from './helpers.js';
import { users, hospitals } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';

const TEST_PATIENT_ID = randomUUID();
const TEST_HOSPITAL_ID = randomUUID();
const TEST_CASE_ID = randomUUID();

let progressRepo: DrizzleCaseProgressRepository;
let seq = 0;

function nextTestCaseNumber(): string {
  seq += 1;
  return `CASE-9999-${String(8000 + seq).padStart(4, '0')}`;
}

function makeProgress(overrides: Partial<{
  id: string;
  caseId: string;
  title: string;
  description: string | null;
  progressType: 'STATUS_CHANGE' | 'DOCUMENT_UPLOAD' | 'VIDEO_CONSULTATION' | 'MESSAGE' | 'APPOINTMENT';
  metadata: Record<string, unknown> | null;
  recordedAt: Date;
  recordedById: string | null;
}> = {}): CaseProgress {
  return new CaseProgress({
    id: overrides.id ?? randomUUID(),
    caseId: overrides.caseId ?? TEST_CASE_ID,
    title: overrides.title ?? 'Test Progress Entry',
    description: overrides.description ?? 'Test description',
    progressType: overrides.progressType ?? 'STATUS_CHANGE',
    metadata: overrides.metadata ?? null,
    recordedAt: overrides.recordedAt ?? new Date(),
    recordedById: overrides.recordedById ?? null,
  });
}

beforeAll(async () => {
  progressRepo = new DrizzleCaseProgressRepository(testDb);

  await cleanupTestCases();

  const now = new Date().toISOString();

  await testDb.insert(hospitals).values({
    id: TEST_HOSPITAL_ID,
    name: 'Progress Test Hospital',
    status: 'ACTIVE',
    type: 'COSMETIC',
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(users).values({
    id: TEST_PATIENT_ID,
    email: `test-progress-patient-${TEST_PATIENT_ID}@integration.test`,
    name: 'Progress Test Patient',
    role: 'PATIENT',
    preferredLanguage: 'en',
    updatedAt: now,
  }).onConflictDoNothing();

  // Create a test case for progress entries to reference
  const caseRepo = new DrizzleCaseRepository(testDb);
  await caseRepo.save(new Case({
    id: TEST_CASE_ID,
    caseNumber: new CaseNumber(nextTestCaseNumber()),
    patientId: TEST_PATIENT_ID,
    patientName: 'Progress Test Patient',
    patientCountry: 'US',
    patientLanguage: 'en',
    assignedHospitalId: TEST_HOSPITAL_ID,
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'PENDING_ASSIGNMENT',
    assignedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
});

afterAll(async () => {
  await cleanupTestCases();
  await testDb.delete(users).where(eq(users.id, TEST_PATIENT_ID));
  await testDb.delete(hospitals).where(eq(hospitals.id, TEST_HOSPITAL_ID));
});

describe('DrizzleCaseProgressRepository integration', () => {
  it('save + findByCaseId round-trip', async () => {
    const entry = makeProgress({ title: 'Status changed to active' });
    const saved = await progressRepo.save(entry);

    expect(saved.id).toBe(entry.id);
    expect(saved.caseId).toBe(TEST_CASE_ID);
    expect(saved.title).toBe('Status changed to active');
    expect(saved.description).toBe('Test description');
    expect(saved.progressType).toBe('STATUS_CHANGE');
    expect(saved.recordedAt).toBeInstanceOf(Date);

    const results = await progressRepo.findByCaseId(TEST_CASE_ID);
    const found = results.find((p) => p.id === entry.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('Status changed to active');
  });

  it('findByCaseId returns entries ordered by recordedAt DESC', async () => {
    const older = makeProgress({
      title: 'Older entry',
      recordedAt: new Date('2025-01-01T00:00:00Z'),
    });
    const newer = makeProgress({
      title: 'Newer entry',
      recordedAt: new Date('2025-06-15T00:00:00Z'),
    });

    await progressRepo.save(older);
    await progressRepo.save(newer);

    const results = await progressRepo.findByCaseId(TEST_CASE_ID);

    // Find our two entries
    const olderIdx = results.findIndex((p) => p.id === older.id);
    const newerIdx = results.findIndex((p) => p.id === newer.id);

    expect(olderIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeGreaterThan(-1);
    // Newer entry should appear before older entry (DESC order)
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it('metadata round-trip (JSONB via videoSummary column)', async () => {
    const meta = {
      videoUrl: 'https://example.com/video.mp4',
      duration: 300,
      summary: 'Patient discussed treatment options',
      tags: ['consultation', 'follow-up'],
      nested: { key: 'value' },
    };

    const entry = makeProgress({
      progressType: 'VIDEO_CONSULTATION',
      metadata: meta,
    });

    const saved = await progressRepo.save(entry);
    expect(saved.metadata).toEqual(meta);

    const results = await progressRepo.findByCaseId(TEST_CASE_ID);
    const found = results.find((p) => p.id === entry.id);
    expect(found).toBeDefined();
    expect(found!.metadata).toEqual(meta);
    expect((found!.metadata as Record<string, unknown>)['videoUrl']).toBe('https://example.com/video.mp4');
    expect((found!.metadata as Record<string, unknown>)['duration']).toBe(300);
    expect((found!.metadata as Record<string, unknown>)['tags']).toEqual(['consultation', 'follow-up']);
  });

  it('null metadata round-trip', async () => {
    const entry = makeProgress({ metadata: null });
    const saved = await progressRepo.save(entry);
    expect(saved.metadata).toBeNull();

    const results = await progressRepo.findByCaseId(TEST_CASE_ID);
    const found = results.find((p) => p.id === entry.id);
    expect(found).toBeDefined();
    expect(found!.metadata).toBeNull();
  });

  it('findByCaseId returns empty array for non-existent case', async () => {
    const results = await progressRepo.findByCaseId(randomUUID());
    expect(results).toEqual([]);
  });

  it('saves all progress types', async () => {
    const types = ['STATUS_CHANGE', 'DOCUMENT_UPLOAD', 'VIDEO_CONSULTATION', 'MESSAGE', 'APPOINTMENT'] as const;

    for (const pt of types) {
      const entry = makeProgress({ progressType: pt, title: `Test ${pt}` });
      const saved = await progressRepo.save(entry);
      expect(saved.progressType).toBe(pt);
    }
  });
});
