import { and, eq, sql } from 'drizzle-orm';
import type { IAiChatSessionRepository, PatientSite } from '@medical-crm/domain';
import { AiChatSession, normalizeSupportingDocuments } from '@medical-crm/domain';
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
    const supportingDocuments = normalizeSupportingDocuments(entity.statusSnapshot.supportingDocuments);

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
        automationMode: entity.automationMode,
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
        enteredDeepWorkflowAt: serializeOptionalTimestamp(entity.statusSnapshot.enteredDeepWorkflowAt),
        minimalTriageStatus: entity.statusSnapshot.minimalTriageStatus,
        minimalTriageAnswersSummary: entity.statusSnapshot.minimalTriageAnswersSummary,
        minimalTriageComplete: entity.statusSnapshot.minimalTriageComplete,
        processExplained: entity.statusSnapshot.processExplained,
        recommendationGenerated: entity.statusSnapshot.recommendationGenerated,
        recommendationSelectionStatus: entity.statusSnapshot.recommendationSelectionStatus,
        recommendationSelectedHospitalIds: entity.statusSnapshot.recommendationSelectedHospitalIds,
        recommendationSelected: entity.statusSnapshot.recommendationSelected,
        journeyCurrentStage: normalizeJourneyCurrentStage(entity.statusSnapshot.journeyCurrentStage),
        journeyCurrentPhase: normalizeJourneyCurrentPhase(entity.statusSnapshot.journeyCurrentPhase),
        supportingDocuments,
        consultCompleted: entity.statusSnapshot.consultCompleted,
        handoffActive: entity.statusSnapshot.handoffActive,
        conversationSummary: entity.statusSnapshot.conversationSummary,
        lastPolicyDecisionAt: serializeOptionalTimestamp(entity.statusSnapshot.lastPolicyDecisionAt),
        lastUserMessageAt: serializeOptionalTimestamp(entity.statusSnapshot.lastUserMessageAt),
        lastAssistantMessageAt: serializeOptionalTimestamp(entity.statusSnapshot.lastAssistantMessageAt),
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
          automationMode: entity.automationMode,
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
          enteredDeepWorkflowAt: serializeOptionalTimestamp(entity.statusSnapshot.enteredDeepWorkflowAt),
          minimalTriageStatus: entity.statusSnapshot.minimalTriageStatus,
          minimalTriageAnswersSummary: entity.statusSnapshot.minimalTriageAnswersSummary,
          minimalTriageComplete: entity.statusSnapshot.minimalTriageComplete,
          processExplained: entity.statusSnapshot.processExplained,
          recommendationGenerated: entity.statusSnapshot.recommendationGenerated,
          recommendationSelectionStatus: entity.statusSnapshot.recommendationSelectionStatus,
          recommendationSelectedHospitalIds: entity.statusSnapshot.recommendationSelectedHospitalIds,
          recommendationSelected: entity.statusSnapshot.recommendationSelected,
          journeyCurrentStage: normalizeJourneyCurrentStage(entity.statusSnapshot.journeyCurrentStage),
          journeyCurrentPhase: normalizeJourneyCurrentPhase(entity.statusSnapshot.journeyCurrentPhase),
          supportingDocuments,
          consultCompleted: entity.statusSnapshot.consultCompleted,
          handoffActive: entity.statusSnapshot.handoffActive,
          conversationSummary: entity.statusSnapshot.conversationSummary,
          lastPolicyDecisionAt: serializeOptionalTimestamp(entity.statusSnapshot.lastPolicyDecisionAt),
          lastUserMessageAt: serializeOptionalTimestamp(entity.statusSnapshot.lastUserMessageAt),
          lastAssistantMessageAt: serializeOptionalTimestamp(entity.statusSnapshot.lastAssistantMessageAt),
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

  async updateAutomationMode(
    sessionId: string,
    site: PatientSite,
    mode: import('@medical-crm/domain').ChatAutomationMode,
    tx?: unknown,
  ): Promise<AiChatSession | null> {
    const db = (tx as CrmDb) ?? this.db;
    const rows = await db
      .update(aiChatSessions)
      .set({ automationMode: mode, updatedAt: sql`NOW()` })
      .where(and(eq(aiChatSessions.sessionId, sessionId), eq(aiChatSessions.site, site)))
      .returning();

    return rows[0] ? this.rowToEntity(rows[0]) : null;
  }

  async patchStatus(
    sessionId: string,
    site: PatientSite,
    patch: Parameters<IAiChatSessionRepository['patchStatus']>[2],
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
      const serializedTimestamp = serializeOptionalTimestampForPatch(patch.enteredDeepWorkflowAt);
      if (serializedTimestamp !== SKIP_TIMESTAMP_UPDATE) {
        updates.enteredDeepWorkflowAt = serializedTimestamp;
      }
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
    if (patch.journeyCurrentStage !== undefined) {
      const journeyCurrentStage = normalizeJourneyCurrentStage(patch.journeyCurrentStage);
      if (journeyCurrentStage !== undefined) {
        updates.journeyCurrentStage = journeyCurrentStage;
      }
    }
    if (patch.journeyCurrentPhase !== undefined) {
      const journeyCurrentPhase = normalizeJourneyCurrentPhase(patch.journeyCurrentPhase);
      if (journeyCurrentPhase !== undefined) {
        updates.journeyCurrentPhase = journeyCurrentPhase;
      }
    }
    if (patch.supportingDocuments !== undefined) {
      updates.supportingDocuments = normalizeSupportingDocuments(patch.supportingDocuments);
    }
    if (patch.consultCompleted !== undefined) updates.consultCompleted = patch.consultCompleted;
    if (patch.handoffActive !== undefined) updates.handoffActive = patch.handoffActive;
    if (patch.conversationSummary !== undefined) updates.conversationSummary = patch.conversationSummary;
    if (patch.lastPolicyDecisionAt !== undefined) {
      const serializedTimestamp = serializeOptionalTimestampForPatch(patch.lastPolicyDecisionAt);
      if (serializedTimestamp !== SKIP_TIMESTAMP_UPDATE) {
        updates.lastPolicyDecisionAt = serializedTimestamp;
      }
    }
    if (patch.lastUserMessageAt !== undefined) {
      const serializedTimestamp = serializeOptionalTimestampForPatch(patch.lastUserMessageAt);
      if (serializedTimestamp !== SKIP_TIMESTAMP_UPDATE) {
        updates.lastUserMessageAt = serializedTimestamp;
      }
    }
    if (patch.lastAssistantMessageAt !== undefined) {
      const serializedTimestamp = serializeOptionalTimestampForPatch(patch.lastAssistantMessageAt);
      if (serializedTimestamp !== SKIP_TIMESTAMP_UPDATE) {
        updates.lastAssistantMessageAt = serializedTimestamp;
      }
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
      automationMode: normalizeAutomationMode(row.automationMode),
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
        journeyCurrentStage: row.journeyCurrentStage as import('@medical-crm/domain').AiChatStatusSnapshot['journeyCurrentStage'],
        journeyCurrentPhase: row.journeyCurrentPhase as import('@medical-crm/domain').AiChatStatusSnapshot['journeyCurrentPhase'],
        supportingDocuments: Array.isArray(row.supportingDocuments)
          ? row.supportingDocuments
          : [],
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

const SKIP_TIMESTAMP_UPDATE = Symbol('skip-timestamp-update');

function serializeOptionalTimestamp(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return null;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid timestamp string: ${normalized}`);
    }

    return parsed.toISOString();
  }

  return null;
}

function serializeOptionalTimestampForPatch(
  value: Date | string | null | undefined,
): string | null | typeof SKIP_TIMESTAMP_UPDATE {
  if (typeof value !== 'string') {
    return serializeOptionalTimestamp(value);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return SKIP_TIMESTAMP_UPDATE;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? SKIP_TIMESTAMP_UPDATE : parsed.toISOString();
}

function normalizeJourneyCurrentStage(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case 'COLLECT_MINIMAL_MEDICAL_FACTS':
    case 'RECOMMENDATION':
    case 'EXPLAIN_PROCESS':
    case 'COLLECT_MEDICAL_INPUTS':
    case 'ONLINE_CONSULT':
    case 'HUMAN_HANDOFF':
      return normalized;
    default:
      return undefined;
  }
}

function normalizeJourneyCurrentPhase(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'active' || normalized === 'post') {
    return normalized;
  }

  return undefined;
}

function normalizeAutomationMode(value: unknown): import('@medical-crm/domain').ChatAutomationMode {
  return value === 'ai' || value === 'human' || value === 'mechanical' ? value : 'mechanical';
}
