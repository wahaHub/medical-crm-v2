import { RecordsLlmAdapter } from './records-llm-adapter.js';
import {
  buildRecordsWorkerPrompt,
  RECORDS_COLLECTION_PROMPT_VERSION,
  RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION,
} from './records-prompts.js';

type FetchLike = typeof fetch;

interface CreateChatbotV3RecordsRouteAdapterOptions {
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

type OpenAiChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export function createChatbotV3RecordsRouteAdapter(
  options: CreateChatbotV3RecordsRouteAdapterOptions = {},
): RecordsLlmAdapter {
  const enabled = options.enabled ?? process.env['CHATBOT_V3_RECORDS_LLM_ENABLED'] === 'true';
  const apiKey = options.apiKey?.trim() ?? process.env['OPENAI_API_KEY']?.trim() ?? '';
  const model = options.model?.trim() ?? process.env['CHATBOT_V3_RECORDS_LLM_MODEL']?.trim() ?? 'gpt-4o-mini';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs ?? Number.parseInt(
    process.env['CHATBOT_V3_RECORDS_LLM_TIMEOUT_MS'] ?? '3000',
    10,
  ));

  if (!enabled || apiKey.length === 0 || typeof fetchImpl !== 'function') {
    return new RecordsLlmAdapter();
  }

  return new RecordsLlmAdapter({
    promptVersionByMode: {
      minimal_triage: `${RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION}:openai`,
      medical_collection: `${RECORDS_COLLECTION_PROMPT_VERSION}:openai`,
    },
    worker: {
      promptVersion: 'records-openai',
      model,
      run: async (input) => runStructuredOpenAiPrompt({
        apiKey,
        model,
        fetchImpl,
        timeoutMs,
        prompt: buildRecordsWorkerPrompt(input.task),
      }),
    },
  });
}

async function runStructuredOpenAiPrompt(input: {
  apiKey: string;
  model: string;
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
    response = await input.fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
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
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`records route llm request failed with status ${response.status}`);
  }

  const payload = await response.json() as OpenAiChatCompletionsResponse;
  const content = payload.choices?.[0]?.message?.content;
  const parsed = parseStructuredResponse(content);
  if (!parsed) {
    throw new Error('records route llm returned non-json content');
  }
  return parsed;
}

function parseStructuredResponse(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function normalizeTimeoutMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 3000;
}
