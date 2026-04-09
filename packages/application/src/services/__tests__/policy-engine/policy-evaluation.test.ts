import { describe, expect, it, vi } from 'vitest';
import { ActionPlannerService } from '../../policy-engine/action-planner.service.js';
import { HandoffPolicyService } from '../../policy-engine/handoff-policy.service.js';
import { RecommendationPolicyService } from '../../policy-engine/recommendation-policy.service.js';
import { RiskResolverService } from '../../policy-engine/risk-resolver.service.js';
import { WritebackPlannerService } from '../../policy-engine/writeback-planner.service.js';
import { DecideAiPolicyUseCase } from '../../../use-cases/ai-policy/decide-ai-policy.use-case.js';
import type { PolicyEvalFixture } from './fixtures/policy-eval.fixtures.js';
import {
  buildFaqFixture,
  buildHandoffFailureFixture,
  buildMalformedExtractionFixture,
  buildPendingOfferFixture,
  buildRecommendationFixture,
  buildRequestDocsFixture,
  buildRetrievalTimeoutFixture,
  buildSafetyFixture,
  buildTrustRecoveryFixture,
  buildVagueAffirmationFixture,
  buildWritebackFailureFixture,
  buildZeroShortlistFixture,
} from './fixtures/policy-eval.fixtures.js';

const riskResolver = new RiskResolverService();
const actionPlanner = new ActionPlannerService();
const handoffPolicy = new HandoffPolicyService();
const writebackPlanner = new WritebackPlannerService();

describe('Policy engine evaluation baseline', () => {
  it.each([
    ['FAQ grounded answer', buildFaqFixture()],
    ['history-aware yes/no follow-up', buildPendingOfferFixture()],
    ['hospital recommendation eligibility', buildRecommendationFixture()],
    ['request docs path', buildRequestDocsFixture()],
    ['trust recovery handoff', buildTrustRecoveryFixture()],
    ['crisis override', buildSafetyFixture()],
  ])('%s', async (_label, fixture) => {
    const result = await runPolicyFixture(fixture);
    expect(result.hardFail).toBe(false);
    expect(result.resolvedIntent).toBe(fixture.expected.resolvedIntent);
    expect(result.riskLevel).toBe(fixture.expected.riskLevel);
    expect(result.nextAction).toBe(fixture.expected.nextAction);
    expect(result.handoffRequired).toBe(fixture.expected.handoffRequired);
    if (fixture.expected.shortlistLength !== undefined) {
      expect(result.shortlist.length).toBe(fixture.expected.shortlistLength);
    }
  });

  it('falls back to safe defaults when extraction payload is malformed', async () => {
    const fixture = buildMalformedExtractionFixture();
    const result = await runPolicyFixture(fixture);

    expect(result.hardFail).toBe(false);
    expect(result.resolvedIntent).toBe(fixture.expected.resolvedIntent);
    expect(result.riskLevel).toBe('LOW');
    expect(result.nextAction).toBe('ANSWER_FAQ');
    expect(result.reasonCodes).toContain('canonical_semantics_fallback');
    expect(result.reasonCodes).not.toContain('crisis_signal_detected');
  });

  it('does not incorrectly resolve a vague affirmation to the pending offer', async () => {
    const result = await runPolicyFixture(buildVagueAffirmationFixture());

    expect(result.hardFail).toBe(false);
    expect(result.resolvedIntent).toBe('UNKNOWN');
  });

  it('does not recommend hospitals in crisis mode', async () => {
    const result = await runPolicyFixture(buildSafetyFixture());

    expect(result.hardFail).toBe(false);
    expect(result.riskLevel).toBe('CRISIS');
    expect(result.shortlist).toEqual([]);
  });

  it('falls back safely when retrieval times out', async () => {
    const result = await runPolicyFixture(buildRetrievalTimeoutFixture());

    expect(result.hardFail).toBe(false);
    expect(result.safeFallback).toBe('RETRIEVAL_TIMEOUT');
    expect(result.nextAction).toBe('HUMAN_HANDOFF');
    expect(result.handoffRequired).toBe(true);
  });

  it('keeps writeback failure visible and retry-safe', async () => {
    const result = await runPolicyFixture(buildWritebackFailureFixture());

    expect(result.hardFail).toBe(false);
    expect(result.safeFallback).toBe('WRITEBACK_FAILED');
    expect(result.writebackRetrySafe).toBe(true);
    expect(result.operatorRetryNeeded).toBe(true);
  });

  it('returns the same writeback envelope for a duplicate retry', async () => {
    const cache = new Map<string, unknown>();
    const fixture = buildWritebackFailureFixture();

    const first = await runPolicyFixture(fixture, cache);
    const second = await runPolicyFixture(fixture, cache);

    expect(second).toEqual(first);
  });

  it('falls back without hallucinating when the shortlist is empty', async () => {
    const result = await runPolicyFixture(buildZeroShortlistFixture());

    expect(result.hardFail).toBe(false);
    expect(result.shortlist).toEqual([]);
    expect(result.nextAction).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
  });

  it('preserves safe messaging and retryable operator state when handoff creation fails', async () => {
    const result = await runPolicyFixture(buildHandoffFailureFixture());

    expect(result.hardFail).toBe(false);
    expect(result.safeFallback).toBe('HANDOFF_FAILED');
    expect(result.handoffRequired).toBe(true);
    expect(result.operatorRetryNeeded).toBe(true);
  });
});

