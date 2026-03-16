import type { SupportTicketReply } from '../entities/support-ticket-reply.entity.js';

export interface ISupportTicketReplyRepository {
  save(entity: SupportTicketReply): Promise<SupportTicketReply>;
  findByTicketId(ticketId: string): Promise<SupportTicketReply[]>;
}
