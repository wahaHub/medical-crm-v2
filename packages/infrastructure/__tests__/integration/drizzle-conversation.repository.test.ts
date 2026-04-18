import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, and, sql } from 'drizzle-orm';
import { Case, CaseNumber, Conversation } from '@medical-crm/domain';
import { DrizzleCaseRepository } from '../../database/repositories/drizzle-case.repository.js';
import { DrizzleConversationRepository } from '../../database/repositories/drizzle-conversation.repository.js';
import { cases, conversations, users } from '../../database/schema/index.js';
import { cleanupTestCases, testDb } from './helpers.js';

const TEST_PATIENT_ID = randomUUID();

let caseRepo: DrizzleCaseRepository;
let conversationRepo: DrizzleConversationRepository;
let seq = 0;

function nextTestCaseNumber(): string {
  seq += 1;
  return `CASE-9999-${String(seq).padStart(4, '0')}`;
}

function makeCase(overrides: Partial<{
  id: string;
  caseNumber: string;
}> = {}): Case {
  const id = overrides.id ?? randomUUID();
  return new Case({
    id,
    caseNumber: new CaseNumber(overrides.caseNumber ?? nextTestCaseNumber()),
    patientId: TEST_PATIENT_ID,
    patientName: 'Conversation Integration Patient',
    patientCountry: 'US',
    patientLanguage: 'en',
    assignedHospitalId: null,
    primaryDiagnosis: 'Test diagnosis',
    diagnosisCode: 'T00.0',
    symptoms: ['fatigue'],
    medicalHistory: 'None',
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: 'LOW',
    status: 'ACTIVE',
    stage: 'PENDING_ASSIGNMENT',
    assignedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

beforeAll(async () => {
  caseRepo = new DrizzleCaseRepository(testDb);
  conversationRepo = new DrizzleConversationRepository(testDb);
  await cleanupTestCases();
  await testDb.insert(users).values({
    id: TEST_PATIENT_ID,
    email: `conversation-patient-${TEST_PATIENT_ID}@integration.test`,
    name: 'Conversation Integration Patient',
    role: 'PATIENT',
    patientSite: 'beauty',
    country: 'US',
    preferredLanguage: 'en',
    updatedAt: new Date().toISOString(),
  }).onConflictDoNothing();
}, 30000);

afterAll(async () => {
  await testDb.delete(conversations).where(
    sql`${conversations.caseId} IN (
      SELECT id FROM cases WHERE case_number LIKE 'CASE-9999-%'
    )`,
  );
  await cleanupTestCases();
  await testDb.delete(users).where(eq(users.id, TEST_PATIENT_ID));
}, 30000);

describe('DrizzleConversationRepository integration', () => {
  it('findOrCreateAdminPatientConversation returns a single ADMIN_PATIENT conversation under concurrent calls', async () => {
    const savedCase = await caseRepo.save(makeCase());
    const now = new Date();
    const buildConversation = () => new Conversation({
      id: randomUUID(),
      caseId: savedCase.id,
      category: 'ADMIN_PATIENT',
      title: null,
      hospitalId: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: now,
      updatedAt: now,
    });

    const [first, second] = await Promise.all([
      conversationRepo.findOrCreateAdminPatientConversation(buildConversation()),
      conversationRepo.findOrCreateAdminPatientConversation(buildConversation()),
    ]);

    expect(first.id).toBe(second.id);
    expect(first.caseId).toBe(savedCase.id);
    expect(first.category).toBe('ADMIN_PATIENT');

    const rows = await testDb
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.caseId, savedCase.id),
        eq(conversations.category, 'ADMIN_PATIENT'),
      ));

    expect(rows).toHaveLength(1);

    await testDb.delete(conversations).where(eq(conversations.id, first.id));
    await testDb.delete(cases).where(eq(cases.id, savedCase.id));
  });
});
