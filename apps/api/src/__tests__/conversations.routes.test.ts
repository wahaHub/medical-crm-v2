import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root
// ---------------------------------------------------------------------------
const mockServices = {
  createConversation: { execute: vi.fn() },
  listConversations: { execute: vi.fn() },
  getConversation: { execute: vi.fn() },
  updateConversation: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import conversationRoutes from '../routes/conversations.routes.js';

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

app.route('/', conversationRoutes);

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Conversation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = {
      userId: 'u-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
  });

  describe('POST /api/v2/conversations', () => {
    it('creates a conversation and returns 201', async () => {
      const created = { id: VALID_UUID };
      mockServices.createConversation.execute.mockResolvedValue(created);

      const res = await app.request('/api/v2/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'ADMIN_HOSPITAL' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(created);
      expect(mockServices.createConversation.execute).toHaveBeenCalledOnce();
    });

    it('rejects invalid category', async () => {
      const res = await app.request('/api/v2/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'INVALID' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createConversation.execute).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v2/conversations', () => {
    it('returns 200 with paginated results', async () => {
      const payload = { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false };
      mockServices.listConversations.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/conversations');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.listConversations.execute).toHaveBeenCalledOnce();
    });
  });

  describe('GET /api/v2/conversations/:id', () => {
    it('returns 200 with conversation detail', async () => {
      const detail = { id: VALID_UUID, title: 'Test' };
      mockServices.getConversation.execute.mockResolvedValue(detail);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(detail);
      expect(mockServices.getConversation.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/conversations/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/v2/conversations/:id', () => {
    it('updates a conversation and returns 200', async () => {
      const updated = { id: VALID_UUID, title: 'Updated' };
      mockServices.updateConversation.execute.mockResolvedValue(updated);

      const res = await app.request(`/api/v2/conversations/${VALID_UUID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(updated);
      expect(mockServices.updateConversation.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({ title: 'Updated' }),
        expect.anything(),
      );
    });
  });
});
