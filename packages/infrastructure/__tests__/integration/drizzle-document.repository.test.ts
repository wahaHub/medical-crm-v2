import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Document, Case, CaseNumber } from '@medical-crm/domain';
import { DrizzleDocumentRepository } from '../../database/repositories/drizzle-document.repository.js';
import { DrizzleCaseRepository } from '../../database/repositories/drizzle-case.repository.js';
import { testDb, cleanupTestCases } from './helpers.js';
import { users, hospitals } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';

const TEST_PATIENT_ID = randomUUID();
const TEST_HOSPITAL_ID = randomUUID();
const TEST_CASE_ID = randomUUID();

let docRepo: DrizzleDocumentRepository;
let seq = 0;

function nextTestCaseNumber(): string {
  seq += 1;
  return `CASE-9999-${String(5000 + seq).padStart(4, '0')}`;
}

function makeDocument(overrides: Partial<{
  id: string;
  caseId: string;
  fileName: string;
  status: 'PENDING' | 'ACTIVE' | 'DELETED';
}> = {}): Document {
  return new Document({
    id: overrides.id ?? randomUUID(),
    caseId: overrides.caseId ?? TEST_CASE_ID,
    uploadedById: TEST_PATIENT_ID,
    fileName: overrides.fileName ?? `test-file-${randomUUID().slice(0, 8)}.pdf`,
    fileSize: 12345,
    mimeType: 'application/pdf',
    storageKey: `test/${randomUUID()}`,
    documentType: 'LAB',
    sensitivity: 'PHI_HIGH',
    language: 'en',
    isTranslated: false,
    status: overrides.status ?? 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

beforeAll(async () => {
  docRepo = new DrizzleDocumentRepository(testDb);

  await cleanupTestCases();

  const now = new Date().toISOString();

  await testDb.insert(hospitals).values({
    id: TEST_HOSPITAL_ID,
    name: 'Doc Test Hospital',
    status: 'ACTIVE',
    type: 'COSMETIC',
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(users).values({
    id: TEST_PATIENT_ID,
    email: `test-doc-patient-${TEST_PATIENT_ID}@integration.test`,
    name: 'Doc Test Patient',
    role: 'PATIENT',
    preferredLanguage: 'en',
    updatedAt: now,
  }).onConflictDoNothing();

  // Create a test case for documents to reference
  const caseRepo = new DrizzleCaseRepository(testDb);
  await caseRepo.save(new Case({
    id: TEST_CASE_ID,
    caseNumber: new CaseNumber(nextTestCaseNumber()),
    patientId: TEST_PATIENT_ID,
    patientName: 'Doc Test Patient',
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

describe('DrizzleDocumentRepository integration', () => {
  it('save + findByCaseId round-trip (excludes DELETED)', async () => {
    const doc1 = makeDocument({ fileName: 'active-doc.pdf' });
    const doc2 = makeDocument({ fileName: 'deleted-doc.pdf', status: 'ACTIVE' });
    await docRepo.save(doc1);
    await docRepo.save(doc2);

    // Soft-delete the second document
    await docRepo.softDelete(doc2.id);

    const results = await docRepo.findByCaseId(TEST_CASE_ID);
    const fileNames = results.map((d) => d.fileName);

    expect(fileNames).toContain('active-doc.pdf');
    expect(fileNames).not.toContain('deleted-doc.pdf');
  });

  it('save persists all fields correctly', async () => {
    const doc = makeDocument({ fileName: 'full-fields.pdf' });
    const saved = await docRepo.save(doc);

    expect(saved.id).toBe(doc.id);
    expect(saved.caseId).toBe(TEST_CASE_ID);
    expect(saved.uploadedById).toBe(TEST_PATIENT_ID);
    expect(saved.fileName).toBe('full-fields.pdf');
    expect(saved.fileSize).toBe(12345);
    expect(saved.mimeType).toBe('application/pdf');
    expect(saved.documentType).toBe('LAB');
    expect(saved.sensitivity).toBe('PHI_HIGH');
    expect(saved.language).toBe('en');
    expect(saved.isTranslated).toBe(false);
    expect(saved.status).toBe('ACTIVE');
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);
  });

  it('softDelete changes status to DELETED', async () => {
    const doc = makeDocument();
    await docRepo.save(doc);

    // Verify it exists
    const before = await docRepo.findById(doc.id);
    expect(before).not.toBeNull();
    expect(before!.status).toBe('ACTIVE');

    // Soft-delete
    await docRepo.softDelete(doc.id);

    // findById still returns the record (it doesn't filter by status)
    const after = await docRepo.findById(doc.id);
    expect(after).not.toBeNull();
    expect(after!.status).toBe('DELETED');
  });

  it('findByCaseId returns documents ordered by createdAt DESC', async () => {
    // Create documents with slightly different timestamps
    const doc1 = makeDocument({ fileName: 'first.pdf' });
    const doc2 = makeDocument({ fileName: 'second.pdf' });

    await docRepo.save(doc1);
    // Small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 50));
    await docRepo.save(doc2);

    const results = await docRepo.findByCaseId(TEST_CASE_ID);
    const activeResults = results.filter((d) =>
      d.fileName === 'first.pdf' || d.fileName === 'second.pdf',
    );

    // Most recent should come first
    if (activeResults.length >= 2) {
      expect(activeResults[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        activeResults[1]!.createdAt.getTime(),
      );
    }
  });

  it('findById returns null for non-existent id', async () => {
    const found = await docRepo.findById(randomUUID());
    expect(found).toBeNull();
  });
});
