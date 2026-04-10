import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import { ConversationOrchestratorService } from '../../services/chatbot-v2/conversation-orchestrator.service.js';

export interface GetAiPolicyContextInput {
  sessionId: string;
  userMessage: string;
  pageContext?: {
    type: 'HOSPITAL_DETAIL';
    hospitalId: string;
    hospitalName?: string;
  } | null;
}

export class GetAiPolicyContextUseCase {
  private readonly orchestrator = new ConversationOrchestratorService();

  constructor(
    private readonly contextBuilder: ContextBuilderService,
  ) {}

  async execute(input: GetAiPolicyContextInput) {
    const context = await this.contextBuilder.build(input);
    const orchestration = this.orchestrator.orchestrate({
      scopeId: context.chatbotV2Foundation.scopeId,
      userMessage: input.userMessage,
      journeySnapshot: context.chatbotV2Foundation.journeySnapshot,
      truth: context.chatbotV2Foundation.truth,
    });
    const projectedJourneySnapshot = orchestration.journeyUpdate ?? context.chatbotV2Foundation.journeySnapshot;
    const projectedAllowedResources = orchestration.allowedResources;

    return {
      profile: context.profile,
      chatbot_v2: {
        source: context.chatbotV2Foundation.source,
        scope_id: context.chatbotV2Foundation.scopeId,
        request_class: orchestration.requestClass,
        response_intent: orchestration.responseIntent,
        journey_snapshot: {
          current_stage: projectedJourneySnapshot.currentStage,
          current_phase: projectedJourneySnapshot.currentPhase,
        },
        allowed_resources: projectedAllowedResources.map((resource) => ({
          resource_type: resource.resourceType,
          resource_id: resource.resourceId,
          status: resource.status,
          stage_binding: resource.stageBinding
            ? {
              stage: resource.stageBinding.stage,
              phase: resource.stageBinding.phase ?? null,
            }
            : null,
          visibility: resource.visibility,
          payload: resource.payload,
          actions: resource.actions,
        })),
      },
      status_snapshot: {
        condition_status: context.statusSnapshot.conditionStatus,
        form_status: context.statusSnapshot.formStatus,
        doc_upload_status: context.statusSnapshot.docUploadStatus,
        recommendation_status: context.statusSnapshot.recommendationStatus,
        consultation_status: context.statusSnapshot.consultationStatus,
        package_status: context.statusSnapshot.packageStatus,
        handoff_status: context.statusSnapshot.handoffStatus,
        risk_level: context.statusSnapshot.riskLevel,
        trust_or_objection: context.statusSnapshot.trustOrObjection,
        last_policy_decision_at: context.statusSnapshot.lastPolicyDecisionAt?.toISOString() ?? null,
        last_user_message_at: context.statusSnapshot.lastUserMessageAt?.toISOString() ?? null,
        last_assistant_message_at: context.statusSnapshot.lastAssistantMessageAt?.toISOString() ?? null,
      },
      conversation_summary: context.statusSnapshot.conversationSummary,
      active_hospital_context: context.activeHospitalContext
        ? {
            hospital_id: context.activeHospitalContext.hospitalId,
            hospital_name: context.activeHospitalContext.hospitalName,
            source: context.activeHospitalContext.source,
          }
        : null,
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
