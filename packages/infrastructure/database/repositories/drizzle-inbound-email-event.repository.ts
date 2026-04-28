import { and, eq, isNull } from 'drizzle-orm';
import type {
  IInboundEmailEventRepository,
  InboundEmailClaimInput,
  InboundEmailProvider,
  InboundEmailStatus,
  Transaction,
} from '@medical-crm/domain';
import { InboundEmailEvent } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { inboundEmailEvents } from '../schema/index.js';

type InboundEmailEventRow = typeof inboundEmailEvents.$inferSelect;

export class DrizzleInboundEmailEventRepository implements IInboundEmailEventRepository {
  constructor(private readonly db: CrmDb) {}

  async claim(
    input: InboundEmailClaimInput,
    tx?: Transaction,
  ): Promise<{ event: InboundEmailEvent; alreadyClaimed: boolean }> {
    if (!input.providerEventId && !input.providerMessageId) {
      throw new Error('Inbound email claim requires providerEventId or providerMessageId');
    }

    const db = (tx as CrmDb | undefined) ?? this.db;
    const now = new Date().toISOString();

    const rows = await db
      .insert(inboundEmailEvents)
      .values({
        id: generateId(),
        provider: input.provider,
        providerEventId: input.providerEventId ?? null,
        providerMessageId: input.providerMessageId ?? null,
        status: 'PROCESSING',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (rows[0]) {
      return { event: this.rowToEntity(rows[0]!), alreadyClaimed: false };
    }

    const existing = await this.findClaimed(input, db);
    if (!existing) {
      throw new Error('Inbound email claim conflict could not be resolved');
    }

    this.assertIdentifiersDoNotConflict(existing, input);
    const enriched = await this.enrichClaimedIdentifiers(existing, input, db);
    const reclaimed = await this.reclaimFailedEvent(enriched, db);
    if (reclaimed.reclaimed) {
      return { event: reclaimed.event, alreadyClaimed: false };
    }
    return { event: reclaimed.event, alreadyClaimed: true };
  }

  async complete(input: {
    id: string;
    status: InboundEmailStatus;
    replyTokenId?: string | null;
    conversationId?: string | null;
    caseId?: string | null;
    fromEmail?: string | null;
    subject?: string | null;
    createdMessageId?: string | null;
    error?: string | null;
  }, tx?: Transaction): Promise<void> {
    const db = (tx as CrmDb | undefined) ?? this.db;
    const set: Partial<typeof inboundEmailEvents.$inferInsert> = {
      status: input.status,
      updatedAt: new Date().toISOString(),
    };

    if ('replyTokenId' in input) set.replyTokenId = input.replyTokenId ?? null;
    if ('conversationId' in input) set.conversationId = input.conversationId ?? null;
    if ('caseId' in input) set.caseId = input.caseId ?? null;
    if ('fromEmail' in input) set.fromEmail = input.fromEmail ?? null;
    if ('subject' in input) set.subject = input.subject ?? null;
    if ('createdMessageId' in input) set.createdMessageId = input.createdMessageId ?? null;
    if ('error' in input) set.error = input.error ?? null;

    await db
      .update(inboundEmailEvents)
      .set(set)
      .where(eq(inboundEmailEvents.id, input.id));
  }

  private async findClaimed(input: InboundEmailClaimInput, db: CrmDb): Promise<InboundEmailEvent | null> {
    let eventIdMatch: InboundEmailEvent | null = null;
    let messageIdMatch: InboundEmailEvent | null = null;

    if (input.providerEventId) {
      eventIdMatch = await this.findClaimedByIdentifier(
        db,
        input.provider,
        inboundEmailEvents.providerEventId,
        input.providerEventId,
      );
    }

    if (input.providerMessageId) {
      messageIdMatch = await this.findClaimedByIdentifier(
        db,
        input.provider,
        inboundEmailEvents.providerMessageId,
        input.providerMessageId,
      );
    }

    if (eventIdMatch && messageIdMatch && eventIdMatch.id !== messageIdMatch.id) {
      throw new Error('Inbound email provider identifiers resolve to different events');
    }

    return eventIdMatch ?? messageIdMatch;
  }

  private assertIdentifiersDoNotConflict(existing: InboundEmailEvent, input: InboundEmailClaimInput): void {
    if (
      existing.providerEventId &&
      input.providerEventId &&
      existing.providerEventId !== input.providerEventId
    ) {
      throw new Error('Inbound email provider identifiers conflict with an existing event');
    }

    if (
      existing.providerMessageId &&
      input.providerMessageId &&
      existing.providerMessageId !== input.providerMessageId
    ) {
      throw new Error('Inbound email provider identifiers conflict with an existing event');
    }
  }

  private async enrichClaimedIdentifiers(
    existing: InboundEmailEvent,
    input: InboundEmailClaimInput,
    db: CrmDb,
  ): Promise<InboundEmailEvent> {
    let current = existing;

    if (!current.providerEventId && input.providerEventId) {
      current = await this.compareAndSetIdentifier(
        current,
        input,
        db,
        inboundEmailEvents.providerEventId,
        { providerEventId: input.providerEventId },
      );
    }
    if (!current.providerMessageId && input.providerMessageId) {
      current = await this.compareAndSetIdentifier(
        current,
        input,
        db,
        inboundEmailEvents.providerMessageId,
        { providerMessageId: input.providerMessageId },
      );
    }

    return current;
  }

  private async compareAndSetIdentifier(
    existing: InboundEmailEvent,
    input: InboundEmailClaimInput,
    db: CrmDb,
    column: typeof inboundEmailEvents.providerEventId | typeof inboundEmailEvents.providerMessageId,
    set: Pick<Partial<typeof inboundEmailEvents.$inferInsert>, 'providerEventId' | 'providerMessageId'>,
  ): Promise<InboundEmailEvent> {
    const values = {
      ...set,
      updatedAt: new Date().toISOString(),
    };

    const rows = await db
      .update(inboundEmailEvents)
      .set(values)
      .where(and(eq(inboundEmailEvents.id, existing.id), isNull(column)))
      .returning();

    if (rows[0]) {
      return this.rowToEntity(rows[0]);
    }

    const latest = await this.findClaimedById(existing.id, db);
    if (!latest) {
      throw new Error('Inbound email claim conflict could not be resolved');
    }

    this.assertIdentifiersDoNotConflict(latest, input);
    return latest;
  }

  private async reclaimFailedEvent(
    existing: InboundEmailEvent,
    db: CrmDb,
  ): Promise<{ event: InboundEmailEvent; reclaimed: boolean }> {
    if (existing.status !== 'FAILED' || existing.createdMessageId) {
      return { event: existing, reclaimed: false };
    }

    const rows = await db
      .update(inboundEmailEvents)
      .set({
        status: 'PROCESSING',
        error: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(inboundEmailEvents.id, existing.id),
        eq(inboundEmailEvents.status, 'FAILED'),
        isNull(inboundEmailEvents.createdMessageId),
      ))
      .returning();

    if (rows[0]) {
      return { event: this.rowToEntity(rows[0]), reclaimed: true };
    }

    const latest = await this.findClaimedById(existing.id, db);
    if (!latest) {
      throw new Error('Inbound email claim conflict could not be resolved');
    }
    return { event: latest, reclaimed: false };
  }

  private async findClaimedById(id: string, db: CrmDb): Promise<InboundEmailEvent | null> {
    const rows = await db
      .select()
      .from(inboundEmailEvents)
      .where(eq(inboundEmailEvents.id, id))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private async findClaimedByIdentifier(
    db: CrmDb,
    provider: InboundEmailProvider,
    column: typeof inboundEmailEvents.providerEventId | typeof inboundEmailEvents.providerMessageId,
    value: string,
  ): Promise<InboundEmailEvent | null> {
    const rows = await db
      .select()
      .from(inboundEmailEvents)
      .where(and(eq(inboundEmailEvents.provider, provider), eq(column, value)))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private rowToEntity(row: InboundEmailEventRow): InboundEmailEvent {
    return new InboundEmailEvent({
      id: row.id,
      provider: row.provider as InboundEmailProvider,
      providerEventId: row.providerEventId ?? null,
      providerMessageId: row.providerMessageId ?? null,
      replyTokenId: row.replyTokenId ?? null,
      conversationId: row.conversationId ?? null,
      caseId: row.caseId ?? null,
      fromEmail: row.fromEmail ?? null,
      subject: row.subject ?? null,
      status: row.status as InboundEmailStatus,
      error: row.error ?? null,
      createdMessageId: row.createdMessageId ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
