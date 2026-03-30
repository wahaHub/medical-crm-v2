import type { HospitalType } from '@medical-crm/domain';

export type AiPolicyEngagementMode =
  | 'LIGHT_DISCOVERY'
  | 'QUALIFIED_EXPLORATION'
  | 'DEEP_WORKFLOW';

export const AI_POLICY_BACKEND_NEXT_ACTIONS = [
  'ANSWER_FAQ',
  'SHOW_PACKAGE',
  'REQUEST_DOC_UPLOAD',
  'SHOW_HOSPITAL_RECOMMENDATIONS',
  'EXPLORE_HOSPITAL_RECOMMENDATIONS',
  'EXPLAIN_DOC_UPLOAD',
  'EXPLAIN_CONSULT_PROCESS',
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
