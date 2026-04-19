import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateScenarioOutcome,
  rollupRunOutcome,
} from '../chatbot-v3-real-api-dogfood/evaluator.ts';

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
