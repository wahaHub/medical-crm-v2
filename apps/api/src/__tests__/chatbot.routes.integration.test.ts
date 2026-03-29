import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { chatbotChatResponseSchema, chatbotHistoryResponseSchema } from '@medical-crm/validation';
import {
  AiChatMessage,
  AiChatSession,
} from '@medical-crm/domain';
import {
  DrizzleAiChatMessageRepository,
  DrizzleAiChatSessionRepository,
} from '@medical-crm/infrastructure/repositories';
import { aiChatMessages, aiChatSessions } from '@medical-crm/infrastructure/database/schema';
import chatbotRoutes from '../routes/chatbot.routes.js';
import { testDb } from '../../../../packages/infrastructure/__tests__/integration/helpers.js';

const SESSION_PREFIX = 'it-route-session-';

const mockServices = {
  aiChatSessionRepo: new DrizzleAiChatSessionRepository(testDb),
  aiChatMessageRepo: new DrizzleAiChatMessageRepository(testDb),
  difyApi: {
    createChatMessage: vi.fn(),
  },
  patientAuthService: {
    verifySessionToken: vi.fn(),
    createSessionToken: vi.fn(),
  },
  mediaUpload: {
    createUploadIntent: vi.fn(),
  },
  initOnboarding: {
    execute: vi.fn(),
  },
  caseRepo: {
    findById: vi.fn(),
    save: vi.fn(),
  },
  createTicket: {
    execute: vi.fn(),
  },
  bootstrapAiSync: {
    execute: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

const app = new OpenAPIHono();
app.route('/', chatbotRoutes);

async function cleanupAiChatArtifacts() {
  await testDb.execute(`
    DELETE FROM ai_chat_messages
    WHERE session_id IN (
      SELECT id FROM ai_chat_sessions WHERE session_id LIKE '${SESSION_PREFIX}%'
    );
    DELETE FROM ai_chat_sessions
    WHERE session_id LIKE '${SESSION_PREFIX}%';
  `);
}

beforeAll(async () => {
  await cleanupAiChatArtifacts();
});

beforeEach(async () => {
  vi.clearAllMocks();
  process.env['DIFY_API_KEY'] = 'integration-dify-key';
  await cleanupAiChatArtifacts();
});

afterAll(async () => {
  await cleanupAiChatArtifacts();
});

describe('Chatbot routes integration', () => {
  it('POST /api/v2/chatbot/chat creates a real DB session and persists user/assistant messages', async () => {
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'conv-int-1',
      answer: JSON.stringify({
        answer: 'Please share your reports.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        topic: 'DOCUMENTS',
        nextAction: 'REQUEST_DOCS',
        secondaryAction: 'CONSULT_CONVERSION',
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['documents_requested'],
        shortlist: [{ hospitalId: 'hospital-2', matchType: 'matched', reasonCodes: ['docs_ready'] }],
        missingItems: ['medical report'],
        citations: [{ sourceTitle: 'FAQ', snippet: 'Bring your latest report.' }],
      }),
      metadata: { retriever_resources: [] },
    });

    const sessionId = `${SESSION_PREFIX}${randomUUID()}`;
    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        hospitalType: 'COSMETIC',
        message: 'I want to consult about rhinoplasty.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.sessionId).toBe(sessionId);
    expect(json.topic).toBe('DOCUMENTS');
    expect(json.nextAction).toBe('REQUEST_DOCS');
    expect(json.secondaryAction).toBe('CONSULT_CONVERSION');
    expect(json.responseMode).toBe('grounded_plus_guidance');
    expect(json.reasonCodes).toEqual(['documents_requested']);
    expect(json.shortlist).toEqual([{ hospitalId: 'hospital-2', matchType: 'matched', reasonCodes: ['docs_ready'] }]);
    expect(json.missingItems).toEqual(['medical report']);

    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('chatbot_session_secret=');

    const session = await mockServices.aiChatSessionRepo.findBySessionId(sessionId);
    expect(session).not.toBeNull();
    expect(session?.difyConversationId).toBe('conv-int-1');

    const messages = await mockServices.aiChatMessageRepo.listBySession(session!.id, 10);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('ASSISTANT');
    expect(messages[1]?.role).toBe('USER');
    expect(messages[0]?.nextAction).toBe('REQUEST_DOCS');
    expect(messages[0]?.resolvedIntent).toBe('CONSULT');
    expect(messages[0]?.secondaryAction).toBe('CONSULT_CONVERSION');
    expect(messages[0]?.responseMode).toBe('grounded_plus_guidance');
    expect(messages[0]?.reasonCodes).toEqual(['documents_requested']);
    expect(messages[0]?.shortlist).toEqual([{ hospitalId: 'hospital-2', matchType: 'matched', reasonCodes: ['docs_ready'] }]);
    expect(messages[0]?.metadata).toMatchObject({
      topic: 'DOCUMENTS',
    });
  });

  it('GET /api/v2/chatbot/history/{sessionId} reads ordered history from the real database', async () => {
    const secret = 'route-secret-123';
    const session = await mockServices.aiChatSessionRepo.save(new AiChatSession({
      id: randomUUID(),
      sessionId: `${SESSION_PREFIX}${randomUUID()}`,
      sessionSecretHash: createHash('sha256').update(secret).digest('hex'),
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await mockServices.aiChatMessageRepo.create(new AiChatMessage({
      id: randomUUID(),
      sessionId: session.id,
      role: 'USER',
      content: 'First question',
      intent: null,
      riskLevel: null,
      canAnswer: null,
      nextAction: null,
      citations: [],
      metadata: {},
      createdAt: new Date('2026-03-27T08:00:00Z'),
    }));
    await mockServices.aiChatMessageRepo.create(new AiChatMessage({
      id: randomUUID(),
      sessionId: session.id,
      role: 'ASSISTANT',
      content: 'Second answer',
      intent: 'FAQ',
      riskLevel: 'NORMAL',
      canAnswer: true,
      nextAction: 'ANSWER',
      citations: [{ sourceTitle: 'FAQ', snippet: 'Clinic hours are 9-5.' }],
      metadata: {},
      createdAt: new Date('2026-03-27T08:05:00Z'),
    }));

    const res = await app.request(`/api/v2/chatbot/history/${session.sessionId}?limit=10`, {
      method: 'GET',
      headers: {
        Cookie: `chatbot_session_secret=${secret}`,
      },
    });

    expect(res.status).toBe(200);
    const json = chatbotHistoryResponseSchema.parse(await res.json());
    expect(json.session.sessionId).toBe(session.sessionId);
    expect(json.session.status).toBe('ACTIVE');
    expect(json.messages).toHaveLength(2);
    expect(json.messages[0]?.content).toBe('First question');
    expect(json.messages[1]?.content).toBe('Second answer');
    expect(json.messages[1]?.nextAction).toBe('ANSWER');
  });
});
