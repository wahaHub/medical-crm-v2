import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockServices = {
  createFaqItem: { execute: vi.fn() },
  listFaqItems: { execute: vi.fn() },
  listFaqCategories: { execute: vi.fn() },
  createFaqCategory: { execute: vi.fn() },
  deleteFaqCategory: { execute: vi.fn() },
  getFaqItem: { execute: vi.fn() },
  updateFaqItem: { execute: vi.fn() },
  deleteFaqItem: { execute: vi.fn() },
  mediaUpload: { createUploadIntent: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

import { OpenAPIHono } from '@hono/zod-openapi';
import chatbotFaqRoutes from '../routes/chatbot-faq.routes.js';

type SessionData = {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
};

let currentSession: SessionData = {
  userId: 'u-1',
  email: 'admin@test.com',
  roles: ['ADMIN'],
  hospitalId: null,
};

const app = new OpenAPIHono();

app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});

app.route('/', chatbotFaqRoutes);

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

describe('Chatbot FAQ routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = {
      userId: 'u-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
  });

  it('deletes an FAQ category', async () => {
    mockServices.deleteFaqCategory.execute.mockResolvedValue(undefined);

    const res = await app.request(`/api/v2/chatbot/faqs/categories/${VALID_UUID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);
    expect(mockServices.deleteFaqCategory.execute).toHaveBeenCalled();
  });

  it('deletes an FAQ item', async () => {
    mockServices.deleteFaqItem.execute.mockResolvedValue(undefined);

    const res = await app.request(`/api/v2/chatbot/faqs/${VALID_UUID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);
    expect(mockServices.deleteFaqItem.execute).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // POST /api/v2/chatbot/faqs/{id}/attachments/upload
  // -------------------------------------------------------------------------
  describe('POST /api/v2/chatbot/faqs/:id/attachments/upload', () => {
    const validBody = {
      fileName: 'brochure.pdf',
      fileSize: 512000,
      mimeType: 'application/pdf',
    };

    beforeEach(() => {
      mockServices.getFaqItem.execute.mockResolvedValue({ id: VALID_UUID });
    });

    it('returns 201 with upload URL and asset on success', async () => {
      const uploadIntentResult = {
        uploadUrl: 'https://storage.example.com/upload/brochure.pdf',
        storageKey: 'crm/dev/faqs/faq/faq-1/asset-1/brochure.pdf',
        expiresIn: 600,
        asset: {
          fileName: 'brochure.pdf',
          mimeType: 'application/pdf',
          fileSize: 512000,
          storageKey: 'crm/dev/faqs/faq/faq-1/asset-1/brochure.pdf',
        },
      };
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue(uploadIntentResult);

      const res = await app.request(`/api/v2/chatbot/faqs/${VALID_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(201);
      const json = await res.json() as Record<string, unknown>;
      expect((json.upload as Record<string, unknown>).uploadUrl).toBe(
        'https://storage.example.com/upload/brochure.pdf',
      );
      expect((json.upload as Record<string, unknown>).storageKey).toBe(uploadIntentResult.storageKey);
      expect((json.upload as Record<string, unknown>).expiresIn).toBe(600);
      expect(json.asset).toEqual(uploadIntentResult.asset);
    });

    it('calls getFaqItem to verify access before creating upload intent', async () => {
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue({
        uploadUrl: 'https://storage.example.com/upload/brochure.pdf',
        storageKey: 'key',
        expiresIn: 600,
        asset: {},
      });

      await app.request(`/api/v2/chatbot/faqs/${VALID_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(mockServices.getFaqItem.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
      expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'faq_attachment',
          ownerType: 'faq',
          ownerId: VALID_UUID,
          fileName: 'brochure.pdf',
          fileSize: 512000,
          mimeType: 'application/pdf',
        }),
      );
    });

    it('returns 400 for missing fileName', async () => {
      const res = await app.request(`/api/v2/chatbot/faqs/${VALID_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileSize: 1024, mimeType: 'application/pdf' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });

    it('returns 400 for non-positive fileSize', async () => {
      const res = await app.request(`/api/v2/chatbot/faqs/${VALID_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'brochure.pdf', fileSize: 0, mimeType: 'application/pdf' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid FAQ UUID param', async () => {
      const res = await app.request('/api/v2/chatbot/faqs/not-a-uuid/attachments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });
  });
});
