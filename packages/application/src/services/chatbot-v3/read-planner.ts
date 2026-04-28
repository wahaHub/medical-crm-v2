import type { LoadedSkillPack, LoadedSkillSection, SkillPackId } from './skill-packs.js';
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

export interface BuildReadPlanInput {
  event: SupervisorEvent;
  turnPlan: TurnPlan;
  loadedSkillSections?: readonly LoadedSkillSection[];
  loadedSkills?: readonly LoadedSkillPack[];
}

export function buildReadPlan(input: BuildReadPlanInput): ReadPlan {
  const readIntents: ReadIntent[] = [];
  const add = (intent: ReadIntent) => {
    if (!readIntents.some((existing) => JSON.stringify(existing) === JSON.stringify(intent))) {
      readIntents.push(intent);
    }
  };

  if (input.loadedSkillSections !== undefined && input.loadedSkillSections.length > 0) {
    for (const section of input.loadedSkillSections) {
      addReadIntentsForLoadedSection(add, section, input);
    }
  } else {
    for (const skill of input.loadedSkills ?? []) {
      addReadIntentForSkill(add, skill.id, input);
    }
  }

  return {
    readIntents,
    reasonCode: input.turnPlan.reasonCode,
  };
}

function addReadIntentsForLoadedSection(
  add: (intent: ReadIntent) => void,
  section: LoadedSkillSection,
  input: { event: SupervisorEvent; turnPlan: TurnPlan },
) {
  const reasonCode = resolveSectionReasonCode(section);
  const hasSignal = (...needles: string[]) => sectionHasSignal(section, needles);
  const readIntentTypes = section.readIntentTypes ?? [];

  if (readIntentTypes.length > 0) {
    for (const readIntentType of readIntentTypes) {
      addReadIntentForType(add, readIntentType, reasonCode, input);
    }
    return;
  }

  switch (section.skillId) {
    case 'pricing_skill':
      if (hasSignal('pricing')) {
        add({ type: 'PRICING_FACTORS', reasonCode });
      }
      if (hasSignal('faq')) {
        add({ type: 'GENERAL_FAQ', category: resolveGeneralFaqCategory(input.event, input.turnPlan), reasonCode });
      }
      if (hasSignal('record', 'document')) {
        add({ type: 'RECORD_REQUIREMENTS', reasonCode });
      }
      return;
    case 'documents_skill':
      if (hasSignal('record', 'document')) {
        add({ type: 'RECORD_REQUIREMENTS', reasonCode });
      }
      return;
    case 'process_skill':
      if (hasSignal('travel')) {
        add({ type: 'TRAVEL_SUPPORT_SCOPE', reasonCode });
      }
      if (hasSignal('payment')) {
        add({ type: 'PAYMENT_POLICY', reasonCode });
      }
      if (hasSignal('process', 'next-step', 'next step')) {
        add({ type: 'PROCESS_POLICY', reasonCode });
      }
      if (hasSignal('faq')) {
        add({ type: 'GENERAL_FAQ', category: resolveGeneralFaqCategory(input.event, input.turnPlan), reasonCode });
      }
      return;
    case 'hospital_recommendation_skill':
      if (hasSignal('candidate', 'recommendation')) {
        add({ type: 'HOSPITAL_CANDIDATES', reasonCode });
      }
      if (hasSignal('hospital', 'recommendation', 'context')) {
        add({ type: 'HOSPITAL_FAQ', category: resolveHospitalFaqCategory(input.event, input.turnPlan), reasonCode });
      }
      if (hasSignal('doctor')) {
        add({ type: 'DOCTOR_MATCHING_CONTEXT', reasonCode });
      }
      return;
    case 'consult_skill':
      if (hasSignal('consult', 'readiness')) {
        add({ type: 'CONSULT_READINESS', reasonCode });
      }
      if (hasSignal('faq')) {
        add({ type: 'GENERAL_FAQ', category: resolveGeneralFaqCategory(input.event, input.turnPlan), reasonCode });
      }
      return;
    case 'safety_scope_skill':
      if (hasSignal('scope', 'boundary', 'restricted', 'out-of-scope')) {
        add({ type: 'SERVICE_SCOPE', reasonCode });
      }
      return;
    case 'human_handoff_skill':
    case 'clarification_recovery_skill':
      return;
    default:
      assertNeverDomainSkill(section.skillId);
  }
}

