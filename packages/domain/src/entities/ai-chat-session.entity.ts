import type { AiChatSessionStatus, HospitalType } from '../enums/index.js';

export interface AiChatPendingState {
  type: string;
  payload: Record<string, unknown>;
}

export interface AiChatStatusSnapshot {
  conditionStatus: string;
  formStatus: string;
  docUploadStatus: string;
  recommendationStatus: string;
  consultationStatus: string;
  packageStatus: string;
  handoffStatus: string;
  leadMaturity: string;
  riskLevel: string;
  trustOrObjection: string;
  pendingOffer: AiChatPendingState | null;
  pendingQuestion: AiChatPendingState | null;
  lastNextAction: string | null;
  lastResolvedIntent: string | null;
  conversationSummary: string;
  lastPolicyDecisionAt: Date | null;
  lastUserMessageAt: Date | null;
  lastAssistantMessageAt: Date | null;
}

export interface AiChatSessionProps {
  id: string;
  sessionId: string;
  sessionSecretHash: string | null;
  difyConversationId: string | null;
  patientId: string | null;
  hospitalType: HospitalType;
  status: AiChatSessionStatus;
  statusSnapshot?: Partial<AiChatStatusSnapshot>;
  createdAt: Date;
  updatedAt: Date;
}

export class AiChatSession {
  readonly id: string;
  sessionId: string;
  sessionSecretHash: string | null;
  difyConversationId: string | null;
  patientId: string | null;
  hospitalType: HospitalType;
  status: AiChatSessionStatus;
  statusSnapshot: AiChatStatusSnapshot;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: AiChatSessionProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.sessionSecretHash = props.sessionSecretHash;
    this.difyConversationId = props.difyConversationId;
    this.patientId = props.patientId;
    this.hospitalType = props.hospitalType;
    this.status = props.status;
    this.statusSnapshot = {
      conditionStatus: props.statusSnapshot?.conditionStatus ?? 'unknown',
      formStatus: props.statusSnapshot?.formStatus ?? 'not_started',
      docUploadStatus: props.statusSnapshot?.docUploadStatus ?? 'none',
      recommendationStatus: props.statusSnapshot?.recommendationStatus ?? 'not_started',
      consultationStatus: props.statusSnapshot?.consultationStatus ?? 'not_introduced',
      packageStatus: props.statusSnapshot?.packageStatus ?? 'not_introduced',
      handoffStatus: props.statusSnapshot?.handoffStatus ?? 'not_needed',
      leadMaturity: props.statusSnapshot?.leadMaturity ?? 'browsing',
      riskLevel: props.statusSnapshot?.riskLevel ?? 'low',
      trustOrObjection: props.statusSnapshot?.trustOrObjection ?? 'none',
      pendingOffer: props.statusSnapshot?.pendingOffer ?? null,
      pendingQuestion: props.statusSnapshot?.pendingQuestion ?? null,
      lastNextAction: props.statusSnapshot?.lastNextAction ?? null,
      lastResolvedIntent: props.statusSnapshot?.lastResolvedIntent ?? null,
      conversationSummary: props.statusSnapshot?.conversationSummary ?? '',
      lastPolicyDecisionAt: props.statusSnapshot?.lastPolicyDecisionAt ?? null,
      lastUserMessageAt: props.statusSnapshot?.lastUserMessageAt ?? null,
      lastAssistantMessageAt: props.statusSnapshot?.lastAssistantMessageAt ?? null,
    };
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
