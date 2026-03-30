import { eq, or, sql } from 'drizzle-orm';
import type { IAiUserProfileRepository } from '@medical-crm/domain';
import { AiUserProfile } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiUserProfiles } from '../schema/index.js';

export class DrizzleAiUserProfileRepository implements IAiUserProfileRepository {
  constructor(private readonly db: CrmDb) {}

  async findByAnonymousKeyOrPatient(
    input: { anonymousKey?: string | null; patientId?: string | null },
    tx?: unknown,
  ): Promise<AiUserProfile | null> {
    const db = (tx as CrmDb) ?? this.db;
    const filters = [];
    if (input.patientId) filters.push(eq(aiUserProfiles.patientId, input.patientId));
    if (input.anonymousKey) filters.push(eq(aiUserProfiles.anonymousKey, input.anonymousKey));
    if (filters.length === 0) return null;

    const rows = await db
      .select()
      .from(aiUserProfiles)
      .where(filters.length === 1 ? filters[0]! : or(...filters))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async save(entity: AiUserProfile, tx?: unknown): Promise<AiUserProfile> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiUserProfiles)
      .values({
        id: entity.id,
        patientId: entity.patientId,
        anonymousKey: entity.anonymousKey,
        conditionOrGoal: entity.conditionOrGoal,
        conditionCategory: entity.conditionCategory,
        preferredDestination: entity.preferredDestination,
        preferredLanguage: entity.preferredLanguage,
        budgetBand: entity.budgetBand,
        urgencyLevel: entity.urgencyLevel,
        existingReportsStatus: entity.existingReportsStatus,
        objectionTags: entity.objectionTags,
        leadStage: entity.leadStage,
        nextBestAction: entity.nextBestAction,
        memorySummary: entity.memorySummary,
        sourceConfidenceMap: entity.sourceConfidenceMap,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      })
      .onConflictDoUpdate({
        target: aiUserProfiles.id,
        set: {
          patientId: entity.patientId,
          anonymousKey: entity.anonymousKey,
          conditionOrGoal: entity.conditionOrGoal,
          conditionCategory: entity.conditionCategory,
          preferredDestination: entity.preferredDestination,
          preferredLanguage: entity.preferredLanguage,
          budgetBand: entity.budgetBand,
          urgencyLevel: entity.urgencyLevel,
          existingReportsStatus: entity.existingReportsStatus,
          objectionTags: entity.objectionTags,
          leadStage: entity.leadStage,
          nextBestAction: entity.nextBestAction,
          memorySummary: entity.memorySummary,
          sourceConfidenceMap: entity.sourceConfidenceMap,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async patch(profileId: string, patch: Partial<AiUserProfile>, tx?: unknown): Promise<AiUserProfile | null> {
    const db = (tx as CrmDb) ?? this.db;
    const updates: Record<string, unknown> = {
      updatedAt: sql`NOW()`,
    };

    if (patch.patientId !== undefined) updates.patientId = patch.patientId;
    if (patch.anonymousKey !== undefined) updates.anonymousKey = patch.anonymousKey;
    if (patch.conditionOrGoal !== undefined) updates.conditionOrGoal = patch.conditionOrGoal;
    if (patch.conditionCategory !== undefined) updates.conditionCategory = patch.conditionCategory;
    if (patch.preferredDestination !== undefined) updates.preferredDestination = patch.preferredDestination;
    if (patch.preferredLanguage !== undefined) updates.preferredLanguage = patch.preferredLanguage;
    if (patch.budgetBand !== undefined) updates.budgetBand = patch.budgetBand;
    if (patch.urgencyLevel !== undefined) updates.urgencyLevel = patch.urgencyLevel;
    if (patch.existingReportsStatus !== undefined) updates.existingReportsStatus = patch.existingReportsStatus;
    if (patch.objectionTags !== undefined) updates.objectionTags = patch.objectionTags;
    if (patch.leadStage !== undefined) updates.leadStage = patch.leadStage;
    if (patch.nextBestAction !== undefined) updates.nextBestAction = patch.nextBestAction;
    if (patch.memorySummary !== undefined) updates.memorySummary = patch.memorySummary;
    if (patch.sourceConfidenceMap !== undefined) updates.sourceConfidenceMap = patch.sourceConfidenceMap;

    const rows = await db
      .update(aiUserProfiles)
      .set(updates as Partial<typeof aiUserProfiles.$inferInsert>)
      .where(eq(aiUserProfiles.id, profileId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private rowToEntity(row: typeof aiUserProfiles.$inferSelect): AiUserProfile {
    return new AiUserProfile({
      id: row.id,
      patientId: row.patientId ?? null,
      anonymousKey: row.anonymousKey ?? null,
      conditionOrGoal: row.conditionOrGoal ?? null,
      conditionCategory: row.conditionCategory ?? null,
      preferredDestination: ((row.preferredDestination as unknown[]) ?? []) as string[],
      preferredLanguage: row.preferredLanguage ?? null,
      budgetBand: row.budgetBand ?? null,
      urgencyLevel: row.urgencyLevel ?? null,
      existingReportsStatus: row.existingReportsStatus,
      objectionTags: ((row.objectionTags as unknown[]) ?? []) as string[],
      leadStage: row.leadStage,
      nextBestAction: row.nextBestAction ?? null,
      memorySummary: row.memorySummary,
      sourceConfidenceMap: (row.sourceConfidenceMap as Record<string, unknown> | null) ?? {},
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
