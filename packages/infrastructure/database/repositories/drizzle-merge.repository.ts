import { eq, and, isNull, sql } from 'drizzle-orm';
import type {
  IMergeRepository,
  PatientMergeSnapshot,
  CaseMergeSnapshot,
  PatientContactFields,
  PatientResourceCounts,
  CaseResourceCounts,
} from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import {
  users,
  cases,
  documents,
  caseProgress,
  conversations,
  emailReplyTokens,
  inboundEmailEvents,
  consultations,
  quotes,
  caseHospitalContacts,
  caseEvents,
  caseJourneys,
  journeyMilestones,
  questionCollectorResponses,
  orders,
  supportTickets,
  aiChatSessions,
  aiChatTimelineEvents,
  aiFollowupTriggers,
  aiHandoffs,
} from '../schema/index.js';

/**
 * Case Lifecycle Phase 2: merge operations. Write methods take an explicit
 * transaction handle (cast from the opaque domain Transaction) so the merge
 * use cases can keep the whole operation atomic via TransactionRunner.
 */
export class DrizzleMergeRepository implements IMergeRepository {
  constructor(private readonly db: CrmDb) {}

  private conn(tx?: unknown): CrmDb {
    return tx ? (tx as CrmDb) : this.db;
  }

  async getPatientSnapshot(patientId: string, tx?: unknown): Promise<PatientMergeSnapshot | null> {
    const rows = await this.conn(tx)
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        status: users.status,
        email: users.email,
        phone: users.phone,
        whatsapp: users.whatsapp,
        mergedIntoUserId: users.mergedIntoUserId,
      })
      .from(users)
      .where(eq(users.id, patientId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status,
      email: row.email ?? null,
      phone: row.phone ?? null,
      whatsapp: row.whatsapp ?? null,
      mergedIntoUserId: row.mergedIntoUserId ?? null,
    };
  }

  async getCaseSnapshot(caseId: string, tx?: unknown): Promise<CaseMergeSnapshot | null> {
    const rows = await this.conn(tx)
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        patientId: cases.patientId,
        patientName: cases.patientName,
        status: cases.status,
        mergedIntoCaseId: cases.mergedIntoCaseId,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      caseNumber: row.caseNumber,
      patientId: row.patientId,
      patientName: row.patientName,
      status: row.status,
      mergedIntoCaseId: row.mergedIntoCaseId ?? null,
    };
  }

  async countPatientResources(patientId: string, tx?: unknown): Promise<PatientResourceCounts> {
    const rows = await this.conn(tx).execute(sql`
      select
        (select count(*)::int from cases where patient_id = ${patientId}) as cases,
        (select count(*)::int from consultations where patient_id = ${patientId}) as consultations,
        (select count(*)::int from support_tickets where patient_id = ${patientId}) as support_tickets,
        (select count(*)::int from orders where patient_id = ${patientId}) as orders,
        (select count(*)::int from email_reply_tokens where patient_id = ${patientId}) as email_reply_tokens,
        (select count(*)::int from ai_chat_sessions where patient_id = ${patientId}) as ai_chat_sessions,
        (select count(*)::int from ai_user_profiles where patient_id = ${patientId}) as ai_user_profiles,
        (select count(*)::int from ai_chat_timeline_events where patient_id = ${patientId}) as ai_chat_timeline_events,
        (select count(*)::int from ai_followup_triggers where patient_id = ${patientId}) as ai_followup_triggers,
        (select count(*)::int from ai_handoffs where patient_id = ${patientId}) as ai_handoffs
    `);
    const row = (rows as unknown as Record<string, number>[])[0] ?? {};
    return {
      cases: Number(row['cases'] ?? 0),
      consultations: Number(row['consultations'] ?? 0),
      supportTickets: Number(row['support_tickets'] ?? 0),
      orders: Number(row['orders'] ?? 0),
      emailReplyTokens: Number(row['email_reply_tokens'] ?? 0),
      aiChatSessions: Number(row['ai_chat_sessions'] ?? 0),
      aiUserProfiles: Number(row['ai_user_profiles'] ?? 0),
      aiChatTimelineEvents: Number(row['ai_chat_timeline_events'] ?? 0),
      aiFollowupTriggers: Number(row['ai_followup_triggers'] ?? 0),
      aiHandoffs: Number(row['ai_handoffs'] ?? 0),
    };
  }

  async countCaseResources(secondaryCaseId: string, primaryCaseId: string, tx?: unknown): Promise<CaseResourceCounts> {
    const rows = await this.conn(tx).execute(sql`
      select
        (select count(*)::int from documents where case_id = ${secondaryCaseId}) as documents,
        (select count(*)::int from case_progress where case_id = ${secondaryCaseId}) as case_progress,
        (select count(*)::int from conversations where case_id = ${secondaryCaseId}) as conversations,
        (select count(*)::int from email_reply_tokens where case_id = ${secondaryCaseId}) as email_reply_tokens,
        (select count(*)::int from inbound_email_events where case_id = ${secondaryCaseId}) as inbound_email_events,
        (select count(*)::int from consultations where case_id = ${secondaryCaseId}) as consultations,
        (select count(*)::int from quotes where case_id = ${secondaryCaseId}) as quotes,
        (select count(*)::int from case_hospital_contacts where case_id = ${secondaryCaseId}) as case_hospital_contacts,
        (select count(*)::int from case_hospital_contacts secondary_chc
          where secondary_chc.case_id = ${secondaryCaseId}
            and exists (
              select 1 from case_hospital_contacts primary_chc
              where primary_chc.case_id = ${primaryCaseId}
                and primary_chc.hospital_id = secondary_chc.hospital_id
            )) as case_hospital_contact_conflicts,
        (select count(*)::int from case_events where case_id = ${secondaryCaseId}) as case_events,
        (select count(*)::int from case_journeys where case_id = ${secondaryCaseId}) as case_journeys,
        (select exists(select 1 from case_journeys where case_id = ${primaryCaseId})) as primary_has_journey,
        (select count(*)::int from journey_milestones where case_id = ${secondaryCaseId}) as journey_milestones,
        (select count(*)::int from question_collector_responses where case_id = ${secondaryCaseId}) as question_collector_responses,
        (select count(*)::int from orders where case_id = ${secondaryCaseId}) as orders,
        (select count(*)::int from support_tickets where case_id = ${secondaryCaseId}) as support_tickets
    `);
    const row = (rows as unknown as Record<string, number | boolean>[])[0] ?? {};
    const caseJourneys = Number(row['case_journeys'] ?? 0);
    const journeyConflict = caseJourneys > 0 && Boolean(row['primary_has_journey']);
    return {
      documents: Number(row['documents'] ?? 0),
      caseProgress: Number(row['case_progress'] ?? 0),
      conversations: Number(row['conversations'] ?? 0),
      emailReplyTokens: Number(row['email_reply_tokens'] ?? 0),
      inboundEmailEvents: Number(row['inbound_email_events'] ?? 0),
      consultations: Number(row['consultations'] ?? 0),
      quotes: Number(row['quotes'] ?? 0),
      caseHospitalContacts: Number(row['case_hospital_contacts'] ?? 0) - Number(row['case_hospital_contact_conflicts'] ?? 0),
      caseHospitalContactConflicts: Number(row['case_hospital_contact_conflicts'] ?? 0),
      caseEvents: Number(row['case_events'] ?? 0),
      caseJourneys: journeyConflict ? 0 : caseJourneys,
      journeyConflict,
      journeyMilestones: Number(row['journey_milestones'] ?? 0),
      questionCollectorResponses: Number(row['question_collector_responses'] ?? 0),
      orders: Number(row['orders'] ?? 0),
      supportTickets: Number(row['support_tickets'] ?? 0),
    };
  }

  async transferPatientResources(secondaryPatientId: string, primaryPatientId: string, tx: unknown): Promise<PatientResourceCounts> {
    const db = this.conn(tx);
    const counts = await this.countPatientResources(secondaryPatientId, tx);

    await db.update(cases).set({ patientId: primaryPatientId, updatedAt: new Date().toISOString() })
      .where(eq(cases.patientId, secondaryPatientId));
    await db.update(consultations).set({ patientId: primaryPatientId })
      .where(eq(consultations.patientId, secondaryPatientId));
    await db.update(supportTickets).set({ patientId: primaryPatientId })
      .where(eq(supportTickets.patientId, secondaryPatientId));
    await db.update(orders).set({ patientId: primaryPatientId })
      .where(eq(orders.patientId, secondaryPatientId));
    await db.update(emailReplyTokens).set({ patientId: primaryPatientId })
      .where(eq(emailReplyTokens.patientId, secondaryPatientId));
    await db.update(aiChatSessions).set({ patientId: primaryPatientId })
      .where(eq(aiChatSessions.patientId, secondaryPatientId));
    // ai_user_profiles is unique per patient — only move when the primary has none
    await db.execute(sql`
      update ai_user_profiles
      set patient_id = ${primaryPatientId}
      where patient_id = ${secondaryPatientId}
        and not exists (select 1 from ai_user_profiles where patient_id = ${primaryPatientId})
    `);
    await db.update(aiChatTimelineEvents).set({ patientId: primaryPatientId })
      .where(eq(aiChatTimelineEvents.patientId, secondaryPatientId));
    await db.update(aiFollowupTriggers).set({ patientId: primaryPatientId })
      .where(eq(aiFollowupTriggers.patientId, secondaryPatientId));
    await db.update(aiHandoffs).set({ patientId: primaryPatientId })
      .where(eq(aiHandoffs.patientId, secondaryPatientId));

    return counts;
  }

  async transferCaseResources(secondaryCaseId: string, primaryCaseId: string, tx: unknown): Promise<CaseResourceCounts> {
    const db = this.conn(tx);
    const counts = await this.countCaseResources(secondaryCaseId, primaryCaseId, tx);

    await db.update(documents).set({ caseId: primaryCaseId })
      .where(eq(documents.caseId, secondaryCaseId));
    await db.update(caseProgress).set({ caseId: primaryCaseId })
      .where(eq(caseProgress.caseId, secondaryCaseId));
    await db.update(conversations).set({ caseId: primaryCaseId })
      .where(eq(conversations.caseId, secondaryCaseId));
    await db.update(emailReplyTokens).set({ caseId: primaryCaseId })
      .where(eq(emailReplyTokens.caseId, secondaryCaseId));
    await db.update(inboundEmailEvents).set({ caseId: primaryCaseId })
      .where(eq(inboundEmailEvents.caseId, secondaryCaseId));
    await db.update(consultations).set({ caseId: primaryCaseId })
      .where(eq(consultations.caseId, secondaryCaseId));
    await db.update(quotes).set({ caseId: primaryCaseId })
      .where(eq(quotes.caseId, secondaryCaseId));
    // case_hospital_contacts is unique on (case_id, hospital_id) — drop duplicates first
    if (counts.caseHospitalContactConflicts > 0) {
      await db.execute(sql`
        delete from case_hospital_contacts secondary_chc
        where secondary_chc.case_id = ${secondaryCaseId}
          and exists (
            select 1 from case_hospital_contacts primary_chc
            where primary_chc.case_id = ${primaryCaseId}
              and primary_chc.hospital_id = secondary_chc.hospital_id
          )
      `);
    }
    await db.update(caseHospitalContacts).set({ caseId: primaryCaseId })
      .where(eq(caseHospitalContacts.caseId, secondaryCaseId));
    // Original events are preserved and re-pointed so the full history lands on the primary timeline
    await db.update(caseEvents).set({ caseId: primaryCaseId })
      .where(eq(caseEvents.caseId, secondaryCaseId));
    // case_journeys is unique per case — only move when the primary has none
    if (!counts.journeyConflict) {
      await db.update(caseJourneys).set({ caseId: primaryCaseId })
        .where(eq(caseJourneys.caseId, secondaryCaseId));
    }
    await db.update(journeyMilestones).set({ caseId: primaryCaseId })
      .where(eq(journeyMilestones.caseId, secondaryCaseId));
    await db.update(questionCollectorResponses).set({ caseId: primaryCaseId })
      .where(eq(questionCollectorResponses.caseId, secondaryCaseId));
    await db.update(orders).set({ caseId: primaryCaseId })
      .where(eq(orders.caseId, secondaryCaseId));
    await db.update(supportTickets).set({ caseId: primaryCaseId })
      .where(eq(supportTickets.caseId, secondaryCaseId));

    return counts;
  }

  async fillPrimaryContactFields(primaryPatientId: string, fields: Partial<PatientContactFields>, tx: unknown): Promise<void> {
    const db = this.conn(tx);
    // Each update is guarded by IS NULL so primary values always win, even under a concurrent change
    if (fields.email) {
      await db.update(users).set({ email: fields.email, updatedAt: new Date().toISOString() })
        .where(and(eq(users.id, primaryPatientId), isNull(users.email)));
    }
    if (fields.phone) {
      await db.update(users).set({ phone: fields.phone, updatedAt: new Date().toISOString() })
        .where(and(eq(users.id, primaryPatientId), isNull(users.phone)));
    }
    if (fields.whatsapp) {
      await db.update(users).set({ whatsapp: fields.whatsapp, updatedAt: new Date().toISOString() })
        .where(and(eq(users.id, primaryPatientId), isNull(users.whatsapp)));
    }
  }

  async markPatientMerged(secondaryPatientId: string, primaryPatientId: string, tx: unknown): Promise<void> {
    await this.conn(tx)
      .update(users)
      .set({
        mergedIntoUserId: primaryPatientId,
        status: 'merged',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, secondaryPatientId));
  }

  async markCaseMerged(secondaryCaseId: string, primaryCaseId: string, tx: unknown): Promise<void> {
    await this.conn(tx)
      .update(cases)
      .set({
        status: 'MERGED',
        mergedIntoCaseId: primaryCaseId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(cases.id, secondaryCaseId));
  }
}
