import type {
  LlmNodeAdapter,
  SupervisorEvent,
  SupervisorEventType,
  SupervisorGatewayInput,
} from '@medical-crm/application';
import {
  SUPERVISOR_EVENT_TYPES,
} from '@medical-crm/application';
import {
  buildSupervisorPrompt,
  getAllowedSupervisorEvents,
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

function buildSupervisorEventResponseFormat(allowedEvents: readonly SupervisorEventType[]) {
  return {
    name: 'chatbot_v3_supervisor_event',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['eventType', 'confidence', 'source'],
      properties: {
        eventType: {
          type: 'string',
          enum: allowedEvents,
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        source: {
          type: 'string',
          enum: ['llm'],
        },
      },
    },
  } as const;
}

const SUPERVISOR_EVENT_TOP_LEVEL_KEYS = new Set(['eventType', 'confidence', 'source']);

export function createChatbotV3SupervisorRouteAdapter(
  options: CreateChatbotV3SupervisorRouteAdapterOptions = {},
): LlmNodeAdapter<SupervisorGatewayInput, SupervisorEvent> | undefined {
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
    run: async (input) => {
      const allowedEvents = getAllowedSupervisorEvents(input);
      return runStructuredOpenAiPrompt({
        apiKey,
        model,
        reasoningEffort,
        fetchImpl,
        timeoutMs,
        prompt: buildSupervisorPrompt(input),
        allowedEvents,
      });
    },
  };
}

async function runStructuredOpenAiPrompt(input: {
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
  prompt: string;
  allowedEvents: readonly SupervisorEventType[];
}): Promise<SupervisorEvent> {
  const maxAttempts = 2;
  let lastFallback = buildFallbackUnknownEvent('supervisor route llm returned invalid SupervisorEvent schema');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const event = await runStructuredOpenAiPromptAttempt(input);
      if (event.source !== 'fallback_unknown') {
        return event;
      }
      lastFallback = event;
    } catch (error) {
      lastFallback = buildFallbackUnknownEvent(
        error instanceof Error ? error.message : 'supervisor route llm request failed',
      );
    }
  }

  return lastFallback;
}

async function runStructuredOpenAiPromptAttempt(input: {
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
  prompt: string;
  allowedEvents: readonly SupervisorEventType[];
}): Promise<SupervisorEvent> {
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
            type: 'json_schema',
            json_schema: buildSupervisorEventResponseFormat(input.allowedEvents),
          },
          messages: [
            {
              role: 'system',
              content: 'Return one valid SupervisorEvent JSON object only.',
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

  let parsed: Record<string, unknown>;
  try {
    parsed = await parseStructuredOpenAiJsonResponse(response, 'supervisor route llm');
  } catch {
    return buildFallbackUnknownEvent('supervisor route llm returned invalid SupervisorEvent schema');
  }

  return sanitizeSupervisorEvent(parsed, input.allowedEvents);
}

function sanitizeSupervisorEvent(
  raw: Record<string, unknown>,
  allowedEvents: readonly SupervisorEventType[],
): SupervisorEvent {
  const hasOnlyEventKeys = Object.keys(raw).every((key) => SUPERVISOR_EVENT_TOP_LEVEL_KEYS.has(key));
  if (
    !hasOnlyEventKeys
    || !isSupervisorEventType(raw.eventType)
    || !allowedEvents.includes(raw.eventType)
    || typeof raw.confidence !== 'number'
    || !Number.isFinite(raw.confidence)
    || raw.confidence < 0
    || raw.confidence > 1
    || raw.source !== 'llm'
  ) {
    return buildFallbackUnknownEvent('supervisor route llm returned invalid SupervisorEvent schema');
  }

  return {
    eventType: raw.eventType,
    confidence: raw.confidence,
    source: raw.source,
  };
}

function isSupervisorEventType(value: unknown): value is SupervisorEvent['eventType'] {
  return typeof value === 'string' && (SUPERVISOR_EVENT_TYPES as readonly string[]).includes(value);
}

function buildFallbackUnknownEvent(rawText: string): SupervisorEvent {
  return {
    eventType: 'UNKNOWN_MESSAGE',
    confidence: 0,
    source: 'fallback_unknown',
    metadata: { rawText },
  };
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
