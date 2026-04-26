import type {
  LlmNodeAdapter,
  SupervisorGatewayInput,
} from '@medical-crm/application';
import {
  buildSupervisorPrompt,
  SUPERVISOR_PROMPT_VERSION,
} from './supervisor-prompt.js';
import {
  buildChatbotV3LlmRequestFailure,
  parseStructuredOpenAiJsonResponse,
} from './llm-route-error.js';

type FetchLike = typeof fetch;

interface CreateChatbotV3SupervisorRouteAdapterOptions {
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  reasoningEffort?: string;
}

export function createChatbotV3SupervisorRouteAdapter(
  options: CreateChatbotV3SupervisorRouteAdapterOptions = {},
): LlmNodeAdapter<SupervisorGatewayInput, unknown> | undefined {
  const enabled = options.enabled ?? process.env['CHATBOT_V3_SUPERVISOR_LLM_ENABLED'] === 'true';
  const apiKey = options.apiKey?.trim() ?? process.env['OPENAI_API_KEY']?.trim() ?? '';
  const model = options.model?.trim() ?? process.env['CHATBOT_V3_SUPERVISOR_LLM_MODEL']?.trim() ?? 'gpt-4o-mini';
  const reasoningEffort = normalizeReasoningEffort(
    options.reasoningEffort ?? process.env['CHATBOT_V3_SUPERVISOR_LLM_REASONING_EFFORT'],
  );
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs ?? Number.parseInt(
    process.env['CHATBOT_V3_SUPERVISOR_LLM_TIMEOUT_MS'] ?? '3000',
    10,
  ));

  if (!enabled || apiKey.length === 0 || typeof fetchImpl !== 'function') {
    return undefined;
  }

  return {
    promptVersion: `${SUPERVISOR_PROMPT_VERSION}:openai`,
    model,
    run: async (input) => runStructuredOpenAiPrompt({
      apiKey,
      model,
      reasoningEffort,
      fetchImpl,
      timeoutMs,
      prompt: buildSupervisorPrompt(input),
    }),
  };
}

async function runStructuredOpenAiPrompt(input: {
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
  prompt: string;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs);

  let response: Response;
  try {
    try {
      response = await input.fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: input.model,
          ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'system',
              content: 'Return a single JSON object only. Do not include markdown fences or commentary.',
            },
            {
              role: 'user',
              content: input.prompt,
            },
          ],
        }),
      });
    } catch (error) {
      throw buildChatbotV3LlmRequestFailure('supervisor route llm', error);
    }
  } finally {
    clearTimeout(timeout);
  }

  return parseStructuredOpenAiJsonResponse(response, 'supervisor route llm');
}

function normalizeTimeoutMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 3000;
}

function normalizeReasoningEffort(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'none'
    || normalized === 'minimal'
    || normalized === 'low'
    || normalized === 'medium'
    || normalized === 'high'
    ? normalized
    : undefined;
}
