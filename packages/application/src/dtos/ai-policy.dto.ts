import type { HospitalType } from '@medical-crm/domain';

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
    nextAction?: string;
    answer?: string;
  };
  details?: Record<string, unknown>;
}