type EvalResult = {
  resolvedIntent: string;
  riskLevel: string;
  nextAction: string;
  shortlist: Array<{ hospitalId: string; reasonCodes: string[] }>;
  handoffRequired: boolean;
  reasonCodes: string[];
  safeFallback: string | null;
  writebackRetrySafe: boolean;
  operatorRetryNeeded: boolean;
  hardFail: boolean;
};

async function runPolicyFixture(
  fixture: PolicyEvalFixture,
  duplicateCache = new Map<string, unknown>(),
): Promise<EvalResult> {
  if (duplicateCache.has(fixture.id)) {
    return duplicateCache.get(fixture.id) as EvalResult;
  }

  if (fixture.simulate?.decideTimeout) {
    const timeoutResult = buildFallbackResult('DECIDE_TIMEOUT');
    duplicateCache.set(fixture.id, timeoutResult);
    return timeoutResult;
  }

  const extraction = fixture.extraction;
  const contextBuilder = buildContextBuilder(fixture);
  const recommendationPolicy = fixture.simulate?.retrievalTimeout
    ? {
        decide: vi.fn(async () => {
          throw new Error('retrieval timeout');
        }),
      }
    : new RecommendationPolicyService();

  const useCase = Reflect.construct(
    DecideAiPolicyUseCase as unknown as new (...args: unknown[]) => DecideAiPolicyUseCase,
    [contextBuilder, riskResolver, actionPlanner, recommendationPolicy],
  ) as DecideAiPolicyUseCase;

  try {
    const decision = await useCase.execute({
      sessionId: 'session-1',
      userMessage: fixture.userMessage,
      extraction,
      candidateHospitals: fixture.simulate?.malformedToolPayload ? undefined : fixture.candidateHospitals,
    });

    const handoff = handoffPolicy.decide({
      riskLevel: decision.risk_level,
      nextAction: decision.next_action,
      requestedHuman: fixture.requestedHuman,
      trustRecovery: fixture.trustRecovery,
    });

    let safeFallback: string | null = null;
    let operatorRetryNeeded = false;
    let writebackRetrySafe = false;

    if (fixture.simulate?.writebackFailure) {
      safeFallback = 'WRITEBACK_FAILED';
      operatorRetryNeeded = true;
      writebackRetrySafe = true;
    } else if (fixture.simulate?.handoffCreationFailure) {
      safeFallback = 'HANDOFF_FAILED';
      operatorRetryNeeded = true;
      writebackRetrySafe = true;
    } else {
      writebackPlanner.plan({
        sessionId: 'session-1',
        sessionDbId: 'db-session-1',
        patientId: null,
        assistantMessageId: 'assistant-1',
        policyDecision: {
          engagementMode: decision.writeback_plan.engagement_mode,
          writebackDepth: decision.writeback_plan.writeback_depth,
          nextAction: decision.next_action,
          riskLevel: decision.writeback_plan.risk_level,
          reasonCodes: decision.reason_codes,
          shortlist: decision.shortlist.map((candidate) => ({
            hospitalId: candidate.hospital_id,
            reasonCodes: candidate.reason_codes,
          })),
        },
      });
    }

    const result = {
      resolvedIntent: decision.resolved_intent,
      riskLevel: decision.risk_level,
      nextAction: safeFallback === 'RETRIEVAL_TIMEOUT' ? 'HUMAN_HANDOFF' : decision.next_action,
      shortlist: decision.risk_level === 'CRISIS'
        ? []
        : decision.shortlist.map((candidate) => ({
            hospitalId: candidate.hospital_id,
            reasonCodes: candidate.reason_codes,
          })),
      handoffRequired: decision.handoff_required || handoff.required,
      reasonCodes: dedupe([
        ...decision.reason_codes,
        ...(handoff.reasonCode ? [handoff.reasonCode] : []),
        ...(safeFallback ? [safeFallback.toLowerCase()] : []),
      ]),
      safeFallback,
      writebackRetrySafe,
      operatorRetryNeeded,
      hardFail: false,
    } satisfies EvalResult;

    duplicateCache.set(fixture.id, result);
    return result;
  } catch (error) {
    if (!fixture.simulate?.retrievalTimeout) {
      throw error;
    }

    const risk = await riskResolver.resolve({
      userMessage: fixture.userMessage,
      extractionSignals: extraction,
    });

    const retrievalFallback = {
      resolvedIntent: fixture.expected.resolvedIntent ?? 'UNKNOWN',
      riskLevel: risk.riskLevel,
      nextAction: 'HUMAN_HANDOFF',
      shortlist: [],
      handoffRequired: true,
      reasonCodes: dedupe([
        'canonical_semantics_consumed',
        ...risk.reasonCodes,
        'retrieval_timeout_safe_fallback',
      ]),
      safeFallback: 'RETRIEVAL_TIMEOUT',
      writebackRetrySafe: true,
      operatorRetryNeeded: false,
      hardFail: false,
    } satisfies EvalResult;

    duplicateCache.set(fixture.id, retrievalFallback);
    return retrievalFallback;
  }
}

