import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AiChatMessage,
  AiChatSession,
  AiSyncOutbox,
  DifyDocumentMapping,
} from '@medical-crm/domain';
import { eq, sql } from 'drizzle-orm';
import { DrizzleAiChatMessageRepository } from '../../database/repositories/drizzle-ai-chat-message.repository.js';
import { DrizzleAiChatSessionRepository } from '../../database/repositories/drizzle-ai-chat-session.repository.js';
import { DrizzleAiSyncOutboxRepository } from '../../database/repositories/drizzle-ai-sync-outbox.repository.js';
import { DrizzleDifyDocumentMappingRepository } from '../../database/repositories/drizzle-dify-document-mapping.repository.js';
import {
  aiChatMessages,
  aiChatSessions,
  aiSyncOutbox,
  difyDocumentMappings,
  users,
} from '../../database/schema/index.js';
import { testDb } from './helpers.js';

const SESSION_PREFIX = 'it-chatbot-session-';
const ENTITY_PREFIX = 'it-chatbot-entity-';
const TEST_PATIENT_ID = randomUUID();

let sessionRepo: DrizzleAiChatSessionRepository;
let messageRepo: DrizzleAiChatMessageRepository;
let mappingRepo: DrizzleDifyDocumentMappingRepository;
let outboxRepo: DrizzleAiSyncOutboxRepository;

function makeSession(overrides: Partial<ConstructorParameters<typeof AiChatSession>[0]> = {}) {
  const id = overrides.id ?? randomUUID();
  const sessionId = overrides.sessionId ?? `${SESSION_PREFIX}${randomUUID()}`;
  return new AiChatSession({
    id,
    sessionId,
    sessionSecretHash:
      overrides.sessionSecretHash ?? createHash('sha256').update(`secret-${sessionId}`).digest('hex'),
    difyConversationId: overrides.difyConversationId ?? null,
    patientId: overrides.patientId ?? null,
    hospitalType: overrides.hospitalType ?? 'COSMETIC',
    status: overrides.status ?? 'ACTIVE',
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  });
}

function makeMessage(overrides: Partial<ConstructorParameters<typeof AiChatMessage>[0]> = {}) {
  return new AiChatMessage({
    id: overrides.id ?? randomUUID(),
    sessionId: overrides.sessionId ?? randomUUID(),
    role: overrides.role ?? 'ASSISTANT',
    content: overrides.content ?? 'Test answer',
    intent: overrides.intent ?? 'CONSULT',
    riskLevel: overrides.riskLevel ?? 'NORMAL',
    canAnswer: overrides.canAnswer ?? true,
    nextAction: overrides.nextAction ?? 'CONSULT_CONVERSION',
    citations: overrides.citations ?? [{ sourceTitle: 'FAQ', snippet: 'Example snippet' }],
    metadata: overrides.metadata ?? { workflow: { kind: 'ANSWER' } },
    createdAt: overrides.createdAt ?? new Date(),
  });
}

function makeMapping(overrides: Partial<ConstructorParameters<typeof DifyDocumentMapping>[0]> = {}) {
  return new DifyDocumentMapping({
    id: overrides.id ?? randomUUID(),
    entityType: overrides.entityType ?? 'FAQ',
    entityKey: overrides.entityKey ?? `${ENTITY_PREFIX}${randomUUID()}`,
    difyDatasetId: overrides.difyDatasetId ?? 'dataset-cosmetic',
    difyDocumentId: overrides.difyDocumentId ?? 'doc-123',
    lastSyncedAt: overrides.lastSyncedAt ?? new Date('2026-03-27T00:00:00Z'),
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  });
}

function makeOutbox(overrides: Partial<ConstructorParameters<typeof AiSyncOutbox>[0]> = {}) {
  return new AiSyncOutbox({
    id: overrides.id ?? randomUUID(),
    entityType: overrides.entityType ?? 'FAQ',
    entityKey: overrides.entityKey ?? `${ENTITY_PREFIX}${randomUUID()}`,
    action: overrides.action ?? 'UPSERT',
    attempts: overrides.attempts ?? 0,
    nextRetryAt: overrides.nextRetryAt ?? null,
    status: overrides.status ?? 'PENDING',
    payload: overrides.payload ?? { title: 'FAQ Title' },
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  });
}

