export type DogfoodAxisOutcome = 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';

export interface DogfoodAxisEvaluation {
  result: DogfoodAxisOutcome;
  reason?: string;
}

const AXIS_ORDER = ['accessDecision', 'journey', 'response', 'continuity'] as const;
type DogfoodAxis = (typeof AXIS_ORDER)[number];

type DogfoodScenarioEvaluationAxes = Record<DogfoodAxis, DogfoodAxisEvaluation>;

export interface DogfoodScenarioEvaluationInput extends DogfoodScenarioEvaluationAxes {
  scenarioId: string;
}

export interface DogfoodEvaluatedAxis {
  axis: DogfoodAxis;
  result: DogfoodAxisOutcome;
  reason: string | null;
}

export interface DogfoodScenarioEvaluationOutcome {
  scenarioId: string;
  outcome: DogfoodAxisOutcome;
  reason: string;
  axisResults: DogfoodEvaluatedAxis[];
}

export interface DogfoodRunRollup {
  outcome: DogfoodAxisOutcome;
  scenarioOutcomes: DogfoodScenarioEvaluationOutcome[];
}

function normalizeAxisEvaluation(
  axis: DogfoodAxis,
  evaluation: DogfoodAxisEvaluation,
): DogfoodEvaluatedAxis {
  if (evaluation.result === 'PASS') {
    return {
      axis,
      result: 'PASS',
      reason: null,
    };
  }

  const reason = evaluation.reason?.trim();
  if (!reason) {
    throw new Error(`Dogfood evaluator requires a reason for ${axis} ${evaluation.result}.`);
  }

  return {
    axis,
    result: evaluation.result,
    reason,
  };
}

export function evaluateScenarioOutcome(
  input: DogfoodScenarioEvaluationInput,
): DogfoodScenarioEvaluationOutcome {
  const axisResults = AXIS_ORDER.map((axis) =>
    normalizeAxisEvaluation(axis, input[axis]),
  );

  const hardFailure = axisResults.find((axisResult) => axisResult.result === 'HARD_FAIL');
  if (hardFailure) {
    return {
      scenarioId: input.scenarioId,
      outcome: 'HARD_FAIL',
      reason: `${hardFailure.axis}: ${hardFailure.reason}`,
      axisResults,
    };
  }

  const softFailure = axisResults.find((axisResult) => axisResult.result === 'SOFT_FAIL');
  if (softFailure) {
    return {
      scenarioId: input.scenarioId,
      outcome: 'SOFT_FAIL',
      reason: `${softFailure.axis}: ${softFailure.reason}`,
      axisResults,
    };
  }

  return {
    scenarioId: input.scenarioId,
    outcome: 'PASS',
    reason: 'all four axes passed',
    axisResults,
  };
}

export function rollupRunOutcome(
  scenarioOutcomes: DogfoodScenarioEvaluationOutcome[],
): DogfoodRunRollup {
  const hasHardFail = scenarioOutcomes.some((scenarioOutcome) => scenarioOutcome.outcome === 'HARD_FAIL');
  if (hasHardFail) {
    return {
      outcome: 'HARD_FAIL',
      scenarioOutcomes,
    };
  }

  const hasSoftFail = scenarioOutcomes.some((scenarioOutcome) => scenarioOutcome.outcome === 'SOFT_FAIL');
  if (hasSoftFail) {
    return {
      outcome: 'SOFT_FAIL',
      scenarioOutcomes,
    };
  }

  return {
    outcome: 'PASS',
    scenarioOutcomes,
  };
}
