import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  AiChatMessage,
  AiChatSession,
  AiChatTimelineEvent,
  AiFollowupTrigger,
  AiHandoff,
  AiUserProfile,
} from '@medical-crm/domain';
import { testDb } from './helpers.js';
import {
  buildFollowupTriggerRow,
  buildHandoffRow,
  buildPolicyMessageRow,
  buildPolicyProfileRow,
  buildPolicySessionRow,
  buildTimelineEventRow,
  policyTestPrefixes,
} from './builders/ai-policy-test-builders.js';
import { DrizzleAiChatMessageRepository } from '../../database/repositories/drizzle-ai-chat-message.repository.js';
import { DrizzleAiChatSessionRepository } from '../../database/repositories/drizzle-ai-chat-session.repository.js';
import { DrizzleAiChatTimelineEventRepository } from '../../database/repositories/drizzle-ai-chat-timeline-event.repository.js';
import { DrizzleAiFollowupTriggerRepository } from '../../database/repositories/drizzle-ai-followup-trigger.repository.js';
import { DrizzleAiHandoffRepository } from '../../database/repositories/drizzle-ai-handoff.repository.js';
import { DrizzleAiUserProfileRepository } from '../../database/repositories/drizzle-ai-user-profile.repository.js';

let sessionRepo: DrizzleAiChatSessionRepository;
let messageRepo: DrizzleAiChatMessageRepository;
let profileRepo: DrizzleAiUserProfileRepository;
let timelineRepo: DrizzleAiChatTimelineEventRepository;
let followupRepo: DrizzleAiFollowupTriggerRepository;
let handoffRepo: DrizzleAiHandoffRepository;

async function cleanupPolicyArtifacts() {
  const existingTables = await testDb.execute(sql`
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'ai_handoffs',
        'ai_followup_triggers',
        'ai_chat_timeline_events',
        'ai_user_profiles',
        'ai_chat_messages',
        'ai_chat_sessions'
      )
  `);

  const tableNames = new Set(
    (existingTables as Array<{ tablename?: string }>).map((row) => row.tablename).filter(Boolean),
  );

  if (tableNames.has('ai_handoffs')) {
    await testDb.execute(sql`
      delete from ai_handoffs
      where session_id in (
        select id from ai_chat_sessions where session_id like ${`${policyTestPrefixes.session}%`}
      )
    `);
  }

  if (tableNames.has('ai_followup_triggers')) {
    await testDb.execute(sql`
      delete from ai_followup_triggers
      where session_id in (
        select id from ai_chat_sessions where session_id like ${`${policyTestPrefixes.session}%`}
      )
    `);
  }

  if (tableNames.has('ai_chat_timeline_events')) {
    await testDb.execute(sql`
      delete from ai_chat_timeline_events
      where session_id in (
        select id from ai_chat_sessions where session_id like ${`${policyTestPrefixes.session}%`}
      )
    `);
  }

  if (tableNames.has('ai_user_profiles')) {
    await testDb.execute(sql`
      delete from ai_user_profiles
      where anonymous_key like ${`${policyTestPrefixes.profile}%`}
    `);
  }

  await testDb.execute(sql`
    delete from ai_chat_messages
    where session_id in (
      select id from ai_chat_sessions where session_id like ${`${policyTestPrefixes.session}%`}
    )
  `);
  await testDb.execute(sql`
    delete from ai_chat_sessions
    where session_id like ${`${policyTestPrefixes.session}%`}
  `);
}

async function ensureAiChatSessionRepairColumns() {
  await testDb.execute(sql`
    alter table ai_chat_sessions
      add column if not exists journey_current_stage text,
      add column if not exists journey_current_phase text,
      add column if not exists supporting_documents jsonb
  `);
}

beforeAll(async () => {
  sessionRepo = new DrizzleAiChatSessionRepository(testDb);
  messageRepo = new DrizzleAiChatMessageRepository(testDb);
  profileRepo = new DrizzleAiUserProfileRepository(testDb);
  timelineRepo = new DrizzleAiChatTimelineEventRepository(testDb);
  followupRepo = new DrizzleAiFollowupTriggerRepository(testDb);
  handoffRepo = new DrizzleAiHandoffRepository(testDb);
  await ensureAiChatSessionRepairColumns();
  await cleanupPolicyArtifacts();
}, 30_000);

afterAll(async () => {
  await cleanupPolicyArtifacts();
}, 30_000);

