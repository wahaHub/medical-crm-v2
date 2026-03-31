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

export interface DifyDocumentMetadataSyncRequest {
  datasetId: string;
  documentId: string;
  metadata: Record<string, string | number | null>;
}

type DifyMetadataType = 'string' | 'number' | 'time';

interface DifyMetadataDefinition {
  id: string;
  name: string;
  type: DifyMetadataType;
}

export class DifyApiClientService {
  private readonly datasetMetadataCache = new Map<string, Map<string, DifyMetadataDefinition>>();

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 30_000,
    private readonly datasetApiKey: string | null = null,
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
      apiKey: this.getDatasetApiKey(),
      body: JSON.stringify({
        name: request.name,
        text: request.text,
        doc_form: 'text_model',
        doc_language: 'English',
        indexing_technique: 'economy',
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
      apiKey: this.getDatasetApiKey(),
      body: JSON.stringify({
        name: request.name,
        text: request.text,
      }),
    });
  }

  async syncDocumentMetadata(request: DifyDocumentMetadataSyncRequest): Promise<void> {
    const metadataDefinitions = await this.ensureMetadataDefinitions(request.datasetId, request.metadata);
    const metadataList = Object.entries(request.metadata).map(([name, value]) => {
      const definition = metadataDefinitions.get(name);
      if (!definition) {
        throw new Error(`Dify metadata definition missing for ${name}`);
      }

      return {
        id: definition.id,
        name,
        value,
      };
    });

    await this.requestJson(`/datasets/${request.datasetId}/documents/metadata`, {
      method: 'POST',
      apiKey: this.getDatasetApiKey(),
      body: JSON.stringify({
        operation_data: [{
          document_id: request.documentId,
          metadata_list: metadataList,
          partial_update: true,
        }],
      }),
    });
  }

  async deleteDocument(input: { datasetId: string; documentId: string }): Promise<void> {
    await this.requestJson(`/datasets/${input.datasetId}/documents/${input.documentId}`, {
      method: 'DELETE',
      apiKey: this.getDatasetApiKey(),
    });
  }

  private getDatasetApiKey(): string {
    return this.datasetApiKey && this.datasetApiKey.length > 0
      ? this.datasetApiKey
      : this.apiKey;
  }

  private async ensureMetadataDefinitions(
    datasetId: string,
    metadata: Record<string, string | number | null>,
  ): Promise<Map<string, DifyMetadataDefinition>> {
    let definitions = this.datasetMetadataCache.get(datasetId);
    if (!definitions) {
      definitions = await this.refreshMetadataDefinitions(datasetId);
    }

    for (const [name, value] of Object.entries(metadata)) {
      const expectedType = resolveMetadataType(value);
      const existing = definitions.get(name);
      if (existing) {
        if (existing.type !== expectedType) {
          throw new Error(`Dify metadata ${name} already exists with type ${existing.type}`);
        }
        continue;
      }

      try {
        const created = await this.createMetadataDefinition(datasetId, name, expectedType);
        definitions.set(created.name, created);
      } catch (error) {
        definitions = await this.refreshMetadataDefinitions(datasetId);
        const refreshed = definitions.get(name);
        if (refreshed) {
          if (refreshed.type !== expectedType) {
            throw new Error(`Dify metadata ${name} already exists with type ${refreshed.type}`);
          }
          continue;
        }
        throw error;
      }
    }

    return definitions;
  }

  private async refreshMetadataDefinitions(datasetId: string): Promise<Map<string, DifyMetadataDefinition>> {
    const definitions = await this.listMetadataDefinitions(datasetId);
    this.datasetMetadataCache.set(datasetId, definitions);
    return definitions;
  }

  private async listMetadataDefinitions(datasetId: string): Promise<Map<string, DifyMetadataDefinition>> {
    const payload = await this.requestJson(`/datasets/${datasetId}/metadata`, {
      method: 'GET',
      apiKey: this.getDatasetApiKey(),
    });

    return new Map(
      readMetadataDefinitions(payload).map((definition) => [definition.name, definition]),
    );
  }

  private async createMetadataDefinition(
    datasetId: string,
    name: string,
    type: DifyMetadataType,
  ): Promise<DifyMetadataDefinition> {
    const payload = await this.requestJson(`/datasets/${datasetId}/metadata`, {
      method: 'POST',
      apiKey: this.getDatasetApiKey(),
      body: JSON.stringify({ name, type }),
    });

    const definition = readMetadataDefinition(payload);
    if (!definition) {
      throw new Error(`Dify create metadata response did not include metadata definition for ${name}`);
    }

    return definition;
  }

  private async requestJson(path: string, init: RequestInit & { apiKey?: string }): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const { apiKey, ...fetchInit } = init;

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        ...fetchInit,
        headers: {
          Authorization: `Bearer ${apiKey ?? this.apiKey}`,
          'Content-Type': 'application/json',
          ...(fetchInit.headers ?? {}),
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

function readMetadataDefinitions(payload: Record<string, unknown>): DifyMetadataDefinition[] {
  const direct = readMetadataDefinitionArray(payload.doc_metadata);
  if (direct.length > 0) {
    return direct;
  }

  const data = payload.data;
  if (data && typeof data === 'object') {
    const nested = readMetadataDefinitionArray((data as Record<string, unknown>).doc_metadata);
    if (nested.length > 0) {
      return nested;
    }
  }

  return [];
}

function readMetadataDefinition(payload: Record<string, unknown>): DifyMetadataDefinition | null {
  const direct = readMetadataDefinitionRecord(payload);
  if (direct) {
    return direct;
  }

  const data = payload.data;
  if (data && typeof data === 'object') {
    return readMetadataDefinitionRecord(data as Record<string, unknown>);
  }

  return null;
}

function readMetadataDefinitionArray(value: unknown): DifyMetadataDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readMetadataDefinitionRecord(item))
    .filter((item): item is DifyMetadataDefinition => item !== null);
}

function readMetadataDefinitionRecord(value: unknown): DifyMetadataDefinition | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  const name = typeof record.name === 'string' ? record.name : null;
  const type = record.type;

  if (!id || !name || (type !== 'string' && type !== 'number' && type !== 'time')) {
    return null;
  }

  return { id, name, type };
}

function resolveMetadataType(value: string | number | null): DifyMetadataType {
  if (typeof value === 'number') {
    return 'number';
  }

  return 'string';
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown> | { message?: string }> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  return JSON.parse(text) as Record<string, unknown> | { message?: string };
}
