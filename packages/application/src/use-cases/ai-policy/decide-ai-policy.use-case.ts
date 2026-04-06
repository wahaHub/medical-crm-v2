import { ActionPlannerService } from '../../services/policy-engine/action-planner.service.js';
import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import { EngagementModeResolverService } from '../../services/policy-engine/engagement-mode-resolver.service.js';
import { IntentResolverService } from '../../services/policy-engine/intent-resolver.service.js';
import { RecommendationPolicyService } from '../../services/policy-engine/recommendation-policy.service.js';
import { RiskResolverService } from '../../services/policy-engine/risk-resolver.service.js';
import { SignalResolverService } from '../../services/policy-engine/signal-resolver.service.js';
import { isMissingDocumentStatus } from '../../services/policy-engine/status-normalization.js';
import {
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
  type AiPolicyResolvedIntent,
  type AiPolicySemanticSignals,
} from '../../dtos/ai-policy.dto.js';
import type {
  AiPolicyBackendNextAction,
  AiPolicyEngagementMode,
} from '../../dtos/ai-policy.dto.js';

type RuntimeIntentBridgeContext = {
  contextDepth: 'light' | 'full';
  activeHospitalContext: {
    hospitalId: string;
    source: string;
  } | null;
  pendingOffer: {
    exists: boolean;
    type: string | null;
  };
  recentMessages?: Array<{
    role: string;
    content: string;
    nextAction?: string | null;
  }>;
  statusSnapshot?: {
    selectedHospitalId?: string | null;
    docUploadStatus?: string;
  };
};

export interface DecideAiPolicyInput {
  sessionId: string;
  userMessage: string;
  extraction?: Record<string, unknown>;
  pageContext?: {
    type: 'HOSPITAL_DETAIL';
    hospitalId: string;
    hospitalName?: string;
  } | null;
  candidateHospitals?: Array<{
    hospitalId: string;
    reasonCodes: string[];
  }>;
}

export class DecideAiPolicyUseCase {
  constructor(
    private readonly contextBuilder: ContextBuilderService,
    _signalResolver: SignalResolverService,
    _engagementModeResolver: EngagementModeResolverService,
    _intentResolver: IntentResolverService,
    private readonly riskResolver: RiskResolverService,
    private readonly actionPlanner: ActionPlannerService,
    private readonly recommendationPolicy: RecommendationPolicyService,
  ) {}

