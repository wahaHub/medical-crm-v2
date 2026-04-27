import type { LlmNodeAdapter } from '@medical-crm/application';
import type { FaqItemRecord } from './tool-gateway.js';
import type { FaqWorkerTask } from './worker-task.js';
import {
  buildFaqAnswerPrompt,
  buildFaqPlanPrompt,
  FAQ_ANSWER_PROMPT_VERSION,
  FAQ_PLAN_PROMPT_VERSION,
} from './faq-prompts.js';

export type FaqPlan = {
  category?: string;
  query: string;
  reason: string;
};

export type FaqAnswerResult = {
  answer: string;
  citedFaqIds: string[];
  confidence: 'high' | 'medium' | 'low';
  policyGrounded?: boolean;
};

export interface FaqLlmRunMetadata {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
}

export interface FaqPlanInput {
  task: FaqWorkerTask;
}

export interface FaqAnswerInput {
  task: FaqWorkerTask;
  plan: FaqPlan;
  matches: FaqItemRecord[];
  details: FaqItemRecord[];
}

export interface FaqLlmAdapterOptions {
  plan?: LlmNodeAdapter<FaqPlanInput, unknown>;
  answer?: LlmNodeAdapter<FaqAnswerInput, unknown>;
}

export class FaqLlmAdapter {
  readonly planPromptVersion: string;
  readonly answerPromptVersion: string;
  private lastPlanRunMetadata: FaqLlmRunMetadata | null = null;
  private lastAnswerRunMetadata: FaqLlmRunMetadata | null = null;

  constructor(private readonly options: FaqLlmAdapterOptions = {}) {
    this.planPromptVersion = options.plan?.promptVersion ?? FAQ_PLAN_PROMPT_VERSION;
    this.answerPromptVersion = options.answer?.promptVersion ?? FAQ_ANSWER_PROMPT_VERSION;
  }

  async plan(input: FaqPlanInput): Promise<FaqPlan> {
    buildFaqPlanPrompt(input);
    const fallback = buildFallbackFaqPlan(input);
    const metadataBase = {
      nodePromptVersion: this.planPromptVersion,
      nodeModel: this.options.plan?.model,
    } satisfies FaqLlmRunMetadata;

    if (!this.options.plan) {
      this.lastPlanRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }

    try {
      const raw = await this.options.plan.run(input);
      const sanitized = sanitizeFaqPlan(raw, fallback);
      this.lastPlanRunMetadata = {
        ...metadataBase,
        fallbackUsed: sanitized.fallbackUsed,
        schemaValidationFailed: sanitized.schemaValidationFailed,
      };
      return sanitized.plan;
    } catch {
      this.lastPlanRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }
  }

  async answer(input: FaqAnswerInput): Promise<FaqAnswerResult> {
    buildFaqAnswerPrompt(input);
    const fallback = composeFallbackFaqAnswer(
      input.matches,
      input.details,
      input.task.latestUserMessage,
      input.task,
    );
    const metadataBase = {
      nodePromptVersion: this.answerPromptVersion,
      nodeModel: this.options.answer?.model,
    } satisfies FaqLlmRunMetadata;

    if (!this.options.answer) {
      this.lastAnswerRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }

    try {
      const raw = await this.options.answer.run(input);
      const sanitized = sanitizeFaqAnswerResult(raw, fallback);
      this.lastAnswerRunMetadata = {
        ...metadataBase,
        fallbackUsed: sanitized.fallbackUsed,
        schemaValidationFailed: sanitized.schemaValidationFailed,
      };
      return sanitized.answer;
    } catch {
      this.lastAnswerRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }
  }

  getLastRunMetadata(): FaqLlmRunMetadata | null {
    const answerMetadata = this.lastAnswerRunMetadata;
    const planMetadata = this.lastPlanRunMetadata;
    if (!answerMetadata && !planMetadata) {
      return null;
    }

    return {
      nodePromptVersion: answerMetadata?.nodePromptVersion ?? planMetadata?.nodePromptVersion,
      nodeModel: answerMetadata?.nodeModel ?? planMetadata?.nodeModel,
      fallbackUsed: Boolean(answerMetadata?.fallbackUsed || planMetadata?.fallbackUsed),
      schemaValidationFailed: Boolean(
        answerMetadata?.schemaValidationFailed || planMetadata?.schemaValidationFailed,
      ),
    };
  }
}

