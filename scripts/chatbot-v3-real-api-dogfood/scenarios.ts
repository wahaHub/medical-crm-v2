import type { BootstrapMode, DogfoodScenarioId } from './types.ts';

export type ScenarioV1Status = 'required' | 'deferred';
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
  group: ScenarioGroup;
  bootstrapMode: BootstrapMode;
  expected: {
    access: ScenarioAccessExpectation;
    journey: ScenarioJourneyExpectation;
    continuity: ScenarioContinuityExpectation;
  };
  healthyOutcomeLevel: ScenarioHealthyOutcomeLevel;
}

export const BLOCKED_PATH_NEGATIVE_CONTROL_SCENARIO_ID = 'blocked_without_prereq' as const;
export const ALLOWED_BOOTSTRAP_SCENARIO_ID = 'allowed_after_patient_session' as const;

export const DOGFOOD_SCENARIOS: DogfoodScenario[] = [
  {
    id: BLOCKED_PATH_NEGATIVE_CONTROL_SCENARIO_ID,
    v1Status: 'required',
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

export const V1_REQUIRED_SCENARIO_IDS = DOGFOOD_SCENARIOS.filter(
  (scenario) => scenario.v1Status === 'required',
).map((scenario) => scenario.id);

export const V1_DEFERRED_SCENARIO_IDS = DOGFOOD_SCENARIOS.filter(
  (scenario) => scenario.v1Status === 'deferred',
).map((scenario) => scenario.id);

export function getScenarioById(scenarioId: DogfoodScenarioId) {
  const scenario = DOGFOOD_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown dogfood scenario: ${scenarioId}`);
  }

  return scenario;
}
