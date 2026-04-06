import { describe, expect, it, vi } from 'vitest';
import { DecideAiPolicyUseCase } from './decide-ai-policy.use-case.js';
import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import { SignalResolverService } from '../../services/policy-engine/signal-resolver.service.js';
import { IntentResolverService } from '../../services/policy-engine/intent-resolver.service.js';
import { RiskResolverService } from '../../services/policy-engine/risk-resolver.service.js';
import { ActionPlannerService } from '../../services/policy-engine/action-planner.service.js';
import { RecommendationPolicyService } from '../../services/policy-engine/recommendation-policy.service.js';
import { EngagementModeResolverService } from '../../services/policy-engine/engagement-mode-resolver.service.js';

describe('DecideAiPolicyUseCase canonical semantics', () => {
  it('consumes valid canonical extraction output directly for primary semantics', async () => {
    const harness = createHarness({
      failOnLegacyResolverCall: true,
      recommendationResult: {
        eligible: true,
        shortlist: [{ hospitalId: 'hospital-1', reasonCodes: ['fit'] }],
        reasonCodes: ['authoritative_shortlist_ready'],
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-1',
      userMessage: 'Please recommend a hospital for me.',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
        possibleIntent: 'GENERAL_CONSULT',
        affirmative: true,
        negative: true,
      }),
      candidateHospitals: [{ hospitalId: 'hospital-1', reasonCodes: ['fit'] }],
    });

    expect(result.engagement_mode).toBe('DEEP_WORKFLOW');
    expect(result.next_action).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(result.shortlist).toEqual([
      {
        hospital_id: 'hospital-1',
        match_type: 'matched',
        reason_codes: ['fit'],
      },
    ]);
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'DEEP_WORKFLOW',
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
    }));
    expect(harness.recommendationPolicy.decide).toHaveBeenCalledWith(expect.objectContaining({
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
    }));
    expect(harness.engagementModeResolver.resolve).not.toHaveBeenCalled();
    expect(harness.intentResolver.resolve).not.toHaveBeenCalled();
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(2);
    expect(harness.contextBuilder.build.mock.calls[0]?.[0]?.depth).toBe('light');
    expect(harness.contextBuilder.build.mock.calls[1]?.[0]?.depth).toBe('full');
  });

  it('applies the deterministic fallback when canonical enum values are invalid', async () => {
    const harness = createHarness({
      failOnLegacyResolverCall: true,
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-2',
      userMessage: 'Please recommend a hospital for me.',
      extraction: {
        resolvedIntent: 'NOT_REAL',
        engagementSignal: 'INVALID',
        progressionSignal: 'ALMOST_READY',
        recommendationSignal: 'NOW',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
        possibleIntent: 'ASK_FOR_RECOMMENDATION',
      },
    });

    expect(result.engagement_mode).toBe('LIGHT_DISCOVERY');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('UNKNOWN');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
      resolvedIntent: 'UNKNOWN',
    }));
    expect(harness.recommendationPolicy.decide).not.toHaveBeenCalled();
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(1);
  });

  it('applies the deterministic fallback when canonical fields are missing', async () => {
    const harness = createHarness({
      failOnLegacyResolverCall: true,
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-3',
      userMessage: 'What documents do you need?',
      extraction: {
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'NONE',
        mentionsCondition: true,
      },
    });

    expect(result.engagement_mode).toBe('LIGHT_DISCOVERY');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('UNKNOWN');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
      resolvedIntent: 'UNKNOWN',
    }));
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(1);
  });

  it('does not let old weak fields alone drive semantic meaning in the main path', async () => {
    const harness = createHarness({
      failOnLegacyResolverCall: true,
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-4',
      userMessage: 'Please recommend a hospital for me.',
      extraction: {
        possibleIntent: 'ASK_FOR_RECOMMENDATION',
        possibleRisk: 'LOW',
        affirmative: true,
        negative: false,
      },
    });

    expect(result.engagement_mode).toBe('LIGHT_DISCOVERY');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('UNKNOWN');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'LIGHT_DISCOVERY',
      resolvedIntent: 'UNKNOWN',
    }));
    expect(harness.contextBuilder.build).toHaveBeenCalledTimes(1);
  });

  it('no longer depends on legacy intent and engagement resolver output for primary semantics', async () => {
    const harness = createHarness({
      engagementResolution: {
        engagementMode: 'DEEP_WORKFLOW',
        reasonCodes: ['legacy_engagement'],
      },
      intentResolution: {
        resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
        reasonCodes: ['legacy_intent'],
      },
    });

    const result = await harness.useCase.execute({
      sessionId: 'session-5',
      userMessage: 'hello',
      extraction: buildCanonicalExtraction({
        resolvedIntent: 'GENERAL_INFO',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'NONE',
        recommendationSignal: 'NONE',
      }),
    });

    expect(result.engagement_mode).toBe('QUALIFIED_EXPLORATION');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.resolved_intent).toBe('GENERAL_CONSULT');
    expect(harness.actionPlanner.plan).toHaveBeenCalledWith(expect.objectContaining({
      engagementMode: 'QUALIFIED_EXPLORATION',
      resolvedIntent: 'GENERAL_CONSULT',
    }));
    expect(harness.engagementModeResolver.resolve).not.toHaveBeenCalled();
    expect(harness.intentResolver.resolve).not.toHaveBeenCalled();
  });
});