function addReadIntentForType(
  add: (intent: ReadIntent) => void,
  readIntentType: ReadIntent['type'],
  reasonCode: string,
  input: { event: SupervisorEvent; turnPlan: TurnPlan },
) {
  switch (readIntentType) {
    case 'GENERAL_FAQ':
      add({ type: 'GENERAL_FAQ', category: resolveGeneralFaqCategory(input.event, input.turnPlan), reasonCode });
      return;
    case 'HOSPITAL_FAQ':
      add({ type: 'HOSPITAL_FAQ', category: resolveHospitalFaqCategory(input.event, input.turnPlan), reasonCode });
      return;
    case 'RECORD_REQUIREMENTS':
      add({ type: 'RECORD_REQUIREMENTS', reasonCode });
      return;
    case 'HOSPITAL_CANDIDATES':
      add({ type: 'HOSPITAL_CANDIDATES', reasonCode });
      return;
    case 'DOCTOR_MATCHING_CONTEXT':
      add({ type: 'DOCTOR_MATCHING_CONTEXT', reasonCode });
      return;
    case 'CONSULT_READINESS':
      add({ type: 'CONSULT_READINESS', reasonCode });
      return;
    case 'SERVICE_SCOPE':
      add({ type: 'SERVICE_SCOPE', reasonCode });
      return;
    case 'PRICING_FACTORS':
      add({ type: 'PRICING_FACTORS', reasonCode });
      return;
    case 'PROCESS_POLICY':
      add({ type: 'PROCESS_POLICY', reasonCode });
      return;
    case 'TRAVEL_SUPPORT_SCOPE':
      add({ type: 'TRAVEL_SUPPORT_SCOPE', reasonCode });
      return;
    case 'PAYMENT_POLICY':
      add({ type: 'PAYMENT_POLICY', reasonCode });
      return;
    default:
      assertNeverReadIntentType(readIntentType);
  }
}

function resolveSectionReasonCode(section: LoadedSkillSection): string {
  const sectionId = section.sectionIds.length > 0
    ? section.sectionIds.join('+')
    : section.reasonCode;
  return `${section.skillId}:${sectionId}`;
}

function sectionHasSignal(section: LoadedSkillSection, needles: readonly string[]): boolean {
  const haystack = [
    section.skillId,
    ...section.sectionIds,
    ...section.retrievalGuidance,
  ].join('\n').toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function assertNeverDomainSkill(skillId: never): never {
  throw new Error(`Unhandled domain skill: ${String(skillId)}`);
}

function assertNeverReadIntentType(readIntentType: never): never {
  throw new Error(`Unhandled read intent type: ${String(readIntentType)}`);
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

function resolveGeneralFaqCategory(event: SupervisorEvent, turnPlan: TurnPlan): string {
  const category = resolveCategory(event, turnPlan);
  return category === 'next_step' ? 'process' : category;
}

function resolveHospitalFaqCategory(event: SupervisorEvent, turnPlan: TurnPlan): string {
  const action = turnPlan.primaryAction;
  const actionTarget = 'target' in action ? action.target : undefined;
  if (actionTarget !== undefined && isHospitalFaqCategory(actionTarget)) {
    return actionTarget === 'recommendation' ? 'hospital' : actionTarget;
  }
  const category = resolveCategory(event, turnPlan);
  return isHospitalFaqCategory(category) && category !== 'recommendation' ? category : 'hospital';
}

function isHospitalFaqCategory(category: string): boolean {
  return category === 'hospital'
    || category === 'hospital_selection'
    || category === 'recommendation';
}
