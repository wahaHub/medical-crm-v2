import type { HospitalType } from '@medical-crm/domain';

export type AiPolicyEngagementMode =
  | 'LIGHT_DISCOVERY'
  | 'QUALIFIED_EXPLORATION'
  | 'DEEP_WORKFLOW';

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

export const AI_POLICY_BACKEND_NEXT_ACTIONS = [
  'ANSWER_FAQ',
  'SHOW_PACKAGE',
  'REQUEST_DOC_UPLOAD',
  'SHOW_HOSPITAL_RECOMMENDATIONS',
  'EXPLORE_HOSPITAL_RECOMMENDATIONS',
  'EXPLAIN_DOC_UPLOAD',
  'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
  'EXPLAIN_CONSULT_PROCESS',
  'INVITE_ONLINE_CONSULT',
  'HUMAN_HANDOFF',
  'SAFETY_HANDOFF',
] as const;

export type AiPolicyBackendNextAction = (typeof AI_POLICY_BACKEND_NEXT_ACTIONS)[number];

export interface AiPolicyRequestEnvelope<TPayload = Record<string, unknown>> {
  version: 'v1';
  request_id: string;
  session_id: string;
  message_id?: string;
  actor: 'DIFY' | 'SYSTEM';
  source_channel: 'chatflow' | 'api' | 'worker';
  hospital_type: HospitalType;
  payload: TPayload;
}

export interface AiPolicyErrorEnvelope {
  code: string;
  retryable: boolean;
  safeFallback?: {
    nextAction?: AiPolicyBackendNextAction;
    answer?: string;
  };
  details?: Record<string, unknown>;
}