async function cleanupAiChatArtifacts() {
  await testDb.delete(aiChatMessages).where(
    sql`${aiChatMessages.sessionId} IN (
      SELECT id FROM ai_chat_sessions WHERE session_id LIKE ${`${SESSION_PREFIX}%`}
    )`,
  );
  await testDb.delete(aiChatSessions).where(
    sql`${aiChatSessions.sessionId} LIKE ${`${SESSION_PREFIX}%`}`,
  );
  await testDb.delete(difyDocumentMappings).where(
    sql`${difyDocumentMappings.entityKey} LIKE ${`${ENTITY_PREFIX}%`}`,
  );
  await testDb.delete(aiSyncOutbox).where(
    sql`${aiSyncOutbox.entityKey} LIKE ${`${ENTITY_PREFIX}%`}`,
  );
}

beforeAll(async () => {
  sessionRepo = new DrizzleAiChatSessionRepository(testDb);
  messageRepo = new DrizzleAiChatMessageRepository(testDb);
  mappingRepo = new DrizzleDifyDocumentMappingRepository(testDb);
  outboxRepo = new DrizzleAiSyncOutboxRepository(testDb);
  await cleanupAiChatArtifacts();
  await testDb.insert(users).values({
    id: TEST_PATIENT_ID,
    email: `ai-chat-patient-${TEST_PATIENT_ID}@integration.test`,
    name: 'AI Chat Integration Patient',
    role: 'PATIENT',
    preferredLanguage: 'en',
    updatedAt: new Date().toISOString(),
  }).onConflictDoNothing();
});

afterAll(async () => {
  await cleanupAiChatArtifacts();
  await testDb.delete(users).where(eq(users.id, TEST_PATIENT_ID));
});

