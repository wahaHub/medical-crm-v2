import type { AiPolicyBackendNextAction } from '../../dtos/ai-policy.dto.js';
import type { AiPolicyEngagementMode } from '../../dtos/ai-policy.dto.js';

export interface WritebackPlannerInput {
  sessionId: string;
  sessionDbId: string;
  patientId: string | null;
  assistantMessageId: string;
  policyDecision: {
    engagementMode?: AiPolicyEngagementMode;
    writebackDepth?: 'minimal' | 'moderate' | 'complete';
    nextAction: AiPolicyBackendNextAction;
    selectedHospitalId?: string;
    riskLevel?: string;
    reasonCodes?: string[];
    prequalificationReasonCodes?: string[];
    shortlist?: Array<Record<string, unknown>>;
  };
}

export interface PlannedTimelineEvent {
  sessionId: string;
  patientId: string | null;
  eventType: string;
  summary: string;
  payload: Record<string, unknown>;
  actor: string;
  confidence: string | null;
}

export interface PlannedFollowupTrigger {
  sessionId: string;
  patientId: string | null;
  triggerType: string;
  channel: string;
  reason: string;
  payload: Record<string, unknown>;
}

export interface WritebackPlan {
  statusPatch: Record<string, unknown>;
  timelineEvents: PlannedTimelineEvent[];
  followupTrigger: PlannedFollowupTrigger | null;
  messageMetadata: {
    engagementMode?: AiPolicyEngagementMode;
    writebackDepth?: 'minimal' | 'moderate' | 'complete';
    prequalificationReasonCodes?: string[];
    shortlist?: Array<Record<string, unknown>>;
    reasonCodes?: string[];
  };
}

