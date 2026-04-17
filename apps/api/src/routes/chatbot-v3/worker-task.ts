import type { ChatJourneyStage } from '@medical-crm/domain';

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

export type RecordsWorkerMode = 'minimal_triage' | 'medical_collection';

interface WorkerTaskBase<TAgent extends 'FaqAgent' | 'RecordsAgent' | 'RecommendationAgent'> {
  agent: TAgent;
  fromStage: ChatJourneyStage;
  toStage: ChatJourneyStage;
  latestUserMessage: string;
  intent?: WorkerTaskIntent;
  supervisorReason?: string;
}

export interface FaqWorkerTask extends WorkerTaskBase<'FaqAgent'> {}

export interface RecordsWorkerTask extends WorkerTaskBase<'RecordsAgent'> {
  mode: RecordsWorkerMode;
  minimalTriageComplete: boolean;
}

export interface RecommendationWorkerTask extends WorkerTaskBase<'RecommendationAgent'> {
  recommendationTask: RecommendationTask;
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