  async execute(input: DecideAiPolicyInput) {
    const lightContext = await this.contextBuilder.build({
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      depth: 'light',
      pageContext: input.pageContext,
    });

    const semantics = parseCanonicalSemanticSignals(input.extraction);
    const candidateSignals = buildCandidateSignals(input.extraction);

    const risk = await this.riskResolver.resolve({
      userMessage: input.userMessage,
      candidateSignals,
    });

    const effectiveEngagementMode = enforceRiskFirstEngagementMode(
      semantics.signals.engagementSignal,
      risk.riskLevel,
    );

    const context = effectiveEngagementMode === 'LIGHT_DISCOVERY' && !requiresFullWorkflowContext(semantics.signals.resolvedIntent)
      ? lightContext
      : await this.contextBuilder.build({
        sessionId: input.sessionId,
        userMessage: input.userMessage,
        depth: 'full',
        pageContext: input.pageContext,
      });

    const runtimeIntentBridge = this.resolveRuntimeIntent({
      semantics: semantics.signals,
      context,
    });
    const runtimeResolvedIntent = runtimeIntentBridge.resolvedIntent;

    const plan = this.actionPlanner.plan({
      hospitalType: context.hospitalType,
      progressionSignal: semantics.signals.progressionSignal,
      statusSnapshot: context.contextDepth === 'full'
        ? {
            ...context.statusSnapshot,
            riskLevel: risk.riskLevel,
          }
        : {
            riskLevel: risk.riskLevel,
          },
      engagementMode: effectiveEngagementMode,
      resolvedIntent: semantics.signals.resolvedIntent,
    });

    const recommendation = effectiveEngagementMode === 'DEEP_WORKFLOW' && context.contextDepth === 'full'
      ? await this.recommendationPolicy.decide({
        statusSnapshot: {
          ...context.statusSnapshot,
          riskLevel: risk.riskLevel,
        },
        resolvedIntent: resolveRecommendationIntentForPolicy(semantics.signals.resolvedIntent, runtimeResolvedIntent),
        candidateHospitals: input.candidateHospitals,
      })
      : {
        eligible: false,
        shortlist: [],
        reasonCodes: ['recommendation_deferred_by_engagement_mode'],
      };

    const resolvedNextAction: AiPolicyBackendNextAction = risk.overrideAction ?? (
      recommendation.eligible && recommendation.shortlist.length > 0
        ? 'SHOW_HOSPITAL_RECOMMENDATIONS'
        : plan.nextAction
    );

    const reasonCodes = dedupeReasonCodes(
      ...semantics.reasonCodes,
      ...runtimeIntentBridge.reasonCodes,
      ...risk.reasonCodes,
      ...plan.reasonCodes,
      ...recommendation.reasonCodes,
    );

    const allowedTools = buildAllowedTools(resolvedNextAction);
    const selectedHospitalId = shouldPersistSelectedHospital(runtimeResolvedIntent, context.activeHospitalContext)
      ? context.activeHospitalContext.hospitalId
      : undefined;

    return {
      engagement_mode: effectiveEngagementMode,
      active_hospital_context: context.activeHospitalContext
        ? {
            hospital_id: context.activeHospitalContext.hospitalId,
            hospital_name: context.activeHospitalContext.hospitalName,
            source: context.activeHospitalContext.source,
          }
        : null,
      resolved_intent: runtimeResolvedIntent,
      risk_level: risk.riskLevel,
      next_action: resolvedNextAction,
      secondary_action: resolvedNextAction === 'SHOW_HOSPITAL_RECOMMENDATIONS'
        ? plan.secondaryAction
        : plan.secondaryAction,
      response_mode: buildResponseMode(resolvedNextAction),
      allowed_tools: allowedTools,
      reason_codes: reasonCodes,
      selected_hospital_id: selectedHospitalId,
      shortlist: recommendation.shortlist.map((candidate) => ({
        hospital_id: candidate.hospitalId,
        match_type: 'matched',
        reason_codes: candidate.reasonCodes,
      })),
      handoff_required: ['SAFETY_HANDOFF', 'HUMAN_HANDOFF'].includes(resolvedNextAction),
      writeback_plan: {
        context_depth: context.contextDepth,
        writeback_depth: determineWritebackDepth(effectiveEngagementMode),
        engagement_mode: effectiveEngagementMode,
        prequalification_reason_codes: buildPrequalificationReasonCodes(semantics, effectiveEngagementMode),
        next_action: resolvedNextAction,
        selected_hospital_id: selectedHospitalId,
        risk_level: risk.riskLevel,
        reason_codes: reasonCodes,
      },
    };
  }

  private resolveRuntimeIntent(input: {
    semantics: AiPolicySemanticSignals;
    context: RuntimeIntentBridgeContext;
  }): { resolvedIntent: string; reasonCodes: string[] } {
    const runtimeResolvedIntent = mapCanonicalResolvedIntentToRuntimeIntent(input.semantics.resolvedIntent);

    if (shouldBridgeAlternativeRecommendations(runtimeResolvedIntent, input.context)) {
      return {
        resolvedIntent: 'ASK_ALTERNATIVE_HOSPITAL_RECOMMENDATIONS',
        reasonCodes: ['selected_hospital_alternative_recommendation_bridge'],
      };
    }

    if (!shouldBridgeAcceptedHospitalRecommendation(runtimeResolvedIntent, input.semantics, input.context)) {
      return {
        resolvedIntent: runtimeResolvedIntent,
        reasonCodes: [],
      };
    }

    return {
      resolvedIntent: 'ACCEPT_HOSPITAL_RECOMMENDATION',
      reasonCodes: ['pending_recommendation_acceptance_bridge'],
    };
  }
}

const DETERMINISTIC_SEMANTIC_FALLBACK: AiPolicySemanticSignals = {
  resolvedIntent: 'UNKNOWN',
  engagementSignal: 'LIGHT_DISCOVERY',
  progressionSignal: 'NONE',
  recommendationSignal: 'NONE',
  mentionsCondition: false,
  mentionsDoctorOrHospitalNeed: false,
};

