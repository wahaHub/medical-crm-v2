import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatbotV3ChatResponseSchema } from '@medical-crm/validation';
import type {
  JourneyRuntimeAuthorityDecision,
  JourneyRuntimeAuthorityInput,
  OrchestratorV3DecisionInput,
  OrchestratorV3Suggestion,
} from '@medical-crm/application';
import { ConversationOrchestratorV3RuntimeService } from '../routes/chatbot-v3/runtime.service.js';

const NOW = new Date('2026-04-15T00:00:00.000Z');
const SESSION_SECRET = 'secret-v3-1';
const SESSION_SECRET_HASH = createHash('sha256').update(SESSION_SECRET).digest('hex');
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
type CompatibilityDecision = ReturnType<
  InstanceType<typeof import('@medical-crm/application').OrchestratorV3Service>['decide']
>;
const applicationOverrides: {
  suggest?: (input: OrchestratorV3DecisionInput) => Promise<OrchestratorV3Suggestion>;
  decide?: (input: OrchestratorV3DecisionInput) => CompatibilityDecision;
  orchestratorDecideShouldThrow?: boolean;
} = {};
let currentSession: Record<string, any> | null = null;

function mapAuthorityInputToCompatibilityInput(
  input: JourneyRuntimeAuthorityInput,
): OrchestratorV3DecisionInput {
  return {
    current: input.current,
    suggestion: input.proposal,
    facts: input.facts,
    handoff: input.handoff,
    bootstrap: input.bootstrap,
    intake: input.intake,
  };
}

