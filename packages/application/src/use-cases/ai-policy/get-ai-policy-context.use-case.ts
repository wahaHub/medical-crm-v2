import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import type { AiChatMessage } from '@medical-crm/domain';

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
  constructor(
    private readonly contextBuilder: ContextBuilderService,
  ) {}

  async execute(input: GetAiPolicyContextInput) {
    const context = await this.contextBuilder.build(input);

    return {
      profile: context.profile,
      chatbot_v2: {
        source: context.chatbotV2Foundation.source,
        scope_id: context.chatbotV2Foundation.scopeId,
        truth_summary: {
          medical_inputs_started: context.chatbotV2Foundation.truth.medicalInputsStarted,
          medical_inputs_submitted: context.chatbotV2Foundation.truth.medicalInputsSubmitted,
          recommendation_available: context.chatbotV2Foundation.truth.recommendationAvailable,
          recommendation_confirmed: context.chatbotV2Foundation.truth.recommendationConfirmed,
          online_consult_required: context.chatbotV2Foundation.truth.onlineConsultRequired,
          online_consult_started: context.chatbotV2Foundation.truth.onlineConsultStarted,
          online_consult_submitted: context.chatbotV2Foundation.truth.onlineConsultSubmitted,
          human_handoff_active: context.chatbotV2Foundation.truth.humanHandoffActive,
          human_handoff_submitted: context.chatbotV2Foundation.truth.humanHandoffSubmitted,
        },
        journey_snapshot: {
          current_stage: context.chatbotV2Foundation.journeySnapshot.currentStage,
          current_phase: context.chatbotV2Foundation.journeySnapshot.currentPhase,
        },
        allowed_resources: context.chatbotV2Foundation.allowedResources.map((resource) => ({
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
      chatbot_v2_floor: readChatbotV2Floor(context.recentMessages),
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

function readChatbotV2Floor(messages: AiChatMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'ASSISTANT') {
      continue;
    }

    const metadata = message.metadata as Record<string, unknown> | null | undefined;
    const floor = metadata?.['chatbotV2'];
    if (!floor || typeof floor !== 'object') {
      continue;
    }

    const record = floor as Record<string, unknown>;
    const journeySnapshot = (record['journeySnapshot'] ?? record['journey_snapshot']) as Record<string, unknown> | undefined;
    const resources = Array.isArray(record['resources'] ?? record['allowed_resources'])
      ? (record['resources'] ?? record['allowed_resources']) as Array<Record<string, unknown>>
      : [];
    const truthSummary = (record['truthSummary'] ?? record['truth_summary']) as Record<string, unknown> | undefined;

    return {
      journey_snapshot: journeySnapshot
        ? {
            current_stage: journeySnapshot['currentStage'] ?? journeySnapshot['current_stage'] ?? null,
            current_phase: journeySnapshot['currentPhase'] ?? journeySnapshot['current_phase'] ?? null,
          }
        : null,
      allowed_resources: resources.map((resource) => ({
        resource_type: resource['resourceType'] ?? resource['resource_type'] ?? null,
        resource_id: resource['resourceId'] ?? resource['resource_id'] ?? null,
        status: resource['status'] ?? null,
        stage_binding: resource['stageBinding'] ?? resource['stage_binding'] ?? null,
        visibility: resource['visibility'] ?? null,
        payload: resource['payload'] ?? {},
        actions: resource['actions'] ?? [],
      })),
      request_class: record['requestClass'] ?? record['request_class'] ?? null,
      response_intent: record['responseIntent'] ?? record['response_intent'] ?? null,
      include_progression_follow_up:
        record['includeProgressionFollowUp'] ?? record['include_progression_follow_up'] ?? false,
      truth_summary: truthSummary
        ? {
            medical_inputs_started: truthSummary['medicalInputsStarted'] ?? truthSummary['medical_inputs_started'] ?? false,
            medical_inputs_submitted: truthSummary['medicalInputsSubmitted'] ?? truthSummary['medical_inputs_submitted'] ?? false,
            recommendation_available: truthSummary['recommendationAvailable'] ?? truthSummary['recommendation_available'] ?? false,
            recommendation_confirmed: truthSummary['recommendationConfirmed'] ?? truthSummary['recommendation_confirmed'] ?? false,
            online_consult_required: truthSummary['onlineConsultRequired'] ?? truthSummary['online_consult_required'] ?? false,
            online_consult_started: truthSummary['onlineConsultStarted'] ?? truthSummary['online_consult_started'] ?? false,
            online_consult_submitted: truthSummary['onlineConsultSubmitted'] ?? truthSummary['online_consult_submitted'] ?? false,
            human_handoff_active: truthSummary['humanHandoffActive'] ?? truthSummary['human_handoff_active'] ?? false,
            human_handoff_submitted: truthSummary['humanHandoffSubmitted'] ?? truthSummary['human_handoff_submitted'] ?? false,
          }
        : null,
    };
  }

  return null;
}