describe('AI chat repositories integration', () => {
  it('persists and mutates chatbot sessions in the migrated ai_chat_sessions table', async () => {
    const entity = makeSession({ difyConversationId: 'conv-1' });

    await sessionRepo.save(entity);

    const foundBySessionId = await sessionRepo.findBySessionId(entity.sessionId);
    expect(foundBySessionId).not.toBeNull();
    expect(foundBySessionId!.difyConversationId).toBe('conv-1');
    expect(foundBySessionId!.hospitalType).toBe('COSMETIC');

    const attached = await sessionRepo.attachPatient(entity.sessionId, TEST_PATIENT_ID);
    expect(attached?.patientId).toBe(TEST_PATIENT_ID);

    const escalated = await sessionRepo.updateStatus(entity.sessionId, 'ESCALATED');
    expect(escalated?.status).toBe('ESCALATED');

    const foundByConversationId = await sessionRepo.findByDifyConversationId('conv-1');
    expect(foundByConversationId?.id).toBe(entity.id);
    expect(foundByConversationId?.patientId).toBe(TEST_PATIENT_ID);
  });

  it('stores chatbot messages newest-first with JSON citations and metadata intact', async () => {
    const session = await sessionRepo.save(makeSession());
    const older = makeMessage({
      sessionId: session.id,
      content: 'Older answer',
      createdAt: new Date('2026-03-27T08:00:00Z'),
    });
    const newer = makeMessage({
      sessionId: session.id,
      content: 'Newer answer',
      nextAction: 'REQUEST_DOCS',
      metadata: { missingItems: ['passport', 'medical report'] },
      createdAt: new Date('2026-03-27T09:00:00Z'),
    });

    await messageRepo.create(older);
    await messageRepo.create(newer);

    const messages = await messageRepo.listBySession(session.id, 10);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('Newer answer');
    expect(messages[1]?.content).toBe('Older answer');
    expect(messages[0]?.nextAction).toBe('REQUEST_DOCS');
    expect(messages[0]?.metadata).toEqual({ missingItems: ['passport', 'medical report'] });
    expect(messages[0]?.citations).toEqual([{ sourceTitle: 'FAQ', snippet: 'Example snippet' }]);
  });

  it('finalizes assistant drafts by merging writeback metadata and can delete abandoned drafts', async () => {
    const session = await sessionRepo.save(makeSession());
    const draft = await messageRepo.create(makeMessage({
      sessionId: session.id,
      content: '',
      intent: null,
      riskLevel: null,
      canAnswer: null,
      nextAction: null,
      citations: [],
      metadata: { engagementMode: 'DEEP_WORKFLOW', writebackDepth: 'complete' },
    }));

    await messageRepo.updateWritebackMetadata(draft.id, {
      metadata: { handoffCreated: true },
      writebackStatus: 'completed',
    });

    const finalized = await messageRepo.updateMessage(draft.id, {
      content: 'Final answer',
      intent: 'CONSULT',
      riskLevel: 'NORMAL',
      canAnswer: true,
      nextAction: 'CONSULT_CONVERSION',
      metadata: { topic: 'PROCEDURE' },
    });

    expect(finalized).not.toBeNull();
    expect(finalized?.content).toBe('Final answer');
    expect(finalized?.metadata).toEqual({
      engagementMode: 'DEEP_WORKFLOW',
      writebackDepth: 'complete',
      handoffCreated: true,
      topic: 'PROCEDURE',
    });
    expect(finalized?.writebackStatus).toBe('completed');

    const abandoned = await messageRepo.create(makeMessage({
      sessionId: session.id,
      content: '',
      metadata: {},
    }));
    expect(await messageRepo.deleteById(abandoned.id)).toBe(true);
    expect(await messageRepo.deleteById(abandoned.id)).toBe(false);
  });

  it('upserts document mappings by logical entity key and deletes them cleanly', async () => {
    const entityKey = `${ENTITY_PREFIX}${randomUUID()}`;
    await mappingRepo.save(makeMapping({
      entityKey,
      difyDocumentId: 'doc-a',
    }));

    const updated = await mappingRepo.save(makeMapping({
      entityKey,
      difyDocumentId: 'doc-b',
      difyDatasetId: 'dataset-regular',
    }));

    expect(updated.difyDocumentId).toBe('doc-b');
    expect(updated.difyDatasetId).toBe('dataset-regular');

    const found = await mappingRepo.findByEntity('FAQ', entityKey);
    expect(found?.difyDocumentId).toBe('doc-b');

    await mappingRepo.deleteByEntity('FAQ', entityKey);
    const deleted = await mappingRepo.findByEntity('FAQ', entityKey);
    expect(deleted).toBeNull();
  });

  it('claims outbox batches in FIFO order and persists retry/done/fail transitions', async () => {
    const first = await outboxRepo.enqueue(makeOutbox({
      entityKey: `${ENTITY_PREFIX}a-${randomUUID()}`,
      createdAt: new Date('2026-03-27T00:00:00Z'),
      updatedAt: new Date('2026-03-27T00:00:00Z'),
    }));
    const second = await outboxRepo.enqueue(makeOutbox({
      entityKey: `${ENTITY_PREFIX}b-${randomUUID()}`,
      createdAt: new Date('2026-03-27T00:01:00Z'),
      updatedAt: new Date('2026-03-27T00:01:00Z'),
    }));

    const claimed = await outboxRepo.claimBatch(2);
    expect(claimed.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(claimed.every((item) => item.status === 'PROCESSING')).toBe(true);

    await outboxRepo.markRetry(first.id, new Date('2026-03-27T01:00:00Z'));
    await outboxRepo.markDone(second.id);

    const [retriedRow] = await testDb
      .select()
      .from(aiSyncOutbox)
      .where(eq(aiSyncOutbox.id, first.id))
      .limit(1);
    expect(retriedRow?.status).toBe('PENDING');
    expect(retriedRow?.attempts).toBe(1);

    const [doneRow] = await testDb
      .select()
      .from(aiSyncOutbox)
      .where(eq(aiSyncOutbox.id, second.id))
      .limit(1);
    expect(doneRow?.status).toBe('DONE');

    await outboxRepo.markFailed(first.id);
    const [failedRow] = await testDb
      .select()
      .from(aiSyncOutbox)
      .where(eq(aiSyncOutbox.id, first.id))
      .limit(1);
    expect(failedRow?.status).toBe('FAILED');
  });
});
