import { eq, and, asc } from 'drizzle-orm';
import type { IJourneyRepository } from '@medical-crm/domain';
import { CaseJourney, JourneyMilestone } from '@medical-crm/domain';
import type { MilestoneEventType } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { caseJourneys, journeyMilestones } from '../schema/index.js';

export class DrizzleJourneyRepository implements IJourneyRepository {
  constructor(private readonly db: CrmDb) {}

  // ---------------------------------------------------------------------------
  // Journey
  // ---------------------------------------------------------------------------

  async findJourneyByCaseId(caseId: string, tx?: unknown): Promise<CaseJourney | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(caseJourneys)
      .where(eq(caseJourneys.caseId, caseId))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToJourney(rows[0]!);
  }

  async saveJourney(entity: CaseJourney, tx?: unknown): Promise<CaseJourney> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      visa: entity.visa,
      insurance: entity.insurance,
      accommodation: entity.accommodation,
      transportation: entity.transportation,
      postCare: entity.postCare,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(caseJourneys)
      .values(values)
      .onConflictDoUpdate({
        target: caseJourneys.id,
        set: {
          visa: values.visa,
          insurance: values.insurance,
          accommodation: values.accommodation,
          transportation: values.transportation,
          postCare: values.postCare,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToJourney(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Milestones
  // ---------------------------------------------------------------------------

  async findMilestoneById(id: string, tx?: unknown): Promise<JourneyMilestone | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(journeyMilestones)
      .where(eq(journeyMilestones.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToMilestone(rows[0]!);
  }

  async findMilestonesByCaseId(
    caseId: string,
    options?: { visibleOnly?: boolean },
  ): Promise<JourneyMilestone[]> {
    const conditions = [eq(journeyMilestones.caseId, caseId)];

    if (options?.visibleOnly) {
      conditions.push(eq(journeyMilestones.isVisibleToPatient, true));
    }

    const rows = await this.db
      .select()
      .from(journeyMilestones)
      .where(and(...conditions))
      .orderBy(asc(journeyMilestones.eventDate));

    return rows.map((r) => this.rowToMilestone(r));
  }

  async saveMilestone(entity: JourneyMilestone, tx?: unknown): Promise<JourneyMilestone> {
    const db = (tx as CrmDb) ?? this.db;
    const now = new Date().toISOString();
    const values = {
      id: entity.id,
      caseId: entity.caseId,
      eventType: entity.eventType as typeof journeyMilestones.eventType.enumValues[number],
      eventDate: entity.eventDate.toISOString(),
      note: entity.note,
      isVisibleToPatient: entity.isVisibleToPatient,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await db
      .insert(journeyMilestones)
      .values(values)
      .onConflictDoUpdate({
        target: journeyMilestones.id,
        set: {
          eventType: values.eventType,
          eventDate: values.eventDate,
          note: values.note,
          isVisibleToPatient: values.isVisibleToPatient,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToMilestone(rows[0]!);
  }

  async deleteMilestone(id: string): Promise<void> {
    await this.db
      .delete(journeyMilestones)
      .where(eq(journeyMilestones.id, id));
  }

  // ---------------------------------------------------------------------------
  // Row mappers
  // ---------------------------------------------------------------------------

  private rowToJourney(row: typeof caseJourneys.$inferSelect): CaseJourney {
    return new CaseJourney({
      id: row.id,
      caseId: row.caseId,
      visa: row.visa ?? null,
      insurance: row.insurance ?? null,
      accommodation: row.accommodation ?? null,
      transportation: row.transportation ?? null,
      postCare: row.postCare ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  private rowToMilestone(row: typeof journeyMilestones.$inferSelect): JourneyMilestone {
    return new JourneyMilestone({
      id: row.id,
      caseId: row.caseId,
      eventType: row.eventType as MilestoneEventType,
      eventDate: new Date(row.eventDate),
      note: row.note ?? null,
      isVisibleToPatient: row.isVisibleToPatient,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
