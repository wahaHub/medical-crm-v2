import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
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

beforeAll(async () => {
  await cleanupPolicyArtifacts();
});

afterAll(async () => {
  await cleanupPolicyArtifacts();
});

describe('AI policy schema integration', () => {
  it('persists session policy state, profile memory, timeline events, followups, and handoffs', async () => {
    const session = buildPolicySessionRow();

    await testDb.execute(sql`
      insert into ai_chat_sessions (
        id,
        session_id,
        session_secret_hash,
        hospital_type,
        status,
        condition_status,
        form_status,
        doc_upload_status,
        recommendation_status,
        consultation_status,
        package_status,
        handoff_status,
        lead_maturity,
        risk_level,
        trust_or_objection,
        pending_offer_type,
        pending_offer_payload,
        pending_question_type,
        pending_question_payload,
        last_next_action,
        last_resolved_intent,
        conversation_summary,
        last_policy_decision_at,
        last_user_message_at,
        last_assistant_message_at,
        created_at,
        updated_at
      ) values (
        ${session.id},
        ${session.sessionId},
        ${session.sessionSecretHash},
        ${session.hospitalType},
        ${session.status},
        ${session.conditionStatus},
        ${session.formStatus},
        ${session.docUploadStatus},
        ${session.recommendationStatus},
        ${session.consultationStatus},
        ${session.packageStatus},
        ${session.handoffStatus},
        ${session.leadMaturity},
        ${session.riskLevel},
        ${session.trustOrObjection},
        ${session.pendingOfferType},
        ${JSON.stringify(session.pendingOfferPayload)}::jsonb,
        ${session.pendingQuestionType},
        ${JSON.stringify(session.pendingQuestionPayload)}::jsonb,
        ${session.lastNextAction},
        ${session.lastResolvedIntent},
        ${session.conversationSummary},
        ${session.lastPolicyDecisionAt}::timestamptz,
        ${session.lastUserMessageAt}::timestamptz,
        ${session.lastAssistantMessageAt}::timestamptz,
        ${session.createdAt}::timestamptz,
        ${session.updatedAt}::timestamptz
      )
    `);

    const message = buildPolicyMessageRow(session.id);
    await testDb.execute(sql`
      insert into ai_chat_messages (
        id,
        session_id,
        role,
        content,
        intent,
        resolved_intent,
        risk_level,
        can_answer,
        next_action,
        secondary_action,
        response_mode,
        citations,
        metadata,
        reason_codes,
        shortlist,
        writeback_status,
        tool_trace,
        created_at
      ) values (
        ${message.id},
        ${message.sessionId},
        ${message.role},
        ${message.content},
        ${message.intent},
        ${message.resolvedIntent},
        ${message.riskLevel},
        ${message.canAnswer},
        ${message.nextAction},
        ${message.secondaryAction},
        ${message.responseMode},
        ${JSON.stringify(message.citations)}::jsonb,
        ${JSON.stringify(message.metadata)}::jsonb,
        ${JSON.stringify(message.reasonCodes)}::jsonb,
        ${JSON.stringify(message.shortlist)}::jsonb,
        ${message.writebackStatus},
        ${JSON.stringify(message.toolTrace)}::jsonb,
        ${message.createdAt}::timestamptz
      )
    `);

    const profile = buildPolicyProfileRow(session.sessionId);
    await testDb.execute(sql`
      insert into ai_user_profiles (
        id,
        patient_id,
        anonymous_key,
        condition_or_goal,
        condition_category,
        preferred_destination,
        preferred_language,
        budget_band,
        urgency_level,
        existing_reports_status,
        objection_tags,
        lead_stage,
        next_best_action,
        memory_summary,
        source_confidence_map,
        created_at,
        updated_at
      ) values (
        ${profile.id},
        ${profile.patientId},
        ${profile.anonymousKey},
        ${profile.conditionOrGoal},
        ${profile.conditionCategory},
        ${JSON.stringify(profile.preferredDestination)}::jsonb,
        ${profile.preferredLanguage},
        ${profile.budgetBand},
        ${profile.urgencyLevel},
        ${profile.existingReportsStatus},
        ${JSON.stringify(profile.objectionTags)}::jsonb,
        ${profile.leadStage},
        ${profile.nextBestAction},
        ${profile.memorySummary},
        ${JSON.stringify(profile.sourceConfidenceMap)}::jsonb,
        ${profile.createdAt}::timestamptz,
        ${profile.updatedAt}::timestamptz
      )
    `);

    const event = buildTimelineEventRow(session.id);
    await testDb.execute(sql`
      insert into ai_chat_timeline_events (
        id,
        session_id,
        patient_id,
        event_type,
        summary,
        payload,
        actor,
        confidence,
        created_at
      ) values (
        ${event.id},
        ${event.sessionId},
        ${event.patientId},
        ${event.eventType},
        ${event.summary},
        ${JSON.stringify(event.payload)}::jsonb,
        ${event.actor},
        ${event.confidence}::numeric,
        ${event.createdAt}::timestamptz
      )
    `);

    const followup = buildFollowupTriggerRow(session.id);
    await testDb.execute(sql`
      insert into ai_followup_triggers (
        id,
        session_id,
        patient_id,
        trigger_type,
        status,
        due_at,
        channel,
        reason,
        payload,
        created_at,
        resolved_at
      ) values (
        ${followup.id},
        ${followup.sessionId},
        ${followup.patientId},
        ${followup.triggerType},
        ${followup.status},
        ${followup.dueAt}::timestamptz,
        ${followup.channel},
        ${followup.reason},
        ${JSON.stringify(followup.payload)}::jsonb,
        ${followup.createdAt}::timestamptz,
        ${followup.resolvedAt}
      )
    `);

    const handoff = buildHandoffRow(session.id);
    await testDb.execute(sql`
      insert into ai_handoffs (
        id,
        session_id,
        patient_id,
        support_ticket_id,
        handoff_type,
        priority,
        reason_code,
        brief,
        status,
        assigned_to,
        created_at,
        completed_at
      ) values (
        ${handoff.id},
        ${handoff.sessionId},
        ${handoff.patientId},
        ${handoff.supportTicketId},
        ${handoff.handoffType},
        ${handoff.priority},
        ${handoff.reasonCode},
        ${JSON.stringify(handoff.brief)}::jsonb,
        ${handoff.status},
        ${handoff.assignedTo},
        ${handoff.createdAt}::timestamptz,
        ${handoff.completedAt}
      )
    `);

    const sessionRows = await testDb.execute(sql`
      select
        session_id,
        last_resolved_intent,
        recommendation_status
      from ai_chat_sessions
      where id = ${session.id}
    `);
    const profileRows = await testDb.execute(sql`
      select anonymous_key, memory_summary from ai_user_profiles where id = ${profile.id}
    `);
    const timelineRows = await testDb.execute(sql`
      select event_type from ai_chat_timeline_events where id = ${event.id}
    `);
    const followupRows = await testDb.execute(sql`
      select trigger_type from ai_followup_triggers where id = ${followup.id}
    `);
    const handoffRows = await testDb.execute(sql`
      select handoff_type from ai_handoffs where id = ${handoff.id}
    `);

    expect((sessionRows as Array<{ session_id: string }>)[0]?.session_id).toBe(session.sessionId);
    expect((profileRows as Array<{ memory_summary: string }>)[0]?.memory_summary).toContain('rhinoplasty');
    expect((timelineRows as Array<{ event_type: string }>)[0]?.event_type).toBe('DOC_UPLOAD_REQUESTED');
    expect((followupRows as Array<{ trigger_type: string }>)[0]?.trigger_type).toBe('DOC_UPLOAD_PENDING');
    expect((handoffRows as Array<{ handoff_type: string }>)[0]?.handoff_type).toBe('HIGH_VALUE_LEAD');
  });
});
