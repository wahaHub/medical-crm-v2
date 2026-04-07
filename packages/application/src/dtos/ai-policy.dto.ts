import type { HospitalType } from '@medical-crm/domain';
import {
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
} from '@medical-crm/utils';

export {
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
} from '@medical-crm/utils';

export type AiPolicyEngagementMode =
  | 'LIGHT_DISCOVERY'
  | 'QUALIFIED_EXPLORATION'
  | 'DEEP_WORKFLOW';
export type AiPolicyResolvedIntent = (typeof AI_POLICY_RESOLVED_INTENTS)[number];
export type AiPolicyEngagementSignal = (typeof AI_POLICY_ENGAGEMENT_SIGNALS)[number];
export type AiPolicyProgressionSignal = (typeof AI_POLICY_PROGRESSION_SIGNALS)[number];
export type AiPolicyRecommendationSignal = (typeof AI_POLICY_RECOMMENDATION_SIGNALS)[number];
export type AiPolicySemanticSignals = {
  resolvedIntent: AiPolicyResolvedIntent;
  engagementSignal: AiPolicyEngagementSignal;
  progressionSignal: AiPolicyProgressionSignal;
  recommendationSignal: AiPolicyRecommendationSignal;
  mentionsCondition: boolean;
  mentionsDoctorOrHospitalNeed: boolean;
};

export const AI_POLICY_BACKEND_NEXT_ACTIONS = [
  'ANSWER_FAQ',
  'SHOW_PACKAGE',
  'REQUEST_DOC_UPLOAD',
  'SHOW_HOSPITAL_RECOMMENDATIONS',
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
