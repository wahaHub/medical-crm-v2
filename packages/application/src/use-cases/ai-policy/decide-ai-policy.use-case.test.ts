import { describe, expect, it, vi } from 'vitest';
import { DecideAiPolicyUseCase } from './decide-ai-policy.use-case.js';
import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import { SignalResolverService } from '../../services/policy-engine/signal-resolver.service.js';
import { IntentResolverService } from '../../services/policy-engine/intent-resolver.service.js';
import { RiskResolverService } from '../../services/policy-engine/risk-resolver.service.js';
import { ActionPlannerService } from '../../services/policy-engine/action-planner.service.js';
import { RecommendationPolicyService } from '../../services/policy-engine/recommendation-policy.service.js';
import { EngagementModeResolverService } from '../../services/policy-engine/engagement-mode-resolver.service.js';

describe('DecideAiPolicyUseCase', () => {
  it('keeps a low-signal greeting on the light path and avoids shortlist push', async () => {
    const contextBuilder = {
      build: vi.fn(async () => ({
        contextDepth: 'light',
        sessionId: 'session-1',
        userMessage: 'hello',
        sessionRef: {
          id: 'db-session-1',
          sessionId: 'session-1',
          patientId: null,
        },
        patientId: null,
        currentEngagementMode: 'LIGHT_DISCOVERY',
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
      })),
    } as unknown as ContextBuilderService;

    const useCase = new DecideAiPolicyUseCase(
      contextBuilder,
      new SignalResolverService(),
      new EngagementModeResolverService(),
      new IntentResolverService(),
      new RiskResolverService(),
      new ActionPlannerService(),
      new RecommendationPolicyService(),
    );

    const result = await useCase.execute({
      sessionId: 'session-1',
      userMessage: 'hello',
      extraction: {},
      candidateHospitals: [
        { hospitalId: 'hospital-1', reasonCodes: ['fit'] },
      ],
    });

    expect(result.engagement_mode).toBe('LIGHT_DISCOVERY');
    expect(result.next_action).toBe('ANSWER_FAQ');
    expect(result.shortlist).toEqual([]);
    expect(result.allowed_tools).toEqual(['search_faq']);
    expect((contextBuilder.build as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((contextBuilder.build as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.depth).toBe('light');
  });

  it('promotes a careful but high-value user into qualified exploration and loads full context', async () => {
    const build = vi.fn(async (input: { depth?: string }) => {
      if (input.depth === 'light') {
        return {
          contextDepth: 'light',
          sessionId: 'session-2',
          userMessage: 'I want to understand your process and how you choose hospitals before I decide.',
        sessionRef: { id: 'db-session-2', sessionId: 'session-2', patientId: null },
        patientId: null,
        currentEngagementMode: 'LIGHT_DISCOVERY',
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

      return {
        contextDepth: 'full',
        sessionId: 'session-2',
        userMessage: 'I want to understand your process and how you choose hospitals before I decide.',
        sessionRef: { id: 'db-session-2', sessionId: 'session-2', patientId: null },
        patientId: null,
        currentEngagementMode: 'QUALIFIED_EXPLORATION',
        statusSnapshot: {
          conditionStatus: 'unknown',
          formStatus: 'not_started',
          docUploadStatus: 'none',
          recommendationStatus: 'not_started',
          consultationStatus: 'not_introduced',
          packageStatus: 'not_introduced',
          handoffStatus: 'not_needed',
          leadMaturity: 'browsing',
          riskLevel: 'low',
          trustOrObjection: 'none',
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: 'CONSULT_CONVERSION',
          lastResolvedIntent: 'GENERAL_CONSULT',
          conversationSummary: 'User is cautious and evaluating trust.',
          lastPolicyDecisionAt: null,
          lastUserMessageAt: null,
          lastAssistantMessageAt: null,
        },
        pendingOffer: { exists: false, type: null },
        pendingQuestion: { exists: false, type: null },
        lastAssistantAction: 'CONSULT_CONVERSION',
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
    });

    const useCase = new DecideAiPolicyUseCase(
      { build } as unknown as ContextBuilderService,
      new SignalResolverService(),
      new EngagementModeResolverService(),
      new IntentResolverService(),
      new RiskResolverService(),
      new ActionPlannerService(),
      new RecommendationPolicyService(),
    );

    const result = await useCase.execute({
      sessionId: 'session-2',
      userMessage: 'I want to understand your process and how you choose hospitals before I decide.',
      extraction: {},
    });

    expect(result.engagement_mode).toBe('QUALIFIED_EXPLORATION');
    expect(result.next_action).not.toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[0]?.[0]?.depth).toBe('light');
    expect(build.mock.calls[1]?.[0]?.depth).toBe('full');
  });

  it('treats form completion as a strong signal without making it the sole gateway', async () => {
    const build = vi.fn(async (input: { depth?: string }) => ({
      contextDepth: input.depth === 'full' ? 'full' : 'light',
      sessionId: 'session-3',
      userMessage: 'What happens after the form review?',
      sessionRef: { id: 'db-session-3', sessionId: 'session-3', patientId: null },
      patientId: null,
      currentEngagementMode: input.depth === 'full' ? 'DEEP_WORKFLOW' : 'DEEP_WORKFLOW',
      pendingOffer: { exists: false, type: null },
      pendingQuestion: { exists: false, type: null },
      lastAssistantAction: 'CONSULT_CONVERSION',
      safetyFlags: {
        riskLevel: 'LOW',
        hasHighRiskSignal: false,
        requiresSafetyHandling: false,
      },
      ...(input.depth === 'full'
        ? {
            statusSnapshot: {
              conditionStatus: 'known',
              formStatus: 'completed',
              docUploadStatus: 'uploaded',
              recommendationStatus: 'not_started',
              consultationStatus: 'not_introduced',
              packageStatus: 'not_introduced',
              handoffStatus: 'not_needed',
              leadMaturity: 'qualified',
              riskLevel: 'low',
              trustOrObjection: 'none',
              pendingOffer: null,
              pendingQuestion: null,
              lastNextAction: 'CONSULT_CONVERSION',
              lastResolvedIntent: 'GENERAL_CONSULT',
              conversationSummary: 'Form completed and documents uploaded.',
              lastPolicyDecisionAt: null,
              lastUserMessageAt: null,
              lastAssistantMessageAt: null,
            },
            profile: null,
            recentMessages: [],
            recentTimeline: [],
            activeFollowups: [],
            recentHandoffs: [],
          }
        : {
            profile: null,
            recentMessages: [],
            recentTimeline: [],
            activeFollowups: [],
            recentHandoffs: [],
          }),
    }));

    const useCase = new DecideAiPolicyUseCase(
      { build } as unknown as ContextBuilderService,
      new SignalResolverService(),
      new EngagementModeResolverService(),
      new IntentResolverService(),
      new RiskResolverService(),
      new ActionPlannerService(),
      new RecommendationPolicyService(),
    );

    const result = await useCase.execute({
      sessionId: 'session-3',
      userMessage: 'What happens after the form review?',
      extraction: {},
    });

    expect(result.engagement_mode).toBe('DEEP_WORKFLOW');
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('keeps qualified exploration on a recommendation-exploration path without producing a shortlist', async () => {
    const build = vi.fn(async (input: { depth?: string }) => {
      if (input.depth === 'light') {
        return {
          contextDepth: 'light',
          sessionId: 'session-4',
          userMessage: 'Can you walk me through how you choose hospitals for someone like me?',
          sessionRef: { id: 'db-session-4', sessionId: 'session-4', patientId: null },
          patientId: null,
          currentEngagementMode: 'LIGHT_DISCOVERY',
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

      return {
        contextDepth: 'full',
        sessionId: 'session-4',
        userMessage: 'Can you walk me through how you choose hospitals for someone like me?',
        sessionRef: { id: 'db-session-4', sessionId: 'session-4', patientId: null },
        patientId: null,
        currentEngagementMode: 'QUALIFIED_EXPLORATION',
        pendingOffer: { exists: false, type: null },
        pendingQuestion: { exists: false, type: null },
        lastAssistantAction: 'CONSULT_CONVERSION',
        safetyFlags: {
          riskLevel: 'LOW',
          hasHighRiskSignal: false,
          requiresSafetyHandling: false,
        },
        statusSnapshot: {
          conditionStatus: 'unknown',
          formStatus: 'not_started',
          docUploadStatus: 'uploaded',
          recommendationStatus: 'not_started',
          consultationStatus: 'not_introduced',
          packageStatus: 'shown',
          handoffStatus: 'not_needed',
          leadMaturity: 'qualified',
          riskLevel: 'low',
          trustOrObjection: 'needs_trust',
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: 'CONSULT_CONVERSION',
          lastResolvedIntent: 'GENERAL_CONSULT',
          conversationSummary: 'User wants to understand hospital choice process before deciding.',
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
    });

    const useCase = new DecideAiPolicyUseCase(
      { build } as unknown as ContextBuilderService,
      new SignalResolverService(),
      new EngagementModeResolverService(),
      new IntentResolverService(),
      new RiskResolverService(),
      new ActionPlannerService(),
      new RecommendationPolicyService(),
    );

    const result = await useCase.execute({
      sessionId: 'session-4',
      userMessage: 'Can you walk me through how you choose hospitals for someone like me?',
      extraction: {},
      candidateHospitals: [{ hospitalId: 'hospital-1', reasonCodes: ['fit'] }],
    });

    expect(result.engagement_mode).toBe('QUALIFIED_EXPLORATION');
    expect(result.next_action).toBe('EXPLORE_HOSPITAL_RECOMMENDATIONS');
    expect(result.shortlist).toEqual([]);
    expect(result.allowed_tools).toEqual(['search_hospitals']);
  });

  it('keeps explicit document questions in qualified exploration on an explanation path', async () => {
    const build = vi.fn(async (input: { depth?: string }) => {
      if (input.depth === 'light') {
        return {
          contextDepth: 'light',
          sessionId: 'session-5',
          userMessage: 'What documents do you need before recommending hospitals?',
          sessionRef: { id: 'db-session-5', sessionId: 'session-5', patientId: null },
          patientId: null,
          currentEngagementMode: 'QUALIFIED_EXPLORATION',
          pendingOffer: { exists: false, type: null },
          pendingQuestion: { exists: false, type: null },
          lastAssistantAction: 'CONSULT_CONVERSION',
          safetyFlags: {
            riskLevel: 'LOW',
            hasHighRiskSignal: false,
            requiresSafetyHandling: false,
          },
        };
      }

      return {
        contextDepth: 'full',
        sessionId: 'session-5',
        userMessage: 'What documents do you need before recommending hospitals?',
        sessionRef: { id: 'db-session-5', sessionId: 'session-5', patientId: null },
        patientId: null,
        currentEngagementMode: 'QUALIFIED_EXPLORATION',
        pendingOffer: { exists: false, type: null },
        pendingQuestion: { exists: false, type: null },
        lastAssistantAction: 'CONSULT_CONVERSION',
        safetyFlags: {
          riskLevel: 'LOW',
          hasHighRiskSignal: false,
          requiresSafetyHandling: false,
        },
        statusSnapshot: {
          conditionStatus: 'unknown',
          formStatus: 'not_started',
          docUploadStatus: 'none',
          recommendationStatus: 'not_started',
          consultationStatus: 'not_introduced',
          packageStatus: 'shown',
          handoffStatus: 'not_needed',
          leadMaturity: 'qualified',
          riskLevel: 'low',
          trustOrObjection: 'needs_trust',
          pendingOffer: null,
          pendingQuestion: null,
          lastNextAction: 'CONSULT_CONVERSION',
          lastResolvedIntent: 'GENERAL_CONSULT',
          conversationSummary: 'User is asking what materials are needed before the next step.',
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
    });

    const useCase = new DecideAiPolicyUseCase(
      { build } as unknown as ContextBuilderService,
      new SignalResolverService(),
      new EngagementModeResolverService(),
      new IntentResolverService(),
      new RiskResolverService(),
      new ActionPlannerService(),
      new RecommendationPolicyService(),
    );

    const result = await useCase.execute({
      sessionId: 'session-5',
      userMessage: 'What documents do you need before recommending hospitals?',
      extraction: {},
    });

    expect(result.engagement_mode).toBe('QUALIFIED_EXPLORATION');
    expect(result.next_action).toBe('EXPLAIN_DOC_UPLOAD');
    expect(result.allowed_tools).toEqual(['search_faq']);
    expect(result.shortlist).toEqual([]);
  });
});
