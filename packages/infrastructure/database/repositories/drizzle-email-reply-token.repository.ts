import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type {
  EmailReplyChannel,
  EmailReplyTokenStatus,
  IEmailReplyTokenRepository,
  Transaction,
} from '@medical-crm/domain';
import { EmailReplyToken } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { emailReplyTokens } from '../schema/index.js';

type EmailReplyTokenRow = typeof emailReplyTokens.$inferSelect;

export class DrizzleEmailReplyTokenRepository implements IEmailReplyTokenRepository {
  constructor(private readonly db: CrmDb) {}

  async findByTokenHash(tokenHash: string, tx?: Transaction): Promise<EmailReplyToken | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .select()
      .from(emailReplyTokens)
      .where(eq(emailReplyTokens.tokenHash, tokenHash))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async findReusable(input: {
    conversationId: string;
    patientId: string;
    sourceKind: string;
    sourceId?: string | null;
    now: Date;
  }, tx?: Transaction): Promise<EmailReplyToken | null> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const rows = await db
      .select()
      .from(emailReplyTokens)
      .where(
        and(
          eq(emailReplyTokens.conversationId, input.conversationId),
          eq(emailReplyTokens.patientId, input.patientId),
          eq(emailReplyTokens.sourceKind, input.sourceKind),
          input.sourceId == null
            ? isNull(emailReplyTokens.sourceId)
            : eq(emailReplyTokens.sourceId, input.sourceId),
          eq(emailReplyTokens.status, 'ACTIVE'),
          gt(emailReplyTokens.expiresAt, input.now.toISOString()),
        ),
      )
      .orderBy(desc(emailReplyTokens.createdAt))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async save(entity: EmailReplyToken, tx?: Transaction): Promise<EmailReplyToken> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const values = {
      id: entity.id,
      tokenHash: entity.tokenHash,
      conversationId: entity.conversationId,
      caseId: entity.caseId,
      patientId: entity.patientId,
      patientEmail: entity.patientEmail,
      channel: entity.channel,
      hospitalId: entity.hospitalId,
      sourceKind: entity.sourceKind,
      sourceId: entity.sourceId,
      expiresAt: entity.expiresAt.toISOString(),
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      lastUsedAt: entity.lastUsedAt?.toISOString() ?? null,
    };

    const rows = await db
      .insert(emailReplyTokens)
      .values(values)
      .onConflictDoUpdate({
        target: emailReplyTokens.id,
        set: {
          tokenHash: values.tokenHash,
          conversationId: values.conversationId,
          caseId: values.caseId,
          patientId: values.patientId,
          patientEmail: values.patientEmail,
          channel: values.channel,
          hospitalId: values.hospitalId,
          sourceKind: values.sourceKind,
          sourceId: values.sourceId,
          expiresAt: values.expiresAt,
          status: values.status,
          lastUsedAt: values.lastUsedAt,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async markUsed(id: string, usedAt: Date, tx?: Transaction): Promise<void> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    await db
      .update(emailReplyTokens)
      .set({ lastUsedAt: usedAt.toISOString() })
      .where(eq(emailReplyTokens.id, id));
  }

  private rowToEntity(row: EmailReplyTokenRow): EmailReplyToken {
    return new EmailReplyToken({
      id: row.id,
      tokenHash: row.tokenHash,
      conversationId: row.conversationId,
      caseId: row.caseId,
      patientId: row.patientId,
      patientEmail: row.patientEmail,
      channel: row.channel as EmailReplyChannel,
      hospitalId: row.hospitalId ?? null,
      sourceKind: row.sourceKind,
      sourceId: row.sourceId ?? null,
      expiresAt: new Date(row.expiresAt),
      status: row.status as EmailReplyTokenStatus,
      createdAt: new Date(row.createdAt),
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
    });
  }
}
