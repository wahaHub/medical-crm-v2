export type EmailReplyChannel = 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
export type EmailReplyTokenStatus = 'ACTIVE' | 'REVOKED';

export interface EmailReplyTokenProps {
  id: string;
  tokenHash: string;
  conversationId: string;
  caseId: string;
  patientId: string;
  patientEmail: string;
  channel: EmailReplyChannel;
  hospitalId: string | null;
  sourceKind: string;
  sourceId: string | null;
  expiresAt: Date;
  status: EmailReplyTokenStatus;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export class EmailReplyToken {
  readonly id: string;
  tokenHash: string;
  conversationId: string;
  caseId: string;
  patientId: string;
  patientEmail: string;
  channel: EmailReplyChannel;
  hospitalId: string | null;
  sourceKind: string;
  sourceId: string | null;
  expiresAt: Date;
  status: EmailReplyTokenStatus;
  createdAt: Date;
  lastUsedAt: Date | null;

  constructor(props: EmailReplyTokenProps) {
    this.id = props.id;
    this.tokenHash = props.tokenHash;
    this.conversationId = props.conversationId;
    this.caseId = props.caseId;
    this.patientId = props.patientId;
    this.patientEmail = props.patientEmail;
    this.channel = props.channel;
    this.hospitalId = props.hospitalId;
    this.sourceKind = props.sourceKind;
    this.sourceId = props.sourceId;
    this.expiresAt = props.expiresAt;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.lastUsedAt = props.lastUsedAt;
  }
}
