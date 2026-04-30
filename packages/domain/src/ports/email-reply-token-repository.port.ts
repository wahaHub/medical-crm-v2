import type { EmailReplyToken } from '../entities/email-reply-token.entity.js';
import type { Transaction } from './transaction-runner.port.js';

export interface IEmailReplyTokenRepository {
  findByTokenHash(tokenHash: string, tx?: Transaction): Promise<EmailReplyToken | null>;
  findReusable(input: {
    conversationId: string;
    patientId: string;
    sourceKind: string;
    sourceId?: string | null;
    now: Date;
  }, tx?: Transaction): Promise<EmailReplyToken | null>;
  save(entity: EmailReplyToken, tx?: Transaction): Promise<EmailReplyToken>;
  markUsed(id: string, usedAt: Date, tx?: Transaction): Promise<void>;
}
