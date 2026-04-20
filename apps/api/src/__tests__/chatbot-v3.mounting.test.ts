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
import { createChatbotV3SessionDriver } from './helpers/chatbot-v3-session-driver.js';

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

function createPersistedMountingSession(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, any> {
  return normalizePersistedMountingSession({
    ...currentSession,
    ...overrides,
    statusSnapshot: {
      ...currentSession?.statusSnapshot,
      ...(overrides.statusSnapshot as Record<string, unknown> | undefined),
    },
  });
}

function normalizePersistedMountingSession(session: Record<string, any> | null): Record<string, any> | null {
  if (!session) {
    return session;
  }

  const statusSnapshot = session.statusSnapshot ?? {};
  const journeySnapshot = statusSnapshot.journeyCurrentStage
    ? {
        current_stage: statusSnapshot.journeyCurrentStage,
        current_phase: statusSnapshot.journeyCurrentPhase ?? 'active',
      }
    : asLegacyJourneySnapshot(statusSnapshot);

  return {
    ...session,
    statusSnapshot: {
      ...statusSnapshot,
      ...(journeySnapshot
        ? {
            journeyCurrentStage: journeySnapshot.current_stage,
            journeyCurrentPhase: journeySnapshot.current_phase,
          }
        : {}),
    },
  };
}

function asLegacyJourneySnapshot(statusSnapshot: Record<string, unknown>) {
  const chatbotV2 = statusSnapshot.chatbot_v2 as Record<string, unknown> | undefined;
  const journeySnapshot = chatbotV2?.journey_snapshot as Record<string, unknown> | undefined;
  const currentStage = journeySnapshot?.current_stage as string | undefined;
  if (!currentStage) {
    return null;
  }

  const currentPhase = journeySnapshot?.current_phase as string | undefined;
  return {
    current_stage: currentStage,
    current_phase: currentPhase ?? 'active',
  };
}

function persistMountingSession(
  session: Record<string, any>,
) {
  let persistedSession = normalizePersistedMountingSession(session) ?? session;
  mockServices.aiChatSessionRepo.findBySessionId.mockImplementation(async () => normalizePersistedMountingSession(persistedSession));
  mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: any) => {
    persistedSession = normalizePersistedMountingSession(entity) ?? entity;
    return persistedSession;
  });
  mockServices.aiChatSessionRepo.patchStatus.mockImplementation(async (_sessionId: string, _site: string, patch: Record<string, unknown>) => {
    persistedSession = normalizePersistedMountingSession({
      ...persistedSession,
      statusSnapshot: {
        ...persistedSession.statusSnapshot,
        ...patch,
      },
      updatedAt: NOW,
    }) ?? persistedSession;

    return persistedSession;
  });

  return () => persistedSession;
}

