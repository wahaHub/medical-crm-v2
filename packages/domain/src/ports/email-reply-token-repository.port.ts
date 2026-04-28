import type { EmailReplyToken } from '../entities/email-reply-token.entity.js';

export interface IEmailReplyTokenRepository {
  findByTokenHash(tokenHash: string): Promise<EmailReplyToken | null>;
  findReusable(input: {
    conversationId: string;
    patientId: string;
    sourceKind: string;
    sourceId?: string | null;
    now: Date;
  }): Promise<EmailReplyToken | null>;
  save(entity: EmailReplyToken): Promise<EmailReplyToken>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}
