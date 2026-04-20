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

    it('forwards semantic_signals only and ignores candidate_signals compatibility noise', async () => {
      mockServices.decideAiPolicy.execute.mockResolvedValue({
        next_action: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      });

      const res = await app.request('/api/v2/internal/ai-policy/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'v1',
          request_id: 'req-2',
          session_id: 'session-2',
          actor: 'DIFY',
          source_channel: 'chatflow',
          hospital_type: 'COSMETIC',
          payload: {
            user_message: 'Can you recommend a hospital for me?',
            candidate_signals: {
              possibleRisk: 'SENSITIVE',
              topicHint: 'rhinoplasty',
              possibleIntent: 'ASK_FOR_RECOMMENDATION',
            },
            semantic_signals: {
              resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
              engagementSignal: 'QUALIFIED_EXPLORATION',
              progressionSignal: 'OPEN_TO_NEXT_STEP',
              recommendationSignal: 'SEEKING_RECOMMENDATION',
              mentionsCondition: true,
              mentionsDoctorOrHospitalNeed: true,
              riskLevelHint: 'SENSITIVE',
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.decideAiPolicy.execute).toHaveBeenCalledWith({
        sessionId: 'session-2',
        site: 'china',
        userMessage: 'Can you recommend a hospital for me?',
        extraction: {
          resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
          engagementSignal: 'QUALIFIED_EXPLORATION',
          progressionSignal: 'OPEN_TO_NEXT_STEP',
          recommendationSignal: 'SEEKING_RECOMMENDATION',
          mentionsCondition: true,
          mentionsDoctorOrHospitalNeed: true,
          riskLevelHint: 'SENSITIVE',
        },
        pageContext: null,
        candidateHospitals: [],
      });
    });

    it('ignores candidate_signals when semantic_signals is absent and falls back deterministically', async () => {
      mockServices.decideAiPolicy.execute.mockResolvedValue({
        next_action: 'ANSWER_FAQ',
      });

      const res = await app.request('/api/v2/internal/ai-policy/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'v1',
          request_id: 'req-3',
          session_id: 'session-3',
          actor: 'DIFY',
          source_channel: 'chatflow',
          hospital_type: 'COSMETIC',
          payload: {
            user_message: 'hello',
            candidate_signals: {
              resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
              engagementSignal: 'QUALIFIED_EXPLORATION',
              progressionSignal: 'OPEN_TO_NEXT_STEP',
              recommendationSignal: 'SEEKING_RECOMMENDATION',
              mentionsCondition: true,
              mentionsDoctorOrHospitalNeed: true,
              possibleRisk: 'SENSITIVE',
              topicHint: 'rhinoplasty',
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.decideAiPolicy.execute).toHaveBeenCalledWith({
        sessionId: 'session-3',
        site: 'china',
        userMessage: 'hello',
        extraction: {},
        pageContext: null,
        candidateHospitals: [],
      });
    });

    it('ignores transitional compatibility keys in candidate_signals entirely', async () => {
      mockServices.decideAiPolicy.execute.mockResolvedValue({
        next_action: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      });

      const res = await app.request('/api/v2/internal/ai-policy/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'v1',
          request_id: 'req-4',
          session_id: 'session-4',
          actor: 'DIFY',
          source_channel: 'chatflow',
          hospital_type: 'COSMETIC',
          payload: {
            user_message: 'Can you recommend a hospital for me?',
            candidate_signals: {
              possibleIntent: 'ASK_FOR_RECOMMENDATION',
              possibleRisk: 'SENSITIVE',
              mentionedBudget: '$5000',
              topicHint: 'rhinoplasty',
              arbitraryText: 'drop me',
              freeformObject: { note: 'drop me too' },
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.decideAiPolicy.execute).toHaveBeenCalledWith({
        sessionId: 'session-4',
        site: 'china',
        userMessage: 'Can you recommend a hospital for me?',
        extraction: {},
        pageContext: null,
        candidateHospitals: [],
      });
    });
  });

  describe('POST /api/v2/internal/ai-policy/context', () => {
    it('returns policy context through the shared envelope', async () => {
      mockServices.getAiPolicyContext.execute.mockResolvedValue({
        profile: null,
        status_snapshot: { risk_level: 'LOW' },
        conversation_summary: '',
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
        site: 'china',
        policyDecision: expect.objectContaining({
          engagementMode: 'DEEP_WORKFLOW',
          writebackDepth: 'complete',
          nextAction: 'REQUEST_DOC_UPLOAD',
        }),
      }));
    });

    it('passes an explicit site through to writeback instead of falling back to china', async () => {
      mockServices.applyAiPolicyWriteback.execute.mockResolvedValue({
        statusUpdated: {},
        timelineEventsWritten: [],
        messageMetadata: {},
        followupCreated: null,
        handoffCreated: null,
      });

      const res = await app.request('/api/v2/internal/ai-policy/writeback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'v1',
          session_id: 'session-explicit-site',
          site: 'beauty',
          payload: {
            assistant_message_id: 'assistant-explicit-site',
            idempotency_key: 'session-explicit-site:assistant-explicit-site:v1',
            policy_decision: {
              next_action: 'ANSWER_FAQ',
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.applyAiPolicyWriteback.execute).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'session-explicit-site',
        site: 'beauty',
        assistantMessageId: 'assistant-explicit-site',
      }));
    });

    it('parses response-shaped canonical policy_decision payloads before writeback forwarding', async () => {
      mockServices.applyAiPolicyWriteback.execute.mockResolvedValue({
        statusUpdated: { docUploadStatus: 'REQUESTED', engagementMode: 'DEEP_WORKFLOW' },
        timelineEventsWritten: [],
        messageMetadata: { engagementMode: 'DEEP_WORKFLOW', writebackDepth: 'complete' },
        followupCreated: null,
        handoffCreated: null,
      });

      const res = await app.request('/api/v2/internal/ai-policy/writeback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'v1',
          request_id: 'req-writeback-2',
          session_id: 'session-2',
          actor: 'DIFY',
          source_channel: 'chatflow',
          hospital_type: 'COSMETIC',
          payload: {
            assistant_message_id: 'assistant-2',
            idempotency_key: 'session-2:assistant-2:v1',
            policy_decision: JSON.stringify({
              engagementMode: 'DEEP_WORKFLOW',
              writebackDepth: 'complete',
              nextAction: 'REQUEST_DOC_UPLOAD',
              riskLevel: 'LOW',
              reasonCodes: ['canonical_semantics_consumed'],
              shortlist: [{
                hospitalId: 'hospital-2',
                matchType: 'matched',
                reasonCodes: ['best_fit'],
              }],
            }),
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.applyAiPolicyWriteback.execute).toHaveBeenCalledWith({
        sessionId: 'session-2',
        site: 'china',
        assistantMessageId: 'assistant-2',
        idempotencyKey: 'session-2:assistant-2:v1',
        policyDecision: {
          engagementMode: 'DEEP_WORKFLOW',
          writebackDepth: 'complete',
          nextAction: 'REQUEST_DOC_UPLOAD',
          riskLevel: 'LOW',
          reasonCodes: ['canonical_semantics_consumed'],
          shortlist: [{
            hospitalId: 'hospital-2',
            matchType: 'matched',
            reasonCodes: ['best_fit'],
          }],
        },
      });
    });

    it('normalizes shortlist items in writeback ingress before forwarding', async () => {
      mockServices.applyAiPolicyWriteback.execute.mockResolvedValue({
        statusUpdated: { recommendationStatus: 'PRELIMINARY_SHOWN', engagementMode: 'DEEP_WORKFLOW' },
        timelineEventsWritten: [],
        messageMetadata: { engagementMode: 'DEEP_WORKFLOW', writebackDepth: 'complete' },
        followupCreated: null,
        handoffCreated: null,
      });

      const res = await app.request('/api/v2/internal/ai-policy/writeback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
        },
        body: JSON.stringify({
          version: 'v1',
          request_id: 'req-writeback-3',
          session_id: 'session-3',
          actor: 'DIFY',
          source_channel: 'chatflow',
          hospital_type: 'COSMETIC',
          payload: {
            assistant_message_id: 'assistant-3',
            idempotency_key: 'session-3:assistant-3:v1',
            policy_decision: {
              engagement_mode: 'DEEP_WORKFLOW',
              writeback_depth: 'complete',
              next_action: 'SHOW_HOSPITAL_RECOMMENDATIONS',
              shortlist: [{
                hospital_id: 'hospital-3',
                match_type: 'matched',
                reason_codes: ['best_fit', 123, null],
                extra_field: 'drop me',
              }],
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.applyAiPolicyWriteback.execute).toHaveBeenCalledWith({
        sessionId: 'session-3',
        site: 'china',
        assistantMessageId: 'assistant-3',
        idempotencyKey: 'session-3:assistant-3:v1',
        policyDecision: {
          engagementMode: 'DEEP_WORKFLOW',
          writebackDepth: 'complete',
          nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          riskLevel: undefined,
          reasonCodes: [],
          shortlist: [{
            hospitalId: 'hospital-3',
            matchType: 'matched',
            reasonCodes: ['best_fit'],
          }],
        },
      });
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
      expect(mockServices.matchHospitals.execute).toHaveBeenCalledWith({});
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
