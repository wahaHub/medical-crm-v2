import { eq, and, sql } from 'drizzle-orm';
import type { ICaseEventRepository, CaseEventListOptions, CaseEventType, ActorType } from '@medical-crm/domain';
import { CaseEvent } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { caseEvents } from '../schema/index.js';

export class DrizzleCaseEventRepository implements ICaseEventRepository {
  constructor(private readonly db: CrmDb) {}

  private rowToEntity(row: typeof caseEvents.$inferSelect): CaseEvent {
    return new CaseEvent({
      id: row.id,
      caseId: row.caseId,
      eventType: row.eventType as CaseEventType,
      actorType: row.actorType as ActorType,
      actorId: row.actorId,
      eventData: row.eventData as Record<string, unknown> | null,
      isVisibleToPatient: row.isVisibleToPatient,
      createdAt: new Date(row.createdAt),
    });
  }

  async save(event: CaseEvent): Promise<CaseEvent> {
    const [row] = await this.db.insert(caseEvents).values({
      id: event.id,
      caseId: event.caseId,
      eventType: event.eventType,
      actorType: event.actorType,
      actorId: event.actorId,
      eventData: event.eventData,
      isVisibleToPatient: event.isVisibleToPatient,
      createdAt: event.createdAt.toISOString(),
    }).returning();
    return this.rowToEntity(row!);
  }

  async findByCaseId(caseId: string, opts?: CaseEventListOptions): Promise<CaseEvent[]> {
    const conditions = [eq(caseEvents.caseId, caseId)];
    if (opts?.eventType) {
      conditions.push(eq(caseEvents.eventType, opts.eventType as CaseEventType));
    }
    const query = this.db
      .select()
      .from(caseEvents)
      .where(and(...conditions))
      .orderBy(sql`${caseEvents.createdAt} DESC`)
      .limit(opts?.limit ?? 100)
      .offset(opts?.offset ?? 0);
    const rows = await query;
    return rows.map((r) => this.rowToEntity(r));
  }

  async findVisibleByCaseId(caseId: string): Promise<CaseEvent[]> {
    const rows = await this.db
      .select()
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.isVisibleToPatient, true)))
      .orderBy(sql`${caseEvents.createdAt} DESC`);
    return rows.map((r) => this.rowToEntity(r));
  }
}
