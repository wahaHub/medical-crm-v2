import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
  chatbotChatResponseSchema,
  chatbotConvertResponseSchema,
} from '@medical-crm/validation';
import chatbotRoutes from '../routes/chatbot.routes.js';

const mockServices = {
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    attachPatient: vi.fn(),
    updateStatus: vi.fn(),
  },
  aiChatMessageRepo: {
    create: vi.fn(),
    listBySession: vi.fn(),
  },
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
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

const app = new OpenAPIHono();
app.route('/', chatbotRoutes);

const NOW = new Date('2026-03-26T10:00:00.000Z');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'db-session-1',
    sessionId: 'session-1',
    sessionSecretHash: null,
    difyConversationId: null,
    patientId: null,
    hospitalType: 'COSMETIC',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    sessionId: 'db-session-1',
    role: 'ASSISTANT',
    content: 'ok',
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: null,
    citations: [],
    metadata: {},
    createdAt: NOW,
    ...overrides,
  };
}

describe('Chatbot routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DIFY_API_KEY'] = 'test-dify-key';
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatMessageRepo.create.mockImplementation(async (entity: unknown) => entity);
    mockServices.patientAuthService.createSessionToken.mockResolvedValue('patient-token');
  });

  it('POST /api/v2/chatbot/chat returns normalized structured response without exposing dify conversation id', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-123',
      answer: JSON.stringify({
        answer: 'We can help you with that.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'CONSULT_CONVERSION',
        collectedFields: { country: 'Singapore' },
        missingItems: ['photo'],
        citations: [{ sourceTitle: 'FAQ', snippet: 'Sample snippet' }],
      }),
      metadata: {},
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'I want to consult about rhinoplasty.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.sessionId).toBe('session-1');
    expect(json.intent).toBe('CONSULT');
    expect(json.nextAction).toBe('CONSULT_CONVERSION');
    expect(json.collectedFields?.country).toBe('Singapore');
    expect(json.missingItems).toEqual(['photo']);
    expect('difyConversationId' in (json as Record<string, unknown>)).toBe(false);
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'session-1',
        conversationId: null,
      }),
    );
  });

  it('POST /api/v2/chatbot/uploads/init rejects access without matching chatbot session secret', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
    }));

    const res = await app.request('/api/v2/chatbot/uploads/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(401);
    expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
  });

  it('POST /api/v2/chatbot/convert reuses existing case workflow instead of creating a duplicate case', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'workflow-msg-1',
        role: 'SYSTEM',
        metadata: {
          workflow: {
            kind: 'CONVERT',
            requestedAction: 'CONSULT_CONVERSION',
            patientId: 'patient-1',
            caseId: 'case-1',
          },
        },
      }),
    ]);

    const res = await app.request('/api/v2/chatbot/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        requestedAction: 'CONSULT_CONVERSION',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotConvertResponseSchema.parse(await res.json());
    expect(json.caseId).toBe('case-1');
    expect(json.patientId).toBe('patient-1');
    expect(json.alreadyExists).toBe(true);
    expect(mockServices.initOnboarding.execute).not.toHaveBeenCalled();
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
  });
});