function mapCompatibilityDecisionToAuthorityDecision(
  decision: CompatibilityDecision,
): JourneyRuntimeAuthorityDecision {
  const write = decision.write ?? {
    authority: 'journey-runtime-authority' as const,
    stage: decision.to,
    factsPatch: {},
  };
  const denied = decision.whyNotSkip && !decision.dispatchAgent;

  if (denied) {
    return {
      outcome: 'DENY',
      action: 'STAY',
      from: decision.from,
      to: decision.to,
      dispatch: {
        outcome: 'DENY',
      },
      write,
      reason: decision.whyNotSkip,
    };
  }

  return {
    outcome: 'ALLOW',
    action: decision.action === 'HANDOFF'
      ? 'ESCALATE'
      : decision.action === 'STAY'
        ? 'REPEAT'
        : 'ADVANCE',
    from: decision.from,
    to: decision.to,
    dispatch: decision.dispatchAgent
      ? {
          outcome: 'ALLOW',
          agent: decision.dispatchAgent,
        }
      : {
          outcome: 'DENY',
        },
    write,
    reason: decision.whyNotSkip ?? 'compatibility decision override',
  };
}

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
  aiUserProfileRepo: {
    findByAnonymousKeyOrPatient: vi.fn(),
  },
  matchHospitals: {
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
    JourneyRuntimeAuthorityService: class extends actual.JourneyRuntimeAuthorityService {
      override decide(input: JourneyRuntimeAuthorityInput): JourneyRuntimeAuthorityDecision {
        if (applicationOverrides.decide) {
          return mapCompatibilityDecisionToAuthorityDecision(
            applicationOverrides.decide(mapAuthorityInputToCompatibilityInput(input)),
          );
        }

        return super.decide(input);
      }
    },
    OrchestratorV3Service: class extends actual.OrchestratorV3Service {
      override decide(input: OrchestratorV3DecisionInput) {
        if (applicationOverrides.orchestratorDecideShouldThrow) {
          throw new Error('orchestrator compatibility shell should not be used on the live route');
        }

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
    applicationOverrides.orchestratorDecideShouldThrow = false;
    currentSession = {
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
        minimalTriageComplete: true,
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
    };
    mockServices.aiChatSessionRepo.findBySessionId.mockImplementation(async () => currentSession);
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatSessionRepo.patchStatus.mockImplementation(async (_sessionId: string, patch: Record<string, unknown>) => {
      if (!currentSession) {
        return null;
      }

      currentSession = {
        ...currentSession,
        statusSnapshot: {
          ...currentSession.statusSnapshot,
          ...patch,
        },
        updatedAt: NOW,
      };

      return currentSession;
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-1' });
    mockServices.createTicket.execute.mockResolvedValue({ id: 'ticket-v3-1' });
    mockServices.matchHospitals.execute.mockResolvedValue({
      hospitals: [
        {
          id: 'hospital-sh-chest',
          name: 'Shanghai Chest Hospital',
          nameEn: 'Shanghai Chest Hospital',
          rating: 4.8,
          logoUrl: null,
          tags: ['thoracic oncology'],
          procedureCount: 12,
        },
        {
          id: 'hospital-fudan-cancer',
          name: 'Fudan Cancer Center',
          nameEn: 'Fudan Cancer Center',
          rating: 4.7,
          logoUrl: null,
          tags: ['multidisciplinary cancer care'],
          procedureCount: 16,
        },
      ],
    });
    mockServices.listFaqItems.execute.mockResolvedValue({
      data: [],
    });
    mockServices.listFaqCategoriesForChatbot.execute.mockResolvedValue({
      categories: [],
    });
    mockServices.getFaqItem.execute.mockResolvedValue(null);
    mockServices.aiUserProfileRepo.findByAnonymousKeyOrPatient.mockResolvedValue(null);
    mockServices.resolveHospitalType.mockResolvedValue('COSMETIC');
    mockServices.matchHospitals.execute.mockResolvedValue({
      hospitals: [
        {
          id: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          nameEn: 'Shanghai Chest Hospital',
          rating: 4.8,
          logoUrl: null,
          tags: ['thoracic oncology'],
          procedureCount: 24,
        },
        {
          id: 'hospital-2',
          name: 'Fudan Cancer Center',
          nameEn: 'Fudan Cancer Center',
          rating: 4.7,
          logoUrl: null,
          tags: ['multidisciplinary oncology'],
          procedureCount: 18,
        },
        {
          id: 'hospital-3',
          name: 'Ruijin Hospital',
          nameEn: 'Ruijin Hospital',
          rating: 4.6,
          logoUrl: null,
          tags: ['broad oncology'],
          procedureCount: 20,
        },
      ],
    });
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

  it('does not route live authority decisions through the orchestrator compatibility shell', async () => {
    process.env.NODE_ENV = 'test';
    applicationOverrides.orchestratorDecideShouldThrow = true;
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
    expect(body.runtimeDebug).toMatchObject({
      lastDispatchSource: 'journey-runtime-authority',
    });
  });

  it('returns a real process overview before persisting process.explained', async () => {
    currentSession = {
      ...currentSession,
      statusSnapshot: {
        ...currentSession?.statusSnapshot,
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
      },
    };
    applicationOverrides.suggest = async () => ({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'explain the process',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      dispatchAgent: 'FaqAgent',
      dispatchSource: 'orchestrator',
      write: {
        authority: 'journey-runtime-authority',
        stage: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        factsPatch: {
          'process.explained': true,
        },
      },
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

  it('persists a compact conversation summary after a committed turn and reuses it on the next turn', async () => {
    let session = {
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
        minimalTriageComplete: true,
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
        },
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
    };
    const capturedSummaries: Array<string | undefined> = [];

    mockServices.aiChatSessionRepo.findBySessionId.mockImplementation(async () => session);
    mockServices.aiChatSessionRepo.patchStatus.mockImplementation(async (_sessionId: string, patch: Record<string, unknown>) => {
      session = {
        ...session,
        statusSnapshot: {
          ...session.statusSnapshot,
          ...patch,
        },
      };
      return session;
    });

    applicationOverrides.suggest = vi.fn(async (input) => {
      capturedSummaries.push(input.conversationSummary);
      return {
        intent: 'faq' as const,
        suggestedStage: 'EXPLAIN_PROCESS' as const,
        dispatchAgent: 'FaqAgent' as const,
        reason: 'explain the process',
        task: {
          goal: 'Answer the user\'s question using FAQ knowledge only.',
          latestUserMessage: input.latestUserMessage,
          necessaryFacts: {
            'current.stage': 'EXPLAIN_PROCESS',
          },
        },
      };
    });
    applicationOverrides.decide = vi.fn(() => ({
      action: 'STAY' as const,
      from: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
      to: { stage: 'EXPLAIN_PROCESS' as const, phase: 'active' as const },
      dispatchAgent: 'FaqAgent' as const,
      dispatchSource: 'orchestrator' as const,
    }));

    const { default: app } = await import('../index.js');

    const firstRes = await app.request('/api/v3/chatbot/chat', {
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

    expect(firstRes.status).toBe(200);
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        conversationSummary: 'stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant=Here is the process: first, share your medical records, then review hospital recommendations, and finally arrange an...',
      }),
    );

    const secondRes = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Thanks, what should I do next?',
      }),
    });

    expect(secondRes.status).toBe(200);
    expect(capturedSummaries[0]).toBe('');
    expect(capturedSummaries[1]).toBe(
      'stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant=Here is the process: first, share your medical records, then review hospital recommendations, and finally arrange an...',
    );
  });

  it('does not churn summary timestamps when the same committed turn is retried with the same idempotency key', async () => {
    const cachedResults = new Map<string, Promise<unknown>>();
    mockServices.idempotencyExecutor.execute.mockImplementation(async (key: string, _operation: string, fn: () => Promise<unknown>) => {
      const existing = cachedResults.get(key);
      if (existing) {
        return existing;
      }

      const created = Promise.resolve().then(fn);
      cachedResults.set(key, created);
      return created;
    });
    applicationOverrides.suggest = async () => ({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'explain the process',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      dispatchAgent: 'FaqAgent',
      dispatchSource: 'orchestrator',
    });

    const { default: app } = await import('../index.js');
    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'summary-retry-v3-1',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    } as const;

    const firstRes = await app.request('/api/v3/chatbot/chat', request);
    const firstPatch = mockServices.aiChatSessionRepo.patchStatus.mock.calls[0]?.[1] as Record<string, unknown>;
    const secondRes = await app.request('/api/v3/chatbot/chat', request);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledTimes(1);
    expect(firstPatch).toEqual(expect.objectContaining({
      conversationSummary: 'stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant=Here is the process: first, share your medical records, then review hospital recommendations, and finally arrange an...',
      lastUserMessageAt: expect.any(Date),
      lastAssistantMessageAt: expect.any(Date),
    }));
    expect(firstPatch.lastUserMessageAt).toEqual(firstPatch.lastAssistantMessageAt);
    expect(currentSession?.statusSnapshot.lastUserMessageAt).toEqual(firstPatch.lastUserMessageAt);
    expect(currentSession?.statusSnapshot.lastAssistantMessageAt).toEqual(firstPatch.lastAssistantMessageAt);
  });

  it('dispatches only the finalized authority worker', async () => {
    const recommendationAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          recommendations: [{ hospitalId: 'hospital-finalized-1' }],
        },
      })),
    };
    const faqAgent = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        data: {
          answer: 'faq worker should not have been chosen',
        },
      })),
    };
    const runtime = new ConversationOrchestratorV3RuntimeService({
      idempotency: { execute: vi.fn(async (_key, _operation, fn) => fn()) },
      supervisor: {
        suggest: vi.fn(async () => ({
          intent: 'progression' as const,
          suggestedStage: 'RECOMMENDATION' as const,
          reason: 'records are ready',
        })),
      },
      journeyRuntimeAuthority: {
        decide: vi.fn(() => ({
          action: 'ADVANCE' as const,
          from: { stage: 'COLLECT_MEDICAL_INPUTS' as const, phase: 'active' as const },
          to: { stage: 'RECOMMENDATION' as const, phase: 'active' as const },
          dispatchAgent: 'RecommendationAgent' as const,
          dispatchSource: 'journey-runtime-authority' as const,
        })),
      },
      gateway: {
        status: {
          query: vi.fn(async () => ({
            status: 'ok' as const,
            data: { snapshot: {} },
          })),
        },
        records: {
          status: vi.fn(),
        },
        recommendation: {
          status: vi.fn(),
        },
        consult: {
          status: vi.fn(),
        },
        handoff: {
          status: vi.fn(),
        },
      } as any,
      agents: {
        RecommendationAgent: recommendationAgent,
        FaqAgent: faqAgent,
      },
    });

    const result = await runtime.handleTurn({
      traceId: 'trace-finalized-dispatch-1',
      sessionId: 'session-finalized-dispatch-1',
      turnId: 'turn-finalized-dispatch-1',
      message: 'Please recommend a hospital.',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.saved': true,
      },
    });

    expect(result.decision.dispatchAgent).toBe('RecommendationAgent');
    expect(result.journey).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(recommendationAgent.execute).toHaveBeenCalledOnce();
    expect(faqAgent.execute).not.toHaveBeenCalled();
    expect(recommendationAgent.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'recommendation.generate',
        input: expect.objectContaining({
      sessionId: 'session-finalized-dispatch-1',
      turnId: 'turn-finalized-dispatch-1',
        }),
      }),
    );
  });

  it('persists process.explained when progression is blocked by the explain gate', async () => {
    applicationOverrides.suggest = async () => ({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'records are ready',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      dispatchSource: 'orchestrator',
      whyNotSkip: 'EXPLAIN_PROCESS must complete before RECOMMENDATION',
      write: {
        authority: 'journey-runtime-authority',
        stage: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        factsPatch: {
          'process.explained': true,
        },
      },
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
        message: 'Please skip ahead to recommendations.',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages[0].text).toContain('share your medical records');
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        processExplained: true,
      }),
    );
  });

  it('passes bootstrap-only signals to runtime instead of route-owned handoff or progression truth', async () => {
    let capturedInput: OrchestratorV3DecisionInput | undefined;
    applicationOverrides.suggest = async (input) => {
      capturedInput = input;
      return {
        intent: 'handoff',
        suggestedStage: 'HUMAN_HANDOFF',
        reason: 'runtime-owned handoff suggestion',
      };
    };
    applicationOverrides.decide = () => ({
      action: 'HANDOFF',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'HUMAN_HANDOFF', phase: 'active' },
      dispatchAgent: 'HandoffAgent',
      dispatchSource: 'orchestrator',
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
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-v3-1/report.pdf',
        }],
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
    expect(capturedInput).toMatchObject({
      suggestion: {
        intent: 'unknown',
        suggestedStage: expect.any(String),
      },
      bootstrap: {
        message: 'Need a human now',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            fileName: 'report.pdf',
          }),
        ]),
        canCreateHandoff: false,
      },
    });
    expect(capturedInput?.suggestion.reason).toContain('Need a human now');
  });

  it('does not rewrite process.explained on non-explanation turns when it is already persisted', async () => {
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
        minimalTriageComplete: true,
        processExplained: true,
        conversationSummary: 'The process was already explained earlier in the session.',
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
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages[0].text).toContain('recommendation stage');
    expect(mockServices.aiChatSessionRepo.patchStatus).not.toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        processExplained: true,
      }),
    );
    expect(mockServices.aiChatSessionRepo.patchStatus).not.toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        processExplained: false,
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
        minimalTriageComplete: true,
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
        minimalTriageComplete: true,
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
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
  });

  it('accepts COLLECT_MINIMAL_MEDICAL_FACTS from the persisted journey snapshot', async () => {
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
            current_stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            current_phase: 'active',
          },
        },
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
        processExplained: true,
        conversationSummary: 'Collect the minimum required medical facts before deeper intake.',
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
        message: 'What do you need from me first?',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(body.messages[0].text).toContain('Please answer these 3 questions');
    expect(body.messages[0].text).toContain('What is the main symptom, diagnosis, or medical problem right now?');
  });

  it('persists minimalTriageComplete only when RecordsAgent triage determines completion', async () => {
    currentSession = {
      ...currentSession,
      statusSnapshot: {
        ...currentSession?.statusSnapshot,
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: false,
        processExplained: true,
      },
    };

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'I have chest pain, it started 3 days ago, it feels moderate, and I already had a blood test.',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages[0].text).not.toContain('I checked');
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        minimalTriageComplete: true,
      }),
    );
  });

  it('surfaces the RecordsAgent collection prompt on the public chat route during COLLECT_MEDICAL_INPUTS', async () => {
    applicationOverrides.suggest = async () => ({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      reason: 'continue records collection',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      dispatchAgent: 'RecordsAgent',
      dispatchSource: 'journey-runtime-authority',
    });

    currentSession = {
      ...currentSession,
      statusSnapshot: {
        ...currentSession?.statusSnapshot,
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MEDICAL_INPUTS',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
      },
    };

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'I can upload more reports.',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(body.messages[0].text).toContain('Please upload or share any pathology reports');
  });

  it('hard-locks a stale RECOMMENDATION snapshot back to minimal triage until minimalTriageComplete is true', async () => {
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
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'not_started',
        recommendationStatus: 'in_progress',
        consultationStatus: 'not_introduced',
        packageStatus: 'in_progress',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        minimalTriageComplete: false,
        processExplained: false,
        conversationSummary: 'Recommendation was entered prematurely before minimal triage was completed.',
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
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(body.messages[0].text).toContain('Please answer these 3 questions');
    expect(body.messages[0].text).toContain('What is the main symptom, diagnosis, or medical problem right now?');
    expect(body.cards).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
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

  it('persists uploads while still asking minimal triage questions on attachment turns', async () => {
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
        message: 'Here is my report.',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-v3-1/report.pdf',
        }],
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(body.messages[0].text).toContain('Please answer these 3 questions');
    expect(body.messages[0].text).toContain('What is the main symptom, diagnosis, or medical problem right now?');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          uploadedCount: 1,
          required: true,
        }),
      }),
    ]));
    const uploadPatch = mockServices.aiChatSessionRepo.patchStatus.mock.calls.find(
      ([sessionId, patch]) => sessionId === 'session-v3-1'
        && (patch as Record<string, unknown>).docUploadStatus === 'SUBMITTED',
    )?.[1] as Record<string, unknown> | undefined;
    expect(uploadPatch).toMatchObject({
      docUploadStatus: 'SUBMITTED',
    });
    expect(uploadPatch?.minimalTriageComplete).not.toBe(true);
    expect(mockServices.aiChatSessionRepo.patchStatus).not.toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        processExplained: true,
      }),
    );
  });

  it('keeps the next turn in minimal triage after an upload-first start until the Records worker marks completion', async () => {
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
        docUploadStatus: 'submitted',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        minimalTriageComplete: false,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: NOW,
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
        message: 'What should I send next?',
      }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(body.messages[0].text).toContain('Please answer these 3 questions');
    expect(body.messages[0].text).toContain('What tests, treatments, medicines, or diagnoses already exist?');
    expect(body.cards).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
  });

  it('advances to recommendation on the next turn after upload-first start once minimal triage is persisted', async () => {
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
        docUploadStatus: 'submitted',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        minimalTriageComplete: true,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: NOW,
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
        message: 'What should I send next?',
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
          candidates: expect.arrayContaining([
            expect.objectContaining({
              hospitalId: expect.any(String),
              name: 'Shanghai Chest Hospital',
            }),
          ]),
        }),
      }),
    ]));
  });

  it('shows recommendation compare explanations on the public route while keeping recommendation cards grounded', async () => {
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
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'submitted',
        recommendationStatus: 'in_progress',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        minimalTriageComplete: true,
        recommendationGenerated: true,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: NOW,
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
        message: 'Compare the hospitals for me.',
      }),
    });

    const body = chatbotV3ChatResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(body.messages[0]?.text).toContain('These options can be compared');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
        payload: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              name: 'Shanghai Chest Hospital',
            }),
          ]),
        }),
      }),
    ]));
  });

  it('syncs recommendation.selected and consult.completed from deterministic legacy statuses when stale migrated canonical flags are false', async () => {
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
        recommendationStatus: 'accepted',
        consultationStatus: 'completed',
        packageStatus: 'accepted',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        minimalTriageComplete: true,
        processExplained: true,
        recommendationSelected: false,
        consultCompleted: false,
        conversationSummary: 'Legacy statuses already show a selected recommendation and completed consult.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: NOW,
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
        message: 'What happens next?',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      expect.objectContaining({
        recommendationSelected: true,
        consultCompleted: true,
      }),
    );
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

  it('forces HUMAN_HANDOFF before trusting a stale stored journey snapshot when handoff is already active', async () => {
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
        message: 'What happens next?',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journey).toMatchObject({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
    expect(body.handoff.required).toBe(true);
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
    applicationOverrides.suggest = async (input) => {
      if (input.latestUserMessage?.toLowerCase().includes('human')) {
        return {
          intent: 'handoff',
          suggestedStage: 'HUMAN_HANDOFF',
          reason: 'user requested a human',
        };
      }

      return {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'explain the process',
      };
    };
    applicationOverrides.decide = (input) => {
      if (input.suggestion.suggestedStage === 'HUMAN_HANDOFF') {
        return {
          action: 'HANDOFF',
          from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          to: { stage: 'HUMAN_HANDOFF', phase: 'active' },
          dispatchAgent: 'HandoffAgent',
          dispatchSource: 'orchestrator',
        };
      }

      return {
        action: 'STAY',
        from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        dispatchAgent: 'FaqAgent',
        dispatchSource: 'orchestrator',
      };
    };

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
        minimalTriageComplete: true,
        handoffActive: false,
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
