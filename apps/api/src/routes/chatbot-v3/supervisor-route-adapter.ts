import type {
  LlmNodeAdapter,
  SupervisorEvent,
  SupervisorEventModifier,
  SupervisorEventTarget,
  SupervisorEventType,
  SupervisorGatewayInput,
} from '@medical-crm/application';
import {
  SUPERVISOR_EVENT_MODIFIERS,
  SUPERVISOR_EVENT_TARGETS,
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
  summarizeChatbotV3LlmError,
} from './llm-route-error.js';
import type { ChatbotV3LlmFailureMetadata } from './llm-route-error.js';

type FetchLike = typeof fetch;
type SupervisorRouteAdapter = LlmNodeAdapter<SupervisorGatewayInput, SupervisorEvent> & {
  runWithLlmMetadata(input: SupervisorGatewayInput): Promise<{
    output: SupervisorEvent;
    llmRunMetadata: ChatbotV3LlmFailureMetadata | null;
  }>;
};

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
      required: ['eventType', 'target', 'modifier', 'confidence'],
      properties: {
        eventType: {
          type: 'string',
          enum: allowedEvents,
        },
        target: {
          type: 'string',
          enum: SUPERVISOR_EVENT_TARGETS,
        },
        modifier: {
          type: 'string',
          enum: SUPERVISOR_EVENT_MODIFIERS,
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
      },
    },
  } as const;
}

const SUPERVISOR_EVENT_TOP_LEVEL_KEYS = new Set(['eventType', 'target', 'modifier', 'confidence']);

export function createChatbotV3SupervisorRouteAdapter(
  options: CreateChatbotV3SupervisorRouteAdapterOptions = {},
): SupervisorRouteAdapter | undefined {
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
      return (await runSupervisorRoute(input)).output;
    },
    runWithLlmMetadata: runSupervisorRoute,
  };

  async function runSupervisorRoute(input: SupervisorGatewayInput): Promise<{
    output: SupervisorEvent;
    llmRunMetadata: ChatbotV3LlmFailureMetadata | null;
  }> {
    const allowedEvents = getAllowedSupervisorEvents(input);
    const result = await runStructuredOpenAiPrompt({
      apiKey,
      model,
      reasoningEffort,
      fetchImpl,
      timeoutMs,
      prompt: buildSupervisorPrompt(input),
      allowedEvents,
    });
    return {
      output: result.event,
      llmRunMetadata: result.llmFailureMetadata,
    };
  }
}

async function runStructuredOpenAiPrompt(input: {
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
  prompt: string;
  allowedEvents: readonly SupervisorEventType[];
}): Promise<{
  event: SupervisorEvent;
  llmFailureMetadata: ChatbotV3LlmFailureMetadata | null;
}> {
  const maxAttempts = 2;
  let lastFallback = buildFallbackUnknownEvent('supervisor route llm returned invalid SupervisorEvent schema');
  let lastLlmFailureMetadata: ChatbotV3LlmFailureMetadata | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await runStructuredOpenAiPromptAttempt(input);
      if (result.event.source !== 'fallback_unknown') {
        return result;
      }
      lastFallback = result.event;
      lastLlmFailureMetadata = result.llmFailureMetadata;
    } catch (error) {
      lastLlmFailureMetadata = summarizeChatbotV3LlmError(error);
      lastFallback = buildFallbackUnknownEvent(
        error instanceof Error ? error.message : 'supervisor route llm request failed',
      );
    }
  }

  return {
    event: lastFallback,
    llmFailureMetadata: lastLlmFailureMetadata,
  };
}

async function runStructuredOpenAiPromptAttempt(input: {
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
  prompt: string;
  allowedEvents: readonly SupervisorEventType[];
}): Promise<{
  event: SupervisorEvent;
  llmFailureMetadata: ChatbotV3LlmFailureMetadata | null;
}> {
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
  } catch (error) {
    return {
      event: buildFallbackUnknownEvent('supervisor route llm returned invalid SupervisorEvent schema'),
      llmFailureMetadata: summarizeChatbotV3LlmError(error),
    };
  }

  return {
    event: sanitizeSupervisorEvent(parsed, input.allowedEvents),
    llmFailureMetadata: null,
  };
}

/*
 * Keep the OpenAI response schema and SupervisorEvent sanitizer authority-only.
 * LLM transport/parsing failures are exposed through runWithLlmMetadata().
 */
function sanitizeSupervisorEvent(
  raw: Record<string, unknown>,
  allowedEvents: readonly SupervisorEventType[],
): SupervisorEvent {
  const hasOnlyEventKeys = Object.keys(raw).every((key) => SUPERVISOR_EVENT_TOP_LEVEL_KEYS.has(key));
  if (
    !hasOnlyEventKeys
    || !isSupervisorEventType(raw.eventType)
    || !allowedEvents.includes(raw.eventType)
    || !isSupervisorEventTarget(raw.target)
    || !isSupervisorEventModifier(raw.modifier)
    || typeof raw.confidence !== 'number'
    || !Number.isFinite(raw.confidence)
    || raw.confidence < 0
    || raw.confidence > 1
  ) {
    return buildFallbackUnknownEvent('supervisor route llm returned invalid SupervisorEvent schema');
  }

  return {
    eventType: raw.eventType,
    target: raw.target,
    modifier: raw.modifier,
    confidence: raw.confidence,
    source: 'llm',
  };
}

function isSupervisorEventType(value: unknown): value is SupervisorEvent['eventType'] {
  return typeof value === 'string' && (SUPERVISOR_EVENT_TYPES as readonly string[]).includes(value);
}

function buildFallbackUnknownEvent(rawText: string): SupervisorEvent {
  return {
    eventType: 'USER_MESSAGE_UNCLEAR',
    target: 'unknown',
    modifier: 'unknown',
    confidence: 0,
    source: 'fallback_unknown',
    metadata: { rawText },
  };
}

function isSupervisorEventTarget(value: unknown): value is SupervisorEventTarget {
  return typeof value === 'string' && (SUPERVISOR_EVENT_TARGETS as readonly string[]).includes(value);
}

function isSupervisorEventModifier(value: unknown): value is SupervisorEventModifier {
  return typeof value === 'string' && (SUPERVISOR_EVENT_MODIFIERS as readonly string[]).includes(value);
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
