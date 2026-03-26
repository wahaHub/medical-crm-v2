export interface DifyChatRequest {
  inputs?: Record<string, unknown>;
  query: string;
  user: string;
  conversationId?: string | null;
}

export interface DifyChatResponse {
  answer?: string;
  conversation_id?: string;
  message_id?: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export class DifyApiClientService {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async createChatMessage(request: DifyChatRequest): Promise<DifyChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat-messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: request.inputs ?? {},
          query: request.query,
          user: request.user,
          response_mode: 'blocking',
          conversation_id: request.conversationId ?? undefined,
        }),
        signal: controller.signal,
      });

      const payload = await response.json() as DifyChatResponse | { message?: string };
      if (!response.ok) {
        const message = 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : `Dify request failed with status ${response.status}`;
        throw new Error(message);
      }

      return payload as DifyChatResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}
