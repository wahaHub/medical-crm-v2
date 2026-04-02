import { eq, sql } from 'drizzle-orm';
import type { IAiChatSessionRepository } from '@medical-crm/domain';
import { AiChatSession } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { aiChatSessions } from '../schema/index.js';

export class DrizzleAiChatSessionRepository implements IAiChatSessionRepository {
  constructor(private readonly db: CrmDb) {}

  async findBySessionId(sessionId: string, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.sessionId, sessionId))
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
        sessionSecretHash: entity.sessionSecretHash,
        difyConversationId: entity.difyConversationId,
        patientId: entity.patientId,
        hospitalType: entity.hospitalType,
        status: entity.status,
        conditionStatus: entity.statusSnapshot.conditionStatus,
        formStatus: entity.statusSnapshot.formStatus,
        docUploadStatus: entity.statusSnapshot.docUploadStatus,
        recommendationStatus: entity.statusSnapshot.recommendationStatus,
        selectedHospitalId: entity.statusSnapshot.selectedHospitalId,
        consultationStatus: entity.statusSnapshot.consultationStatus,
        packageStatus: entity.statusSnapshot.packageStatus,
        handoffStatus: entity.statusSnapshot.handoffStatus,
        leadMaturity: entity.statusSnapshot.leadMaturity,
        riskLevel: entity.statusSnapshot.riskLevel,
        trustOrObjection: entity.statusSnapshot.trustOrObjection,
        engagementMode: entity.statusSnapshot.engagementMode,
        prequalificationReasonCodes: entity.statusSnapshot.prequalificationReasonCodes,
        enteredDeepWorkflowAt: entity.statusSnapshot.enteredDeepWorkflowAt?.toISOString() ?? null,
        pendingOfferType: entity.statusSnapshot.pendingOffer?.type ?? null,
        pendingOfferPayload: entity.statusSnapshot.pendingOffer?.payload ?? {},
        pendingQuestionType: entity.statusSnapshot.pendingQuestion?.type ?? null,
        pendingQuestionPayload: entity.statusSnapshot.pendingQuestion?.payload ?? {},
        lastNextAction: entity.statusSnapshot.lastNextAction,
        lastResolvedIntent: entity.statusSnapshot.lastResolvedIntent,
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
          sessionSecretHash: entity.sessionSecretHash,
          difyConversationId: entity.difyConversationId,
          patientId: entity.patientId,
          hospitalType: entity.hospitalType,
          status: entity.status,
          conditionStatus: entity.statusSnapshot.conditionStatus,
          formStatus: entity.statusSnapshot.formStatus,
          docUploadStatus: entity.statusSnapshot.docUploadStatus,
          recommendationStatus: entity.statusSnapshot.recommendationStatus,
          selectedHospitalId: entity.statusSnapshot.selectedHospitalId,
          consultationStatus: entity.statusSnapshot.consultationStatus,
          packageStatus: entity.statusSnapshot.packageStatus,
          handoffStatus: entity.statusSnapshot.handoffStatus,
          leadMaturity: entity.statusSnapshot.leadMaturity,
          riskLevel: entity.statusSnapshot.riskLevel,
          trustOrObjection: entity.statusSnapshot.trustOrObjection,
          engagementMode: entity.statusSnapshot.engagementMode,
          prequalificationReasonCodes: entity.statusSnapshot.prequalificationReasonCodes,
          enteredDeepWorkflowAt: entity.statusSnapshot.enteredDeepWorkflowAt?.toISOString() ?? null,
          pendingOfferType: entity.statusSnapshot.pendingOffer?.type ?? null,
          pendingOfferPayload: entity.statusSnapshot.pendingOffer?.payload ?? {},
          pendingQuestionType: entity.statusSnapshot.pendingQuestion?.type ?? null,
          pendingQuestionPayload: entity.statusSnapshot.pendingQuestion?.payload ?? {},
          lastNextAction: entity.statusSnapshot.lastNextAction,
          lastResolvedIntent: entity.statusSnapshot.lastResolvedIntent,
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

  async attachPatient(sessionId: string, patientId: string, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ patientId, updatedAt: sql`NOW()` })
      .where(eq(aiChatSessions.sessionId, sessionId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async updateStatus(sessionId: string, status: import('@medical-crm/domain').AiChatSessionStatus, tx?: unknown): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ status, updatedAt: sql`NOW()` })
      .where(eq(aiChatSessions.sessionId, sessionId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async patchStatus(
    sessionId: string,
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
    if (patch.selectedHospitalId !== undefined) updates.selectedHospitalId = patch.selectedHospitalId;
    if (patch.consultationStatus !== undefined) updates.consultationStatus = patch.consultationStatus;
    if (patch.packageStatus !== undefined) updates.packageStatus = patch.packageStatus;
    if (patch.handoffStatus !== undefined) updates.handoffStatus = patch.handoffStatus;
    if (patch.leadMaturity !== undefined) updates.leadMaturity = patch.leadMaturity;
    if (patch.riskLevel !== undefined) updates.riskLevel = patch.riskLevel;
    if (patch.trustOrObjection !== undefined) updates.trustOrObjection = patch.trustOrObjection;
    if (patch.engagementMode !== undefined) updates.engagementMode = patch.engagementMode;
    if (patch.prequalificationReasonCodes !== undefined) {
      updates.prequalificationReasonCodes = patch.prequalificationReasonCodes;
    }
    if (patch.enteredDeepWorkflowAt !== undefined) {
      updates.enteredDeepWorkflowAt = patch.enteredDeepWorkflowAt?.toISOString() ?? null;
    }
    if (patch.pendingOffer !== undefined) {
      updates.pendingOfferType = patch.pendingOffer?.type ?? null;
      updates.pendingOfferPayload = patch.pendingOffer?.payload ?? {};
    }
    if (patch.pendingQuestion !== undefined) {
      updates.pendingQuestionType = patch.pendingQuestion?.type ?? null;
      updates.pendingQuestionPayload = patch.pendingQuestion?.payload ?? {};
    }
    if (patch.lastNextAction !== undefined) updates.lastNextAction = patch.lastNextAction;
    if (patch.lastResolvedIntent !== undefined) updates.lastResolvedIntent = patch.lastResolvedIntent;
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
      .where(eq(aiChatSessions.sessionId, sessionId))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  private rowToEntity(row: typeof aiChatSessions.$inferSelect): AiChatSession {
    return new AiChatSession({
      id: row.id,
      sessionId: row.sessionId,
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
        selectedHospitalId: row.selectedHospitalId ?? null,
        consultationStatus: row.consultationStatus,
        packageStatus: row.packageStatus,
        handoffStatus: row.handoffStatus,
        leadMaturity: row.leadMaturity,
        riskLevel: row.riskLevel,
        trustOrObjection: row.trustOrObjection,
        engagementMode: row.engagementMode,
        prequalificationReasonCodes: ((row.prequalificationReasonCodes as unknown[]) ?? []) as string[],
        enteredDeepWorkflowAt: row.enteredDeepWorkflowAt ? new Date(row.enteredDeepWorkflowAt) : null,
        pendingOffer: row.pendingOfferType
          ? {
              type: row.pendingOfferType,
              payload: (row.pendingOfferPayload as Record<string, unknown> | null) ?? {},
            }
          : null,
        pendingQuestion: row.pendingQuestionType
          ? {
              type: row.pendingQuestionType,
              payload: (row.pendingQuestionPayload as Record<string, unknown> | null) ?? {},
            }
          : null,
        lastNextAction: row.lastNextAction ?? null,
        lastResolvedIntent: row.lastResolvedIntent ?? null,
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
