import { and, eq, sql } from 'drizzle-orm';
import type { IAiChatSessionRepository, PatientSite } from '@medical-crm/domain';
import { AiChatSession } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiChatSessions } from '../schema/index.js';

export class DrizzleAiChatSessionRepository implements IAiChatSessionRepository {
  constructor(private readonly db: CrmDb) {}

  async findBySessionId(sessionId: string, site: PatientSite, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(and(eq(aiChatSessions.sessionId, sessionId), eq(aiChatSessions.site, site)))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async findByDifyConversationId(difyConversationId: string, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.difyConversationId, difyConversationId))
      .limit(1);

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async save(entity: AiChatSession, tx?: unknown): Promise<AiChatSession> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .insert(aiChatSessions)
      .values({
        id: entity.id,
        sessionId: entity.sessionId,
        site: entity.site,
        sessionSecretHash: entity.sessionSecretHash,
        difyConversationId: entity.difyConversationId,
        patientId: entity.patientId,
        hospitalType: entity.hospitalType,
        status: entity.status,
        conditionStatus: entity.statusSnapshot.conditionStatus,
        formStatus: entity.statusSnapshot.formStatus,
        docUploadStatus: entity.statusSnapshot.docUploadStatus,
        recommendationStatus: entity.statusSnapshot.recommendationStatus,
        consultationStatus: entity.statusSnapshot.consultationStatus,
        packageStatus: entity.statusSnapshot.packageStatus,
        handoffStatus: entity.statusSnapshot.handoffStatus,
        riskLevel: entity.statusSnapshot.riskLevel,
        trustOrObjection: entity.statusSnapshot.trustOrObjection,
        engagementMode: entity.statusSnapshot.engagementMode,
        enteredDeepWorkflowAt: entity.statusSnapshot.enteredDeepWorkflowAt?.toISOString() ?? null,
        minimalTriageStatus: entity.statusSnapshot.minimalTriageStatus,
        minimalTriageAnswersSummary: entity.statusSnapshot.minimalTriageAnswersSummary,
        minimalTriageComplete: entity.statusSnapshot.minimalTriageComplete,
        processExplained: entity.statusSnapshot.processExplained,
        recommendationGenerated: entity.statusSnapshot.recommendationGenerated,
        recommendationSelectionStatus: entity.statusSnapshot.recommendationSelectionStatus,
        recommendationSelectedHospitalIds: entity.statusSnapshot.recommendationSelectedHospitalIds,
        recommendationSelected: entity.statusSnapshot.recommendationSelected,
        consultCompleted: entity.statusSnapshot.consultCompleted,
        handoffActive: entity.statusSnapshot.handoffActive,
        conversationSummary: entity.statusSnapshot.conversationSummary,
        lastPolicyDecisionAt: entity.statusSnapshot.lastPolicyDecisionAt?.toISOString() ?? null,
        lastUserMessageAt: entity.statusSnapshot.lastUserMessageAt?.toISOString() ?? null,
        lastAssistantMessageAt: entity.statusSnapshot.lastAssistantMessageAt?.toISOString() ?? null,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: entity.updatedAt.toISOString(),
      })
      .onConflictDoUpdate({
        target: aiChatSessions.id,
        set: {
          site: entity.site,
          sessionSecretHash: entity.sessionSecretHash,
          difyConversationId: entity.difyConversationId,
          patientId: entity.patientId,
          hospitalType: entity.hospitalType,
          status: entity.status,
          conditionStatus: entity.statusSnapshot.conditionStatus,
          formStatus: entity.statusSnapshot.formStatus,
          docUploadStatus: entity.statusSnapshot.docUploadStatus,
          recommendationStatus: entity.statusSnapshot.recommendationStatus,
          consultationStatus: entity.statusSnapshot.consultationStatus,
          packageStatus: entity.statusSnapshot.packageStatus,
          handoffStatus: entity.statusSnapshot.handoffStatus,
          riskLevel: entity.statusSnapshot.riskLevel,
          trustOrObjection: entity.statusSnapshot.trustOrObjection,
          engagementMode: entity.statusSnapshot.engagementMode,
          enteredDeepWorkflowAt: entity.statusSnapshot.enteredDeepWorkflowAt?.toISOString() ?? null,
          minimalTriageStatus: entity.statusSnapshot.minimalTriageStatus,
          minimalTriageAnswersSummary: entity.statusSnapshot.minimalTriageAnswersSummary,
          minimalTriageComplete: entity.statusSnapshot.minimalTriageComplete,
          processExplained: entity.statusSnapshot.processExplained,
          recommendationGenerated: entity.statusSnapshot.recommendationGenerated,
          recommendationSelectionStatus: entity.statusSnapshot.recommendationSelectionStatus,
          recommendationSelectedHospitalIds: entity.statusSnapshot.recommendationSelectedHospitalIds,
          recommendationSelected: entity.statusSnapshot.recommendationSelected,
          consultCompleted: entity.statusSnapshot.consultCompleted,
          handoffActive: entity.statusSnapshot.handoffActive,
          conversationSummary: entity.statusSnapshot.conversationSummary,
          lastPolicyDecisionAt: entity.statusSnapshot.lastPolicyDecisionAt?.toISOString() ?? null,
          lastUserMessageAt: entity.statusSnapshot.lastUserMessageAt?.toISOString() ?? null,
          lastAssistantMessageAt: entity.statusSnapshot.lastAssistantMessageAt?.toISOString() ?? null,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  async attachPatient(sessionId: string, site: PatientSite, patientId: string, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ patientId, updatedAt: sql`NOW()` })
      .where(and(eq(aiChatSessions.sessionId, sessionId), eq(aiChatSessions.site, site)))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async setDifyConversationId(
    sessionId: string,
    site: PatientSite,
    difyConversationId: string,
    tx?: unknown,
  ): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ difyConversationId, updatedAt: sql`NOW()` })
      .where(and(eq(aiChatSessions.sessionId, sessionId), eq(aiChatSessions.site, site)))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async updateStatus(sessionId: string, site: PatientSite, status: import('@medical-crm/domain').AiChatSessionStatus, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ status, updatedAt: sql`NOW()` })
      .where(and(eq(aiChatSessions.sessionId, sessionId), eq(aiChatSessions.site, site)))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async patchStatus(
    sessionId: string,
    site: PatientSite,
    patch: Partial<AiChatSession['statusSnapshot']>,
    tx?: unknown,
  ): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const updates: Record<string, unknown> = {
      updatedAt: sql`NOW()`,
    };

    if (patch.conditionStatus !== undefined) updates.conditionStatus = patch.conditionStatus;
    if (patch.formStatus !== undefined) updates.formStatus = patch.formStatus;
    if (patch.docUploadStatus !== undefined) updates.docUploadStatus = patch.docUploadStatus;
    if (patch.recommendationStatus !== undefined) updates.recommendationStatus = patch.recommendationStatus;
    if (patch.consultationStatus !== undefined) updates.consultationStatus = patch.consultationStatus;
    if (patch.packageStatus !== undefined) updates.packageStatus = patch.packageStatus;
    if (patch.handoffStatus !== undefined) updates.handoffStatus = patch.handoffStatus;
    if (patch.riskLevel !== undefined) updates.riskLevel = patch.riskLevel;
    if (patch.trustOrObjection !== undefined) updates.trustOrObjection = patch.trustOrObjection;
    if (patch.engagementMode !== undefined) updates.engagementMode = patch.engagementMode;
    if (patch.enteredDeepWorkflowAt !== undefined) {
      updates.enteredDeepWorkflowAt = patch.enteredDeepWorkflowAt?.toISOString() ?? null;
    }
    if (patch.minimalTriageStatus !== undefined) updates.minimalTriageStatus = patch.minimalTriageStatus;
    if (patch.minimalTriageAnswersSummary !== undefined) {
      updates.minimalTriageAnswersSummary = patch.minimalTriageAnswersSummary;
    }
    if (patch.minimalTriageComplete !== undefined) updates.minimalTriageComplete = patch.minimalTriageComplete;
    if (patch.processExplained !== undefined) updates.processExplained = patch.processExplained;
    if (patch.recommendationGenerated !== undefined) updates.recommendationGenerated = patch.recommendationGenerated;
    if (patch.recommendationSelectionStatus !== undefined) {
      updates.recommendationSelectionStatus = patch.recommendationSelectionStatus;
    }
    if (patch.recommendationSelectedHospitalIds !== undefined) {
      updates.recommendationSelectedHospitalIds = patch.recommendationSelectedHospitalIds;
    }
    if (patch.recommendationSelected !== undefined) updates.recommendationSelected = patch.recommendationSelected;
    if (patch.consultCompleted !== undefined) updates.consultCompleted = patch.consultCompleted;
    if (patch.handoffActive !== undefined) updates.handoffActive = patch.handoffActive;
    if (patch.conversationSummary !== undefined) updates.conversationSummary = patch.conversationSummary;
    if (patch.lastPolicyDecisionAt !== undefined) {
      updates.lastPolicyDecisionAt = patch.lastPolicyDecisionAt?.toISOString() ?? null;
    }
    if (patch.lastUserMessageAt !== undefined) {
      updates.lastUserMessageAt = patch.lastUserMessageAt?.toISOString() ?? null;
    }
    if (patch.lastAssistantMessageAt !== undefined) {
      updates.lastAssistantMessageAt = patch.lastAssistantMessageAt?.toISOString() ?? null;
    }

    const rows = await db
      .update(aiChatSessions)
      .set(updates as Partial<typeof aiChatSessions.$inferInsert>)
      .where(and(eq(aiChatSessions.sessionId, sessionId), eq(aiChatSessions.site, site)))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private rowToEntity(row: typeof aiChatSessions.$inferSelect): AiChatSession {
    return new AiChatSession({
      id: row.id,
      sessionId: row.sessionId,
      site: row.site ?? 'china',
      sessionSecretHash: row.sessionSecretHash ?? null,
      difyConversationId: row.difyConversationId ?? null,
      patientId: row.patientId ?? null,
      hospitalType: row.hospitalType as import('@medical-crm/domain').HospitalType,
      status: row.status as import('@medical-crm/domain').AiChatSessionStatus,
      statusSnapshot: {
        conditionStatus: row.conditionStatus,
        formStatus: row.formStatus,
        docUploadStatus: row.docUploadStatus,
        recommendationStatus: row.recommendationStatus,
        consultationStatus: row.consultationStatus,
        packageStatus: row.packageStatus,
        handoffStatus: row.handoffStatus,
        riskLevel: row.riskLevel,
        trustOrObjection: row.trustOrObjection,
        engagementMode: row.engagementMode,
        enteredDeepWorkflowAt: row.enteredDeepWorkflowAt ? new Date(row.enteredDeepWorkflowAt) : null,
        minimalTriageStatus: row.minimalTriageStatus as import('@medical-crm/domain').AiChatStatusSnapshot['minimalTriageStatus'],
        minimalTriageAnswersSummary: row.minimalTriageAnswersSummary,
        minimalTriageComplete: row.minimalTriageComplete,
        processExplained: row.processExplained,
        recommendationGenerated: row.recommendationGenerated,
        recommendationSelectionStatus: row.recommendationSelectionStatus as import('@medical-crm/domain').AiChatStatusSnapshot['recommendationSelectionStatus'],
        recommendationSelectedHospitalIds: Array.isArray(row.recommendationSelectedHospitalIds)
          ? row.recommendationSelectedHospitalIds.filter((candidate): candidate is string => typeof candidate === 'string')
          : null,
        recommendationSelected: row.recommendationSelected,
        consultCompleted: row.consultCompleted,
        handoffActive: row.handoffActive,
        conversationSummary: row.conversationSummary,
        lastPolicyDecisionAt: row.lastPolicyDecisionAt ? new Date(row.lastPolicyDecisionAt) : null,
        lastUserMessageAt: row.lastUserMessageAt ? new Date(row.lastUserMessageAt) : null,
        lastAssistantMessageAt: row.lastAssistantMessageAt ? new Date(row.lastAssistantMessageAt) : null,
      },
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
