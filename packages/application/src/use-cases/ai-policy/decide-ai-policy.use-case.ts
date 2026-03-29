import { ActionPlannerService } from '../../services/policy-engine/action-planner.service.js';
import { ContextBuilderService } from '../../services/policy-engine/context-builder.service.js';
import { IntentResolverService } from '../../services/policy-engine/intent-resolver.service.js';
import { RecommendationPolicyService } from '../../services/policy-engine/recommendation-policy.service.js';
import { RiskResolverService } from '../../services/policy-engine/risk-resolver.service.js';
import { SignalResolverService } from '../../services/policy-engine/signal-resolver.service.js';

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
    private readonly intentResolver: IntentResolverService,
    private readonly riskResolver: RiskResolverService,
    private readonly actionPlanner: ActionPlannerService,
    private readonly recommendationPolicy: RecommendationPolicyService,
  ) {}

  async execute(input: DecideAiPolicyInput) {
    const context = await this.contextBuilder.build({
      sessionId: input.sessionId,
      userMessage: input.userMessage,
    });

    const signals = this.signalResolver.resolve({
      extraction: input.extraction,
    });

    const intent = await this.intentResolver.resolve({
      userMessage: input.userMessage,
      pendingOffer: context.statusSnapshot.pendingOffer,
      recentMessages: context.recentMessages.map((message) => ({
        role: message.role,
        content: message.content,
        nextAction: message.nextAction,
      })),
      candidateSignals: input.extraction,
    });

    const risk = await this.riskResolver.resolve({
      userMessage: input.userMessage,
      candidateSignals: {
        ...input.extraction,
        possibleRisk: signals.possibleRisk,
      },
    });

    const plan = this.actionPlanner.plan({
      statusSnapshot: {
        ...context.statusSnapshot,
        riskLevel: risk.riskLevel,
      },
      resolvedIntent: intent.resolvedIntent,
    });

    const recommendation = await this.recommendationPolicy.decide({
      statusSnapshot: {
        ...context.statusSnapshot,
        riskLevel: risk.riskLevel,
      },
      resolvedIntent: intent.resolvedIntent,
      candidateHospitals: input.candidateHospitals,
    });

    const resolvedNextAction = risk.overrideAction ?? (
      recommendation.eligible && recommendation.shortlist.length > 0
        ? 'SHOW_HOSPITAL_RECOMMENDATIONS'
        : plan.nextAction
    );

    const reasonCodes = dedupeReasonCodes(
      ...intent.reasonCodes,
      ...risk.reasonCodes,
      ...plan.reasonCodes,
      ...recommendation.reasonCodes,
    );

    const allowedTools = buildAllowedTools(resolvedNextAction);

    return {
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
        next_action: resolvedNextAction,
        risk_level: risk.riskLevel,
        reason_codes: reasonCodes,
      },
    };
  }
}

function dedupeReasonCodes(...codes: string[]): string[] {
  return [...new Set(codes.filter((code) => code.length > 0))];
}

function buildAllowedTools(nextAction: string): string[] {
  switch (nextAction) {
    case 'SHOW_HOSPITAL_RECOMMENDATIONS':
      return ['search_hospitals', 'get_hospital_details'];
    case 'REQUEST_DOC_UPLOAD':
      return ['request_docs_upload'];
    case 'SHOW_PACKAGE':
      return ['list_packages', 'get_package_details'];
    case 'SAFETY_HANDOFF':
      return ['create_handoff'];
    default:
      return ['search_faq'];
  }
}

function buildResponseMode(nextAction: string): string {
  switch (nextAction) {
    case 'SHOW_HOSPITAL_RECOMMENDATIONS':
      return 'grounded_with_shortlist';
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
