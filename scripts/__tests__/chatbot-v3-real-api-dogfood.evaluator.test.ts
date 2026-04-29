import assert from 'node:assert/strict';
import test from 'node:test';

import * as evaluator from '../chatbot-v3-real-api-dogfood/evaluator.ts';
import {
  buildScenarioTurns,
  evaluateJourneyFromRuntime,
} from '../chatbot-v3-real-api-dogfood.ts';
import {
  DOGFOOD_SCENARIO_IDS,
  QUALITY_GATE_EXECUTED_SCENARIO_IDS,
} from '../chatbot-v3-real-api-dogfood/scenarios.ts';
import type { TurnTranscript } from '../chatbot-v3-real-api-dogfood/types.ts';

const { evaluateScenarioOutcome, rollupRunOutcome } = evaluator;

function buildScenarioOutcome(
  scenarioId: string,
  overrides: Partial<{
    accessDecision: { result: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL'; reason?: string };
    journey: { result: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL'; reason?: string };
    response: { result: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL'; reason?: string };
    continuity: { result: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL'; reason?: string };
  }> = {},
) {
  return evaluateScenarioOutcome({
    scenarioId,
    accessDecision: overrides.accessDecision ?? { result: 'PASS' },
    journey: overrides.journey ?? { result: 'PASS' },
    response: overrides.response ?? { result: 'PASS' },
    continuity: overrides.continuity ?? { result: 'PASS' },
  });
}

function buildTurnTranscript(overrides: Partial<TurnTranscript['response']> & {
  body?: unknown;
  bodyText?: string | null;
  journeySummary?: TurnTranscript['journeySummary'];
  turnIndex?: number;
  scenarioId?: string;
} = {}): TurnTranscript {
  return {
    scenarioId: overrides.scenarioId ?? 'triage_to_recommendation',
    turnIndex: overrides.turnIndex ?? 0,
    journeySummary: overrides.journeySummary,
    request: {
      method: 'POST',
      path: '/api/v3/chatbot/chat',
      body: { sessionId: 'sess_runtime', message: 'Hello' },
      headers: {},
    },
    response: {
      status: overrides.status ?? 200,
      body: overrides.body ?? {
        messages: [{ role: 'assistant', text: 'Hello there.' }],
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
      },
      bodyText: overrides.bodyText ?? null,
      headers: overrides.headers ?? {},
    },
  };
}

function buildRuntimeDebug(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    responseContract: {
      constraints: {
        maxQuestions: 2,
        avoidMultipleCTAs: false,
      },
      forbiddenClaims: [],
    },
    loadedSkillSections: [],
    minimalContractChecks: [],
    skillBehaviorChecks: [],
    llmJudgeSummary: {
      status: 'pass',
      summary: 'No issues found.',
    },
    ...overrides,
  };
}

test('scenario returns PASS when all four axes pass', () => {
  const result = buildScenarioOutcome('intake_to_triage_opening');

  assert.equal(result.outcome, 'PASS');
  assert.equal(result.reason, 'all four axes passed');
  assert.deepEqual(result.axisResults, [
    { axis: 'accessDecision', result: 'PASS', reason: null },
    { axis: 'journey', result: 'PASS', reason: null },
    { axis: 'response', result: 'PASS', reason: null },
    { axis: 'continuity', result: 'PASS', reason: null },
  ]);
});

test('semantic mismatch returns SOFT_FAIL', () => {
  const result = buildScenarioOutcome('triage_to_recommendation', {
    response: {
      result: 'SOFT_FAIL',
      reason: 'semantic mismatch: response wording does not match the expected recommendation flow',
    },
  });

  assert.equal(result.outcome, 'SOFT_FAIL');
  assert.equal(
    result.reason,
    'response: semantic mismatch: response wording does not match the expected recommendation flow',
  );
});

test('wrong access decision returns HARD_FAIL', () => {
  const result = buildScenarioOutcome('blocked_without_prereq', {
    accessDecision: {
      result: 'HARD_FAIL',
      reason: 'wrong access decision: chat was allowed before prerequisites were satisfied',
    },
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(
    result.reason,
    'accessDecision: wrong access decision: chat was allowed before prerequisites were satisfied',
  );
});

test('broken continuity returns HARD_FAIL', () => {
  const result = buildScenarioOutcome('handoff_denied_returns_to_current_step', {
    continuity: {
      result: 'HARD_FAIL',
      reason: 'broken continuity: later turn forgot the active step after denial',
    },
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(
    result.reason,
    'continuity: broken continuity: later turn forgot the active step after denial',
  );
});

test('run-level rollup rules are explicit', () => {
  assert.equal(
    rollupRunOutcome([
      buildScenarioOutcome('blocked_without_prereq'),
      buildScenarioOutcome('allowed_after_patient_session'),
    ]).outcome,
    'PASS',
  );

  assert.equal(
    rollupRunOutcome([
      buildScenarioOutcome('intake_to_triage_opening'),
      buildScenarioOutcome('triage_to_recommendation', {
        response: {
          result: 'SOFT_FAIL',
          reason: 'semantic mismatch: response wording does not match the expected recommendation flow',
        },
      }),
    ]).outcome,
    'SOFT_FAIL',
  );

  assert.equal(
    rollupRunOutcome([
      buildScenarioOutcome('blocked_without_prereq'),
      buildScenarioOutcome('handoff_denied_returns_to_current_step', {
        continuity: {
          result: 'HARD_FAIL',
          reason: 'broken continuity: later turn forgot the active step after denial',
        },
      }),
    ]).outcome,
    'HARD_FAIL',
  );
});

test('bootstrap failures are classified as hard failures outside control-plane judgment', () => {
  const result = evaluator.buildClassifiedScenarioOutcome({
    scenarioId: 'allowed_after_patient_session',
    summary: '/api/patient/onboarding/init failed: fetch failed',
    failureCategory: 'bootstrap',
    failedPhase: 'bootstrap',
    usableForControlPlaneJudgment: false,
  });

  assert.equal(evaluator.defaultOutcomeForFailureCategory('bootstrap'), 'HARD_FAIL');
  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'bootstrap');
  assert.equal(result.failedPhase, 'bootstrap');
  assert.equal(result.usableForControlPlaneJudgment, false);
  assert.deepEqual(result.bootstrapAttempts, []);
  assert.deepEqual(result.chatAttempts, []);
  assert.equal(result.sessionId, null);
  assert.deepEqual(result.notes, []);
});

test('response quality failures are classified as soft failures with usable control-plane evidence', () => {
  const result = evaluator.buildClassifiedScenarioOutcome({
    scenarioId: 'faq_side_path_preserves_stage',
    summary: 'FAQ agent fell back after reducer selected the FAQ side-path',
    failureCategory: 'response_quality',
    failedPhase: 'evaluation',
    usableForControlPlaneJudgment: true,
  });

  assert.equal(evaluator.defaultOutcomeForFailureCategory('response_quality'), 'SOFT_FAIL');
  assert.equal(result.outcome, 'SOFT_FAIL');
  assert.equal(result.failureCategory, 'response_quality');
  assert.equal(result.failedPhase, 'evaluation');
  assert.equal(result.usableForControlPlaneJudgment, true);
});

test('quality gate execution filter includes observed scenarios and excludes local-only scenarios', () => {
  assert.deepEqual(QUALITY_GATE_EXECUTED_SCENARIO_IDS, [
    'blocked_without_prereq',
    'allowed_after_patient_session',
    'intake_to_triage_opening',
    'triage_to_recommendation',
    'recommendation_selected_to_consult',
    'faq_detour_no_progression',
    'recommendation_to_explain',
    'direct_human_request_to_handoff',
    'recommendation_revisit_compare',
    'repeat_explain',
  ]);
  assert.ok(DOGFOOD_SCENARIO_IDS.includes('degraded_then_retry'));
  assert.ok(!QUALITY_GATE_EXECUTED_SCENARIO_IDS.includes('degraded_then_retry'));
});

test('quality-gated observed scenarios have explicit turn scripts', () => {
  assert.deepEqual(buildScenarioTurns('recommendation_to_explain'), [
    {
      message: 'Main problem: chest pain. It started 3 days ago, feels moderate, and I already had a blood test.',
      action: { type: 'TRIAGE_SUBMITTED' },
    },
    { message: 'Please explain the process first.' },
  ]);
  assert.deepEqual(buildScenarioTurns('direct_human_request_to_handoff'), [
    { message: 'Need a human now' },
    { message: 'Any update from the human team?' },
  ]);
  assert.deepEqual(buildScenarioTurns('recommendation_revisit_compare'), [
    {
      message: 'Main problem: chest pain. It started 3 days ago, feels moderate, and I already had a blood test.',
      action: { type: 'TRIAGE_SUBMITTED' },
    },
    { message: 'Compare the hospitals for me.' },
    { message: 'Compare them again and explain the differences.' },
    { message: 'Show me the hospital options again.' },
  ]);
  assert.deepEqual(buildScenarioTurns('repeat_explain'), [
    { message: 'Please explain the process again.' },
    { message: 'What should I do next?' },
  ]);
});

test('journey oracle fails when triage scenario does not reach recommendation', () => {
  const result = evaluateJourneyFromRuntime('triage_to_recommendation', [
    buildTurnTranscript({
      scenarioId: 'triage_to_recommendation',
      journeySummary: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
    }),
  ]);

  assert.deepEqual(result, {
    result: 'HARD_FAIL',
    reason: 'expected final journey RECOMMENDATION/active, got COLLECT_MINIMAL_MEDICAL_FACTS/active',
  });
});

test('journey oracle fails when FAQ detour advances the stage', () => {
  const result = evaluateJourneyFromRuntime('faq_detour_no_progression', [
    buildTurnTranscript({
      scenarioId: 'faq_detour_no_progression',
      journeySummary: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
    }),
    buildTurnTranscript({
      scenarioId: 'faq_detour_no_progression',
      turnIndex: 1,
      journeySummary: { stage: 'RECOMMENDATION', phase: 'active' },
    }),
  ]);

  assert.deepEqual(result, {
    result: 'HARD_FAIL',
    reason: 'expected final journey COLLECT_MINIMAL_MEDICAL_FACTS/active, got RECOMMENDATION/active',
  });
});

test('journey oracle fails when direct human request does not reach handoff', () => {
  const result = evaluateJourneyFromRuntime('direct_human_request_to_handoff', [
    buildTurnTranscript({
      scenarioId: 'direct_human_request_to_handoff',
      journeySummary: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
    }),
  ]);

  assert.deepEqual(result, {
    result: 'HARD_FAIL',
    reason: 'expected final journey HUMAN_HANDOFF/active, got COLLECT_MINIMAL_MEDICAL_FACTS/active',
  });
});

test('journey oracle expects handoff denial to return to the current step', () => {
  assert.deepEqual(
    evaluateJourneyFromRuntime('handoff_denied_returns_to_current_step', [
      buildTurnTranscript({
        scenarioId: 'handoff_denied_returns_to_current_step',
        journeySummary: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
      }),
    ]),
    { result: 'PASS' },
  );

  assert.deepEqual(
    evaluateJourneyFromRuntime('handoff_denied_returns_to_current_step', [
      buildTurnTranscript({
        scenarioId: 'handoff_denied_returns_to_current_step',
        journeySummary: { stage: 'HUMAN_HANDOFF', phase: 'active' },
      }),
    ]),
    {
      result: 'HARD_FAIL',
      reason: 'expected final journey COLLECT_MINIMAL_MEDICAL_FACTS/active, got HUMAN_HANDOFF/active',
    },
  );
});

test('journey oracle passes when the final stage matches scenario expectation', () => {
  const result = evaluateJourneyFromRuntime('triage_to_recommendation', [
    buildTurnTranscript({
      scenarioId: 'triage_to_recommendation',
      journeySummary: { stage: 'RECOMMENDATION', phase: 'active' },
    }),
  ]);

  assert.deepEqual(result, { result: 'PASS' });
});

test('non-pass classified outcomes require failure category, failed phase, and usability before serialization', () => {
  assert.throws(
    () =>
      evaluator.buildClassifiedScenarioOutcome({
        scenarioId: 'missing_classification',
        outcome: 'HARD_FAIL',
        summary: 'classification was not supplied',
        usableForControlPlaneJudgment: false,
      }),
    /failureCategory/,
  );

  assert.throws(
    () =>
      evaluator.buildClassifiedScenarioOutcome({
        scenarioId: 'missing_phase',
        outcome: 'SOFT_FAIL',
        summary: 'phase was not supplied',
        failureCategory: 'control_plane',
        usableForControlPlaneJudgment: true,
      }),
    /failedPhase/,
  );

  assert.throws(
    () =>
      evaluator.buildClassifiedScenarioOutcome({
        scenarioId: 'missing_usability',
        outcome: 'HARD_FAIL',
        summary: 'usability was not supplied',
        failureCategory: 'transport',
        failedPhase: 'chat',
      }),
    /usableForControlPlaneJudgment/,
  );
});

test('preflight API health failures classify as environment hard failures outside control-plane judgment', () => {
  const result = evaluator.classifyEnvironmentFailureOutcome({
    scenarioId: 'preflight',
    summary: 'API health check failed before scenario bootstrap.',
    notes: ['GET /api/health returned 503'],
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'environment');
  assert.equal(result.failedPhase, 'preflight');
  assert.equal(result.usableForControlPlaneJudgment, false);
  assert.equal(result.summary, 'API health check failed before scenario bootstrap.');
  assert.deepEqual(result.notes, ['GET /api/health returned 503']);
});

test('bootstrap failure results normalize into bootstrap hard failures outside control-plane judgment', () => {
  const result = evaluator.classifyBootstrapFailureOutcome({
    scenarioId: 'allowed_after_patient_session',
    summary: 'Bootstrap did not return required session evidence.',
    bootstrapAttempts: [
      {
        phase: 'bootstrap',
        turnIndex: null,
        attempt: 1,
        durationMs: 12,
        status: 200,
        retried: false,
      },
    ],
    sessionId: null,
    notes: ['failureKind=missing_allowed_evidence'],
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'bootstrap');
  assert.equal(result.failedPhase, 'bootstrap');
  assert.equal(result.usableForControlPlaneJudgment, false);
  assert.deepEqual(result.bootstrapAttempts, [
    {
      phase: 'bootstrap',
      turnIndex: null,
      attempt: 1,
      durationMs: 12,
      status: 200,
      retried: false,
    },
  ]);
  assert.equal(result.sessionId, null);
});

test('chat response status 0 classifies as transport hard failure outside control-plane judgment', () => {
  const result = evaluator.classifyChatFailureOutcome({
    scenarioId: 'intake_to_triage_opening',
    status: 0,
    summary: '/api/v3/chatbot/chat timeout after 60000ms',
    bootstrapAttempts: [],
    chatAttempts: [
      {
        phase: 'chat',
        turnIndex: 0,
        attempt: 1,
        durationMs: 60_000,
        transportErrorKind: 'timeout',
        errorMessage: '/api/v3/chatbot/chat timeout after 60000ms',
        retried: false,
      },
    ],
    sessionId: 'sess_transport',
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'transport');
  assert.equal(result.failedPhase, 'chat');
  assert.equal(result.usableForControlPlaneJudgment, false);
  assert.equal(result.sessionId, 'sess_transport');
  assert.equal(result.chatAttempts[0]?.transportErrorKind, 'timeout');
});

test('chat response 5xx also classifies as transport hard failure outside control-plane judgment', () => {
  const result = evaluator.classifyChatFailureOutcome({
    scenarioId: 'triage_to_recommendation',
    status: 500,
    summary: '/api/v3/chatbot/chat failed with HTTP 500',
    sessionId: 'sess_http',
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'transport');
  assert.equal(result.failedPhase, 'chat');
  assert.equal(result.usableForControlPlaneJudgment, false);
  assert.equal(result.sessionId, 'sess_http');
});

test('HTTP 200 with wrong journey oracle classifies as usable read planning hard failure', () => {
  const result = evaluator.classifyEvaluationOutcome({
    scenarioId: 'faq_detour_no_progression',
    summary: 'journey: expected FAQ side-path to preserve stage, got TRIAGE',
    journey: { result: 'HARD_FAIL', reason: 'expected FAQ side-path to preserve stage, got TRIAGE' },
    response: { result: 'PASS' },
    continuity: { result: 'PASS' },
    sessionId: 'sess_control',
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'read_planning');
  assert.equal(result.failedPhase, 'evaluation');
  assert.equal(result.usableForControlPlaneJudgment, true);
  assert.equal(result.sessionId, 'sess_control');
});

test('HTTP 200 with acceptable journey but degraded output classifies as usable response quality soft failure', () => {
  const result = evaluator.classifyEvaluationOutcome({
    scenarioId: 'recommendation_selected_to_consult',
    summary: 'response: reducer selected consult flow but composer omitted the card',
    journey: { result: 'PASS' },
    response: { result: 'SOFT_FAIL', reason: 'reducer selected consult flow but composer omitted the card' },
    continuity: { result: 'PASS' },
    sessionId: 'sess_agent',
  });

  assert.equal(result.outcome, 'SOFT_FAIL');
  assert.equal(result.failureCategory, 'response_quality');
  assert.equal(result.failedPhase, 'evaluation');
  assert.equal(result.usableForControlPlaneJudgment, true);
  assert.equal(result.sessionId, 'sess_agent');
});

test('response quality category is soft-only even when the response axis is provided as hard fail', () => {
  const result = evaluator.classifyEvaluationOutcome({
    scenarioId: 'recommendation_selected_to_consult',
    summary: 'llm judge failed the wording',
    journey: { result: 'PASS' },
    response: { result: 'HARD_FAIL', reason: 'llm judge failed the wording' },
    responseFailureCategory: 'response_quality',
    continuity: { result: 'PASS' },
    sessionId: 'sess_llm_judge',
  });

  assert.equal(result.outcome, 'SOFT_FAIL');
  assert.equal(result.failureCategory, 'response_quality');
});

test('runtime response evaluator classifies deterministic minimal contract failures as agent contract hard failures', () => {
  const evaluated = evaluator.evaluateResponseQualityFromRuntime([
    buildTurnTranscript({
      body: {
        messages: [{ role: 'assistant', text: 'Can you share the report?' }],
        runtimeDebug: buildRuntimeDebug({
          responseContract: {
            constraints: {
              maxQuestions: 0,
              avoidMultipleCTAs: false,
            },
            forbiddenClaims: [],
          },
        }),
      },
    }),
  ]);

  assert.deepEqual(evaluated, {
    response: {
      result: 'HARD_FAIL',
      reason: 'Found 1 questions; maximum is 0.',
    },
    failureCategory: 'agent_contract',
  });
});

test('runtime response evaluator requires runtimeDebug on successful turns', () => {
  const evaluated = evaluator.evaluateResponseQualityFromRuntime([
    buildTurnTranscript({
      body: {
        messages: [{ role: 'assistant', text: 'Here is the answer.' }],
      },
    }),
  ]);

  assert.deepEqual(evaluated, {
    response: {
      result: 'HARD_FAIL',
      reason: 'runtimeDebug missing from successful chat response on turn 1.',
    },
    failureCategory: 'environment',
  });
});

test('runtime response evaluator requires complete runtimeDebug quality evidence', () => {
  const malformedValues: Record<string, unknown> = {
    responseContract: null,
    loadedSkillSections: {},
    minimalContractChecks: {},
    skillBehaviorChecks: {},
  };

  for (const missingField of Object.keys(malformedValues)) {
    const debug = buildRuntimeDebug();
    delete debug[missingField];

    const evaluated = evaluator.evaluateResponseQualityFromRuntime([
      buildTurnTranscript({
        body: {
          messages: [{ role: 'assistant', text: 'Here is the answer.' }],
          runtimeDebug: debug,
        },
      }),
    ]);

    assert.deepEqual(evaluated, {
      response: {
        result: 'HARD_FAIL',
        reason: `runtimeDebug ${missingField} missing or malformed on successful chat response turn 1.`,
      },
      failureCategory: 'environment',
    });

    const malformedDebug = buildRuntimeDebug({ [missingField]: malformedValues[missingField] });
    const malformedEvaluated = evaluator.evaluateResponseQualityFromRuntime([
      buildTurnTranscript({
        body: {
          messages: [{ role: 'assistant', text: 'Here is the answer.' }],
          runtimeDebug: malformedDebug,
        },
      }),
    ]);

    assert.deepEqual(malformedEvaluated, {
      response: {
        result: 'HARD_FAIL',
        reason: `runtimeDebug ${missingField} missing or malformed on successful chat response turn 1.`,
      },
      failureCategory: 'environment',
    });
  }
});

test('runtime response evaluator classifies deterministic skill behavior failures as hard skill behavior failures', () => {
  const evaluated = evaluator.evaluateResponseQualityFromRuntime([
    buildTurnTranscript({
      body: {
        messages: [{ role: 'assistant', text: 'The fixed price is $5000.' }],
        runtimeDebug: buildRuntimeDebug({
          loadedSkillSections: [{
            skillId: 'pricing_skill',
            sectionIds: ['overview'],
            reasonCode: 'pricing_summary',
            handlingGuidance: [],
            policyText: [],
          }],
        }),
      },
    }),
  ]);

  assert.deepEqual(evaluated, {
    response: {
      result: 'HARD_FAIL',
      reason: 'Response appears to promise a guaranteed or fixed total price.',
    },
    failureCategory: 'skill_behavior',
  });
});

test('runtime response evaluator applies deterministic behavior checks to canonical skill ids', () => {
  const cases = [
    {
      skillId: 'treatment_skill',
      sectionIds: ['documents_reject_hesitate'],
      handlingGuidance: ['Acknowledge without pressure and offer a lower-friction next step.'],
      responseText: 'I understand your concern, but you must upload now before we can help.',
      reason: 'Response pressures the user to upload after rejection or hesitation.',
    },
    {
      skillId: 'medical_advice_skill',
      sectionIds: ['safe_medical_boundary'],
      responseText: 'This is pneumonia. Take antibiotics and we guarantee full recovery.',
      reason: 'Response appears to diagnose the user.',
    },
    {
      skillId: 'handoff_skill',
      sectionIds: ['handoff_policy'],
      responseText: 'A human will call in 5 minutes with a guaranteed callback.',
      reason: 'Response appears to promise unsupported human handoff timing or guarantees.',
    },
  ];

  for (const item of cases) {
    const evaluated = evaluator.evaluateResponseQualityFromRuntime([
      buildTurnTranscript({
        body: {
          messages: [{ role: 'assistant', text: item.responseText }],
          runtimeDebug: buildRuntimeDebug({
            loadedSkillSections: [{
              skillId: item.skillId,
              sectionIds: item.sectionIds,
              reasonCode: 'canonical_skill_behavior',
              handlingGuidance: 'handlingGuidance' in item ? item.handlingGuidance : [],
              policyText: [],
            }],
          }),
        },
      }),
    ]);

    assert.deepEqual(evaluated, {
      response: {
        result: 'HARD_FAIL',
        reason: item.reason,
      },
      failureCategory: 'skill_behavior',
    });
  }
});

test('runtime response evaluator sends llm judge failures to the soft response quality bucket', () => {
  const evaluated = evaluator.evaluateResponseQualityFromRuntime([
    buildTurnTranscript({
      body: {
        messages: [{ role: 'assistant', text: 'Here is the answer.' }],
        runtimeDebug: buildRuntimeDebug({
          llmJudgeSummary: {
            status: 'fail',
            summary: 'Too terse for the scenario.',
          },
        }),
      },
    }),
  ]);

  assert.deepEqual(evaluated, {
    response: {
      result: 'SOFT_FAIL',
      reason: 'LLM judge fail: Too terse for the scenario.',
    },
    failureCategory: 'response_quality',
  });
});

test('runtime response evaluator preserves an earlier hard deterministic failure across later clean turns', () => {
  const evaluated = evaluator.evaluateResponseQualityFromRuntime([
    buildTurnTranscript({
      body: {
        messages: [{ role: 'assistant', text: 'Can you share the report?' }],
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        runtimeDebug: buildRuntimeDebug({
          responseContract: {
            constraints: {
              maxQuestions: 0,
              avoidMultipleCTAs: false,
            },
            forbiddenClaims: [],
          },
        }),
      },
    }),
    buildTurnTranscript({
      body: {
        messages: [{ role: 'assistant', text: 'Here is the answer.' }],
        journey: { stage: 'RECOMMENDATION', phase: 'active' },
        runtimeDebug: buildRuntimeDebug({
          responseContract: {
            constraints: {
              maxQuestions: 2,
              avoidMultipleCTAs: false,
            },
            forbiddenClaims: [],
          },
        }),
      },
    }),
  ]);

  assert.deepEqual(evaluated, {
    response: {
      result: 'HARD_FAIL',
      reason: 'Found 1 questions; maximum is 0.',
    },
    failureCategory: 'agent_contract',
  });
});

test('deterministic contract failures classify as hard agent contract failures', () => {
  const result = evaluator.classifyEvaluationOutcome({
    scenarioId: 'intake_to_triage_opening',
    summary: 'response contract failed: missing next-step invite and wrong card payload',
    journey: { result: 'PASS' },
    response: {
      result: 'HARD_FAIL',
      reason: 'response contract failed: missing next-step invite and wrong card payload',
    },
    continuity: { result: 'PASS' },
    sessionId: 'sess_contract',
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'agent_contract');
  assert.equal(result.failedPhase, 'evaluation');
  assert.equal(result.usableForControlPlaneJudgment, true);
});

test('deterministic skill behavior failures classify as hard skill behavior failures', () => {
  const result = evaluator.classifyEvaluationOutcome({
    scenarioId: 'triage_to_recommendation',
    summary: 'selected skill behavior missing expected pricing explainer',
    journey: { result: 'PASS' },
    response: {
      result: 'HARD_FAIL',
      reason: 'selected skill behavior missing expected pricing explainer',
    },
    continuity: { result: 'PASS' },
    sessionId: 'sess_skill_behavior',
  });

  assert.equal(result.outcome, 'HARD_FAIL');
  assert.equal(result.failureCategory, 'skill_behavior');
  assert.equal(result.failedPhase, 'evaluation');
  assert.equal(result.usableForControlPlaneJudgment, true);
});

test('classified run rollup helper preserves full scenario outcomes for artifact publishing', () => {
  const classified = evaluator.classifyBootstrapFailureOutcome({
    scenarioId: 'allowed_after_patient_session',
    summary: 'Bootstrap failed with HTTP 429.',
    bootstrapAttempts: [
      {
        phase: 'bootstrap',
        turnIndex: null,
        attempt: 1,
        durationMs: 8,
        status: 429,
        retried: false,
      },
    ],
    sessionId: 'widget_session_from_bootstrap',
    notes: ['status=429'],
  });

  const rollup = evaluator.buildClassifiedRunRollup([classified]);
  const [published] = rollup.scenarioOutcomes;

  assert.equal(rollup.outcome, 'HARD_FAIL');
  assert.equal(published, classified);
  assert.equal(published?.failureCategory, 'bootstrap');
  assert.equal(published?.failedPhase, 'bootstrap');
  assert.equal(published?.usableForControlPlaneJudgment, false);
  assert.equal(published?.sessionId, 'widget_session_from_bootstrap');
  assert.deepEqual(published?.bootstrapAttempts, classified.bootstrapAttempts);
  assert.deepEqual(published?.notes, ['status=429']);
});
