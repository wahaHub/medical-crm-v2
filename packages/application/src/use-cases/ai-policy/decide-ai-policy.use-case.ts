import { ActionPlannerService } from '../../services/policy-engine/action-planner.service.js';
import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import { EngagementModeResolverService } from '../../services/policy-engine/engagement-mode-resolver.service.js';
import { IntentResolverService } from '../../services/policy-engine/intent-resolver.service.js';
import { RecommendationPolicyService } from '../../services/policy-engine/recommendation-policy.service.js';
import { RiskResolverService } from '../../services/policy-engine/risk-resolver.service.js';
import { SignalResolverService } from '../../services/policy-engine/signal-resolver.service.js';
import type {
  AiPolicyBackendNextAction,
  AiPolicyEngagementMode,
} from '../../dtos/ai-policy.dto.js';

export interface DecideAiPolicyInput {
  sessionId: string;
  userMessage: string;
  extraction?: Record<string, unknown>;
  candidateHospitals?: Array<{
    hospitalId: string;
    reasonCodes: string[];
  }>;
}

export class DecideAiPolicyUseCase {
  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly signalResolver: SignalResolverService,
    private readonly engagementModeResolver: EngagementModeResolverService,
    private readonly intentResolver: IntentResolverService,
    private readonly riskResolver: RiskResolverService,
    private readonly actionPlanner: ActionPlannerService,
    private readonly recommendationPolicy: RecommendationPolicyService,
  ) {}

  async execute(input: DecideAiPolicyInput) {
    const lightContext = await this.contextBuilder.build({
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      depth: 'light',
    });

    const signals = this.signalResolver.resolve({
      extraction: input.extraction,
    });
    const candidateSignals = mergeCandidateSignals(input.extraction, signals);

    const engagement = this.engagementModeResolver.resolve({
      userMessage: input.userMessage,
      currentEngagementMode: lightContext.currentEngagementMode,
      pendingOffer: lightContext.pendingOffer,
      pendingQuestion: lightContext.pendingQuestion,
      lastAssistantAction: lightContext.lastAssistantAction,
      candidateSignals,
    });

    const risk = await this.riskResolver.resolve({
      userMessage: input.userMessage,
      candidateSignals,
    });

    const effectiveEngagementMode = enforceRiskFirstEngagementMode(engagement.engagementMode, risk.riskLevel);

    const context = effectiveEngagementMode === 'LIGHT_DISCOVERY'
      ? lightContext
      : await this.contextBuilder.build({
        sessionId: input.sessionId,
        userMessage: input.userMessage,
        depth: 'full',
      });

    const intent = await this.intentResolver.resolve({
      userMessage: input.userMessage,
      pendingOffer: context.pendingOffer.exists
        ? { type: context.pendingOffer.type ?? 'UNKNOWN' }
        : null,
      recentMessages: context.contextDepth === 'full'
        ? context.recentMessages.map((message) => ({
        role: message.role,
        content: message.content,
        nextAction: message.nextAction,
      }))
        : [],
      candidateSignals,
    });

    const plan = this.actionPlanner.plan({
      statusSnapshot: context.contextDepth === 'full'
        ? {
            ...context.statusSnapshot,
            riskLevel: risk.riskLevel,
          }
        : {
            riskLevel: risk.riskLevel,
          },
      engagementMode: effectiveEngagementMode,
      resolvedIntent: intent.resolvedIntent,
    });

    const recommendation = effectiveEngagementMode === 'DEEP_WORKFLOW' && context.contextDepth === 'full'
      ? await this.recommendationPolicy.decide({
        statusSnapshot: {
          ...context.statusSnapshot,
          riskLevel: risk.riskLevel,
        },
        resolvedIntent: intent.resolvedIntent,
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
      ...engagement.reasonCodes,
      ...intent.reasonCodes,
      ...risk.reasonCodes,
      ...plan.reasonCodes,
      ...recommendation.reasonCodes,
    );

    const allowedTools = buildAllowedTools(resolvedNextAction);

    return {
      engagement_mode: effectiveEngagementMode,
      resolved_intent: intent.resolvedIntent,
      risk_level: risk.riskLevel,
      next_action: resolvedNextAction,
      secondary_action: resolvedNextAction === 'SHOW_HOSPITAL_RECOMMENDATIONS'
        ? plan.secondaryAction
        : plan.secondaryAction,
      response_mode: buildResponseMode(resolvedNextAction),
      allowed_tools: allowedTools,
      reason_codes: reasonCodes,
      shortlist: recommendation.shortlist.map((candidate) => ({
        hospital_id: candidate.hospitalId,
        match_type: 'matched',
        reason_codes: candidate.reasonCodes,
      })),
      handoff_required: resolvedNextAction === 'SAFETY_HANDOFF',
      writeback_plan: {
        context_depth: context.contextDepth,
        writeback_depth: determineWritebackDepth(effectiveEngagementMode),
        engagement_mode: effectiveEngagementMode,
        prequalification_reason_codes: engagement.reasonCodes,
        next_action: resolvedNextAction,
        risk_level: risk.riskLevel,
        reason_codes: reasonCodes,
      },
    };
  }
}

function mergeCandidateSignals(
  extraction: Record<string, unknown> | undefined,
  signals: ReturnType<SignalResolverService['resolve']>,
): Record<string, unknown> {
  return {
    ...(extraction ?? {}),
    affirmative: extraction?.['affirmative'] ?? signals.affirmative,
    negative: extraction?.['negative'] ?? signals.negative,
    possibleRisk: extraction?.['possibleRisk'] ?? signals.possibleRisk,
    possibleIntent: extraction?.['possibleIntent'] ?? signals.possibleIntent,
    mentionedBudget: extraction?.['mentionedBudget'] ?? signals.mentionedBudget,
  };
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
    case 'EXPLAIN_CONSULT_PROCESS':
      return ['search_faq'];
    case 'REQUEST_DOC_UPLOAD':
      return ['request_docs_upload'];
    case 'SHOW_PACKAGE':
      return ['list_packages'];
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
    case 'EXPLAIN_CONSULT_PROCESS':
      return 'grounded_with_guidance';
    case 'REQUEST_DOC_UPLOAD':
      return 'guided_upload_request';
    case 'SHOW_PACKAGE':
      return 'grounded_with_soft_cta';
    case 'SAFETY_HANDOFF':
      return 'safety_only';
    default:
      return 'grounded_answer';
  }
}
