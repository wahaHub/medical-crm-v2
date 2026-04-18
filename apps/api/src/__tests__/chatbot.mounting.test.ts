import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockServices = {
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    attachPatient: vi.fn(),
    updateStatus: vi.fn(),
  },
  aiChatMessageRepo: {
    create: vi.fn(),
    updateMessage: vi.fn(),
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
  bootstrapAiSync: {
    execute: vi.fn(),
  },
  registerHospitalUser: {
    execute: vi.fn(),
  },
  validateRegistrationToken: {
    execute: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: async (c: { json: (body: unknown, status: number) => Response }) =>
    c.json({ error: 'Missing or invalid Authorization header' }, 401),
}));

const NOW = new Date('2026-03-30T12:00:00.000Z');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'db-session-1',
    sessionId: 'policy-e2e-1',
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

describe('Chatbot public route mounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DIFY_APP_API_KEY'] = 'app-test-key';
    process.env['DIFY_API_KEY'] = 'app-test-key';
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatMessageRepo.create.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.aiChatMessageRepo.updateMessage.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
      id,
      sessionId: 'db-session-1',
      role: 'ASSISTANT',
      content: patch.content ?? '',
      intent: patch.intent ?? null,
      resolvedIntent: patch.resolvedIntent ?? null,
      riskLevel: patch.riskLevel ?? null,
      canAnswer: patch.canAnswer ?? null,
      nextAction: patch.nextAction ?? null,
      secondaryAction: patch.secondaryAction ?? null,
      responseMode: patch.responseMode ?? null,
      citations: patch.citations ?? [],
      reasonCodes: patch.reasonCodes ?? [],
      shortlist: patch.shortlist ?? [],
      metadata: patch.metadata ?? {},
      createdAt: NOW,
    }));
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-1',
      answer: JSON.stringify({
        answer: 'Hello from the chatbot.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'ANSWER',
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });
    mockServices.bootstrapAiSync.execute.mockResolvedValue({ faq: 1, packages: 1 });
  });

  afterEach(() => {
    delete process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'];
    delete process.env['CHATBOT_V3_CUTOVER_NOW'];
  });

  it('keeps POST /api/v2/chatbot/chat public even when global auth rejects /api/v2/*', async () => {
    process.env['CHATBOT_V3_CUTOVER_ACTIVATED_AT'] = '2026-04-10T00:00:00.000Z';
    process.env['CHATBOT_V3_CUTOVER_NOW'] = '2026-04-18T12:00:00.000Z';
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-medora-site': 'china' },
      body: JSON.stringify({
        sessionId: 'policy-e2e-1',
        hospitalType: 'COSMETIC',
        message: 'Hi, I am just exploring what you do.',
      }),
    });

    expect(res.status).toBe(410);
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
  });

  it('keeps POST /api/v2/chatbot/sync behind authenticated routing', async () => {
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v2/chatbot/sync', {
      method: 'POST',
    });

    expect(res.status).toBe(401);
    expect(mockServices.bootstrapAiSync.execute).not.toHaveBeenCalled();
  });
});
