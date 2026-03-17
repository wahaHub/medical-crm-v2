import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root
// ---------------------------------------------------------------------------
const mockServices = {
  sendMessage: { execute: vi.fn() },
  listMessages: { execute: vi.fn() },
  getMessage: { execute: vi.fn() },
  updateMessage: { execute: vi.fn() },
  deleteMessage: { execute: vi.fn() },
  listPendingReview: { execute: vi.fn() },
  approveMessage: { execute: vi.fn() },
  rejectMessage: { execute: vi.fn() },
  regenerateSummary: { execute: vi.fn() },
  retranslateMessage: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import messageRoutes from '../routes/messages.routes.js';

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

app.route('/', messageRoutes);

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_MSG_ID = '00000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Message routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = {
      userId: 'u-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/conversations/:id/messages
  // -----------------------------------------------------------------------
  describe('GET /api/v2/conversations/:id/messages', () => {
    it('returns 200 with paginated messages', async () => {
      const payload = { data: [], total: 0, page: 1, limit: 50, totalPages: 0, hasMore: false };
      mockServices.listMessages.execute.mockResolvedValue(payload);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages`);
      expect(res.status).toBe(200);
      expect(mockServices.listMessages.execute).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/conversations/:id/messages
  // -----------------------------------------------------------------------
  describe('POST /api/v2/conversations/:id/messages', () => {
    it('sends a message and returns 201', async () => {
      const created = { id: VALID_MSG_ID };
      mockServices.sendMessage.execute.mockResolvedValue(created);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello world' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(created);
      expect(mockServices.sendMessage.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({ content: 'Hello world' }),
        expect.anything(),
      );
    });

    it('rejects empty content', async () => {
      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.sendMessage.execute).not.toHaveBeenCalled();
    });

    it('accepts attachment-only payloads', async () => {
      const created = { id: VALID_MSG_ID };
      mockServices.sendMessage.execute.mockResolvedValue(created);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '',
          messageType: 'FILE',
          attachments: [
            {
              fileName: 'report.pdf',
              fileSize: 1024,
              mimeType: 'application/pdf',
              storageKey: 'messages/conv-1/report.pdf',
            },
          ],
        }),
      });

      expect(res.status).toBe(201);
      expect(mockServices.sendMessage.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({
          content: '',
          messageType: 'FILE',
          attachments: [
            expect.objectContaining({
              fileName: 'report.pdf',
              storageKey: 'messages/conv-1/report.pdf',
            }),
          ],
        }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/conversations/:id/messages/:msgId
  // -----------------------------------------------------------------------
  describe('GET /api/v2/conversations/:id/messages/:msgId', () => {
    it('returns 200 with message detail', async () => {
      const detail = { id: VALID_MSG_ID, content: 'Hello' };
      mockServices.getMessage.execute.mockResolvedValue(detail);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages/${VALID_MSG_ID}`);
      expect(res.status).toBe(200);
      expect(mockServices.getMessage.execute).toHaveBeenCalledWith(VALID_UUID, VALID_MSG_ID, expect.anything());
    });

    it('returns 400 for invalid message UUID', async () => {
      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages/not-a-uuid`);
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/conversations/:id/messages/:msgId
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/conversations/:id/messages/:msgId', () => {
    it('updates a message and returns 200', async () => {
      const updated = { id: VALID_MSG_ID, content: 'Updated' };
      mockServices.updateMessage.execute.mockResolvedValue(updated);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages/${VALID_MSG_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.updateMessage.execute).toHaveBeenCalledWith(
        VALID_UUID, VALID_MSG_ID, expect.objectContaining({ content: 'Updated' }), expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v2/conversations/:id/messages/:msgId
  // -----------------------------------------------------------------------
  describe('DELETE /api/v2/conversations/:id/messages/:msgId', () => {
    it('deletes a message and returns 204', async () => {
      mockServices.deleteMessage.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}/messages/${VALID_MSG_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(mockServices.deleteMessage.execute).toHaveBeenCalledWith(VALID_UUID, VALID_MSG_ID, expect.anything());
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/conversations/:id/messages/:msgId/regenerate-summary
  // -----------------------------------------------------------------------
  describe('POST regenerate-summary', () => {
    it('returns 200', async () => {
      const result = { id: VALID_MSG_ID, aiSummary: 'Summary' };
      mockServices.regenerateSummary.execute.mockResolvedValue(result);

      const res = await app.request(
        `/api/v2/conversations/${VALID_UUID}/messages/${VALID_MSG_ID}/regenerate-summary`,
        { method: 'POST' },
      );

      expect(res.status).toBe(200);
      expect(mockServices.regenerateSummary.execute).toHaveBeenCalledWith(VALID_MSG_ID, expect.anything());
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/conversations/:id/messages/:msgId/retranslate
  // -----------------------------------------------------------------------
  describe('POST retranslate', () => {
    it('returns 200', async () => {
      const result = { id: VALID_MSG_ID, translatedContent: 'Translated' };
      mockServices.retranslateMessage.execute.mockResolvedValue(result);

      const res = await app.request(
        `/api/v2/conversations/${VALID_UUID}/messages/${VALID_MSG_ID}/retranslate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLang: 'zh' }),
        },
      );

      expect(res.status).toBe(200);
      expect(mockServices.retranslateMessage.execute).toHaveBeenCalledWith(VALID_MSG_ID, 'zh', expect.anything());
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/messages/pending-review
  // -----------------------------------------------------------------------
  describe('GET /api/v2/messages/pending-review', () => {
    it('returns 200 with pending messages', async () => {
      const messages = [{ id: VALID_MSG_ID }];
      mockServices.listPendingReview.execute.mockResolvedValue(messages);

      const res = await app.request('/api/v2/messages/pending-review');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(messages);
      expect(mockServices.listPendingReview.execute).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/messages/:msgId/approve
  // -----------------------------------------------------------------------
  describe('POST /api/v2/messages/:msgId/approve', () => {
    it('approves a message and returns 200', async () => {
      const result = { id: VALID_MSG_ID, moderationStatus: 'ALLOWED' };
      mockServices.approveMessage.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/messages/${VALID_MSG_ID}/approve`, { method: 'POST' });
      expect(res.status).toBe(200);
      expect(mockServices.approveMessage.execute).toHaveBeenCalledWith(VALID_MSG_ID, expect.anything());
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/messages/:msgId/reject
  // -----------------------------------------------------------------------
  describe('POST /api/v2/messages/:msgId/reject', () => {
    it('rejects a message and returns 200', async () => {
      const result = { id: VALID_MSG_ID, moderationStatus: 'REJECTED' };
      mockServices.rejectMessage.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/messages/${VALID_MSG_ID}/reject`, { method: 'POST' });
      expect(res.status).toBe(200);
      expect(mockServices.rejectMessage.execute).toHaveBeenCalledWith(VALID_MSG_ID, expect.anything());
    });
  });
});
