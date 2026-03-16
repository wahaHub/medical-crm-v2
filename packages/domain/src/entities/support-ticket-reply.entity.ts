import type { TicketReplyRole } from '../enums/index.js';

export interface SupportTicketReplyProps {
  id: string;
  ticketId: string;
  authorId: string;
  authorRole: TicketReplyRole;
  content: string;
  isInternalNote: boolean;
  attachments: unknown | null;
  createdAt: Date;
}

export class SupportTicketReply {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly authorRole: TicketReplyRole;
  readonly content: string;
  readonly isInternalNote: boolean;
  readonly attachments: unknown | null;
  readonly createdAt: Date;

  constructor(props: SupportTicketReplyProps) {
    this.id = props.id;
    this.ticketId = props.ticketId;
    this.authorId = props.authorId;
    this.authorRole = props.authorRole;
    this.content = props.content;
    this.isInternalNote = props.isInternalNote;
    this.attachments = props.attachments;
    this.createdAt = props.createdAt;
  }
}
