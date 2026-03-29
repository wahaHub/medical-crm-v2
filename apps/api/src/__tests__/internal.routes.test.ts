import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock composition root + config
// ---------------------------------------------------------------------------
const mockServices = {
  processMessageTasks: { execute: vi.fn() },
  processTranslationTasks: { execute: vi.fn() },
  processAiSyncOutbox: { execute: vi.fn() },
  getAiPolicyContext: { execute: vi.fn() },
  decideAiPolicy: { execute: vi.fn() },
  applyAiPolicyWriteback: { execute: vi.fn() },
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

  describe('POST /api/v2/internal/ai-policy/decide', () => {
    it('returns 400 for unsupported contract versions', async () => {
      const res = await app.request('/api/v2/internal/ai-policy/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'old',
          request_id: 'req-1',
          session_id: 'session-1',
          actor: 'DIFY',
          source_channel: 'chatflow',
          hospital_type: 'COSMETIC',
          payload: {},
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.decideAiPolicy.execute).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v2/internal/ai-policy/context', () => {
    it('returns policy context through the shared envelope', async () => {
      mockServices.getAiPolicyContext.execute.mockResolvedValue({
        profile: null,
        status_snapshot: { risk_level: 'LOW' },
        conversation_summary: '',
        pending_offer: null,
        pending_question: null,
        recent_messages: [],
        active_followups: [],
      });

      const res = await app.request('/api/v2/internal/ai-policy/context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'v1',
          request_id: 'req-ctx-1',
          session_id: 'session-1',
          actor: 'DIFY',
          source_channel: 'chatflow',
          hospital_type: 'COSMETIC',
          payload: {
            user_message: 'hello',
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        data: {
          profile: null,
          status_snapshot: { risk_level: 'LOW' },
          conversation_summary: '',
          pending_offer: null,
          pending_question: null,
          recent_messages: [],
          active_followups: [],
        },
      });
    });
  });

  describe('POST /api/v2/internal/ai-policy/writeback', () => {
    it('returns a writeback envelope and stays idempotent for the same writeback key', async () => {
      const response = {
        statusUpdated: { docUploadStatus: 'REQUESTED' },
        timelineEventsWritten: ['DOC_UPLOAD_REQUESTED'],
        messageMetadata: {},
        followupCreated: 'followup-1',
        handoffCreated: null,
      };
      mockServices.applyAiPolicyWriteback.execute.mockResolvedValue(response);

      const body = {
        version: 'v1',
        request_id: 'req-writeback-1',
        session_id: 'session-1',
        actor: 'DIFY',
        source_channel: 'chatflow',
        hospital_type: 'COSMETIC',
        payload: {
          assistant_message_id: 'assistant-1',
          idempotency_key: 'session-1:assistant-1:v1',
          policy_decision: { next_action: 'REQUEST_DOC_UPLOAD' },
          tool_results: [],
          final_response_metadata: {},
        },
      };

      const first = await app.request('/api/v2/internal/ai-policy/writeback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify(body),
      });

      const second = await app.request('/api/v2/internal/ai-policy/writeback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify(body),
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await first.json()).toEqual(await second.json());
    });
  });
});
