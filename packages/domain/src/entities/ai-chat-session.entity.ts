import type { AiChatSessionStatus, HospitalType } from '../enums/index.js';

export interface AiChatSessionProps {
  id: string;
  sessionId: string;
  sessionSecretHash: string | null;
  difyConversationId: string | null;
  patientId: string | null;
  hospitalType: HospitalType;
  status: AiChatSessionStatus;
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
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
