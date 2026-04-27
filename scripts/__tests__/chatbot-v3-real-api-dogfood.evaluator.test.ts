import assert from 'node:assert/strict';
import test from 'node:test';

import * as evaluator from '../chatbot-v3-real-api-dogfood/evaluator.ts';

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

test('agent or composer failures are classified as soft failures with usable control-plane evidence', () => {
  const result = evaluator.buildClassifiedScenarioOutcome({
    scenarioId: 'faq_side_path_preserves_stage',
    summary: 'FAQ agent fell back after reducer selected the FAQ side-path',
    failureCategory: 'agent_or_composer',
    failedPhase: 'evaluation',
    usableForControlPlaneJudgment: true,
  });

  assert.equal(evaluator.defaultOutcomeForFailureCategory('agent_or_composer'), 'SOFT_FAIL');
  assert.equal(result.outcome, 'SOFT_FAIL');
  assert.equal(result.failureCategory, 'agent_or_composer');
  assert.equal(result.failedPhase, 'evaluation');
  assert.equal(result.usableForControlPlaneJudgment, true);
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
        failureCategory: 'chat_transport',
        failedPhase: 'chat',
      }),
    /usableForControlPlaneJudgment/,
  );
});
