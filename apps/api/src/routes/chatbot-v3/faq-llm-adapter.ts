import type { LlmNodeAdapter } from '@medical-crm/application';
import type { FaqItemRecord } from './tool-gateway.js';
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
};

export interface FaqPlanInput {
  taskPrompt: string;
  latestUserMessage: string;
}

export interface FaqAnswerInput {
  taskPrompt: string;
  latestUserMessage: string;
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

  constructor(private readonly options: FaqLlmAdapterOptions = {}) {
    this.planPromptVersion = options.plan?.promptVersion ?? FAQ_PLAN_PROMPT_VERSION;
    this.answerPromptVersion = options.answer?.promptVersion ?? FAQ_ANSWER_PROMPT_VERSION;
  }

  async plan(input: FaqPlanInput): Promise<FaqPlan> {
    buildFaqPlanPrompt(input);
    const fallback = buildFallbackFaqPlan(input);

    if (!this.options.plan) {
      return fallback;
    }

    try {
      const raw = await this.options.plan.run(input);
      return sanitizeFaqPlan(raw, fallback);
    } catch {
      return fallback;
    }
  }

  async answer(input: FaqAnswerInput): Promise<FaqAnswerResult> {
    buildFaqAnswerPrompt(input);
    const fallback = composeFallbackFaqAnswer(input.matches, input.details, input.latestUserMessage);

    if (!this.options.answer) {
      return fallback;
    }

    try {
      const raw = await this.options.answer.run(input);
      return sanitizeFaqAnswerResult(raw, fallback);
    } catch {
      return fallback;
    }
  }
}

export function composeFallbackFaqAnswer(
  matches: FaqItemRecord[],
  details: FaqItemRecord[],
  latestUserMessage: string,
): FaqAnswerResult {
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

function buildFallbackFaqPlan(input: FaqPlanInput): FaqPlan {
  const latestUserMessage = normalizeString(input.latestUserMessage);
  return {
    query: latestUserMessage ?? 'faq question',
    reason: 'fallback faq plan derived from latest user message',
  };
}

function sanitizeFaqPlan(raw: unknown, fallback: FaqPlan): FaqPlan {
  const record = asRecord(raw);
  const query = normalizeString(record.query) ?? fallback.query;
  const reason = normalizeString(record.reason) ?? fallback.reason;
  const category = normalizeString(record.category) ?? undefined;

  return {
    ...(category ? { category } : {}),
    query,
    reason,
  };
}

function sanitizeFaqAnswerResult(raw: unknown, fallback: FaqAnswerResult): FaqAnswerResult {
  const record = asRecord(raw);
  const answer = normalizeString(record.answer) ?? fallback.answer;
  const citedFaqIds = sanitizeFaqIds(record.citedFaqIds);
  const confidence = normalizeConfidence(record.confidence) ?? fallback.confidence;

  return {
    answer,
    citedFaqIds: citedFaqIds.length > 0 ? citedFaqIds : fallback.citedFaqIds,
    confidence,
  };
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
