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
  matchHospitals: { execute: vi.fn() },
  listPackages: { execute: vi.fn() },
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
        statusUpdated: { docUploadStatus: 'REQUESTED', engagementMode: 'DEEP_WORKFLOW' },
        timelineEventsWritten: ['DOC_UPLOAD_REQUESTED'],
        messageMetadata: { engagementMode: 'DEEP_WORKFLOW', writebackDepth: 'complete' },
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
          policy_decision: {
            engagement_mode: 'DEEP_WORKFLOW',
            writeback_depth: 'complete',
            next_action: 'REQUEST_DOC_UPLOAD',
            prequalification_reason_codes: ['form_completed'],
          },
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
      expect(mockServices.applyAiPolicyWriteback.execute).toHaveBeenCalledWith(expect.objectContaining({
        policyDecision: expect.objectContaining({
          engagementMode: 'DEEP_WORKFLOW',
          writebackDepth: 'complete',
          prequalificationReasonCodes: ['form_completed'],
          nextAction: 'REQUEST_DOC_UPLOAD',
        }),
      }));
    });
  });

  describe('POST /api/v2/internal/mcp/search-hospitals', () => {
    it('returns hospital cards for Dify orchestration', async () => {
      mockServices.matchHospitals.execute.mockResolvedValue({
        hospitals: [{
          id: 'hospital-1',
          name: 'Medora Seoul',
          nameEn: 'Medora Seoul',
          rating: 4.8,
          logoUrl: 'https://example.com/logo.png',
          tags: ['rhinoplasty', 'premium'],
          procedureCount: 24,
        }],
      });

      const res = await app.request('/api/v2/internal/mcp/search-hospitals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          session_id: 'session-1',
          query: 'I need help choosing a rhinoplasty hospital',
          candidate_signals: {
            topicHint: 'rhinoplasty',
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        data: [{
          hospitalId: 'hospital-1',
          name: 'Medora Seoul',
          nameEn: 'Medora Seoul',
          rating: 4.8,
          logoUrl: 'https://example.com/logo.png',
          tags: ['rhinoplasty', 'premium'],
          procedureCount: 24,
          reasonCodes: ['candidate_pool_match'],
        }],
      });
      expect(mockServices.matchHospitals.execute).toHaveBeenCalledWith({
        category: 'rhinoplasty',
      });
    });
  });

  describe('POST /api/v2/internal/mcp/list-packages', () => {
    it('returns compact published package cards for Dify orchestration', async () => {
      mockServices.listPackages.execute.mockResolvedValue({
        data: [{
          id: 'pkg-1',
          nameEn: 'Consultation Package',
          nameZh: null,
          type: 'CONSULTATION',
          price: '199',
          currency: 'USD',
          descriptionEn: 'Includes concierge support.',
          descriptionZh: null,
          inclusions: [],
          coverImageUrl: 'https://example.com/pkg.png',
          sortWeight: 0,
          status: 'PUBLISHED',
          publishAt: null,
          takedownAt: null,
          config: {},
          createdBy: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z',
        }],
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
        hasMore: false,
      });

      const res = await app.request('/api/v2/internal/mcp/list-packages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          session_id: 'session-1',
          hospital_type: 'COSMETIC',
          query: 'What package options do you have?',
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        data: [{
          packageId: 'pkg-1',
          name: 'Consultation Package',
          type: 'CONSULTATION',
          price: '199',
          currency: 'USD',
          description: 'Includes concierge support.',
          coverImageUrl: 'https://example.com/pkg.png',
        }],
      });
      expect(mockServices.listPackages.execute).toHaveBeenCalledWith(
        {
          page: 1,
          limit: 5,
          status: 'PUBLISHED',
        },
        expect.objectContaining({
          role: 'ADMIN',
        }),
      );
    });
  });
});
