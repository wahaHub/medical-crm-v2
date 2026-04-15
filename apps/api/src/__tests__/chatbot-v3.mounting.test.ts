import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatbotV3ChatResponseSchema } from '@medical-crm/validation';
import type {
  OrchestratorV3DecisionInput,
  OrchestratorV3Suggestion,
} from '@medical-crm/application';

const NOW = new Date('2026-04-15T00:00:00.000Z');
const SESSION_SECRET = 'secret-v3-1';
const SESSION_SECRET_HASH = createHash('sha256').update(SESSION_SECRET).digest('hex');
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const applicationOverrides: {
  suggest?: (input: OrchestratorV3DecisionInput) => Promise<OrchestratorV3Suggestion>;
  decide?: (input: OrchestratorV3DecisionInput) => ReturnType<
    InstanceType<typeof import('@medical-crm/application').OrchestratorV3Service>['decide']
  >;
} = {};

const mockServices = {
  idempotencyExecutor: {
    execute: vi.fn(async (_key: string, _operation: string, fn: () => Promise<unknown>) => fn()),
  },
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    patchStatus: vi.fn(),
  },
  patientAuthService: {
    verifySessionToken: vi.fn(),
  },
  registerHospitalUser: {
    execute: vi.fn(),
  },
  validateRegistrationToken: {
    execute: vi.fn(),
  },
  createTicket: {
    execute: vi.fn(),
  },
  listFaqItems: {
    execute: vi.fn(),
  },
  listFaqCategoriesForChatbot: {
    execute: vi.fn(),
  },
  getFaqItem: {
    execute: vi.fn(),
  },
  resolveHospitalType: vi.fn(),
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

vi.mock('@medical-crm/application', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@medical-crm/application')>();

  return {
    ...actual,
    SupervisorService: class extends actual.SupervisorService {
      override async suggest(input: OrchestratorV3DecisionInput): Promise<OrchestratorV3Suggestion> {
        if (applicationOverrides.suggest) {
          return applicationOverrides.suggest(input);
        }

        return super.suggest(input);
      }
    },
    OrchestratorV3Service: class extends actual.OrchestratorV3Service {
      override decide(input: OrchestratorV3DecisionInput) {
        if (applicationOverrides.decide) {
          return applicationOverrides.decide(input);
        }

        return super.decide(input);
      }
    },
  };
});

vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: async (c: { json: (body: unknown, status: number) => Response }) =>
    c.json({ error: 'Missing or invalid Authorization header' }, 401),
}));