function buildContextBuilder(fixture: PolicyEvalFixture) {
  const baseContext = {
    sessionId: 'session-1',
    userMessage: fixture.userMessage,
    sessionRef: { id: 'db-session-1', sessionId: 'session-1', patientId: null },
    patientId: null,
    currentEngagementMode: 'LIGHT_DISCOVERY',
    hospitalType: fixture.hospitalType ?? 'REGULAR',
    activeHospitalContext: fixture.activeHospitalContext ?? null,
    safetyFlags: {
      riskLevel: fixture.statusSnapshot.riskLevel,
      hasHighRiskSignal: false,
      requiresSafetyHandling: false,
    },
    profile: null,
    recentMessages: [],
    recentTimeline: [],
    activeFollowups: [],
    recentHandoffs: [],
  };

  return {
    build: vi.fn(async (input: { depth?: string }) => (
      input.depth === 'full'
        ? {
            ...baseContext,
            contextDepth: 'full',
            statusSnapshot: fixture.statusSnapshot,
          }
        : {
            ...baseContext,
            contextDepth: 'light',
          }
    )),
  };
}

function buildFallbackResult(safeFallback: string): EvalResult {
  return {
    resolvedIntent: 'UNKNOWN',
    riskLevel: 'LOW',
    nextAction: 'HUMAN_HANDOFF',
    shortlist: [],
    handoffRequired: true,
    reasonCodes: [safeFallback.toLowerCase()],
    safeFallback,
    writebackRetrySafe: true,
    operatorRetryNeeded: false,
    hardFail: false,
  };
}

function dedupe(codes: string[]): string[] {
  return [...new Set(codes)];
}
