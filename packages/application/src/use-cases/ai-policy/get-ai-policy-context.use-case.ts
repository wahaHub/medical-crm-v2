import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';

export interface GetAiPolicyContextInput {
  sessionId: string;
  userMessage: string;
}

export class GetAiPolicyContextUseCase {
  constructor(
    private readonly contextBuilder: ContextBuilderService,
  ) {}

  async execute(input: GetAiPolicyContextInput) {
    const context = await this.contextBuilder.build(input);

    return {
      profile: context.profile,
      status_snapshot: {
        condition_status: context.statusSnapshot.conditionStatus,
        form_status: context.statusSnapshot.formStatus,
        doc_upload_status: context.statusSnapshot.docUploadStatus,
        recommendation_status: context.statusSnapshot.recommendationStatus,
        consultation_status: context.statusSnapshot.consultationStatus,
        package_status: context.statusSnapshot.packageStatus,
        handoff_status: context.statusSnapshot.handoffStatus,
        lead_maturity: context.statusSnapshot.leadMaturity,
        risk_level: context.statusSnapshot.riskLevel,
        trust_or_objection: context.statusSnapshot.trustOrObjection,
        last_next_action: context.statusSnapshot.lastNextAction,
        last_resolved_intent: context.statusSnapshot.lastResolvedIntent,
        last_policy_decision_at: context.statusSnapshot.lastPolicyDecisionAt?.toISOString() ?? null,
        last_user_message_at: context.statusSnapshot.lastUserMessageAt?.toISOString() ?? null,
        last_assistant_message_at: context.statusSnapshot.lastAssistantMessageAt?.toISOString() ?? null,
      },
      conversation_summary: context.statusSnapshot.conversationSummary,
      pending_offer: context.statusSnapshot.pendingOffer,
      pending_question: context.statusSnapshot.pendingQuestion,
      recent_messages: context.recentMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        resolved_intent: message.resolvedIntent,
        next_action: message.nextAction,
        secondary_action: message.secondaryAction,
        response_mode: message.responseMode,
        created_at: message.createdAt.toISOString(),
      })),
      active_followups: context.activeFollowups.map((followup) => ({
        id: followup.id,
        trigger_type: followup.triggerType,
        status: followup.status,
        reason: followup.reason,
        due_at: followup.dueAt.toISOString(),
      })),
      recent_timeline: context.recentTimeline.map((event) => ({
        id: event.id,
        event_type: event.eventType,
        summary: event.summary,
        actor: event.actor,
        created_at: event.createdAt.toISOString(),
      })),
      recent_handoffs: context.recentHandoffs.map((handoff) => ({
        id: handoff.id,
        handoff_type: handoff.handoffType,
        priority: handoff.priority,
        reason_code: handoff.reasonCode,
        status: handoff.status,
        created_at: handoff.createdAt.toISOString(),
      })),
    };
  }
}
