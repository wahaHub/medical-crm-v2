import type {
  DogfoodAttemptSummary,
  DogfoodFailureCategory,
  DogfoodFailurePhase,
  ScenarioOutcome,
  TurnTranscript,
} from './types.ts';

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

export interface BuildClassifiedScenarioOutcomeInput {
  scenarioId: string;
  outcome?: DogfoodAxisOutcome;
  summary: string;
  failureCategory?: DogfoodFailureCategory;
  failedPhase?: DogfoodFailurePhase;
  usableForControlPlaneJudgment?: boolean;
  bootstrapAttempts?: DogfoodAttemptSummary[];
  chatAttempts?: DogfoodAttemptSummary[];
  sessionId?: string | null;
  turns?: TurnTranscript[];
  notes?: string[];
}

interface BaseClassifiedFailureInput {
  scenarioId: string;
  summary: string;
  bootstrapAttempts?: DogfoodAttemptSummary[];
  chatAttempts?: DogfoodAttemptSummary[];
  sessionId?: string | null;
  turns?: TurnTranscript[];
  notes?: string[];
}

export type EvaluationAxisInput = Pick<DogfoodAxisEvaluation, 'result' | 'reason'>;

export interface ClassifyChatFailureOutcomeInput extends BaseClassifiedFailureInput {
  status: number;
}

export interface ClassifyEvaluationOutcomeInput extends BaseClassifiedFailureInput {
  journey: EvaluationAxisInput;
  response: EvaluationAxisInput;
  continuity: EvaluationAxisInput;
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

export function defaultOutcomeForFailureCategory(category: DogfoodFailureCategory): DogfoodAxisOutcome {
  return category === 'agent_or_composer' ? 'SOFT_FAIL' : 'HARD_FAIL';
}

export function buildClassifiedScenarioOutcome(input: BuildClassifiedScenarioOutcomeInput): ScenarioOutcome {
  const outcome = input.outcome ?? (input.failureCategory ? defaultOutcomeForFailureCategory(input.failureCategory) : 'PASS');

  if (outcome !== 'PASS') {
    if (!input.failureCategory) {
      throw new Error('Dogfood non-PASS scenario outcomes require failureCategory before serialization.');
    }

    if (!input.failedPhase) {
      throw new Error('Dogfood non-PASS scenario outcomes require failedPhase before serialization.');
    }

    if (typeof input.usableForControlPlaneJudgment !== 'boolean') {
      throw new Error('Dogfood non-PASS scenario outcomes require usableForControlPlaneJudgment before serialization.');
    }
  }

  return {
    scenarioId: input.scenarioId,
    outcome,
    summary: input.summary,
    ...(input.failureCategory ? { failureCategory: input.failureCategory } : {}),
    ...(input.failedPhase ? { failedPhase: input.failedPhase } : {}),
    usableForControlPlaneJudgment: input.usableForControlPlaneJudgment ?? outcome === 'PASS',
    bootstrapAttempts: [...(input.bootstrapAttempts ?? [])],
    chatAttempts: [...(input.chatAttempts ?? [])],
    sessionId: input.sessionId ?? null,
    turns: [...(input.turns ?? [])],
    notes: [...(input.notes ?? [])],
  };
}

export function classifyEnvironmentFailureOutcome(input: BaseClassifiedFailureInput): ScenarioOutcome {
  return buildClassifiedScenarioOutcome({
    ...input,
    failureCategory: 'environment',
    failedPhase: 'preflight',
    usableForControlPlaneJudgment: false,
  });
}

export function classifyBootstrapFailureOutcome(input: BaseClassifiedFailureInput): ScenarioOutcome {
  return buildClassifiedScenarioOutcome({
    ...input,
    failureCategory: 'bootstrap',
    failedPhase: 'bootstrap',
    usableForControlPlaneJudgment: false,
  });
}

export function classifyChatFailureOutcome(input: ClassifyChatFailureOutcomeInput): ScenarioOutcome {
  if (input.status === 0) {
    return buildClassifiedScenarioOutcome({
      ...input,
      failureCategory: 'chat_transport',
      failedPhase: 'chat',
      usableForControlPlaneJudgment: false,
    });
  }

  if (input.status >= 400) {
    return buildClassifiedScenarioOutcome({
      ...input,
      failureCategory: 'chat_http',
      failedPhase: 'chat',
      usableForControlPlaneJudgment: false,
    });
  }

  throw new Error(`Chat failure classification requires status 0 or >=400, got ${input.status}.`);
}

export function classifyEvaluationOutcome(input: ClassifyEvaluationOutcomeInput): ScenarioOutcome {
  const evaluated = evaluateScenarioOutcome({
    scenarioId: input.scenarioId,
    accessDecision: { result: 'PASS' },
    journey: input.journey,
    response: input.response,
    continuity: input.continuity,
  });

  if (evaluated.outcome === 'PASS') {
    return buildClassifiedScenarioOutcome({
      ...input,
      outcome: 'PASS',
      summary: evaluated.reason,
    });
  }

  const hasControlPlaneFailure =
    input.journey.result !== 'PASS' || input.continuity.result !== 'PASS';
  const failureCategory: DogfoodFailureCategory = hasControlPlaneFailure
    ? 'control_plane'
    : 'agent_or_composer';

  return buildClassifiedScenarioOutcome({
    ...input,
    outcome: failureCategory === 'agent_or_composer' ? 'SOFT_FAIL' : evaluated.outcome,
    summary: input.summary || evaluated.reason,
    failureCategory,
    failedPhase: 'evaluation',
    usableForControlPlaneJudgment: true,
  });
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
