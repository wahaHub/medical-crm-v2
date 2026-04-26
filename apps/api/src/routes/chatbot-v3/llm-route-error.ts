export type ChatbotV3LlmFailurePhase =
  | 'request'
  | 'http_status'
  | 'response_json'
  | 'response_content';

export interface ChatbotV3LlmFailureMetadata {
  llmFailurePhase?: ChatbotV3LlmFailurePhase;
  llmErrorName?: string;
  llmErrorMessage?: string;
  llmHttpStatus?: number;
  llmResponseContentLength?: number;
  llmResponseContentStartsWithBrace?: boolean;
}

export class ChatbotV3LlmRouteError extends Error {
  readonly name = 'ChatbotV3LlmRouteError';

  constructor(
    message: string,
    readonly metadata: ChatbotV3LlmFailureMetadata = {},
  ) {
    super(message);
  }
}

export function buildChatbotV3LlmRequestFailure(
  requestLabel: string,
  error: unknown,
): ChatbotV3LlmRouteError {
  return new ChatbotV3LlmRouteError(
    `${requestLabel} request failed before a usable response was returned`,
    {
      llmFailurePhase: 'request',
      llmErrorName: error instanceof Error ? clampString(error.name, 80) : 'RequestError',
      llmErrorMessage: error instanceof Error
        ? clampString(error.message, 240)
        : `${requestLabel} request failed before a usable response was returned`,
    },
  );
}

export async function parseStructuredOpenAiJsonResponse(
  response: Response,
  requestLabel: string,
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new ChatbotV3LlmRouteError(
      `${requestLabel} request failed with status ${response.status}`,
      {
        llmFailurePhase: 'http_status',
        llmErrorName: 'UpstreamHttpError',
        llmErrorMessage: `${requestLabel} request failed with status ${response.status}`,
        llmHttpStatus: response.status,
      },
    );
  }

  let payload: {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  try {
    payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };
  } catch (error) {
    throw new ChatbotV3LlmRouteError(
      `${requestLabel} returned an unreadable json payload`,
      {
        llmFailurePhase: 'response_json',
        llmErrorName: error instanceof Error ? clampString(error.name, 80) : 'ResponseJsonError',
        llmErrorMessage: error instanceof Error
          ? clampString(error.message, 240)
          : `${requestLabel} returned an unreadable json payload`,
      },
    );
  }

  const content = payload.choices?.[0]?.message?.content;
  const parsed = parseStructuredResponse(content);
  if (!parsed) {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    throw new ChatbotV3LlmRouteError(
      `${requestLabel} returned non-json content`,
      {
        llmFailurePhase: 'response_content',
        llmErrorName: 'NonJsonContentError',
        llmErrorMessage: `${requestLabel} returned non-json content`,
        llmResponseContentLength: typeof content === 'string' ? content.length : 0,
        llmResponseContentStartsWithBrace: trimmed.startsWith('{'),
      },
    );
  }

  return parsed;
}

export function summarizeChatbotV3LlmError(error: unknown): ChatbotV3LlmFailureMetadata {
  if (error instanceof ChatbotV3LlmRouteError) {
    return error.metadata;
  }

  if (error instanceof Error) {
    return {
      llmFailurePhase: 'request',
      llmErrorName: clampString(error.name, 80),
      llmErrorMessage: clampString(error.message, 240),
    };
  }

  return {
    llmFailurePhase: 'request',
    llmErrorName: 'UnknownError',
    llmErrorMessage: 'Unknown LLM route failure',
  };
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

function clampString(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1))}...`;
}
