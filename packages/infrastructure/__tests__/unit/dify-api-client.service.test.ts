import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DifyApiClientService } from '../../services/dify-api-client.service.js';

function mockResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
  } as unknown as Response;
}

describe('DifyApiClientService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let service: DifyApiClientService;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    service = new DifyApiClientService('https://dify.test/', 'test-api-key', 1_000);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createChatMessage', () => {
    it('posts a blocking chat message with the expected payload', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          answer: 'Hello',
          conversation_id: 'conv-1',
        }),
      );

      await service.createChatMessage({
        inputs: { foo: 'bar' },
        query: 'What is the status?',
        user: 'user-123',
        conversationId: 'conv-456',
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dify.test/chat-messages');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(init?.body as string) as {
        inputs: Record<string, unknown>;
        query: string;
        user: string;
        response_mode: string;
        conversation_id: string;
      };
      expect(body).toEqual({
        inputs: { foo: 'bar' },
        query: 'What is the status?',
        user: 'user-123',
        response_mode: 'blocking',
        conversation_id: 'conv-456',
      });
    });

    it('passes through policy-friendly session metadata in inputs', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { answer: 'Hello' }));

      await service.createChatMessage({
        inputs: {
          hospitalType: 'COSMETIC',
          sessionId: 'session-1',
          currentStatus: {
            recommendationStatus: 'NOT_STARTED',
            docUploadStatus: 'NONE',
          },
          conversationSummary: 'User is exploring rhinoplasty.',
        },
        query: 'What should I do next?',
        user: 'session-1',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init?.body as string) as {
        inputs: Record<string, unknown>;
      };

      expect(body.inputs).toEqual({
        hospitalType: 'COSMETIC',
        sessionId: 'session-1',
        currentStatus: {
          recommendationStatus: 'NOT_STARTED',
          docUploadStatus: 'NONE',
        },
        conversationSummary: 'User is exploring rhinoplasty.',
      });
    });

    it('surfaces Dify error messages from non-2xx responses', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(400, {
          message: 'Invalid conversation id',
        }),
      );

      await expect(
        service.createChatMessage({
          query: 'Hello',
          user: 'user-123',
        }),
      ).rejects.toThrow('Invalid conversation id');
    });

    it('defaults inputs to an empty object and omits conversation_id when absent', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { answer: 'Hello' }));

      await service.createChatMessage({
        query: 'Hello',
        user: 'user-123',
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dify.test/chat-messages');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(init?.body as string) as {
        inputs: Record<string, unknown>;
        query: string;
        user: string;
        response_mode: string;
        conversation_id?: string;
      };
      expect(body.inputs).toEqual({});
      expect(body).not.toHaveProperty('conversation_id');
    });
  });

  describe('createDocumentByText', () => {
    it('uses the dataset API key for dataset requests when provided', async () => {
      service = new DifyApiClientService('https://dify.test/', 'chat-api-key', 1_000, 'dataset-api-key');
      fetchMock.mockResolvedValueOnce(mockResponse(200, { document_id: 'doc-1' }));

      await service.createDocumentByText({
        datasetId: 'dataset-1',
        name: 'Knowledge Base',
        text: 'Hello world',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer dataset-api-key',
      });
    });

    it.each([
      {
        name: 'top-level document_id',
        payload: { document_id: 'doc-1' },
        expectedId: 'doc-1',
      },
      {
        name: 'nested data.document_id',
        payload: { data: { document_id: 'doc-2' } },
        expectedId: 'doc-2',
      },
      {
        name: 'nested data.document_ids[0]',
        payload: { data: { document_ids: ['doc-3', 'doc-4'] } },
        expectedId: 'doc-3',
      },
      {
        name: 'payload.document.id',
        payload: { document: { id: 'doc-5' } },
        expectedId: 'doc-5',
      },
    ])('extracts document id from $name', async ({ payload, expectedId }) => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, payload));

      await expect(
        service.createDocumentByText({
          datasetId: 'dataset-1',
          name: 'Knowledge Base',
          text: 'Hello world',
        }),
      ).resolves.toEqual({ documentId: expectedId });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dify.test/datasets/dataset-1/document/create_by_text');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(init?.body as string)).toEqual({
        name: 'Knowledge Base',
        text: 'Hello world',
        doc_form: 'text_model',
        doc_language: 'English',
        indexing_technique: 'economy',
      });
    });

    it('throws when no document id is returned', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { data: {} }));

      await expect(
        service.createDocumentByText({
          datasetId: 'dataset-1',
          name: 'Knowledge Base',
          text: 'Hello world',
        }),
      ).rejects.toThrow('Dify create document response did not include document id');
    });
  });

  describe('updateDocumentByText', () => {
    it('uses the dataset API key for document updates when provided', async () => {
      service = new DifyApiClientService('https://dify.test/', 'chat-api-key', 1_000, 'dataset-api-key');
      fetchMock.mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));

      await service.updateDocumentByText({
        datasetId: 'dataset-1',
        documentId: 'doc-9',
        name: 'Updated title',
        text: 'Updated text',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer dataset-api-key',
      });
    });

    it('posts to the expected update endpoint', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));

      await service.updateDocumentByText({
        datasetId: 'dataset-1',
        documentId: 'doc-9',
        name: 'Updated title',
        text: 'Updated text',
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dify.test/datasets/dataset-1/documents/doc-9/update_by_text');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(init?.body as string)).toEqual({
        name: 'Updated title',
        text: 'Updated text',
      });
    });
  });

  describe('syncDocumentMetadata', () => {
    it('refreshes metadata definitions after a create conflict and reuses the discovered field id', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, { doc_metadata: [] }))
        .mockResolvedValueOnce(mockResponse(409, { message: 'Metadata already exists' }))
        .mockResolvedValueOnce(mockResponse(200, {
          doc_metadata: [{ id: 'meta-1', name: 'faq_id', type: 'string' }],
        }))
        .mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));

      await expect(
        service.syncDocumentMetadata({
          datasetId: 'dataset-1',
          documentId: 'doc-9',
          metadata: { faq_id: 'faq-1' },
        }),
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://dify.test/datasets/dataset-1/metadata');
      expect(fetchMock.mock.calls[1]?.[0]).toBe('https://dify.test/datasets/dataset-1/metadata');
      expect(fetchMock.mock.calls[2]?.[0]).toBe('https://dify.test/datasets/dataset-1/metadata');
      expect(fetchMock.mock.calls[3]?.[0]).toBe('https://dify.test/datasets/dataset-1/documents/metadata');
      expect(JSON.parse(fetchMock.mock.calls[3]?.[1]?.body as string)).toEqual({
        operation_data: [{
          document_id: 'doc-9',
          metadata_list: [{
            id: 'meta-1',
            name: 'faq_id',
            value: 'faq-1',
          }],
          partial_update: true,
        }],
      });
    });
  });

  describe('deleteDocument', () => {
    it('uses the dataset API key for document deletes when provided', async () => {
      service = new DifyApiClientService('https://dify.test/', 'chat-api-key', 1_000, 'dataset-api-key');
      fetchMock.mockResolvedValueOnce(mockResponse(204, ''));

      await service.deleteDocument({
        datasetId: 'dataset-1',
        documentId: 'doc-9',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer dataset-api-key',
      });
    });

    it('sends a DELETE request to the document endpoint', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(204, ''));

      await service.deleteDocument({
        datasetId: 'dataset-1',
        documentId: 'doc-9',
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dify.test/datasets/dataset-1/documents/doc-9');
      expect(init?.method).toBe('DELETE');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      });
    });
  });
});
