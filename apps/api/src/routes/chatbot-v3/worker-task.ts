import type { ChatJourneyStage } from '@medical-crm/domain';
import type { NextAction } from '@medical-crm/application';

export type WorkerTaskIntent =
  | 'faq'
  | 'progression'
  | 'resource'
  | 'consult'
  | 'handoff'
  | 'unknown';

export type RecommendationTask =
  | 'generate'
  | 'refresh'
  | 'revisit'
  | 'compare'
  | 'explain';

export type RecommendationBasis =
  | 'INTAKE_AND_FOLLOW_UP_SUMMARY'
  | 'INTAKE_ONLY_AFTER_TRIAGE_SKIP';

export type RecordsWorkerMode = 'minimal_triage' | 'medical_collection';
export type FaqResponseMode =
  | 'standard'
  | 'safe_medical_redirect'
  | 'out_of_scope_redirect'
  | 'rejection_or_hesitation';

interface WorkerTaskBase<TAgent extends 'FaqAgent' | 'RecordsAgent' | 'RecommendationAgent'> {
  agent: TAgent;
  fromStage: ChatJourneyStage;
  toStage: ChatJourneyStage;
  latestUserMessage: string;
  intent?: WorkerTaskIntent;
  supervisorReason?: string;
}

export interface FaqWorkerTask extends WorkerTaskBase<'FaqAgent'> {
  responseMode?: FaqResponseMode;
  safetyRiskType?: string;
  redirectTarget?: string;
  businessScope?: string[];
  outputRules?: string[];
}

export interface RecordsWorkerTask extends WorkerTaskBase<'RecordsAgent'> {
  mode: RecordsWorkerMode;
  minimalTriageComplete: boolean;
}

export interface RecommendationWorkerTask extends WorkerTaskBase<'RecommendationAgent'> {
  recommendationTask: RecommendationTask;
  recommendationBasis?: RecommendationBasis;
  minimalTriageAnswersSummary?: string | null;
}

export type WorkerTask =
  | FaqWorkerTask
  | RecordsWorkerTask
  | RecommendationWorkerTask;

export function createFallbackFaqWorkerTask(latestUserMessage: string): FaqWorkerTask {
  return {
    agent: 'FaqAgent',
    fromStage: 'EXPLAIN_PROCESS',
    toStage: 'EXPLAIN_PROCESS',
    latestUserMessage,
  };
}

export function createFallbackRecordsWorkerTask(
  latestUserMessage: string,
): RecordsWorkerTask {
  return {
    agent: 'RecordsAgent',
    fromStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    toStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    latestUserMessage,
    mode: 'minimal_triage',
    minimalTriageComplete: false,
  };
}

export function createFallbackRecommendationWorkerTask(
  latestUserMessage: string,
): RecommendationWorkerTask {
  return {
    agent: 'RecommendationAgent',
    fromStage: 'RECOMMENDATION',
    toStage: 'RECOMMENDATION',
    latestUserMessage,
    recommendationTask: 'generate',
  };
}

export function resolveFaqTaskPolicy(
  nextAction: NextAction | undefined,
): Pick<FaqWorkerTask, 'responseMode' | 'safetyRiskType' | 'redirectTarget' | 'businessScope' | 'outputRules'> {
  switch (nextAction?.type) {
    case 'SAFE_MEDICAL_REDIRECT':
      return {
        responseMode: 'safe_medical_redirect',
        safetyRiskType: nextAction.riskType,
        outputRules: [
          'do_not_diagnose',
          'do_not_recommend_medication',
          'do_not_guarantee_outcome',
          'mention_emergency_care_when_urgent',
          'ask_one_safe_next_step',
        ],
      };
    case 'OUT_OF_SCOPE_REDIRECT':
      return {
        responseMode: 'out_of_scope_redirect',
        redirectTarget: nextAction.redirectTarget,
        businessScope: [
          'doctor matching in China',
          'medical record preparation',
          'online consultation',
          'hospital coordination',
          'travel support related to treatment',
        ],
        outputRules: [
          'do_not_claim_we_can_help_with_unsupported_service',
          'ask_one_relevant_next_step',
          'preserve_primary_stage',
        ],
      };
    case 'ANSWER_FAQ':
      if (nextAction.subtopic !== 'rejection_or_hesitation') {
        return {};
      }

      return {
        responseMode: 'rejection_or_hesitation',
        outputRules: [
          'acknowledge_without_pressure',
          'preserve_primary_stage',
          'offer_one_lower_friction_next_step',
        ],
      };
    default:
      return {};
  }
}