const RUNTIME_RESOLVED_INTENT_BY_CANONICAL_INTENT: Record<AiPolicyResolvedIntent, string> = {
  GENERAL_INFO: 'GENERAL_CONSULT',
  ASK_MEDICAL_TRAVEL_PROCESS: 'ASK_MEDICAL_TRAVEL_PROCESS',
  ASK_CONSULT_PROCESS: 'ASK_CONSULT_PROCESS',
  ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION: 'ASK_FOR_RECOMMENDATION',
  ASK_FOR_HOSPITAL_RECOMMENDATION: 'ASK_FOR_RECOMMENDATION',
  REQUEST_DOC_UPLOAD: 'REQUEST_DOC_UPLOAD',
  ACCEPT_DOC_UPLOAD: 'REQUEST_DOC_UPLOAD',
  ACCEPT_ONLINE_CONSULT_INVITE: 'ACCEPT_ONLINE_CONSULT_INVITE',
  REQUEST_HUMAN_HANDOFF: 'REQUEST_HUMAN_HANDOFF',
  ASK_PACKAGE_INFO: 'GENERAL_CONSULT',
  SMALL_TALK_OR_GREETING: 'GENERAL_CONSULT',
  UNKNOWN: 'UNKNOWN',
};

function buildCandidateSignals(extraction: Record<string, unknown> | undefined): Record<string, unknown> {
  return isRecord(extraction) ? { ...extraction } : {};
}

function requiresFullWorkflowContext(resolvedIntent: AiPolicyResolvedIntent): boolean {
  return [
    'ASK_CONSULT_PROCESS',
    'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
    'ASK_FOR_HOSPITAL_RECOMMENDATION',
    'REQUEST_DOC_UPLOAD',
    'ACCEPT_DOC_UPLOAD',
  ].includes(resolvedIntent);
}

function resolveRecommendationIntentForPolicy(
  canonicalResolvedIntent: AiPolicyResolvedIntent,
  runtimeResolvedIntent: string,
): string {
  return runtimeResolvedIntent === 'ASK_ALTERNATIVE_HOSPITAL_RECOMMENDATIONS'
    ? runtimeResolvedIntent
    : canonicalResolvedIntent;
}

function parseCanonicalSemanticSignals(
  extraction: Record<string, unknown> | undefined,
): {
  signals: AiPolicySemanticSignals;
  reasonCodes: string[];
  usedFallback: boolean;
} {
  if (
    isRecord(extraction)
    && isEnumValue(extraction.resolvedIntent, AI_POLICY_RESOLVED_INTENTS)
    && isEnumValue(extraction.engagementSignal, AI_POLICY_ENGAGEMENT_SIGNALS)
    && isEnumValue(extraction.progressionSignal, AI_POLICY_PROGRESSION_SIGNALS)
    && isEnumValue(extraction.recommendationSignal, AI_POLICY_RECOMMENDATION_SIGNALS)
    && typeof extraction.mentionsCondition === 'boolean'
    && typeof extraction.mentionsDoctorOrHospitalNeed === 'boolean'
  ) {
    return {
      signals: {
        resolvedIntent: extraction.resolvedIntent,
        engagementSignal: extraction.engagementSignal,
        progressionSignal: extraction.progressionSignal,
        recommendationSignal: extraction.recommendationSignal,
        mentionsCondition: extraction.mentionsCondition,
        mentionsDoctorOrHospitalNeed: extraction.mentionsDoctorOrHospitalNeed,
      },
      reasonCodes: ['canonical_semantics_consumed'],
      usedFallback: false,
    };
  }

  return {
    signals: DETERMINISTIC_SEMANTIC_FALLBACK,
    reasonCodes: ['canonical_semantics_fallback'],
    usedFallback: true,
  };
}

function mapCanonicalResolvedIntentToRuntimeIntent(resolvedIntent: AiPolicyResolvedIntent): string {
  return RUNTIME_RESOLVED_INTENT_BY_CANONICAL_INTENT[resolvedIntent];
}

function shouldBridgeAcceptedHospitalRecommendation(
  runtimeResolvedIntent: string,
  semantics: AiPolicySemanticSignals,
  context: RuntimeIntentBridgeContext,
): boolean {
  if (
    !context.pendingOffer.exists
    || context.pendingOffer.type !== 'HOSPITAL_RECOMMENDATION'
    || context.activeHospitalContext === null
  ) {
    return false;
  }

  return ['UNKNOWN', 'GENERAL_CONSULT'].includes(runtimeResolvedIntent)
    && semantics.recommendationSignal === 'READY_FOR_RECOMMENDATION'
    && isAcceptanceLikeProgression(semantics.progressionSignal);
}

