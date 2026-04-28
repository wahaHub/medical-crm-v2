export type InboundEmailProvider = 'resend';
export type InboundEmailStatus =
  | 'PROCESSING'
  | 'PROCESSED'
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_EXPIRED'
  | 'SENDER_MISMATCH'
  | 'EMAIL_AUTH_FAILED'
  | 'CONVERSATION_INVALID'
  | 'EMPTY_REPLY'
  | 'FAILED';

export interface InboundEmailEventProps {
  id: string;
  provider: InboundEmailProvider;
  providerEventId: string | null;
  providerMessageId: string | null;
  replyTokenId: string | null;
  conversationId: string | null;
  caseId: string | null;
  fromEmail: string | null;
  subject: string | null;
  status: InboundEmailStatus;
  error: string | null;
  createdMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class InboundEmailEvent {
  readonly id: string;
  provider: InboundEmailProvider;
  providerEventId: string | null;
  providerMessageId: string | null;
  replyTokenId: string | null;
  conversationId: string | null;
  caseId: string | null;
  fromEmail: string | null;
  subject: string | null;
  status: InboundEmailStatus;
  error: string | null;
  createdMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: InboundEmailEventProps) {
    this.id = props.id;
    this.provider = props.provider;
    this.providerEventId = props.providerEventId;
    this.providerMessageId = props.providerMessageId;
    this.replyTokenId = props.replyTokenId;
    this.conversationId = props.conversationId;
    this.caseId = props.caseId;
    this.fromEmail = props.fromEmail;
    this.subject = props.subject;
    this.status = props.status;
    this.error = props.error;
    this.createdMessageId = props.createdMessageId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