describe('Chatbot v3 public route mounting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applicationOverrides.suggest = undefined;
    applicationOverrides.decide = undefined;
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatSessionRepo.patchStatus.mockImplementation(async (_sessionId: string, patch: Record<string, unknown>) => ({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: patch['formStatus'] ?? 'not_started',
        docUploadStatus: patch['docUploadStatus'] ?? 'submitted',
        recommendationStatus: 'not_started',
        consultationStatus: patch['consultationStatus'] ?? 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: patch['handoffStatus'] ?? 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-1' });
    mockServices.createTicket.execute.mockResolvedValue({ id: 'ticket-v3-1' });
    mockServices.listFaqItems.execute.mockResolvedValue({
      data: [],
    });
    mockServices.listFaqCategoriesForChatbot.execute.mockResolvedValue({
      categories: [],
    });
    mockServices.getFaqItem.execute.mockResolvedValue(null);
    mockServices.resolveHospitalType.mockResolvedValue('COSMETIC');
  });

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
      return;
    }

    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('keeps POST /api/v3/chatbot/chat public and returns v3-only fields', async () => {
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = res.headers.get('content-type')?.includes('application/json')
      ? await res.json()
      : undefined;

    expect(res.status).toBe(200);
    expect(body.nextAction).toBeUndefined();
    expect(body.turnOutcome).toBeDefined();
    expect(chatbotV3ChatResponseSchema.parse(body)).toBeDefined();
    expect(mockServices.idempotencyExecutor.execute).toHaveBeenCalledOnce();
  });

  it('returns a real process overview before persisting process.explained', async () => {
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages[0].text).toContain('share your medical records');
    expect(body.messages[0].text).toContain('review hospital recommendations');
    expect(body.messages[0].text).toContain('arrange an online consultation');
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        processExplained: true,
      }),
    );
  });

  it('passes through bounded faq agent answer while keeping cards owned by the response composer', async () => {
    applicationOverrides.suggest = async () => ({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'user asked an faq question',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      dispatchAgent: 'FaqAgent',
      dispatchSource: 'orchestrator',
    });
    mockServices.listFaqItems.execute.mockResolvedValue({
      data: [{
        id: 'faq-1',
        question: 'How long does online consultation usually take to schedule?',
        answer: 'Online consultations are usually arranged within 24 hours.',
        category: 'Consultation',
      }],
    });
    mockServices.getFaqItem.execute.mockResolvedValue({
      id: 'faq-1',
      question: 'How long does online consultation usually take to schedule?',
      answer: 'Online consultations are usually arranged within 24 hours.',
      category: 'Consultation',
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'How long does online consultation usually take to schedule?',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages[0].text).toContain('Online consultations are usually arranged within 24 hours.');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'PROCESS_GUIDE',
      }),
    ]));
    expect(mockServices.aiChatSessionRepo.patchStatus).not.toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        processExplained: true,
      }),
    );
  });

  it('keeps public faq retrieval hospital-aware when pageContext supplies a hospital id', async () => {
    applicationOverrides.suggest = async () => ({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'user asked an faq question',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      dispatchAgent: 'FaqAgent',
      dispatchSource: 'orchestrator',
    });
    mockServices.listFaqCategoriesForChatbot.execute.mockResolvedValue({
      categories: [{
        name: 'Consultation',
        sortOrder: 1,
      }],
    });
    mockServices.listFaqItems.execute.mockImplementation(async (_query, actor) => {
      if (actor.role === 'HOSPITAL' && actor.hospitalId === 'hospital-123') {
        return {
          data: [{
            id: 'faq-1',
            question: 'How long does online consultation usually take to schedule?',
            answer: 'Online consultations are usually arranged within 24 hours.',
            category: 'Consultation',
          }],
        };
      }

      return { data: [] };
    });
    mockServices.getFaqItem.execute.mockImplementation(async (_id, actor) => {
      if (actor.role === 'HOSPITAL' && actor.hospitalId === 'hospital-123') {
        return {
          id: 'faq-1',
          question: 'How long does online consultation usually take to schedule?',
          answer: 'Online consultations are usually arranged within 24 hours.',
          category: 'Consultation',
        };
      }

      throw new Error('FAQ not found in this scope');
    });

    const { default: app } = await import('../index.js');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'REGULAR',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'How long does online consultation usually take to schedule?',
        pageContext: {
          type: 'HOSPITAL_DETAIL',
          hospitalId: 'hospital-123',
        },
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.turnOutcome.status).toBe('ok');
    expect(body.messages[0].text).toContain('Online consultations are usually arranged within 24 hours.');
    expect(mockServices.resolveHospitalType).toHaveBeenCalledWith('hospital-123');
    expect(mockServices.listFaqCategoriesForChatbot.execute).toHaveBeenCalledWith({
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
    });
    expect(mockServices.listFaqItems.execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        page: 1,
        limit: 5,
        category: 'Consultation',
        hospitalType: 'COSMETIC',
        isActive: true,
        search: 'How long does online consultation usually take to schedule?',
      }),
      expect.objectContaining({
        role: 'ADMIN',
      }),
    );
    expect(mockServices.listFaqItems.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        page: 1,
        limit: 5,
        category: 'Consultation',
        hospitalType: 'COSMETIC',
        isActive: true,
        search: 'How long does online consultation usually take to schedule?',
      }),
      expect.objectContaining({
        role: 'HOSPITAL',
        hospitalId: 'hospital-123',
      }),
    );
    expect(mockServices.getFaqItem.execute).toHaveBeenCalledWith(
      'faq-1',
      expect.objectContaining({
        role: 'HOSPITAL',
        hospitalId: 'hospital-123',
      }),
    );
  });

  it('returns runtimeDebug with request traceId in non-production', async () => {
    process.env.NODE_ENV = 'test';
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-request-id': 'trace-nonprod-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runtimeDebug).toMatchObject({
      traceId: 'trace-nonprod-1',
      idempotencyKey: expect.any(String),
    });
  });

  it('falls back to generated traceId when x-request-id is invalid', async () => {
    process.env.NODE_ENV = 'test';
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-request-id': 'trace invalid $$$',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runtimeDebug.traceId).not.toBe('trace invalid $$$');
    expect(body.runtimeDebug.traceId).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(body.runtimeDebug.traceId.length).toBeLessThanOrEqual(128);
  });

  it('does not expose runtimeDebug in production responses', async () => {
    process.env.NODE_ENV = 'production';
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-request-id': 'trace-prod-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runtimeDebug).toBeUndefined();
  });

  it('returns 404 when the session does not exist', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'missing-session',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(404);
    expect(mockServices.idempotencyExecutor.execute).not.toHaveBeenCalled();
  });

  it('bootstraps a new session secret cookie when the stored hash is missing', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('chatbot_session_secret=');
    expect(mockServices.aiChatSessionRepo.save).toHaveBeenCalledOnce();
  });

  it('still reaches recommendation when the process has already been shown', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MEDICAL_INPUTS',
            current_phase: 'active',
          },
        },
        conditionStatus: 'unknown',
        formStatus: 'completed',
        docUploadStatus: 'submitted',
        recommendationStatus: 'in_progress',
        consultationStatus: 'not_introduced',
        packageStatus: 'in_progress',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        processExplained: true,
        conversationSummary: 'The process has already been explained to the user.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: NOW,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please recommend a hospital.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
  });

  it('does not infer process.explained from journey stage or phase when the persisted fact is false', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MEDICAL_INPUTS',
            current_phase: 'post',
          },
        },
        conditionStatus: 'unknown',
        formStatus: 'completed',
        docUploadStatus: 'submitted',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        processExplained: false,
        conversationSummary: 'Records are ready, but the process explainer was never shown.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: NOW,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please recommend a hospital.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'post',
    });
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
      }),
    ]));
  });

  it('does not execute RecommendationAgent when RECOMMENDATION prerequisites fail in-place', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'completed',
        docUploadStatus: 'submitted',
        recommendationStatus: 'in_progress',
        consultationStatus: 'not_introduced',
        packageStatus: 'in_progress',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        processExplained: false,
        conversationSummary: 'Records are present but the process explanation was never shown.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: NOW,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please recommend a hospital.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
        payload: expect.objectContaining({
          candidates: [],
        }),
      }),
    ]));
    expect(mockServices.aiChatSessionRepo.findBySessionId).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or wrong secret on sessions with a stored hash', async () => {
    const { default: app } = await import('../index.js');

    const missingSecret = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const wrongSecret = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=wrong-secret',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(missingSecret.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
    expect(mockServices.idempotencyExecutor.execute).not.toHaveBeenCalled();
  });

  it('rejects patient-linked sessions with missing secret hash instead of bootstrapping', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(mockServices.aiChatSessionRepo.save).not.toHaveBeenCalled();
  });

  it('rejects mismatched patient_session ownership with 403 for patient-linked sessions', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-2' });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `patient_session=patient-token; chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(403);
    expect(mockServices.idempotencyExecutor.execute).not.toHaveBeenCalled();
  });

  it('reuses the same explicit idempotency header for concurrent and repeated retries', async () => {
    const observedKeys: string[] = [];
    let releaseConcurrentTurn: (() => void) | null = null;
    const waitForRelease = new Promise<void>((resolve) => {
      releaseConcurrentTurn = resolve;
    });
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockServices.idempotencyExecutor.execute.mockImplementation(async (key: string, _operation: string, fn: () => Promise<unknown>) => {
      observedKeys.push(key);

      if (observedKeys.length === 1) {
        await waitForRelease;
      }

      return fn();
    });

    const { default: app } = await import('../index.js');
    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'retry-key-v3-1',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    } as const;

    const first = app.request('/api/v3/chatbot/chat', request);
    const second = app.request('/api/v3/chatbot/chat', request);

    await Promise.resolve();
    releaseConcurrentTurn?.();

    const [firstRes, secondRes] = await Promise.all([first, second]);
    const thirdRes = await app.request('/api/v3/chatbot/chat', request);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(thirdRes.status).toBe(200);
    expect(mockServices.idempotencyExecutor.execute).toHaveBeenCalledTimes(2);
    expect(new Set(observedKeys)).toHaveProperty('size', 1);
    expect(observedKeys[0]).toContain('session-v3-1:retry-key-v3-1:chatbot-v3-turn');
    expect(observedKeys[0]).toContain(':chatbot-v3-turn');
  });

  it('supports attachment turns through the records upload path', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'in_progress',
        docUploadStatus: 'requested',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: '',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-v3-1/report.pdf',
        }],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalled();
  });

  it('creates a handoff ticket when the first v3 user message directly requests a human', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}; patient_session=patient-token`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Need a human now',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
    expect(body.handoff).toMatchObject({
      required: true,
      ticketId: 'ticket-v3-1',
    });
    expect(mockServices.createTicket.execute).toHaveBeenCalledOnce();
  });

  it('does not claim a successful handoff for anonymous public sessions without patientId', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Need a human now',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(body.handoff).toMatchObject({
      required: false,
      ticketId: null,
    });
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'PROCESS_GUIDE',
      }),
    ]));
    expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
  });

  it('returns normal guidance when semantic handoff is denied by prerequisites', async () => {
    applicationOverrides.suggest = async () => ({
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      reason: 'user requested a human',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      dispatchSource: 'orchestrator',
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Can I talk to a human now?',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.handoff.required).toBe(false);
    expect(body.messages[0].text).toContain('Before we connect you with a human');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
      }),
    ]));
    expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
  });

  it('does not create duplicate handoff tickets when handoff is already active', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'HUMAN_HANDOFF',
            current_phase: 'active',
          },
        },
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'requested',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: 'A human advisor is already handling this session.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}; patient_session=patient-token`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Need a human now',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
    expect(body.handoff.required).toBe(true);
    expect(mockServices.idempotencyExecutor.execute).toHaveBeenCalledTimes(1);
    expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
  });

  it('treats CANCELLED handoff status as inactive and allows a fresh handoff ticket', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
        },
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'cancelled',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: 'A previous handoff was cancelled.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');

    const explainRes = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}; patient_session=patient-token`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const explainBody = await explainRes.json();
    expect(explainRes.status).toBe(200);
    expect(explainBody.journey).toMatchObject({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(explainBody.handoff.required).toBe(false);

    const handoffRes = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}; patient_session=patient-token`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Need a human now',
      }),
    });

    const handoffBody = await handoffRes.json();
    expect(handoffRes.status).toBe(200);
    expect(handoffBody.handoff).toMatchObject({
      required: true,
      ticketId: 'ticket-v3-1',
    });
    expect(mockServices.createTicket.execute).toHaveBeenCalledOnce();
  });
});
