import type { LlmNodeAdapter } from '@medical-crm/application';
import {
  buildFallbackRecommendationResult,
  compactRecommendations,
  type CompactRecommendation,
  type RecommendationPromptInput,
  RECOMMENDATION_MAX_RESULTS,
  RECOMMENDATION_PROMPT_VERSION,
  type RecommendationWorkerResult,
} from './recommendation-prompts.js';

export interface RecommendationLlmRunMetadata {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
}

export interface RecommendationLlmAdapterOptions {
  worker?: LlmNodeAdapter<RecommendationPromptInput, unknown>;
}

export class RecommendationLlmAdapter {
  readonly promptVersion: string;
  private lastRunMetadata: RecommendationLlmRunMetadata | null = null;

  constructor(private readonly options: RecommendationLlmAdapterOptions = {}) {
    this.promptVersion = options.worker?.promptVersion ?? RECOMMENDATION_PROMPT_VERSION;
  }

  async runGenerate(input: RecommendationPromptInput): Promise<RecommendationWorkerResult> {
    const fallback = buildFallbackRecommendationResult(input);
    const metadataBase = {
      nodePromptVersion: this.promptVersion,
      nodeModel: this.options.worker?.model,
    } satisfies RecommendationLlmRunMetadata;

    if (!this.options.worker) {
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }

    try {
      const raw = await this.options.worker.run(input);
      const sanitized = sanitizeRecommendationWorkerResult(raw, fallback, input);
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: sanitized.fallbackUsed,
        schemaValidationFailed: sanitized.schemaValidationFailed,
      };
      return sanitized.result;
    } catch {
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }
  }

  getLastRunMetadata(): RecommendationLlmRunMetadata | null {
    return this.lastRunMetadata;
  }
}

function sanitizeRecommendationWorkerResult(
  raw: unknown,
  fallback: RecommendationWorkerResult,
  input: RecommendationPromptInput,
): {
  result: RecommendationWorkerResult;
  fallbackUsed: boolean;
  schemaValidationFailed: boolean;
} {
  const recommendationTask = input.task.recommendationTask;
  const allowedRecommendations = new Map(
    compactRecommendations(input.recommendations)
      .map((candidate) => [candidate.hospitalId, candidate] as const),
  );
  const record = asRecord(raw);
  const recommendations = sanitizeRecommendations(record.recommendations, allowedRecommendations);
  const explanation = sanitizeExplanation(record.explanation);
  const hasInvalidRecommendations = record.recommendations !== undefined && recommendations === null;
  const hasInvalidExplanation = record.explanation !== undefined && explanation === null;
  const requiresExplanation = recommendationTask === 'compare' || recommendationTask === 'explain';
  const missingRequiredExplanation = requiresExplanation && !explanation;

  if (
    hasInvalidRecommendations
    || hasInvalidExplanation
    || missingRequiredExplanation
    || !recommendations
    || recommendations.length === 0
  ) {
    return {
      result: fallback,
      fallbackUsed: true,
      schemaValidationFailed: true,
    };
  }

  return {
    result: {
      recommendations,
      ...(explanation ? { explanation } : {}),
    },
    fallbackUsed: false,
    schemaValidationFailed: false,
  };
}

function sanitizeRecommendations(
  value: unknown,
  allowedRecommendations: Map<string, CompactRecommendation>,
): CompactRecommendation[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const recommendations: CompactRecommendation[] = [];
  const seenHospitalIds = new Set<string>();
  for (const entry of value) {
    const record = asRecord(entry);
    const hospitalId = normalizeString(record.hospitalId);
    if (!hospitalId || !allowedRecommendations.has(hospitalId) || seenHospitalIds.has(hospitalId)) {
      return null;
    }

    const recommendation = allowedRecommendations.get(hospitalId);
    if (!recommendation) {
      return null;
    }

    recommendations.push(recommendation);
    seenHospitalIds.add(hospitalId);
    if (recommendations.length >= RECOMMENDATION_MAX_RESULTS) {
      break;
    }
  }

  return recommendations.length > 0 ? recommendations : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeExplanation(value: unknown): string | null {
  const explanation = normalizeString(value);
  if (!explanation) {
    return null;
  }

  return containsCrossDomainRecommendationClaim(explanation) ? null : explanation;
}

function containsCrossDomainRecommendationClaim(value: string): boolean {
  return /\b(record|records|document|documents|upload|uploaded|consult|consultation|handoff|ticket|agent|human)\b/i.test(value);
}
