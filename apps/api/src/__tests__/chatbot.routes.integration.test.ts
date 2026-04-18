import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  difyClassifierApi: {
    createChatMessage: vi.fn(),
  },
  difyFaqGroundingApi: {
    createChatMessage: vi.fn(),
  },
  patientAuthService: {
    verifySessionToken: vi.fn(),
    createSessionToken: vi.fn(),
  },
  mediaUpload: {
    createUploadIntent: vi.fn(),
  },
  storage: {
    getSignedUrls: vi.fn(),
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
  getTemplateByDisease: {
    execute: vi.fn(),
  },
  getAiPolicyContext: {
    execute: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

const app = new OpenAPIHono();
app.route('/', chatbotRoutes);

const CUTOVER_ACTIVATED_AT = '2026-03-20T00:00:00.000Z';
const CUTOVER_IN_WINDOW_NOW = '2026-03-26T10:00:00.000Z';
const CUTOVER_AFTER_WINDOW_NOW = '2026-03-28T00:00:00.000Z';

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
  mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
    answer: JSON.stringify({
      requestClass: 'faq',
      targetResourceTypes: [],
      includeProgressionFollowUp: false,
    }),
  });
  mockServices.difyFaqGroundingApi.createChatMessage.mockResolvedValue({
    answer: JSON.stringify({
      faqScope: 'GENERAL_ONLY',
      categories: ['Consultation Process'],
      groundedContext: 'Grounded FAQ context',
    }),
  });
  mockServices.storage.getSignedUrls.mockResolvedValue({});
  mockServices.getTemplateByDisease.execute.mockRejectedValue(new Error('default questionnaire unavailable'));
  mockServices.getAiPolicyContext.execute.mockResolvedValue({
    chatbot_v2: {
      source: 'status_snapshot_bridge',
      scope_id: 'session-1',
      journey_snapshot: {
        current_stage: 'EXPLAIN_PROCESS',
        current_phase: 'active',
      },
      allowed_resources: [
        {
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: {
            mode: 'journey',
          },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        },
      ],
    },
    status_snapshot: {
      form_status: 'NOT_STARTED',
    },
  });
  await cleanupAiChatArtifacts();
});

afterEach(() => {
  delete process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'];
  delete process.env['CHATBOT_V3_CUTOVER_NOW'];
});

afterAll(async () => {
  await cleanupAiChatArtifacts();
});

describe('Chatbot routes integration', () => {
  it('POST /api/v2/chatbot/chat returns 410 Gone after cutover', async () => {
    process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'] = CUTOVER_ACTIVATED_AT;
    process.env['CHATBOT_V3_CUTOVER_NOW'] = CUTOVER_IN_WINDOW_NOW;

    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'conv-int-1',
      answer: JSON.stringify({
        answer: 'Please share your reports.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        topic: 'DOCUMENTS',
        nextAction: 'REQUEST_DOC_UPLOAD',
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
      headers: { 'Content-Type': 'application/json', 'x-medora-site': 'china' },
      body: JSON.stringify({
        sessionId,
        hospitalType: 'COSMETIC',
        message: 'I want to consult about rhinoplasty.',
      }),
    });

    expect(res.status).toBe(410);
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
  }, 15000);

  it('GET /api/v2/chatbot/history/{sessionId} reads ordered history from the real database during the drain window', async () => {
    process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'] = CUTOVER_ACTIVATED_AT;
    process.env['CHATBOT_V3_CUTOVER_NOW'] = CUTOVER_IN_WINDOW_NOW;

    const secret = 'route-secret-123';
    const session = await mockServices.aiChatSessionRepo.save(new AiChatSession({
      id: randomUUID(),
      sessionId: `${SESSION_PREFIX}${randomUUID()}`,
      site: 'china',
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
      nextAction: 'ANSWER_FAQ',
      citations: [{ sourceTitle: 'FAQ', snippet: 'Clinic hours are 9-5.' }],
      metadata: {},
      createdAt: new Date('2026-03-27T08:05:00Z'),
    }));

    const res = await app.request(`/api/v2/chatbot/history/${session.sessionId}?limit=10`, {
      method: 'GET',
      headers: {
        'x-medora-site': 'china',
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
    expect(json.messages[1]?.nextAction).toBe('ANSWER_FAQ');
  }, 15000);

  it('GET /api/v2/chatbot/history/{sessionId} returns 410 Gone after the drain window closes', async () => {
    process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'] = CUTOVER_ACTIVATED_AT;
    process.env['CHATBOT_V3_CUTOVER_NOW'] = CUTOVER_AFTER_WINDOW_NOW;

    const secret = 'route-secret-123';
    const session = await mockServices.aiChatSessionRepo.save(new AiChatSession({
      id: randomUUID(),
      sessionId: `${SESSION_PREFIX}${randomUUID()}`,
      site: 'china',
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

    const res = await app.request(`/api/v2/chatbot/history/${session.sessionId}?limit=10`, {
      method: 'GET',
      headers: {
        'x-medora-site': 'china',
        Cookie: `chatbot_session_secret=${secret}`,
      },
    });

    expect(res.status).toBe(410);
  }, 15000);

  it('POST /api/v2/chatbot/chat falls back safely when Dify returns plain text instead of structured JSON', async () => {
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'conv-int-plain-1',
      answer: 'We can help you continue this conversation with our team.',
      metadata: { retriever_resources: [] },
    });

    const sessionId = `${SESSION_PREFIX}${randomUUID()}`;
    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-medora-site': 'china' },
      body: JSON.stringify({
        sessionId,
        hospitalType: 'COSMETIC',
        message: 'Can you help me?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.answer).toBe('We can help you continue this conversation with our team.');
    expect(json.topic).toBeNull();
    expect(json.nextAction).toBeNull();
    expect(json.reasonCodes).toEqual([]);
    expect(json.shortlist).toEqual([]);
  }, 15000);
});
