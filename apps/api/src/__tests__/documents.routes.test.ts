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
import documentRoutes from '../routes/documents.routes.js';

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

app.route('/', documentRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CASE_UUID = '00000000-0000-0000-0000-000000000001';
const DOC_UUID = '00000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Documents routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/cases/:caseId/documents — upload document
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases/:caseId/documents', () => {
    const validBody = {
      fileName: 'report.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      documentType: 'LAB',
    };

    it('creates a document and returns 201', async () => {
      const created = { id: DOC_UUID, uploadUrl: 'https://storage.example.com/upload' };
      mockServices.uploadDocument.execute.mockResolvedValue(created);

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(created);
      expect(mockServices.uploadDocument.execute).toHaveBeenCalledOnce();

      const [input] = mockServices.uploadDocument.execute.mock.calls[0]!;
      expect(input).toMatchObject({ caseId: CASE_UUID, fileName: 'report.pdf' });
    });

    it('rejects missing required fields', async () => {
      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'report.pdf' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.uploadDocument.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid caseId param', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(400);
      expect(mockServices.uploadDocument.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/:caseId/documents — list documents
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/documents', () => {
    it('returns 200 with documents list', async () => {
      const docs = [{ id: DOC_UUID, fileName: 'report.pdf' }];
      mockServices.listDocuments.execute.mockResolvedValue(docs);

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(docs);
      expect(mockServices.listDocuments.execute).toHaveBeenCalledWith(CASE_UUID, expect.anything());
    });

    it('returns 200 with empty array when no documents', async () => {
      mockServices.listDocuments.execute.mockResolvedValue([]);

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('rejects invalid caseId param', async () => {
      const res = await app.request('/api/v2/cases/bad-id/documents');
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v2/cases/:caseId/documents/:docId — delete document
  // -----------------------------------------------------------------------
  describe('DELETE /api/v2/cases/:caseId/documents/:docId', () => {
    it('deletes a document and returns 204', async () => {
      mockServices.deleteDocument.execute.mockResolvedValue(undefined);

      const res = await app.request(
        `/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}`,
        { method: 'DELETE' },
      );

      expect(res.status).toBe(204);
      expect(mockServices.deleteDocument.execute).toHaveBeenCalledWith(
        CASE_UUID,
        DOC_UUID,
        expect.anything(),
      );
    });

    it('rejects invalid caseId', async () => {
      const res = await app.request(
        `/api/v2/cases/bad-id/documents/${DOC_UUID}`,
        { method: 'DELETE' },
      );

      expect(res.status).toBe(400);
      expect(mockServices.deleteDocument.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid docId', async () => {
      const res = await app.request(
        `/api/v2/cases/${CASE_UUID}/documents/bad-id`,
        { method: 'DELETE' },
      );

      expect(res.status).toBe(400);
      expect(mockServices.deleteDocument.execute).not.toHaveBeenCalled();
    });
  });
});
