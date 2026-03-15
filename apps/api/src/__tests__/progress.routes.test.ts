import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — must be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createCase: { execute: vi.fn() },
  listCases: { execute: vi.fn() },
  getCase: { execute: vi.fn() },
  getHospitalCaseDetail: { execute: vi.fn() },
  updateCase: { execute: vi.fn() },
  assignCase: { execute: vi.fn() },
  updateCaseStatus: { execute: vi.fn() },
  advanceCaseStage: { execute: vi.fn() },
  getCaseStats: { execute: vi.fn() },
  uploadDocument: { execute: vi.fn() },
  listDocuments: { execute: vi.fn() },
  deleteDocument: { execute: vi.fn() },
  getCaseProgress: { execute: vi.fn() },
  addCaseProgress: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import progressRoutes from '../routes/progress.routes.js';

const app = new OpenAPIHono();

const adminSession = {
  userId: 'u-1',
  email: 'admin@test.com',
  roles: ['ADMIN'],
  hospitalId: null,
};

app.use('/api/v2/*', async (c, next) => {
  c.set('session', adminSession);
  await next();
});

app.route('/', progressRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CASE_UUID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Progress routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/:caseId/progress — get case progress
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/progress', () => {
    it('returns 200 with progress timeline', async () => {
      const progress = [
        { id: 'p-1', type: 'STATUS_CHANGE', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'p-2', type: 'DIAGNOSIS', createdAt: '2026-01-02T00:00:00Z' },
      ];
      mockServices.getCaseProgress.execute.mockResolvedValue(progress);

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/progress`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(progress);
      expect(mockServices.getCaseProgress.execute).toHaveBeenCalledWith(CASE_UUID, expect.anything());
    });

    it('returns 200 with empty array when no progress', async () => {
      mockServices.getCaseProgress.execute.mockResolvedValue([]);

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/progress`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('rejects invalid caseId param', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/progress');
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/cases/:caseId/progress — add progress entry
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases/:caseId/progress', () => {
    it('adds a DIAGNOSIS progress entry and returns 201', async () => {
      const created = { id: 'p-1', type: 'DIAGNOSIS' };
      mockServices.addCaseProgress.execute.mockResolvedValue(created);

      const body = {
        type: 'DIAGNOSIS',
        icdCode: 'J45.0',
        severity: 'MODERATE',
        treatmentRecommendation: 'Inhaler therapy',
      };

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(created);

      const [input] = mockServices.addCaseProgress.execute.mock.calls[0]!;
      expect(input).toMatchObject({ caseId: CASE_UUID, type: 'DIAGNOSIS', icdCode: 'J45.0' });
    });

    it('adds a PHONE_CALL progress entry and returns 201', async () => {
      const created = { id: 'p-2', type: 'PHONE_CALL' };
      mockServices.addCaseProgress.execute.mockResolvedValue(created);

      const body = {
        type: 'PHONE_CALL',
        callResult: 'answered',
        summary: 'Discussed treatment options',
        duration: 600,
      };

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      expect(mockServices.addCaseProgress.execute).toHaveBeenCalledOnce();
    });

    it('adds a STATUS_CHANGE progress entry and returns 201', async () => {
      const created = { id: 'p-3', type: 'STATUS_CHANGE' };
      mockServices.addCaseProgress.execute.mockResolvedValue(created);

      const body = {
        type: 'STATUS_CHANGE',
        reason: 'Patient requested cancellation',
      };

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      expect(mockServices.addCaseProgress.execute).toHaveBeenCalledOnce();
    });

    it('adds a DOCUMENT_UPLOAD progress entry and returns 201', async () => {
      const docUuid = '00000000-0000-0000-0000-000000000099';
      const created = { id: 'p-4', type: 'DOCUMENT_UPLOAD' };
      mockServices.addCaseProgress.execute.mockResolvedValue(created);

      const body = {
        type: 'DOCUMENT_UPLOAD',
        documentId: docUuid,
      };

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      expect(mockServices.addCaseProgress.execute).toHaveBeenCalledOnce();
    });

    it('rejects invalid progress type', async () => {
      const body = {
        type: 'INVALID_TYPE',
        reason: 'This should fail',
      };

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
      expect(mockServices.addCaseProgress.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid caseId param', async () => {
      const body = { type: 'STATUS_CHANGE', reason: 'test' };

      const res = await app.request('/api/v2/cases/bad-id/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
      expect(mockServices.addCaseProgress.execute).not.toHaveBeenCalled();
    });
  });
});
