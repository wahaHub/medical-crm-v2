export const RECOMMENDATION_PROMPT_VERSION = '2026-04-16-recommendation-worker-v1';
export const RECOMMENDATION_MAX_RESULTS = 3;

export type RecommendationTask =
  | 'generate'
  | 'refresh'
  | 'revisit'
  | 'compare'
  | 'explain';

export interface RecommendationPromptInput {
  taskPrompt: string;
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
    'Use only the supplied candidate recommendations and the task prompt.',
    'Keep the output small and grounded.',
    'Do not invent hospitals, scores, rankings, or medical facts.',
    'Do not mutate or mention records, consult, or handoff state.',
    'If explanation is needed, keep it to one short sentence.',
    'Output schema:',
    '{"recommendations":[{"hospitalId":"string","name":"string","reason":"string"}],"explanation":"optional short string"}',
    'Task prompt:',
    input.taskPrompt.trim(),
    'Candidate recommendations:',
    JSON.stringify(compactRecommendations(input.recommendations), null, 2),
  ].join('\n');
}

export function buildFallbackRecommendationResult(
  input: RecommendationPromptInput,
): RecommendationWorkerResult {
  const recommendations = compactRecommendations(input.recommendations);
  const task = extractRecommendationTask(input.taskPrompt);

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

export function extractRecommendationTask(taskPrompt: string): RecommendationTask {
  const value = extractTaskPromptValue(taskPrompt, 'recommendation_task');
  switch (value) {
    case 'refresh':
    case 'revisit':
    case 'compare':
    case 'explain':
      return value;
    default:
      return 'generate';
  }
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

function extractTaskPromptValue(taskPrompt: string, key: string): string | null {
  const marker = `${key}=`;
  const linePrefixedMarker = `\n${marker}`;
  const prefixedIndex = taskPrompt.indexOf(linePrefixedMarker);

  if (prefixedIndex >= 0) {
    const start = prefixedIndex + linePrefixedMarker.length;
    const end = taskPrompt.indexOf('\n', start);
    return taskPrompt.slice(start, end >= 0 ? end : undefined).trim();
  }

  if (taskPrompt.startsWith(marker)) {
    const end = taskPrompt.indexOf('\n', marker.length);
    return taskPrompt.slice(marker.length, end >= 0 ? end : undefined).trim();
  }

  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
