import type { BootstrapMode, DogfoodScenarioId } from './types.ts';

export type ScenarioV1Status = 'required' | 'deferred';
export type ScenarioQualityGate = 'required' | 'observed' | 'local_only';
export type ScenarioGroup = 'gate' | 'core_journey' | 'dirty_path';
export type ScenarioAccessExpectation = 'blocked' | 'allowed';
export type ScenarioContinuityExpectation = 'single-turn' | 'multi-turn';
export type ScenarioJourneyExpectation =
  | 'blocked_gate'
  | 'allowed_bootstrap'
  | 'intake_opening'
  | 'triage_progression'
  | 'recommendation_progression'
  | 'consult_progression'
  | 'faq_detour_no_progression'
  | 'handoff_denied_returns_to_current_step'
  | 'recommendation_explain'
  | 'direct_handoff_request'
  | 'recommendation_revisit_compare'
  | 'repeat_explain'
  | 'degraded_retry';

export type ScenarioHealthyOutcomeLevel =
  | 'blocked_correctly'
  | 'bootstrap_success'
  | 'opening_turn_ok'
  | 'triage_progression_ok'
  | 'recommendation_progression_ok'
  | 'consult_progression_ok'
  | 'faq_detour_no_progression_ok'
  | 'handoff_denied_returns_current_step_ok'
  | 'recommendation_explain_ok'
  | 'direct_handoff_request_ok'
  | 'recommendation_revisit_compare_ok'
  | 'repeat_explain_ok'
  | 'degraded_retry_ok';

export interface DogfoodScenario {
  id: DogfoodScenarioId;
  v1Status: ScenarioV1Status;
  qualityGate: ScenarioQualityGate;
  group: ScenarioGroup;
  bootstrapMode: BootstrapMode;
  expected: {
    access: ScenarioAccessExpectation;
    journey: ScenarioJourneyExpectation;
    continuity: ScenarioContinuityExpectation;
  };
  healthyOutcomeLevel: ScenarioHealthyOutcomeLevel;
}

export interface DogfoodScenarioMatrixRow {
  scenarioId: DogfoodScenarioId;
  bootstrapMode: BootstrapMode;
  v1Status: ScenarioV1Status;
  qualityGate: ScenarioQualityGate;
  why: string;
  healthyOutcomeLevel: ScenarioHealthyOutcomeLevel;
  turnShape: ScenarioContinuityExpectation;
}

export const BLOCKED_PATH_NEGATIVE_CONTROL_SCENARIO_ID = 'blocked_without_prereq' as const;
export const ALLOWED_BOOTSTRAP_SCENARIO_ID = 'allowed_after_patient_session' as const;

export const DOGFOOD_SCENARIOS: DogfoodScenario[] = [
  {
    id: BLOCKED_PATH_NEGATIVE_CONTROL_SCENARIO_ID,
    v1Status: 'required',
    qualityGate: 'required',
    group: 'gate',
    bootstrapMode: 'blocked_expected',
    expected: {
      access: 'blocked',
      journey: 'blocked_gate',
      continuity: 'single-turn',
    },
    healthyOutcomeLevel: 'blocked_correctly',
  },
  {
    id: ALLOWED_BOOTSTRAP_SCENARIO_ID,
    v1Status: 'required',
    qualityGate: 'required',
    group: 'gate',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'allowed_bootstrap',
      continuity: 'single-turn',
    },
    healthyOutcomeLevel: 'bootstrap_success',
  },
  {
    id: 'intake_to_triage_opening',
    v1Status: 'required',
    qualityGate: 'required',
    group: 'core_journey',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'intake_opening',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'opening_turn_ok',
  },
  {
    id: 'triage_to_recommendation',
    v1Status: 'required',
    qualityGate: 'required',
    group: 'core_journey',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'triage_progression',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'triage_progression_ok',
  },
  {
    id: 'recommendation_selected_to_consult',
    v1Status: 'required',
    qualityGate: 'required',
    group: 'core_journey',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'consult_progression',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'consult_progression_ok',
  },
  {
    id: 'faq_detour_no_progression',
    v1Status: 'required',
    qualityGate: 'required',
    group: 'dirty_path',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'faq_detour_no_progression',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'faq_detour_no_progression_ok',
  },
  {
    id: 'handoff_denied_returns_to_current_step',
    v1Status: 'required',
    qualityGate: 'required',
    group: 'dirty_path',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'handoff_denied_returns_to_current_step',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'handoff_denied_returns_current_step_ok',
  },
  {
    id: 'recommendation_to_explain',
    v1Status: 'deferred',
    qualityGate: 'observed',
    group: 'core_journey',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'recommendation_explain',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'recommendation_explain_ok',
  },
  {
    id: 'direct_human_request_to_handoff',
    v1Status: 'deferred',
    qualityGate: 'observed',
    group: 'core_journey',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'direct_handoff_request',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'direct_handoff_request_ok',
  },
  {
    id: 'recommendation_revisit_compare',
    v1Status: 'deferred',
    qualityGate: 'observed',
    group: 'dirty_path',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'recommendation_revisit_compare',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'recommendation_revisit_compare_ok',
  },
  {
    id: 'repeat_explain',
    v1Status: 'deferred',
    qualityGate: 'observed',
    group: 'dirty_path',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'repeat_explain',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'repeat_explain_ok',
  },
  {
    id: 'degraded_then_retry',
    v1Status: 'deferred',
    qualityGate: 'local_only',
    group: 'dirty_path',
    bootstrapMode: 'chat_allowed',
    expected: {
      access: 'allowed',
      journey: 'degraded_retry',
      continuity: 'multi-turn',
    },
    healthyOutcomeLevel: 'degraded_retry_ok',
  },
];

