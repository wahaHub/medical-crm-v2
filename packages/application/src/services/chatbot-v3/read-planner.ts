import type { LoadedSkillPack, SkillPackId } from './skill-packs.js';
import type { SupervisorEvent, TurnPlan } from './supervisor-event.types.js';

export type ReadIntent =
  | { type: 'GENERAL_FAQ'; category: string; reasonCode: string }
  | { type: 'HOSPITAL_FAQ'; category: string; reasonCode: string }
  | { type: 'RECORD_REQUIREMENTS'; reasonCode: string }
  | { type: 'HOSPITAL_CANDIDATES'; reasonCode: string }
  | { type: 'DOCTOR_MATCHING_CONTEXT'; reasonCode: string }
  | { type: 'CONSULT_READINESS'; reasonCode: string }
  | { type: 'SERVICE_SCOPE'; reasonCode: string }
  | { type: 'PRICING_FACTORS'; reasonCode: string }
  | { type: 'PROCESS_POLICY'; reasonCode: string }
  | { type: 'TRAVEL_SUPPORT_SCOPE'; reasonCode: string }
  | { type: 'PAYMENT_POLICY'; reasonCode: string };

export interface ReadPlan {
  readIntents: ReadIntent[];
  reasonCode: string;
}

export function buildReadPlan(input: {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  loadedSkills: readonly LoadedSkillPack[];
}): ReadPlan {
  const readIntents: ReadIntent[] = [];
  const add = (intent: ReadIntent) => {
    if (!readIntents.some((existing) => JSON.stringify(existing) === JSON.stringify(intent))) {
      readIntents.push(intent);
    }
  };

  for (const skill of input.loadedSkills) {
    addReadIntentForSkill(add, skill.id, input);
  }

  return {
    readIntents,
    reasonCode: input.turnPlan.reasonCode,
  };
}

function addReadIntentForSkill(
  add: (intent: ReadIntent) => void,
  skillPackId: SkillPackId,
  input: { event: SupervisorEvent; turnPlan: TurnPlan },
) {
  switch (skillPackId) {
    case 'search_general_faq_by_category':
    case 'answer_general_faq_from_admin_source':
      add({
        type: 'GENERAL_FAQ',
        category: resolveCategory(input.event, input.turnPlan),
        reasonCode: skillPackId,
      });
      return;
    case 'search_hospital_faq_by_category':
    case 'answer_hospital_faq_from_admin_source':
      add({
        type: 'HOSPITAL_FAQ',
        category: resolveCategory(input.event, input.turnPlan),
        reasonCode: skillPackId,
      });
      return;
    case 'load_records_requirement_data':
      add({ type: 'RECORD_REQUIREMENTS', reasonCode: skillPackId });
      return;
    case 'search_hospital_candidates':
      add({ type: 'HOSPITAL_CANDIDATES', reasonCode: skillPackId });
      return;
    case 'search_doctor_matching_context':
      add({ type: 'DOCTOR_MATCHING_CONTEXT', reasonCode: skillPackId });
      return;
    case 'load_consult_readiness_criteria':
      add({ type: 'CONSULT_READINESS', reasonCode: skillPackId });
      return;
    case 'load_medora_service_scope':
      add({ type: 'SERVICE_SCOPE', reasonCode: skillPackId });
      return;
    case 'load_pricing_factors':
      add({ type: 'PRICING_FACTORS', reasonCode: skillPackId });
      return;
    case 'load_process_policy':
      add({ type: 'PROCESS_POLICY', reasonCode: skillPackId });
      return;
    case 'load_travel_support_scope':
      add({ type: 'TRAVEL_SUPPORT_SCOPE', reasonCode: skillPackId });
      return;
    case 'load_payment_policy':
      add({ type: 'PAYMENT_POLICY', reasonCode: skillPackId });
      return;
    default:
      return;
  }
}

function resolveCategory(event: SupervisorEvent, turnPlan: TurnPlan): string {
  if (event.target && event.target !== 'unknown') {
    return event.target;
  }
  const action = turnPlan.primaryAction;
  return 'target' in action && action.target ? action.target : 'unknown';
}