function mapAuthorityInputToCompatibilityInput(
  input: JourneyRuntimeAuthorityInput,
): OrchestratorV3DecisionInput {
  return {
    current: input.current,
    suggestion: input.proposal,
    facts: input.facts,
    statusSnapshot: input.statusSnapshot,
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
  notifyAdminsOfNewTicket: {
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

function withSiteHeaders(headers?: HeadersInit, site = 'beauty') {
  const merged = new Headers(headers);
  if (!merged.has('x-medora-site')) {
    merged.set('x-medora-site', site);
  }
  return merged;
}

async function loadApp() {
  const { default: app } = await import('../index.js');
  const originalRequest = app.request.bind(app);
  app.request = ((input: string, init?: RequestInit) =>
    originalRequest(input, {
      ...init,
      headers: withSiteHeaders(init?.headers),
    })) as typeof app.request;
  return app;
}

describe('Chatbot v3 public route mounting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applicationOverrides.suggest = undefined;
    applicationOverrides.decide = undefined;
    applicationOverrides.orchestratorDecideShouldThrow = false;
    const originalFindBySessionIdMockResolvedValue = mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue.bind(
      mockServices.aiChatSessionRepo.findBySessionId,
    );
    const originalFindBySessionIdMockResolvedValueOnce = mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValueOnce.bind(
      mockServices.aiChatSessionRepo.findBySessionId,
    );
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue = ((value: unknown) =>
      originalFindBySessionIdMockResolvedValue(normalizePersistedMountingSession(value as Record<string, any>))) as typeof mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue;
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValueOnce = ((value: unknown) =>
      originalFindBySessionIdMockResolvedValueOnce(normalizePersistedMountingSession(value as Record<string, any>))) as typeof mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValueOnce;
    currentSession = {
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      site: 'beauty',
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
    mockServices.aiChatSessionRepo.findBySessionId.mockImplementation(async () => normalizePersistedMountingSession(currentSession));
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => normalizePersistedMountingSession(entity as Record<string, any>) ?? entity);
    mockServices.aiChatSessionRepo.patchStatus.mockImplementation(async (_sessionId: string, _site: string, patch: Record<string, unknown>) => {
      if (!currentSession) {
        return null;
      }

      currentSession = normalizePersistedMountingSession({
        ...currentSession,
        statusSnapshot: {
          ...currentSession.statusSnapshot,
          ...patch,
        },
        updatedAt: NOW,
      }) ?? currentSession;

      return currentSession;
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-1' });
    mockServices.createTicket.execute.mockResolvedValue({
      id: 'ticket-v3-1',
      ticketNumber: 'TKT-20260418-0101',
    });
    mockServices.notifyAdminsOfNewTicket.execute.mockResolvedValue(undefined);
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
    const app = await loadApp();

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

  it('rejects malformed TRIAGE_SUBMITTED requests at validation time', async () => {
    const app = await loadApp();

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        action: {
          type: 'TRIAGE_SUBMITTED',
        },
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Validation failed',
      code: 'VALIDATION_FAILED',
      details: [
        expect.objectContaining({
          message: 'TRIAGE_SUBMITTED requires non-empty follow-up text',
          path: ['message'],
        }),
      ],
    });
  });

  it('rejects requests when the persisted chatbot session belongs to a different site', async () => {
    const app = await loadApp();

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-medora-site': 'china',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('does not route live authority decisions through the orchestrator compatibility shell', async () => {
    process.env.NODE_ENV = 'test';
    applicationOverrides.orchestratorDecideShouldThrow = true;
    const app = await loadApp();

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

  it('forwards statusSnapshot through the compatibility authority shim', async () => {
    currentSession = createPersistedMountingSession({
      statusSnapshot: {
        ...currentSession?.statusSnapshot,
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      },
    });
    applicationOverrides.suggest = async () => ({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'snapshot-backed triage is complete',
    });
    applicationOverrides.decide = vi.fn((input) => {
      expect(input.statusSnapshot).toEqual(expect.objectContaining({
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      }));

      return {
        action: 'ADVANCE',
        from: input.current,
        to: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchAgent: 'RecommendationAgent',
        dispatchSource: 'orchestrator',
      };
    });

    const app = await loadApp();

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please recommend hospitals for me.',
      }),
    });

    expect(res.status).toBe(200);
    expect(applicationOverrides.decide).toHaveBeenCalledOnce();
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

    const app = await loadApp();

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
    expect(body.messages[0].text).toContain('review the hospital recommendation');
    expect(body.messages[0].text).toContain('upload supporting documents');
    expect(body.messages[0].text).toContain('online consult');
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      'beauty',
      expect.objectContaining({
        processExplained: true,
      }),
    );
  });

  it('persists a compact conversation summary after a committed turn and reuses it on the next turn', async () => {
    let session = {
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      site: 'beauty',
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
    mockServices.aiChatSessionRepo.patchStatus.mockImplementation(async (_sessionId: string, _site: string, patch: Record<string, unknown>) => {
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

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });
    const firstTurn = await driver.sendTurn({
      message: 'Please explain the process.',
    });

    expect(firstTurn.status).toBe(200);
    expect(chatbotV3ChatResponseSchema.parse(firstTurn.body)).toBeDefined();
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      'beauty',
      expect.objectContaining({
        conversationSummary: `stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant=${firstTurn.body.messages[0]?.text}`,
        journeyCurrentStage: 'EXPLAIN_PROCESS',
        journeyCurrentPhase: 'active',
      }),
    );

    const secondTurn = await driver.sendTurn({
      message: 'Thanks, what should I do next?',
    });

    expect(secondTurn.status).toBe(200);
    expect(chatbotV3ChatResponseSchema.parse(secondTurn.body)).toBeDefined();
    expect(capturedSummaries[0]).toBe('');
    expect(capturedSummaries[1]).toBe(
      `stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant=${firstTurn.body.messages[0]?.text}`,
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

    const app = await loadApp();
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
    const firstPatch = mockServices.aiChatSessionRepo.patchStatus.mock.calls[0]?.[2] as Record<string, unknown>;
    const secondRes = await app.request('/api/v3/chatbot/chat', request);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledTimes(1);
    expect(firstPatch).toEqual(expect.objectContaining({
      conversationSummary: expect.stringContaining('stage=EXPLAIN_PROCESS | user=Please explain the process. | assistant='),
      journeyCurrentStage: 'EXPLAIN_PROCESS',
      journeyCurrentPhase: 'active',
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

    const app = await loadApp();

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
    expect(body.messages[0].text).toContain('review the hospital recommendation');
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      'beauty',
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

    const app = await loadApp();

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
      site: 'beauty',
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
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        minimalTriageComplete: true,
        processExplained: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [{
          path: 'chatbot/session-v3-1/report.pdf',
          name: 'report.pdf',
        }],
        conversationSummary: 'The process was already explained earlier in the session.',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: NOW,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const app = await loadApp();

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
    expect(body.messages[0].text).toContain('online consultation stage');
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

    const app = await loadApp();
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

    const app = await loadApp();
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
    const app = await loadApp();

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
    const app = await loadApp();

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
    const app = await loadApp();

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

    const app = await loadApp();
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

    const app = await loadApp();
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

  it('session driver carries bootstrapped secret cookies into the next turn', async () => {
    let session = {
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      site: 'beauty',
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
    };
    mockServices.aiChatSessionRepo.findBySessionId.mockImplementation(async () => session);
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: any) => {
      session = entity;
      return entity;
    });

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
    });

    const firstTurn = await driver.sendTurn({
      message: 'Please explain the process.',
    });

    expect(firstTurn.status).toBe(200);
    expect(firstTurn.response.headers.get('set-cookie')).toContain('chatbot_session_secret=');
    expect(session.sessionSecretHash).toBeTruthy();

    const secondTurn = await driver.sendTurn({
      message: 'What should I do next?',
    });

    expect(secondTurn.status).toBe(200);
    expect(mockServices.idempotencyExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it('keeps an upload-first session on minimal triage until a later turn can advance to recommendation', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'EXPLAIN_PROCESS',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: false,
        processExplained: false,
        recommendationGenerated: false,
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const uploadTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Here is my report.',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-v3-1/report.pdf',
      }],
    })).body);

    expect(uploadTurn.journey).toMatchObject({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(uploadTurn.messages[0]?.text).toContain('Here is the process');
    expect(uploadTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'PROCESS_GUIDE',
      }),
    ]));
    expect(readSession().statusSnapshot.docUploadStatus).toBe('none');
    expect(readSession().statusSnapshot.minimalTriageComplete).not.toBe(true);

    const triageTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'I have chest pain, it started 3 days ago, it feels moderate, and I already had a blood test.',
    })).body);

    expect(triageTurn.journey).toMatchObject({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(triageTurn.messages[0]?.text).toContain('explain process stage');
    expect(triageTurn.cards).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.minimalTriageComplete).toBe(false);

    const recommendationTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'What should I do next?',
    })).body);

    expect(recommendationTurn.journey).toMatchObject({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(recommendationTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'PROCESS_GUIDE',
      }),
    ]));
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(false);
  });

  it('treats pending minimal triage with a persisted answers summary as ready for recommendation', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            current_phase: 'active',
          },
        },
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
        processExplained: false,
        recommendationGenerated: false,
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const recommendationTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Please recommend a hospital.',
    })).body);

    expect(recommendationTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(recommendationTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);
  });

  it('treats skipped minimal triage as ready for recommendation', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
            current_phase: 'active',
          },
        },
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
        processExplained: false,
        recommendationGenerated: false,
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const recommendationTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Please recommend a hospital.',
    })).body);

    expect(recommendationTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(recommendationTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);
  });

  it('keeps recommendation to process explanation continuity before the session advances to consult', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: false,
        recommendationGenerated: true,
        recommendationSelected: true,
        docUploadStatus: 'submitted',
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const explainTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Please explain the process first.',
    })).body);

    expect(explainTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(explainTurn.messages[0]?.text).toContain('recommendation stage');
    expect(readSession().statusSnapshot.processExplained).toBe(false);

    const inputsTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'What should I do next?',
    })).body);

    expect(inputsTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(inputsTurn.messages[0]?.text).toContain('recommendation stage');
    expect(inputsTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.processExplained).toBe(false);
  });

  it('keeps a controlled recommendation to explain process to medical inputs continuity session when records collection is explicitly requested', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: false,
        recommendationGenerated: true,
        recommendationSelected: true,
        docUploadStatus: 'submitted',
      },
    }));

    applicationOverrides.suggest = vi.fn(async (input) => {
      if (input.latestUserMessage.toLowerCase().includes('explain')) {
        return {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          dispatchAgent: 'FaqAgent',
          reason: 'explain the process',
        };
      }

      return {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'continue records collection before consult',
      };
    });
    applicationOverrides.decide = vi.fn((input) => {
      if (input.suggestion.suggestedStage === 'EXPLAIN_PROCESS') {
        return {
          action: 'ADVANCE',
          from: input.current,
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
        };
      }

      return {
        action: 'ADVANCE',
        from: input.current,
        to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        dispatchAgent: 'RecordsAgent',
        dispatchSource: 'orchestrator',
      };
    });

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const explainTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Please explain the process first.',
    })).body);

    expect(explainTurn.journey).toMatchObject({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(explainTurn.messages[0]?.text).toContain('Here is the process');
    expect(readSession().statusSnapshot.processExplained).toBe(true);

    const inputsTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'I want to share more medical reports before the consultation.',
    })).body);

    expect(inputsTurn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(inputsTurn.messages[0]?.text).toContain('diagnosis proof');
    expect(inputsTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
      }),
    ]));
    expect(readSession().statusSnapshot.processExplained).toBe(true);
  });

  it('keeps recommendation-selected and explained sessions on online consult across committed turns', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [{
          path: 'chatbot/session-v3-1/report.pdf',
          name: 'report.pdf',
        }],
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const firstConsultTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'What should I do next?',
    })).body);

    expect(firstConsultTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(firstConsultTurn.messages[0]?.text).toContain('online consultation stage');
    expect(firstConsultTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));

    const secondConsultTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'I am ready to schedule the consultation.',
    })).body);

    expect(secondConsultTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(secondConsultTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.processExplained).toBe(true);
    expect(readSession().statusSnapshot.recommendationSelected).toBe(true);
  });

  it('keeps direct human requests on handoff continuity after prerequisites are already met', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      patientId: 'patient-1',
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'ONLINE_CONSULT',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelected: true,
        docUploadStatus: 'submitted',
        handoffStatus: 'not_needed',
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
        patient_session: 'patient-token',
      },
    });

    const firstHandoffTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Need a human now',
    })).body);

    expect(firstHandoffTurn.journey).toMatchObject({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
    expect(firstHandoffTurn.handoff).toMatchObject({
      required: true,
      ticketId: 'ticket-v3-1',
    });
    expect(firstHandoffTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'HANDOFF_STATUS',
      }),
    ]));
    expect(mockServices.createTicket.execute).toHaveBeenCalledTimes(1);
    expect(readSession().statusSnapshot.handoffActive).toBe(true);

    const secondHandoffTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Any update from the human team?',
    })).body);

    expect(secondHandoffTurn.journey).toMatchObject({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
    expect(secondHandoffTurn.handoff.required).toBe(true);
    expect(secondHandoffTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'HANDOFF_STATUS',
      }),
    ]));
    expect(mockServices.createTicket.execute).toHaveBeenCalledTimes(1);
    expect(readSession().statusSnapshot.handoffActive).toBe(true);
  });

  it('keeps a controlled FAQ detour from auto-advancing the main recommendation session', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        recommendationGenerated: true,
        processExplained: false,
      },
    }));

    applicationOverrides.suggest = vi.fn(async (input) => {
      if (input.latestUserMessage.toLowerCase().includes('consultation')) {
        return {
          intent: 'faq',
          suggestedStage: 'RECOMMENDATION',
          dispatchAgent: 'FaqAgent',
          reason: 'answer the scheduling faq without advancing the journey',
        };
      }

      return {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'resume recommendation review after the faq detour',
      };
    });
    applicationOverrides.decide = vi.fn((input) => {
      if (input.suggestion.intent === 'faq') {
        return {
          action: 'STAY',
          from: { stage: 'RECOMMENDATION', phase: 'active' },
          to: { stage: 'RECOMMENDATION', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'orchestrator',
        };
      }

      return {
        action: 'STAY',
        from: { stage: 'RECOMMENDATION', phase: 'active' },
        to: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchAgent: 'RecommendationAgent',
        dispatchSource: 'orchestrator',
      };
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

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const faqTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'How long does online consultation usually take to schedule?',
    })).body);

    expect(faqTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(faqTurn.messages[0]?.text).toContain('Online consultations are usually arranged within 24 hours.');
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);
    expect(readSession().statusSnapshot.processExplained).toBe(false);

    const revisitTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Show me the hospital options again.',
    })).body);

    expect(revisitTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(revisitTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);
  });

  it('keeps a real recommendation revisit compare loop canonical across committed turns', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        recommendationGenerated: true,
        processExplained: false,
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const compareTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Compare the hospitals for me.',
    })).body);

    expect(compareTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(compareTurn.messages[0]?.text).toContain('recommendation stage');
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);

    const explainTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Compare them again and explain the differences.',
    })).body);

    expect(explainTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(explainTurn.messages[0]?.text).toContain('recommendation stage');
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);

    const revisitTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Show me the hospital options again.',
    })).body);

    expect(revisitTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(revisitTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);
  });

  it('keeps repeated explain requests on the already-explained recommendation path without corrupting continuity', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [{
          path: 'chatbot/session-v3-1/report.pdf',
          name: 'report.pdf',
        }],
      },
    }));

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const repeatExplainTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Please explain the process again.',
    })).body);

    expect(repeatExplainTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(repeatExplainTurn.messages[0]?.text).toContain('online consultation stage');
    expect(readSession().statusSnapshot.processExplained).toBe(true);

    const nextTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'What should I do next?',
    })).body);

    expect(nextTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(nextTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
    expect(readSession().statusSnapshot.processExplained).toBe(true);
  });

  it('keeps a controlled degraded recommendation retry session recoverable on a later turn', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        recommendationGenerated: true,
      },
    }));

    applicationOverrides.suggest = vi.fn(async () => ({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'refresh recommendation options after the user asked again',
    }));
    applicationOverrides.decide = vi.fn(() => ({
      action: 'STAY',
      from: { stage: 'RECOMMENDATION', phase: 'active' },
      to: { stage: 'RECOMMENDATION', phase: 'active' },
      dispatchAgent: 'RecommendationAgent',
      dispatchSource: 'orchestrator',
    }));
    mockServices.matchHospitals.execute
      .mockRejectedValueOnce(new Error('recommendation.generate timed out'))
      .mockResolvedValue({
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
        ],
      });

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const degradedTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Show me more hospitals.',
    })).body);

    expect(degradedTurn.turnOutcome.status).toBe('degraded');
    expect(degradedTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(degradedTurn.messages[0]?.text).toContain('refresh the hospital recommendations');
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);

    const retryTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Try the recommendations again.',
    })).body);

    expect(retryTurn.turnOutcome.status).toBe('ok');
    expect(retryTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
    expect(retryTurn.cards).toEqual(expect.arrayContaining([
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
    expect(readSession().statusSnapshot.recommendationGenerated).toBe(true);
  });

  it('keeps a controlled denied handoff detour returning to the current records step on the next turn', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MEDICAL_INPUTS',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        handoffStatus: 'not_needed',
        docUploadStatus: 'none',
      },
    }));

    applicationOverrides.suggest = vi.fn(async (input) => {
      if (input.latestUserMessage.toLowerCase().includes('human')) {
        return {
          intent: 'handoff',
          suggestedStage: 'HUMAN_HANDOFF',
          reason: 'user asked for a human before the current step was complete',
        };
      }

      return {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'continue collecting records after the denied handoff detour',
      };
    });
    applicationOverrides.decide = vi.fn((input) => {
      if (input.suggestion.intent === 'handoff') {
        return {
          action: 'STAY',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          dispatchSource: 'orchestrator',
        };
      }

      return {
        action: 'STAY',
        from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        dispatchAgent: 'RecordsAgent',
        dispatchSource: 'orchestrator',
      };
    });

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const deniedTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Can I talk to a human now?',
    })).body);

    expect(deniedTurn.turnOutcome.status).toBe('ok');
    expect(deniedTurn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(deniedTurn.messages[0]?.text).toContain('Before we connect you with a human');
    expect(readSession().statusSnapshot.handoffStatus).toBe('not_needed');

    const recoveryTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'What should I send next?',
    })).body);

    expect(recoveryTurn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(recoveryTurn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
      }),
    ]));
    expect(readSession().statusSnapshot.handoffStatus).toBe('not_needed');
    expect(readSession().statusSnapshot.handoffActive).not.toBe(true);
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

    const app = await loadApp();
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
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
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

    const app = await loadApp();
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

    const app = await loadApp();
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
    expect(body.messages[0].text).toContain('Please answer these 3 follow-up questions');
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

    const app = await loadApp();
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
      'beauty',
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

    const app = await loadApp();
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
    expect(body.messages[0].text).toContain('diagnosis proof');
    expect(body.messages[0].text).not.toContain('treatment history');
  });

  it('resets stale upload residue when entering COLLECT_MEDICAL_INPUTS so earlier uploads do not count as diagnosis proof', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelected: true,
        formStatus: 'completed',
        docUploadStatus: 'submitted',
      },
    }));

    applicationOverrides.suggest = async () => ({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      reason: 'collect diagnosis proof next',
    });
    applicationOverrides.decide = () => ({
      action: 'ADVANCE',
      from: { stage: 'RECOMMENDATION', phase: 'active' },
      to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      dispatchAgent: 'RecordsAgent',
      dispatchSource: 'journey-runtime-authority',
    });

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const turn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'What should I upload next?',
    })).body);

    expect(turn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(turn.messages[0]?.text).toContain('diagnosis proof');
    expect(turn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          uploadedCount: 0,
          required: true,
        }),
      }),
    ]));
    expect(readSession().statusSnapshot.docUploadStatus).toBe('none');
    expect(readSession().statusSnapshot.formStatus).toBe('completed');
  });

  it('preserves fresh diagnosis-proof upload progress when entering COLLECT_MEDICAL_INPUTS on the same turn', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'RECOMMENDATION',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelected: true,
        formStatus: 'completed',
        docUploadStatus: 'none',
      },
    }));

    applicationOverrides.suggest = async () => ({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      reason: 'collect diagnosis proof next',
    });
    applicationOverrides.decide = () => ({
      action: 'ADVANCE',
      from: { stage: 'RECOMMENDATION', phase: 'active' },
      to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      dispatchAgent: 'RecordsAgent',
      dispatchSource: 'journey-runtime-authority',
    });

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const turn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Here is my diagnosis certificate.',
      attachments: [{
        fileName: 'diagnosis-certificate.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-v3-1/diagnosis-certificate.pdf',
      }],
    })).body);

    expect(turn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(turn.messages[0]?.text).toContain('diagnosis proof');
    expect(turn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          uploadedCount: 1,
          required: true,
        }),
      }),
    ]));
    expect(readSession().statusSnapshot.docUploadStatus).toBe('SUBMITTED');
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalledWith(
      'session-v3-1',
      'beauty',
      expect.objectContaining({
        docUploadStatus: 'SUBMITTED',
      }),
    );
  });

  it('keeps diagnosis-proof upload progress driven by upload status once COLLECT_MEDICAL_INPUTS is already active', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        chatbot_v2: {
          journey_snapshot: {
            current_stage: 'COLLECT_MEDICAL_INPUTS',
            current_phase: 'active',
          },
        },
        minimalTriageComplete: true,
        processExplained: true,
        recommendationGenerated: true,
        recommendationSelected: true,
        docUploadStatus: 'none',
      },
    }));

    applicationOverrides.suggest = async () => ({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      reason: 'wait for diagnosis proof upload',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      dispatchAgent: 'RecordsAgent',
      dispatchSource: 'journey-runtime-authority',
    });

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const turn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Here is my diagnosis certificate.',
      attachments: [{
        fileName: 'diagnosis-certificate.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-v3-1/diagnosis-certificate.pdf',
      }],
    })).body);

    expect(turn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(turn.messages[0]?.text).toContain('diagnosis proof');
    expect(turn.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
        payload: expect.objectContaining({
          uploadedCount: 1,
          required: true,
        }),
      }),
    ]));
    expect(readSession().statusSnapshot.docUploadStatus).toBe('SUBMITTED');
  });

  it('persists the repaired journey snapshot across a revisit turn and a later upload turn', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'post',
        recommendationSelectionStatus: 'skipped',
        recommendationSelectedHospitalIds: [],
        processExplained: true,
        supportingDocuments: [
          {
            path: 'uploads/supporting-doc-a.pdf',
            name: 'supporting-doc-a.pdf',
          },
        ],
      },
    }));

    applicationOverrides.suggest = async (input) => {
      if (input.latestUserMessage.includes('skip')) {
        return {
          intent: 'progression',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'skip recommendation and explain the process',
        };
      }

      return {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'continue collecting supporting documents',
      };
    };
    applicationOverrides.decide = (input) => {
      if (input.suggestion.suggestedStage === 'EXPLAIN_PROCESS') {
        return {
          action: 'ADVANCE',
          from: { stage: 'RECOMMENDATION', phase: 'post' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        };
      }

      return {
        action: 'ADVANCE',
        from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        dispatchAgent: 'RecordsAgent',
        dispatchSource: 'journey-runtime-authority',
      };
    };

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const revisitTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'I want to skip the recommendation and hear the process again.',
    })).body);

    expect(revisitTurn.journey).toMatchObject({
      stage: 'RECOMMENDATION',
      phase: 'post',
    });
    expect(readSession().statusSnapshot.journeyCurrentStage).toBe('RECOMMENDATION');

    const uploadTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Here is another supporting document.',
      attachments: [{
        fileName: 'supporting-doc-b.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-v3-1/supporting-doc-b.pdf',
      }],
    })).body);

    expect(uploadTurn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(readSession().statusSnapshot.journeyCurrentStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(mockServices.aiChatSessionRepo.patchStatus).not.toHaveBeenCalledWith(
      'session-v3-1',
      'beauty',
      expect.objectContaining({
        journeyCurrentStage: 'EXPLAIN_PROCESS',
      }),
    );
  });

  it('keeps the persisted primary stage during faq revisit turns and still appends later supporting-document uploads', async () => {
    const readSession = persistMountingSession(createPersistedMountingSession({
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [
          {
            path: 'uploads/supporting-doc-a.pdf',
            name: 'supporting-doc-a.pdf',
          },
        ],
      },
    }));

    applicationOverrides.suggest = async (input) => {
      if (input.latestUserMessage.includes('process')) {
        return {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'revisit the process explanation without changing the primary stage',
        };
      }

      return {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'continue accepting supporting documents',
      };
    };
    applicationOverrides.decide = (input) => {
      if (input.suggestion.suggestedStage === 'EXPLAIN_PROCESS') {
        return {
          action: 'ADVANCE',
          from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
          dispatchAgent: 'FaqAgent',
          dispatchSource: 'journey-runtime-authority',
        };
      }

      return {
        action: 'REPEAT',
        from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        dispatchAgent: 'RecordsAgent',
        dispatchSource: 'journey-runtime-authority',
      };
    };

    const app = await loadApp();
    const driver = createChatbotV3SessionDriver({
      app,
      sessionId: 'session-v3-1',
      cookies: {
        chatbot_session_secret: SESSION_SECRET,
      },
    });

    const revisitTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Please explain the process again.',
    })).body);

    expect(revisitTurn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(readSession().statusSnapshot.journeyCurrentStage).toBe('COLLECT_MEDICAL_INPUTS');

    const uploadTurn = chatbotV3ChatResponseSchema.parse((await driver.sendTurn({
      message: 'Here is another supporting document.',
      attachments: [{
        fileName: 'supporting-doc-b.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'chatbot/session-v3-1/supporting-doc-b.pdf',
      }],
    })).body);

    expect(uploadTurn.journey).toMatchObject({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
    expect(readSession().statusSnapshot.journeyCurrentStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(readSession().statusSnapshot.supportingDocuments).toEqual([
      {
        path: 'uploads/supporting-doc-a.pdf',
        name: 'supporting-doc-a.pdf',
      },
      {
        path: 'chatbot/session-v3-1/supporting-doc-b.pdf',
        name: 'supporting-doc-b.pdf',
      },
    ]);
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

    const app = await loadApp();
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
    expect(body.messages[0].text).toContain('recommendation stage');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
        payload: expect.objectContaining({
          candidates: [],
        }),
      }),
    ]));
  });

  it('rejects missing or wrong secret on sessions with a stored hash', async () => {
    const app = await loadApp();

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

    const app = await loadApp();
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

    const app = await loadApp();
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

    const app = await loadApp();
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

    const app = await loadApp();
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
    expect(body.messages[0].text).toContain('Please answer these 3 follow-up questions');
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
      ([sessionId, , patch]) => sessionId === 'session-v3-1'
        && (patch as Record<string, unknown>).docUploadStatus === 'SUBMITTED',
    )?.[2] as Record<string, unknown> | undefined;
    expect(uploadPatch).toMatchObject({
      docUploadStatus: 'SUBMITTED',
    });
    expect(uploadPatch?.minimalTriageComplete).not.toBe(true);
    expect(mockServices.aiChatSessionRepo.patchStatus).not.toHaveBeenCalledWith(
      'session-v3-1',
      'beauty',
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
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
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

    const app = await loadApp();
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
    expect(body.messages[0].text).toContain('Please answer these 3 follow-up questions');
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
        journeyCurrentStage: 'EXPLAIN_PROCESS',
        journeyCurrentPhase: 'active',
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

    const app = await loadApp();
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
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'PROCESS_GUIDE',
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

    const app = await loadApp();
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
    expect(body.messages[0]?.text).toContain('recommendation stage');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
        payload: expect.objectContaining({
          candidates: [],
        }),
      }),
    ]));
  });

  it('syncs recommendation.selected and consult.completed from deterministic legacy statuses when stale migrated canonical flags are false', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      site: 'beauty',
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

    const app = await loadApp();
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
      'beauty',
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

    const app = await loadApp();
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

    const app = await loadApp();
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

    const app = await loadApp();
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

    const app = await loadApp();
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
    expect(body.turnOutcome.status).toBe('ok');
    expect(body.handoff.required).toBe(false);
    expect(body.messages[0].text).toContain('Before we connect you with a human');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'UPLOAD_RECORDS',
      }),
    ]));
    expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
  });

  it('keeps recommendation degradation distinct from blocked handoff guidance on the public route', async () => {
    applicationOverrides.suggest = async () => ({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: 'refresh recommendation options',
    });
    applicationOverrides.decide = () => ({
      action: 'STAY',
      from: { stage: 'RECOMMENDATION', phase: 'active' },
      to: { stage: 'RECOMMENDATION', phase: 'active' },
      dispatchAgent: 'RecommendationAgent',
      dispatchSource: 'orchestrator',
    });
    mockServices.matchHospitals.execute.mockRejectedValueOnce(
      new Error('recommendation.generate timed out'),
    );

    const app = await loadApp();
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Show me more hospitals.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.turnOutcome.status).toBe('degraded');
    expect(body.handoff.required).toBe(false);
    expect(body.messages[0].text).toContain('refresh the hospital recommendations');
    expect(body.messages[0].text).not.toContain('Before we connect you with a human');
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardType: 'RECOMMENDATION_LIST',
      }),
    ]));
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

    const app = await loadApp();
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

    const app = await loadApp();

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
    expect(mockServices.notifyAdminsOfNewTicket.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-v3-1',
      ticketNumber: 'TKT-20260418-0101',
      patientId: 'patient-1',
      patientName: null,
      subject: 'Chatbot v3 handoff request',
      descriptionPreview: 'user requested a human',
    });
  });
});