function shouldBridgeAlternativeRecommendations(
  runtimeResolvedIntent: string,
  context: RuntimeIntentBridgeContext,
): boolean {
  return runtimeResolvedIntent === 'ASK_FOR_RECOMMENDATION'
    && context.contextDepth === 'full'
    && typeof context.statusSnapshot?.selectedHospitalId === 'string'
    && context.statusSnapshot.selectedHospitalId.length > 0
    && !isMissingDocumentStatus(context.statusSnapshot.docUploadStatus);
}

function isAcceptanceLikeProgression(value: AiPolicySemanticSignals['progressionSignal']): boolean {
  return ['READY_TO_PROCEED', 'EXPLICITLY_COMMITTING'].includes(value);
}

function buildPrequalificationReasonCodes(
  semantics: { signals: AiPolicySemanticSignals; usedFallback: boolean },
  engagementMode: AiPolicyEngagementMode,
): string[] {
  return dedupeReasonCodes(
    semantics.usedFallback ? 'canonical_semantics_fallback' : 'canonical_semantics_consumed',
    `engagement_signal_${engagementMode.toLowerCase()}`,
  );
}

function isEnumValue<T extends string>(value: unknown, allowedValues: readonly T[]): value is T {
  return typeof value === 'string' && allowedValues.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function enforceRiskFirstEngagementMode(
  engagementMode: AiPolicyEngagementMode,
  riskLevel: string,
): AiPolicyEngagementMode {
  return ['HIGH_RISK', 'HIGH', 'CRISIS'].includes(riskLevel.toUpperCase())
    ? 'DEEP_WORKFLOW'
    : engagementMode;
}

function determineWritebackDepth(engagementMode: AiPolicyEngagementMode): 'minimal' | 'moderate' | 'complete' {
  switch (engagementMode) {
    case 'QUALIFIED_EXPLORATION':
      return 'moderate';
    case 'DEEP_WORKFLOW':
      return 'complete';
    default:
      return 'minimal';
  }
}

function dedupeReasonCodes(...codes: string[]): string[] {
  return [...new Set(codes.filter((code) => code.length > 0))];
}

function buildAllowedTools(nextAction: AiPolicyBackendNextAction): string[] {
  switch (nextAction) {
    case 'SHOW_HOSPITAL_RECOMMENDATIONS':
      return ['search_hospitals'];
    case 'EXPLORE_HOSPITAL_RECOMMENDATIONS':
      return ['search_hospitals'];
    case 'EXPLAIN_DOC_UPLOAD':
    case 'EXPLAIN_MEDICAL_TRAVEL_PROCESS':
    case 'EXPLAIN_CONSULT_PROCESS':
      return ['search_faq'];
    case 'REQUEST_DOC_UPLOAD':
      return ['request_docs_upload'];
    case 'INVITE_ONLINE_CONSULT':
      return ['open_online_consult'];
    case 'SHOW_PACKAGE':
      return ['list_packages'];
    case 'HUMAN_HANDOFF':
    case 'SAFETY_HANDOFF':
      return ['create_handoff'];
    default:
      return ['search_faq'];
  }
}

function buildResponseMode(nextAction: AiPolicyBackendNextAction): string {
  switch (nextAction) {
    case 'SHOW_HOSPITAL_RECOMMENDATIONS':
      return 'grounded_with_shortlist';
    case 'EXPLORE_HOSPITAL_RECOMMENDATIONS':
    case 'EXPLAIN_DOC_UPLOAD':
    case 'EXPLAIN_MEDICAL_TRAVEL_PROCESS':
    case 'EXPLAIN_CONSULT_PROCESS':
      return 'grounded_with_guidance';
    case 'REQUEST_DOC_UPLOAD':
      return 'guided_upload_request';
    case 'INVITE_ONLINE_CONSULT':
      return 'guided_consult_invitation';
    case 'SHOW_PACKAGE':
      return 'grounded_with_soft_cta';
    case 'HUMAN_HANDOFF':
      return 'guided_human_handoff';
    case 'SAFETY_HANDOFF':
      return 'safety_only';
    default:
      return 'grounded_answer';
  }
}

function shouldPersistSelectedHospital(
  resolvedIntent: string,
  activeHospitalContext: { hospitalId: string; source: string } | null,
): activeHospitalContext is { hospitalId: string; source: 'page_context' | 'recent_user_message' | 'selected_hospital' } {
  return resolvedIntent === 'ACCEPT_HOSPITAL_RECOMMENDATION'
    && activeHospitalContext !== null
    && ['page_context', 'recent_user_message', 'selected_hospital'].includes(activeHospitalContext.source);
}