export class WritebackPlannerService {
  plan(input: WritebackPlannerInput): WritebackPlan {
    const shortlist = input.policyDecision.shortlist ?? [];
    const reasonCodes = input.policyDecision.reasonCodes ?? [];
    const engagementMode = input.policyDecision.engagementMode;
    const writebackDepth = resolveEffectiveWritebackDepth(
      engagementMode,
      input.policyDecision.writebackDepth,
    );
    const hasPrequalificationReasonCodes = input.policyDecision.prequalificationReasonCodes !== undefined;
    const prequalificationReasonCodes = input.policyDecision.prequalificationReasonCodes ?? [];
    const baseStatusPatch = {
      ...(engagementMode ? { engagementMode } : {}),
      ...(input.policyDecision.selectedHospitalId !== undefined
        ? { selectedHospitalId: input.policyDecision.selectedHospitalId }
        : {}),
      ...(hasPrequalificationReasonCodes ? { prequalificationReasonCodes } : {}),
    };
    const baseMessageMetadata = {
      ...(engagementMode ? { engagementMode } : {}),
      ...(writebackDepth ? { writebackDepth } : {}),
      ...(hasPrequalificationReasonCodes ? { prequalificationReasonCodes } : {}),
    };
    const minimalOnly = writebackDepth === 'minimal';
    const moderateOnly = writebackDepth === 'moderate';

    if (input.policyDecision.nextAction === 'SHOW_HOSPITAL_RECOMMENDATIONS') {
      if (minimalOnly) {
        return {
          statusPatch: {
            ...baseStatusPatch,
            lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          },
          timelineEvents: [],
          followupTrigger: null,
          messageMetadata: {
            ...baseMessageMetadata,
            shortlist,
            reasonCodes,
          },
        };
      }

      if (moderateOnly) {
        return {
          statusPatch: {
            ...baseStatusPatch,
            recommendationStatus: 'PRELIMINARY_SHOWN',
            lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          },
          timelineEvents: [],
          followupTrigger: null,
          messageMetadata: {
            ...baseMessageMetadata,
            shortlist,
            reasonCodes,
          },
        };
      }

      return {
        statusPatch: {
          ...baseStatusPatch,
          recommendationStatus: 'PRELIMINARY_SHOWN',
          lastNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        },
        timelineEvents: [
          {
            sessionId: input.sessionDbId,
            patientId: input.patientId,
            eventType: 'HOSPITALS_RECOMMENDED',
            summary: 'Presented a short hospital shortlist.',
            payload: { shortlist, reasonCodes, assistantMessageId: input.assistantMessageId },
            actor: 'AI',
            confidence: '0.9000',
          },
        ],
        followupTrigger: null,
        messageMetadata: {
          ...baseMessageMetadata,
          shortlist,
          reasonCodes,
        },
      };
    }

    if (input.policyDecision.nextAction === 'REQUEST_DOC_UPLOAD') {
      if (minimalOnly) {
        return {
          statusPatch: {
            ...baseStatusPatch,
            lastNextAction: 'REQUEST_DOC_UPLOAD',
          },
          timelineEvents: [],
          followupTrigger: null,
          messageMetadata: {
            ...baseMessageMetadata,
            reasonCodes,
          },
        };
      }

      if (moderateOnly) {
        return {
          statusPatch: {
            ...baseStatusPatch,
            docUploadStatus: 'REQUESTED',
            lastNextAction: 'REQUEST_DOC_UPLOAD',
          },
          timelineEvents: [],
          followupTrigger: null,
          messageMetadata: {
            ...baseMessageMetadata,
            reasonCodes,
          },
        };
      }

      return {
        statusPatch: {
          ...baseStatusPatch,
          docUploadStatus: 'REQUESTED',
          lastNextAction: 'REQUEST_DOC_UPLOAD',
        },
        timelineEvents: [
          {
            sessionId: input.sessionDbId,
            patientId: input.patientId,
            eventType: 'DOC_UPLOAD_REQUESTED',
            summary: 'Requested supporting medical documents.',
            payload: { reasonCodes, assistantMessageId: input.assistantMessageId },
            actor: 'AI',
            confidence: '0.9000',
          },
        ],
        followupTrigger: {
          sessionId: input.sessionDbId,
          patientId: input.patientId,
          triggerType: 'DOC_UPLOAD_PENDING',
          channel: 'crm_queue',
          reason: 'Waiting for the user to upload supporting documents.',
          payload: { assistantMessageId: input.assistantMessageId },
        },
        messageMetadata: {
          ...baseMessageMetadata,
          reasonCodes,
        },
      };
    }

    if (input.policyDecision.nextAction === 'EXPLAIN_DOC_UPLOAD') {
      return {
        statusPatch: {
          ...baseStatusPatch,
          lastNextAction: 'EXPLAIN_DOC_UPLOAD',
        },
        timelineEvents: [],
        followupTrigger: null,
        messageMetadata: {
          ...baseMessageMetadata,
          reasonCodes,
        },
      };
    }

    if (input.policyDecision.nextAction === 'EXPLAIN_CONSULT_PROCESS') {
      return {
        statusPatch: {
          ...baseStatusPatch,
          lastNextAction: 'EXPLAIN_CONSULT_PROCESS',
        },
        timelineEvents: [],
        followupTrigger: null,
        messageMetadata: {
          ...baseMessageMetadata,
          reasonCodes,
        },
      };
    }

    return {
      statusPatch: {
        ...baseStatusPatch,
        lastNextAction: input.policyDecision.nextAction,
      },
      timelineEvents: [],
      followupTrigger: null,
      messageMetadata: {
        ...baseMessageMetadata,
        reasonCodes,
      },
    };
  }
}

function resolveEffectiveWritebackDepth(
  engagementMode: AiPolicyEngagementMode | undefined,
  requestedDepth: 'minimal' | 'moderate' | 'complete' | undefined,
): 'minimal' | 'moderate' | 'complete' | undefined {
  if (!engagementMode) {
    return requestedDepth;
  }

  switch (engagementMode) {
    case 'LIGHT_DISCOVERY':
      return 'minimal';
    case 'QUALIFIED_EXPLORATION':
      return requestedDepth === 'complete' ? 'moderate' : (requestedDepth ?? 'moderate');
    case 'DEEP_WORKFLOW':
      return 'complete';
    default:
      return requestedDepth;
  }
}