describe('AI policy schema integration', () => {
  it.skip('updates session snapshot and links profile/timeline/followup rows through repository classes', async () => {
    const sessionRow = buildPolicySessionRow();
    const session = await sessionRepo.save(new AiChatSession({
      id: sessionRow.id,
      sessionId: sessionRow.sessionId,
      sessionSecretHash: sessionRow.sessionSecretHash,
      difyConversationId: null,
      patientId: null,
      hospitalType: sessionRow.hospitalType,
      status: sessionRow.status,
      statusSnapshot: {
        conditionStatus: sessionRow.conditionStatus,
        formStatus: sessionRow.formStatus,
        docUploadStatus: sessionRow.docUploadStatus,
        recommendationStatus: sessionRow.recommendationStatus,
        consultationStatus: sessionRow.consultationStatus,
        packageStatus: sessionRow.packageStatus,
        handoffStatus: sessionRow.handoffStatus,
        leadMaturity: sessionRow.leadMaturity,
        riskLevel: sessionRow.riskLevel,
      trustOrObjection: sessionRow.trustOrObjection,
      engagementMode: 'QUALIFIED_EXPLORATION',
      prequalificationReasonCodes: ['trust_building_question'],
      enteredDeepWorkflowAt: null,
      pendingOffer: {
        type: sessionRow.pendingOfferType,
        payload: sessionRow.pendingOfferPayload,
      },
        pendingQuestion: {
          type: sessionRow.pendingQuestionType,
          payload: sessionRow.pendingQuestionPayload,
        },
        lastNextAction: sessionRow.lastNextAction,
        lastResolvedIntent: sessionRow.lastResolvedIntent,
        conversationSummary: sessionRow.conversationSummary,
        lastPolicyDecisionAt: new Date(sessionRow.lastPolicyDecisionAt),
        lastUserMessageAt: new Date(sessionRow.lastUserMessageAt),
        lastAssistantMessageAt: new Date(sessionRow.lastAssistantMessageAt),
      },
      createdAt: new Date(sessionRow.createdAt),
      updatedAt: new Date(sessionRow.updatedAt),
    }));

    const messageRow = buildPolicyMessageRow(session.id);
    await messageRepo.create(new AiChatMessage({
      id: messageRow.id,
      sessionId: messageRow.sessionId,
      role: 'ASSISTANT',
      content: messageRow.content,
      intent: 'CONSULT',
      resolvedIntent: messageRow.resolvedIntent,
      riskLevel: 'NORMAL',
      canAnswer: messageRow.canAnswer,
      nextAction: 'REQUEST_DOCS',
      secondaryAction: messageRow.secondaryAction,
      responseMode: messageRow.responseMode,
      citations: messageRow.citations,
      reasonCodes: messageRow.reasonCodes,
      shortlist: messageRow.shortlist,
      writebackStatus: messageRow.writebackStatus,
      toolTrace: messageRow.toolTrace,
      metadata: messageRow.metadata,
      createdAt: new Date(messageRow.createdAt),
    }));

    const profileRow = buildPolicyProfileRow(session.sessionId);
    const profile = await profileRepo.save(new AiUserProfile({
      id: profileRow.id,
      patientId: profileRow.patientId,
      anonymousKey: profileRow.anonymousKey,
      conditionOrGoal: profileRow.conditionOrGoal,
      conditionCategory: profileRow.conditionCategory,
      preferredDestination: profileRow.preferredDestination,
      preferredLanguage: profileRow.preferredLanguage,
      budgetBand: profileRow.budgetBand,
      urgencyLevel: profileRow.urgencyLevel,
      existingReportsStatus: profileRow.existingReportsStatus,
      objectionTags: profileRow.objectionTags,
      leadStage: profileRow.leadStage,
      nextBestAction: profileRow.nextBestAction,
      memorySummary: profileRow.memorySummary,
      sourceConfidenceMap: profileRow.sourceConfidenceMap,
      createdAt: new Date(profileRow.createdAt),
      updatedAt: new Date(profileRow.updatedAt),
    }));

    const eventRow = buildTimelineEventRow(session.id);
    const event = await timelineRepo.append(new AiChatTimelineEvent({
      id: eventRow.id,
      sessionId: eventRow.sessionId,
      patientId: eventRow.patientId,
      eventType: eventRow.eventType,
      summary: eventRow.summary,
      payload: eventRow.payload,
      actor: eventRow.actor,
      confidence: eventRow.confidence,
      createdAt: new Date(eventRow.createdAt),
    }));

    const followupRow = buildFollowupTriggerRow(session.id);
    const followup = await followupRepo.createPendingTrigger(new AiFollowupTrigger({
      id: followupRow.id,
      sessionId: followupRow.sessionId,
      patientId: followupRow.patientId,
      triggerType: followupRow.triggerType,
      status: followupRow.status,
      dueAt: new Date(followupRow.dueAt),
      channel: followupRow.channel,
      reason: followupRow.reason,
      payload: followupRow.payload,
      createdAt: new Date(followupRow.createdAt),
      resolvedAt: null,
    }));

    const handoffRow = buildHandoffRow(session.id);
    const handoff = await handoffRepo.save(new AiHandoff({
      id: handoffRow.id,
      sessionId: handoffRow.sessionId,
      patientId: handoffRow.patientId,
      supportTicketId: handoffRow.supportTicketId,
      handoffType: handoffRow.handoffType,
      priority: handoffRow.priority,
      reasonCode: handoffRow.reasonCode,
      brief: handoffRow.brief,
      status: handoffRow.status,
      assignedTo: handoffRow.assignedTo,
      createdAt: new Date(handoffRow.createdAt),
      completedAt: null,
    }));

    await sessionRepo.patchStatus(session.sessionId, 'china', {
      engagementMode: 'DEEP_WORKFLOW',
      prequalificationReasonCodes: ['form_completed', 'documents_missing'],
      enteredDeepWorkflowAt: new Date('2026-03-29T12:00:00.000Z'),
      formStatus: 'in_progress',
      selectedHospitalId: null,
      pendingQuestion: {
        type: 'ASK_BUDGET',
        payload: { source: 'repo-test' },
      },
    });

    const persisted = await sessionRepo.findBySessionId(session.sessionId, 'china');
    const recentMessages = await messageRepo.listRecentBySession(session.id, 5);
    const recentTimeline = await timelineRepo.listRecentBySession(session.id, 5);

    expect(persisted?.statusSnapshot.formStatus).toBe('in_progress');
    expect(persisted?.statusSnapshot.engagementMode).toBe('DEEP_WORKFLOW');
    expect(persisted?.statusSnapshot.prequalificationReasonCodes).toEqual(['form_completed', 'documents_missing']);
    expect(persisted?.statusSnapshot.enteredDeepWorkflowAt?.toISOString()).toBe('2026-03-29T12:00:00.000Z');
    expect(persisted?.statusSnapshot.selectedHospitalId).toBeNull();
    expect(persisted?.statusSnapshot.pendingOffer?.type).toBe('FORM_COMPLETION');
    expect(persisted?.statusSnapshot.pendingQuestion?.type).toBe('ASK_BUDGET');
    expect(persisted?.statusSnapshot.conversationSummary).toContain('rhinoplasty');

    expect(profile.memorySummary).toContain('rhinoplasty');
    expect(event.eventType).toBe('DOC_UPLOAD_REQUESTED');
    expect(recentMessages[0]?.resolvedIntent).toBe('ASK_FOR_RECOMMENDATION');
    expect(recentTimeline[0]?.eventType).toBe('DOC_UPLOAD_REQUESTED');
    expect(followup.triggerType).toBe('DOC_UPLOAD_PENDING');
    expect(handoff.handoffType).toBe('HIGH_VALUE_LEAD');
  });

  it('accepts replayed ISO-string timestamps when patching ai chat session status', async () => {
    const sessionId = `${policyTestPrefixes.session}-replay-safe-timestamps`;
    const created = await sessionRepo.save(new AiChatSession({
      id: crypto.randomUUID(),
      sessionId,
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: null,
        processExplained: false,
        recommendationGenerated: null,
        recommendationSelectionStatus: null,
        recommendationSelectedHospitalIds: null,
        recommendationSelected: null,
        journeyCurrentStage: null,
        journeyCurrentPhase: null,
        supportingDocuments: [],
        consultCompleted: null,
        handoffActive: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: new Date('2026-04-19T08:00:00.000Z'),
      updatedAt: new Date('2026-04-19T08:00:00.000Z'),
    }));

    expect(created.sessionId).toBe(sessionId);

    const patched = await sessionRepo.patchStatus(sessionId, 'china', {
      enteredDeepWorkflowAt: '2026-04-19T08:30:00.000Z' as never,
      lastPolicyDecisionAt: '2026-04-19T08:31:00.000Z' as never,
      lastUserMessageAt: '2026-04-19T08:32:00.000Z' as never,
      lastAssistantMessageAt: '2026-04-19T08:33:00.000Z' as never,
      journeyCurrentStage: 'EXPLAIN_PROCESS',
      journeyCurrentPhase: 'active',
      supportingDocuments: [
        { path: 'uploads/replay-safe.pdf', name: 'replay-safe.pdf' },
        { path: 'uploads/replay-safe.pdf', name: 'renamed.pdf' },
      ],
    });

    expect(patched).not.toBeNull();
    expect(patched?.statusSnapshot.enteredDeepWorkflowAt?.toISOString()).toBe('2026-04-19T08:30:00.000Z');
    expect(patched?.statusSnapshot.lastPolicyDecisionAt?.toISOString()).toBe('2026-04-19T08:31:00.000Z');
    expect(patched?.statusSnapshot.lastUserMessageAt?.toISOString()).toBe('2026-04-19T08:32:00.000Z');
    expect(patched?.statusSnapshot.lastAssistantMessageAt?.toISOString()).toBe('2026-04-19T08:33:00.000Z');
    expect(patched?.statusSnapshot.journeyCurrentStage).toBe('EXPLAIN_PROCESS');
    expect(patched?.statusSnapshot.journeyCurrentPhase).toBe('active');
    expect(patched?.statusSnapshot.supportingDocuments).toEqual([
      { path: 'uploads/replay-safe.pdf', name: 'replay-safe.pdf' },
    ]);
  });
});