export const DOGFOOD_SCENARIO_IDS = DOGFOOD_SCENARIOS.map((scenario) => scenario.id);

export const DOGFOOD_SCENARIO_MATRIX_ROWS: DogfoodScenarioMatrixRow[] = DOGFOOD_SCENARIOS.map(
  (scenario) => {
    switch (scenario.id) {
      case BLOCKED_PATH_NEGATIVE_CONTROL_SCENARIO_ID:
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Canonical negative control proving chat is rejected before the patient prerequisite exists.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case ALLOWED_BOOTSTRAP_SCENARIO_ID:
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Canonical allowed onboarding bootstrap proving we can establish a chat-capable patient session.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'intake_to_triage_opening':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Verifies the first allowed chat response opens the intake-to-triage path.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'triage_to_recommendation':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Verifies the core progression from triage into recommendation on the real API.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'recommendation_selected_to_consult':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Verifies the recommended-next-step flow reaches consult.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'faq_detour_no_progression':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Verifies a FAQ/resource detour does not silently advance the journey.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'handoff_denied_returns_to_current_step':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Verifies denied escalation recovers by returning to the current step.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'recommendation_to_explain':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Useful follow-up coverage after the required recommendation flow is stable.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'direct_human_request_to_handoff':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Useful follow-up coverage once basic consult continuity is proven.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'recommendation_revisit_compare':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Useful second-wave semantic coverage for comparing or revisiting recommendations.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'repeat_explain':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Useful second-wave continuity coverage for repeated explanations.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
      case 'degraded_then_retry':
        return {
          scenarioId: scenario.id,
          bootstrapMode: scenario.bootstrapMode,
          v1Status: scenario.v1Status,
          qualityGate: scenario.qualityGate,
          why: 'Useful once baseline failure evidence exists and retry behavior needs checking.',
          healthyOutcomeLevel: scenario.healthyOutcomeLevel,
          turnShape: scenario.expected.continuity,
        };
    }
  },
);

export const V1_REQUIRED_SCENARIO_IDS = DOGFOOD_SCENARIOS.filter(
  (scenario) => scenario.v1Status === 'required',
).map((scenario) => scenario.id);

export const V1_DEFERRED_SCENARIO_IDS = DOGFOOD_SCENARIOS.filter(
  (scenario) => scenario.v1Status === 'deferred',
).map((scenario) => scenario.id);

export const QUALITY_GATE_EXECUTED_SCENARIO_IDS = DOGFOOD_SCENARIOS.filter(
  (scenario) => scenario.qualityGate === 'required' || scenario.qualityGate === 'observed',
).map((scenario) => scenario.id);

export function getScenarioById(scenarioId: DogfoodScenarioId) {
  const scenario = DOGFOOD_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown dogfood scenario: ${scenarioId}`);
  }

  return scenario;
}
