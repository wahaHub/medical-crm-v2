export const AI_POLICY_RESOLVED_INTENTS = [
  'GENERAL_INFO',
  'ASK_MEDICAL_TRAVEL_PROCESS',
  'ASK_CONSULT_PROCESS',
  'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
  'ASK_FOR_HOSPITAL_RECOMMENDATION',
  'REQUEST_DOC_UPLOAD',
  'ACCEPT_DOC_UPLOAD',
  'ACCEPT_ONLINE_CONSULT_INVITE',
  'REQUEST_HUMAN_HANDOFF',
  'ASK_PACKAGE_INFO',
  'SMALL_TALK_OR_GREETING',
  'UNKNOWN',
] as const;

export type AiPolicyResolvedIntent = (typeof AI_POLICY_RESOLVED_INTENTS)[number];

export const AI_POLICY_ENGAGEMENT_SIGNALS = [
  'LIGHT_DISCOVERY',
  'QUALIFIED_EXPLORATION',
  'DEEP_WORKFLOW',
] as const;

export type AiPolicyEngagementSignal = (typeof AI_POLICY_ENGAGEMENT_SIGNALS)[number];

export const AI_POLICY_PROGRESSION_SIGNALS = [
  'NONE',
  'CURIOUS',
  'OPEN_TO_NEXT_STEP',
  'READY_TO_PROCEED',
  'EXPLICITLY_COMMITTING',
] as const;

export type AiPolicyProgressionSignal = (typeof AI_POLICY_PROGRESSION_SIGNALS)[number];

export const AI_POLICY_RECOMMENDATION_SIGNALS = [
  'NONE',
  'SEEKING_DIRECTION',
  'SEEKING_RECOMMENDATION',
  'READY_FOR_RECOMMENDATION',
] as const;

export type AiPolicyRecommendationSignal = (typeof AI_POLICY_RECOMMENDATION_SIGNALS)[number];

export interface AiPolicySemanticSignals {
  resolvedIntent: AiPolicyResolvedIntent;
  engagementSignal: AiPolicyEngagementSignal;
  progressionSignal: AiPolicyProgressionSignal;
  recommendationSignal: AiPolicyRecommendationSignal;
  mentionsCondition: boolean;
  mentionsDoctorOrHospitalNeed: boolean;
}
