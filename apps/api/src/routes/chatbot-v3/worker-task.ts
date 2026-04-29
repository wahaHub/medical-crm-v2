import type { ChatJourneyStage } from '@medical-crm/domain';
import type {
  FollowUpAction,
  LoadedSkillSection,
  PrimaryAction,
  ReadIntent,
  ResponseContract,
  RetrievedContextEntry,
} from '@medical-crm/application';

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
  currentStage: ChatJourneyStage;
  primaryStage: ChatJourneyStage;
  latestUserMessage: string;
  recentMessages?: Array<{ id: string; role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string; createdAt?: string }>;
  conversationSummary?: string;
  intent?: WorkerTaskIntent;
  supervisorReason?: string;
  primaryAction?: PrimaryAction;
  followUpAction?: FollowUpAction;
  selectedDomainSkills?: string[];
  loadedSkillSections?: LoadedSkillSection[];
  retrievedContext?: RetrievedContextEntry[];
  /**
   * Transitional prompt compatibility fields. Runtime bridge tasks should use
   * currentStage/primaryStage and loadedSkillSections/readIntents instead.
   */
  fromStage?: ChatJourneyStage;
  toStage?: ChatJourneyStage;
  allowedSkillPacks?: string[];
  readIntents?: ReadIntent[];
  responseContract?: ResponseContract;
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
    currentStage: 'EXPLAIN_PROCESS',
    primaryStage: 'EXPLAIN_PROCESS',
    latestUserMessage,
    loadedSkillSections: [],
    readIntents: [],
    retrievedContext: [],
  };
}

export function createFallbackRecordsWorkerTask(
  latestUserMessage: string,
): RecordsWorkerTask {
  return {
    agent: 'RecordsAgent',
    currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    primaryStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    latestUserMessage,
    mode: 'minimal_triage',
    minimalTriageComplete: false,
    loadedSkillSections: [],
    readIntents: [],
    retrievedContext: [],
  };
}

export function createFallbackRecommendationWorkerTask(
  latestUserMessage: string,
): RecommendationWorkerTask {
  return {
    agent: 'RecommendationAgent',
    currentStage: 'RECOMMENDATION',
    primaryStage: 'RECOMMENDATION',
    latestUserMessage,
    recommendationTask: 'generate',
    loadedSkillSections: [],
    readIntents: [],
    retrievedContext: [],
  };
}

export function resolveFaqTaskPolicy(
  task: Pick<FaqWorkerTask, 'primaryAction'> | undefined,
): Pick<FaqWorkerTask, 'responseMode' | 'safetyRiskType' | 'redirectTarget' | 'businessScope' | 'outputRules'> {
  const action = task?.primaryAction;
  switch (action?.type) {
    case 'REDIRECT':
      if (action.reasonCode !== 'medical_safety') {
        return {
          responseMode: 'out_of_scope_redirect',
          redirectTarget: action.target,
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
      }

      return {
        responseMode: 'safe_medical_redirect',
        safetyRiskType: action.target,
        outputRules: [
          'do_not_diagnose',
          'do_not_recommend_medication',
          'do_not_guarantee_outcome',
          'mention_emergency_care_when_urgent',
          'ask_one_safe_next_step',
        ],
      };
    case 'HANDLE_RESPONSE':
      if (action.modifier !== 'reject' && action.modifier !== 'hesitate') {
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