type HarnessOptions = {
  failOnLegacyResolverCall?: boolean;
  engagementResolution?: {
    engagementMode: 'LIGHT_DISCOVERY' | 'QUALIFIED_EXPLORATION' | 'DEEP_WORKFLOW';
    reasonCodes: string[];
  };
  intentResolution?: {
    resolvedIntent: string;
    reasonCodes: string[];
  };
  recommendationResult?: {
    eligible: boolean;
    shortlist: Array<{ hospitalId: string; reasonCodes: string[] }>;
    reasonCodes: string[];
  };
};

function createHarness(options: HarnessOptions = {}) {
  const lightContext = buildLightContext();
  const fullContext = buildFullContext();

  const contextBuilder = {
    build: vi.fn(async (input: { depth?: string }) => (
      input.depth === 'full' ? fullContext : lightContext
    )),
  } as unknown as ContextBuilderService & {
    build: ReturnType<typeof vi.fn>;
  };

  const signalResolver = new SignalResolverService();

  const engagementModeResolver = {
    resolve: options.failOnLegacyResolverCall
      ? vi.fn(() => {
          throw new Error('legacy engagement resolver should not be called');
        })
      : vi.fn(() => options.engagementResolution ?? {
          engagementMode: 'DEEP_WORKFLOW',
          reasonCodes: ['legacy_engagement'],
        }),
  } as unknown as EngagementModeResolverService & {
    resolve: ReturnType<typeof vi.fn>;
  };

  const intentResolver = {
    resolve: options.failOnLegacyResolverCall
      ? vi.fn(async () => {
          throw new Error('legacy intent resolver should not be called');
        })
      : vi.fn(async () => options.intentResolution ?? {
          resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
          reasonCodes: ['legacy_intent'],
        }),
  } as unknown as IntentResolverService & {
    resolve: ReturnType<typeof vi.fn>;
  };

  const riskResolver = {
    resolve: vi.fn(async () => ({
      riskLevel: 'LOW',
      overrideAction: null,
      reasonCodes: ['risk_low'],
    })),
  } as unknown as RiskResolverService & {
    resolve: ReturnType<typeof vi.fn>;
  };

  const actionPlanner = {
    plan: vi.fn(() => ({
      nextAction: 'ANSWER_FAQ',
      secondaryAction: null,
      reasonCodes: ['planned'],
    })),
  } as unknown as ActionPlannerService & {
    plan: ReturnType<typeof vi.fn>;
  };

  const recommendationPolicy = {
    decide: vi.fn(async () => options.recommendationResult ?? {
      eligible: false,
      shortlist: [],
      reasonCodes: ['recommendation_deferred'],
    }),
  } as unknown as RecommendationPolicyService & {
    decide: ReturnType<typeof vi.fn>;
  };

  return {
    useCase: new DecideAiPolicyUseCase(
      contextBuilder,
      signalResolver,
      engagementModeResolver,
      intentResolver,
      riskResolver,
      actionPlanner,
      recommendationPolicy,
    ),
    contextBuilder,
    engagementModeResolver,
    intentResolver,
    riskResolver,
    actionPlanner,
    recommendationPolicy,
  };
}

function buildCanonicalExtraction(overrides: Record<string, unknown> = {}) {
  return {
    resolvedIntent: 'GENERAL_INFO',
    engagementSignal: 'LIGHT_DISCOVERY',
    progressionSignal: 'NONE',
    recommendationSignal: 'NONE',
    mentionsCondition: false,
    mentionsDoctorOrHospitalNeed: false,
    ...overrides,
  };
}

function buildLightContext() {
  return {
    contextDepth: 'light',
    sessionId: 'session-1',
    userMessage: 'hello',
    sessionRef: { id: 'db-session-1', sessionId: 'session-1', patientId: null },
    patientId: null,
    currentEngagementMode: 'LIGHT_DISCOVERY',
    hospitalType: 'REGULAR',
    activeHospitalContext: null,
    pendingOffer: { exists: false, type: null },
    pendingQuestion: { exists: false, type: null },
    lastAssistantAction: null,
    safetyFlags: {
      riskLevel: 'LOW',
      hasHighRiskSignal: false,
      requiresSafetyHandling: false,
    },
    profile: null,
    recentMessages: [],
    recentTimeline: [],
    activeFollowups: [],
    recentHandoffs: [],
  };
}

function buildFullContext() {
  return {
    contextDepth: 'full',
    sessionId: 'session-1',
    userMessage: 'hello',
    sessionRef: { id: 'db-session-1', sessionId: 'session-1', patientId: null },
    patientId: null,
    currentEngagementMode: 'DEEP_WORKFLOW',
    hospitalType: 'REGULAR',
    activeHospitalContext: null,
    pendingOffer: { exists: false, type: null },
    pendingQuestion: { exists: false, type: null },
    lastAssistantAction: 'CONSULT_CONVERSION',
    safetyFlags: {
      riskLevel: 'LOW',
      hasHighRiskSignal: false,
      requiresSafetyHandling: false,
    },
    statusSnapshot: {
      conditionStatus: 'known',
      formStatus: 'completed',
      docUploadStatus: 'uploaded',
      recommendationStatus: 'preliminary_shown',
      consultationStatus: 'ready',
      packageStatus: 'shown',
      handoffStatus: 'not_needed',
      leadMaturity: 'qualified',
      riskLevel: 'low',
      trustOrObjection: 'none',
      pendingOffer: null,
      pendingQuestion: null,
      lastNextAction: 'CONSULT_CONVERSION',
      lastResolvedIntent: 'GENERAL_CONSULT',
      conversationSummary: 'Existing qualified context.',
      lastPolicyDecisionAt: null,
      lastUserMessageAt: null,
      lastAssistantMessageAt: null,
    },
    profile: null,
    recentMessages: [],
    recentTimeline: [],
    activeFollowups: [],
    recentHandoffs: [],
  };
}
