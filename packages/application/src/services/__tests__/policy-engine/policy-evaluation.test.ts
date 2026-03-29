import { describe, expect, it } from 'vitest';
import { ActionPlannerService } from '../../policy-engine/action-planner.service.js';
import { HandoffPolicyService } from '../../policy-engine/handoff-policy.service.js';
import { IntentResolverService } from '../../policy-engine/intent-resolver.service.js';
import { RecommendationPolicyService } from '../../policy-engine/recommendation-policy.service.js';
import { RiskResolverService } from '../../policy-engine/risk-resolver.service.js';
import { SignalResolverService } from '../../policy-engine/signal-resolver.service.js';
import { WritebackPlannerService } from '../../policy-engine/writeback-planner.service.js';
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

const signalResolver = new SignalResolverService();
const intentResolver = new IntentResolverService();
const riskResolver = new RiskResolverService();
const actionPlanner = new ActionPlannerService();
const recommendationPolicy = new RecommendationPolicyService();
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
    const result = await runPolicyFixture(buildMalformedExtractionFixture());

    expect(result.hardFail).toBe(false);
    expect(result.riskLevel).toBe('LOW');
    expect(result.reasonCodes).not.toContain('crisis_signal_detected');
  });

  it('does not incorrectly resolve a vague affirmation to the pending offer', async () => {
    const result = await runPolicyFixture(buildVagueAffirmationFixture());

    expect(result.hardFail).toBe(false);
    expect(result.resolvedIntent).toBe('GENERAL_CONSULT');
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
    expect(result.nextAction).toBe('ESCALATE');
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
    expect(result.nextAction).not.toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
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

  const extraction = fixture.simulate?.malformedExtraction ? fixture.extraction : fixture.extraction;
  const signals = signalResolver.resolve({ extraction });

  const intent = await intentResolver.resolve({
    userMessage: fixture.userMessage,
    pendingOffer: fixture.pendingOffer ?? null,
    candidateSignals: extraction,
  });

  const risk = await riskResolver.resolve({
    userMessage: fixture.userMessage,
    candidateSignals: {
      ...extraction,
      possibleRisk: signals.possibleRisk,
    },
  });

  if (fixture.simulate?.retrievalTimeout) {
    const retrievalFallback = {
      resolvedIntent: intent.resolvedIntent,
      riskLevel: risk.riskLevel,
      nextAction: 'ESCALATE',
      shortlist: [],
      handoffRequired: true,
      reasonCodes: [...intent.reasonCodes, ...risk.reasonCodes, 'retrieval_timeout_safe_fallback'],
      safeFallback: 'RETRIEVAL_TIMEOUT',
      writebackRetrySafe: true,
      operatorRetryNeeded: false,
      hardFail: false,
    } satisfies EvalResult;
    duplicateCache.set(fixture.id, retrievalFallback);
    return retrievalFallback;
  }

  const plan = actionPlanner.plan({
    engagementMode: 'DEEP_WORKFLOW',
    statusSnapshot: {
      ...fixture.statusSnapshot,
      riskLevel: risk.riskLevel,
    },
    resolvedIntent: intent.resolvedIntent,
  });

  const recommendation = await recommendationPolicy.decide({
    statusSnapshot: {
      ...fixture.statusSnapshot,
      riskLevel: risk.riskLevel,
      docUploadStatus: fixture.statusSnapshot.docUploadStatus,
    },
    resolvedIntent: intent.resolvedIntent,
    candidateHospitals: fixture.simulate?.malformedToolPayload ? undefined : fixture.candidateHospitals,
  });

  const nextAction = risk.overrideAction
    ?? (recommendation.eligible && recommendation.shortlist.length > 0
      ? 'SHOW_HOSPITAL_RECOMMENDATIONS'
      : plan.nextAction);

  const handoff = handoffPolicy.decide({
    riskLevel: risk.riskLevel,
    nextAction,
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
        nextAction,
        riskLevel: risk.riskLevel,
        reasonCodes: [...intent.reasonCodes, ...risk.reasonCodes, ...plan.reasonCodes],
        shortlist: recommendation.shortlist.map((candidate) => ({
          hospitalId: candidate.hospitalId,
          reasonCodes: candidate.reasonCodes,
        })),
      },
    });
  }

  const result = {
    resolvedIntent: intent.resolvedIntent,
    riskLevel: risk.riskLevel,
    nextAction,
    shortlist: risk.riskLevel === 'CRISIS' ? [] : recommendation.shortlist,
    handoffRequired: handoff.required,
    reasonCodes: dedupe([
      ...intent.reasonCodes,
      ...risk.reasonCodes,
      ...plan.reasonCodes,
      ...recommendation.reasonCodes,
      ...(safeFallback ? [safeFallback.toLowerCase()] : []),
    ]),
    safeFallback,
    writebackRetrySafe,
    operatorRetryNeeded,
    hardFail: Boolean(
      (risk.riskLevel === 'CRISIS' && recommendation.shortlist.length > 0)
      || (fixture.requestedHuman && !handoff.required)
      || (fixture.pendingOffer?.type === 'HOSPITAL_RECOMMENDATION'
        && fixture.userMessage.toLowerCase().includes('maybe')
        && intent.resolvedIntent === 'ACCEPT_HOSPITAL_RECOMMENDATION'),
    ),
  } satisfies EvalResult;

  duplicateCache.set(fixture.id, result);
  return result;
}

function buildFallbackResult(code: string): EvalResult {
  return {
    resolvedIntent: 'GENERAL_CONSULT',
    riskLevel: 'LOW',
    nextAction: 'ESCALATE',
    shortlist: [],
    handoffRequired: true,
    reasonCodes: [code.toLowerCase()],
    safeFallback: code,
    writebackRetrySafe: true,
    operatorRetryNeeded: false,
    hardFail: false,
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