export function composeFallbackFaqAnswer(
  matches: FaqItemRecord[],
  details: FaqItemRecord[],
  latestUserMessage: string,
  task?: FaqWorkerTask,
): FaqAnswerResult {
  const redirectFallback = composeRedirectFallbackAnswer(task);
  if (redirectFallback) {
    return redirectFallback;
  }

  const sourceItems = details.length > 0 ? details : matches;
  const citedFaqIds = dedupeFaqIds(sourceItems.map((item) => item.id)).slice(0, 3);

  if (sourceItems.length === 0) {
    return {
      answer: `I can help with that, but I could not find an exact FAQ answer yet for "${clampText(latestUserMessage, 120)}".`,
      citedFaqIds: [],
      confidence: 'low',
    };
  }

  if (sourceItems.length === 1) {
    const firstItem = sourceItems[0];
    if (!firstItem) {
      return {
        answer: `I can help with that, but I could not find an exact FAQ answer yet for "${clampText(latestUserMessage, 120)}".`,
        citedFaqIds: [],
        confidence: 'low',
      };
    }

    return {
      answer: `I can help with that. ${firstItem.answer}`,
      citedFaqIds,
      confidence: 'medium',
    };
  }

  const summaries = sourceItems
    .slice(0, 2)
    .map((item) => `${item.question}: ${item.answer}`);

  return {
    answer: `I can help with that. Here are the closest FAQ answers: ${summaries.join(' ')}`,
    citedFaqIds,
    confidence: 'medium',
  };
}

function composeRedirectFallbackAnswer(task: FaqWorkerTask | undefined): FaqAnswerResult | null {
  if (!task?.responseMode || task.responseMode === 'standard') {
    return null;
  }

  if (task.responseMode === 'safe_medical_redirect') {
    return {
      answer: [
        'I cannot diagnose, choose treatment, recommend medication, or guarantee an outcome here.',
        'Medora can help arrange a records-based doctor or hospital review in China so the right clinical team can assess the case.',
        'If symptoms are urgent or worsening, please seek local emergency care now. A safe next step is to share available records for review.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  if (task.responseMode === 'out_of_scope_redirect') {
    return {
      answer: [
        'That request is outside Medora\'s current medical travel support scope.',
        'Medora mainly helps international patients with doctor matching in China, medical record preparation, online consultation, hospital coordination, and treatment-related travel support.',
        'If your goal is care in China, I can help explain the next medical step.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  return {
    answer: 'That is completely okay. Medora can continue from the current step whenever you are ready, or I can explain the cost, records, or contact options more clearly.',
    citedFaqIds: [],
    confidence: 'medium',
    policyGrounded: true,
  };
}

function buildFallbackFaqPlan(input: FaqPlanInput): FaqPlan {
  const latestUserMessage = normalizeString(input.task.latestUserMessage);
  return {
    query: latestUserMessage ?? 'faq question',
    reason: 'fallback faq plan derived from latest user message',
  };
}

function sanitizeFaqPlan(
  raw: unknown,
  fallback: FaqPlan,
): {
  plan: FaqPlan;
  fallbackUsed: boolean;
  schemaValidationFailed: boolean;
} {
  const record = asRecord(raw);
  const normalizedQuery = normalizeString(record.query);
  const normalizedReason = normalizeString(record.reason);
  const category = normalizeString(record.category) ?? undefined;
  const query = normalizedQuery ?? fallback.query;
  const reason = normalizedReason ?? fallback.reason;
  const fallbackUsed = normalizedQuery === null || normalizedReason === null;

  return {
    plan: {
      ...(category ? { category } : {}),
      query,
      reason,
    },
    fallbackUsed,
    schemaValidationFailed: fallbackUsed,
  };
}

function sanitizeFaqAnswerResult(
  raw: unknown,
  fallback: FaqAnswerResult,
): {
  answer: FaqAnswerResult;
  fallbackUsed: boolean;
  schemaValidationFailed: boolean;
} {
  const record = asRecord(raw);
  if (fallback.policyGrounded === true) {
    return {
      answer: fallback,
      fallbackUsed: true,
      schemaValidationFailed: true,
    };
  }

  const normalizedAnswer = normalizeString(record.answer);
  const answer = normalizedAnswer ?? fallback.answer;
  const citedFaqIds = sanitizeFaqIds(record.citedFaqIds);
  const normalizedConfidence = normalizeConfidence(record.confidence);
  const confidence = normalizedConfidence ?? fallback.confidence;
  const normalizedIds = citedFaqIds.length > 0 ? citedFaqIds : fallback.citedFaqIds;
  const hasInvalidFaqIds = hasInvalidCitedFaqIds(record.citedFaqIds);
  const fallbackUsed = normalizedAnswer === null || normalizedConfidence === null || hasInvalidFaqIds;

  return {
    answer: {
      answer,
      citedFaqIds: normalizedIds,
      confidence,
    },
    fallbackUsed,
    schemaValidationFailed: fallbackUsed,
  };
}

function hasInvalidCitedFaqIds(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }

  if (!Array.isArray(value)) {
    return true;
  }

  return value.some((candidate) => typeof candidate !== 'string' || candidate.trim().length === 0);
}

function sanitizeFaqIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeFaqIds(
    value
      .filter((candidate): candidate is string => typeof candidate === 'string')
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0),
  );
}

function dedupeFaqIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function normalizeConfidence(value: unknown): FaqAnswerResult['confidence'] | null {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? clampText(trimmed, 240) : null;
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
