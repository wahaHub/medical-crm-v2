import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock composition root + config
// ---------------------------------------------------------------------------
const mockServices = {
  processMessageTasks: { execute: vi.fn() },
  processTranslationTasks: { execute: vi.fn() },
  processAiSyncOutbox: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    INTERNAL_API_SECRET: 'test-secret-must-be-at-least-32-characters-long',
  }),
}));

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import internalRoutes from '../routes/internal.routes.js';

const app = new OpenAPIHono();
app.route('/', internalRoutes);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Internal routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v2/internal/process-message-tasks', () => {
    it('returns 200 with valid secret', async () => {
      const result = { processed: 3, failed: 0 };
      mockServices.processMessageTasks.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/internal/process-message-tasks', {
        method: 'POST',
        headers: { 'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.processMessageTasks.execute).toHaveBeenCalledOnce();
    });

    it('returns 401 without header', async () => {
      const res = await app.request('/api/v2/internal/process-message-tasks', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      expect(mockServices.processMessageTasks.execute).not.toHaveBeenCalled();
    });

    it('returns 401 with wrong secret', async () => {
      const res = await app.request('/api/v2/internal/process-message-tasks', {
        method: 'POST',
        headers: { 'X-Internal-Secret': 'wrong-secret' },
      });

      expect(res.status).toBe(401);
      expect(mockServices.processMessageTasks.execute).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v2/internal/process-ai-sync-outbox', () => {
    it('returns 200 with valid secret', async () => {
      const result = { processed: 2, retried: 1, failed: 0, skipped: 0 };
      mockServices.processAiSyncOutbox.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/internal/process-ai-sync-outbox', {
        method: 'POST',
        headers: { 'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.processAiSyncOutbox.execute).toHaveBeenCalledOnce();
    });

    it('returns 401 without header', async () => {
      const res = await app.request('/api/v2/internal/process-ai-sync-outbox', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      expect(mockServices.processAiSyncOutbox.execute).not.toHaveBeenCalled();
    });

    it('returns 401 with wrong secret', async () => {
      const res = await app.request('/api/v2/internal/process-ai-sync-outbox', {
        method: 'POST',
        headers: { 'X-Internal-Secret': 'wrong-secret' },
      });

      expect(res.status).toBe(401);
      expect(mockServices.processAiSyncOutbox.execute).not.toHaveBeenCalled();
    });
  });
});
