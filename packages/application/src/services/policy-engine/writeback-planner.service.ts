export interface WritebackPlannerInput {
  sessionId: string;
  sessionDbId: string;
  patientId: string | null;
  assistantMessageId: string;
  policyDecision: {
    nextAction: string;
    riskLevel?: string;
    reasonCodes?: string[];
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
    shortlist?: Array<Record<string, unknown>>;
    reasonCodes?: string[];
  };
}

export class WritebackPlannerService {
  plan(input: WritebackPlannerInput): WritebackPlan {
    const shortlist = input.policyDecision.shortlist ?? [];
    const reasonCodes = input.policyDecision.reasonCodes ?? [];

    if (input.policyDecision.nextAction === 'SHOW_HOSPITAL_RECOMMENDATIONS') {
      return {
        statusPatch: {
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
          shortlist,
          reasonCodes,
        },
      };
    }

    if (input.policyDecision.nextAction === 'REQUEST_DOC_UPLOAD') {
      return {
        statusPatch: {
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
          reasonCodes,
        },
      };
    }

    return {
      statusPatch: {
        lastNextAction: input.policyDecision.nextAction,
      },
      timelineEvents: [],
      followupTrigger: null,
      messageMetadata: {
        reasonCodes,
      },
    };
  }
}
