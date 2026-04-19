import type {
  RecommendationTask,
  RecommendationWorkerTask,
} from './worker-task.js';

export const RECOMMENDATION_PROMPT_VERSION = '2026-04-16-recommendation-worker-v1';
export const RECOMMENDATION_MAX_RESULTS = 3;

export interface RecommendationPromptInput {
  task: RecommendationWorkerTask;
  recommendations: Array<Record<string, unknown>>;
}

export interface CompactRecommendation {
  hospitalId: string;
  name: string;
  reason: string;
}

export interface RecommendationWorkerResult {
  recommendations: CompactRecommendation[];
  explanation?: string;
  recommendationTask?: RecommendationTask;
}

export function buildRecommendationWorkerPrompt(input: RecommendationPromptInput): string {
  return [
    'You are RecommendationAgent for chatbot-v3.',
    `Prompt version: ${RECOMMENDATION_PROMPT_VERSION}`,
    'Return a single JSON object only. Do not include markdown fences or extra commentary.',
    'Use only the supplied candidate recommendations and the structured worker task.',
    'Keep the output small and grounded.',
    'Do not invent hospitals, scores, rankings, or medical facts.',
    'Do not mutate or mention records, consult, or handoff state.',
    'If explanation is needed, keep it to one short sentence.',
    ...buildRecommendationBasisPromptLines(input.task),
    'Output schema:',
    '{"recommendations":[{"hospitalId":"string","name":"string","reason":"string"}],"explanation":"optional short string"}',
    'Worker task:',
    JSON.stringify(input.task, null, 2),
    'Candidate recommendations:',
    JSON.stringify(compactRecommendations(input.recommendations), null, 2),
  ].join('\n');
}

export function buildFallbackRecommendationResult(
  input: RecommendationPromptInput,
): RecommendationWorkerResult {
  const recommendations = compactRecommendations(input.recommendations);
  const task = input.task.recommendationTask;

  return {
    recommendations,
    ...(buildFallbackExplanation(task) ? { explanation: buildFallbackExplanation(task) } : {}),
  };
}

export function compactRecommendations(
  recommendations: Array<Record<string, unknown>>,
): CompactRecommendation[] {
  return recommendations
    .map((candidate) => sanitizeCompactRecommendation(candidate))
    .filter((candidate): candidate is CompactRecommendation => candidate !== null)
    .slice(0, RECOMMENDATION_MAX_RESULTS);
}

function buildRecommendationBasisPromptLines(
  task: RecommendationWorkerTask,
): string[] {
  if (task.recommendationBasis === 'INTAKE_AND_FOLLOW_UP_SUMMARY') {
    return [
      'Recommendation basis: intake + follow-up summary',
      ...(task.minimalTriageAnswersSummary
        ? [`Follow-up summary: ${task.minimalTriageAnswersSummary}`]
        : []),
    ];
  }

  if (task.recommendationBasis === 'INTAKE_ONLY_AFTER_TRIAGE_SKIP') {
    return [
      'Recommendation basis: intake only after follow-up skip',
    ];
  }

  return [];
}

function sanitizeCompactRecommendation(value: Record<string, unknown>): CompactRecommendation | null {
  const hospitalId = normalizeString(value.hospitalId);
  const name = normalizeString(value.name);
  const reason = normalizeString(value.reason);

  if (!hospitalId || !name || !reason) {
    return null;
  }

  return {
    hospitalId,
    name,
    reason,
  };
}

function buildFallbackExplanation(task: RecommendationTask): string | undefined {
  switch (task) {
    case 'compare':
      return 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.';
    case 'explain':
      return 'These recommendations are grounded in the current hospital list and can be refreshed if you want different options later.';
    default:
      return undefined;
  }
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
