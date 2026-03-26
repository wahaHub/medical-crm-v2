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

export interface DifyDocumentUpsertRequest {
  datasetId: string;
  name: string;
  text: string;
}

export interface DifyDocumentUpdateRequest extends DifyDocumentUpsertRequest {
  documentId: string;
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

  async createDocumentByText(request: DifyDocumentUpsertRequest): Promise<{ documentId: string }> {
    const payload = await this.requestJson(`/datasets/${request.datasetId}/document/create_by_text`, {
      method: 'POST',
      body: JSON.stringify({
        name: request.name,
        text: request.text,
      }),
    });

    const documentId = readDocumentId(payload);
    if (!documentId) {
      throw new Error('Dify create document response did not include document id');
    }

    return { documentId };
  }

  async updateDocumentByText(request: DifyDocumentUpdateRequest): Promise<void> {
    await this.requestJson(`/datasets/${request.datasetId}/documents/${request.documentId}/update_by_text`, {
      method: 'POST',
      body: JSON.stringify({
        name: request.name,
        text: request.text,
      }),
    });
  }

  async deleteDocument(input: { datasetId: string; documentId: string }): Promise<void> {
    await this.requestJson(`/datasets/${input.datasetId}/documents/${input.documentId}`, {
      method: 'DELETE',
    });
  }

  private async requestJson(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      const payload = await readJsonResponse(response);
      if (!response.ok) {
        const message = 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : `Dify request failed with status ${response.status}`;
        throw new Error(message);
      }

      return payload as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readDocumentId(payload: Record<string, unknown>): string | null {
  const direct = typeof payload.document_id === 'string' ? payload.document_id : null;
  if (direct) return direct;

  const data = payload.data;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.document_id === 'string') return record.document_id;
    if (Array.isArray(record.document_ids) && typeof record.document_ids[0] === 'string') {
      return record.document_ids[0];
    }
  }

  return null;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown> | { message?: string }> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  return JSON.parse(text) as Record<string, unknown> | { message?: string };
}
