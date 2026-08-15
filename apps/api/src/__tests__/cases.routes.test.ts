import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createCase: { execute: vi.fn() },
  listCases: { execute: vi.fn() },
  getCase: { execute: vi.fn() },
  getHospitalCaseDetail: { execute: vi.fn() },
  updateCase: { execute: vi.fn() },
  saveCaseDiagnosis: { execute: vi.fn() },
  assignCase: { execute: vi.fn() },
  updateCaseStatus: { execute: vi.fn() },
  advanceCaseStage: { execute: vi.fn() },
  getCaseStats: { execute: vi.fn() },
  uploadDocument: { execute: vi.fn() },
  listDocuments: { execute: vi.fn() },
  deleteDocument: { execute: vi.fn() },
  getCaseProgress: { execute: vi.fn() },
  addCaseProgress: { execute: vi.fn() },
  caseRepo: { findById: vi.fn() },
  adminPatientSiteAccess: { assertCaseNotExcludedByPatientEmail: vi.fn() },
  patientRepo: { findById: vi.fn() },
  createConversation: { execute: vi.fn() },
  notifyPatientOfCaseUpdate: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import caseRoutes from '../routes/cases.routes.js';

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

// Fake auth middleware: injects `currentSession` into the context
app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});

// Mount the actual case routes
app.route('/', caseRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

function buildExpectedMarketingDedupeKey(caseId: string, subject: string, messagePreview: string): string {
  const digest = createHash('sha256')
    .update(`${subject.trim()}\n${messagePreview.trim()}`)
    .digest('hex')
    .slice(0, 16);
  return `marketing-email:${caseId}:${digest}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cases routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = {
      userId: 'u-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
    mockServices.caseRepo.findById.mockResolvedValue({
      id: VALID_UUID,
      patientId: 'patient-1',
      assignedHospitalId: 'hospital-1',
    });
    mockServices.adminPatientSiteAccess.assertCaseNotExcludedByPatientEmail.mockResolvedValue(undefined);
    mockServices.patientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      site: 'beauty',
    });
    mockServices.createConversation.execute.mockResolvedValue({
      id: 'conversation-1',
      caseId: VALID_UUID,
      category: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases — list
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases', () => {
    it('returns 200 with paginated results', async () => {
      const payload = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: false,
      };
      mockServices.listCases.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/cases');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.listCases.execute).toHaveBeenCalledOnce();
    });

    it('passes query params to use case', async () => {
      const payload = { data: [], total: 0, page: 2, limit: 10, totalPages: 0, hasMore: false };
      mockServices.listCases.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/cases?page=2&limit=10&status=ACTIVE');
      expect(res.status).toBe(200);

      const [query] = mockServices.listCases.execute.mock.calls[0]!;
      expect(query).toMatchObject({ page: 2, limit: 10, status: 'ACTIVE' });
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/cases — create
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases', () => {
    it('creates a case and returns 201', async () => {
      const created = { id: VALID_UUID };
      mockServices.createCase.execute.mockResolvedValue(created);

      const body = {
        patientId: VALID_UUID,
        patientName: 'Test Patient',
      };

      const res = await app.request('/api/v2/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(created);
      expect(mockServices.createCase.execute).toHaveBeenCalledOnce();
    });

    it('rejects invalid body (missing patientName)', async () => {
      const res = await app.request('/api/v2/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: VALID_UUID }),
      });

      // zod-openapi returns 400 for validation errors
      expect(res.status).toBe(400);
      expect(mockServices.createCase.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/stats — stats
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/stats', () => {
    it('returns 200 with stats', async () => {
      const stats = { total: 5, byStatus: {} };
      mockServices.getCaseStats.execute.mockResolvedValue(stats);

      const res = await app.request('/api/v2/cases/stats');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(stats);
      expect(mockServices.getCaseStats.execute).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/:id — get by id
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:id', () => {
    it('returns 200 with case detail for ADMIN', async () => {
      const detail = { id: VALID_UUID, patientName: 'Test' };
      mockServices.getCase.execute.mockResolvedValue(detail);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(detail);
      expect(mockServices.getCase.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('uses getHospitalCaseDetail for HOSPITAL role', async () => {
      currentSession = {
        userId: 'u-2',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'h-1',
      };

      const detail = { id: VALID_UUID, hospitalView: true };
      mockServices.getHospitalCaseDetail.execute.mockResolvedValue(detail);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(detail);
      expect(mockServices.getHospitalCaseDetail.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
      expect(mockServices.getCase.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/cases/:id — update
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/cases/:id', () => {
    it('updates a case and returns 200', async () => {
      const updated = { id: VALID_UUID, primaryDiagnosis: 'Updated' };
      mockServices.updateCase.execute.mockResolvedValue(updated);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryDiagnosis: 'Updated' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(updated);
      expect(mockServices.updateCase.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({ primaryDiagnosis: 'Updated' }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/cases/:id/status — update status
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/cases/:id/status', () => {
    it('updates case assignment status and returns 200', async () => {
      const result = { id: VALID_UUID, assignmentStatus: 'ASSIGNED' };
      mockServices.updateCaseStatus.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentStatus: 'ASSIGNED' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.updateCaseStatus.execute).toHaveBeenCalledWith(
        VALID_UUID,
        'ASSIGNED',
        expect.anything(),
      );
    });

    it('rejects invalid assignmentStatus value', async () => {
      const res = await app.request(`/api/v2/cases/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentStatus: 'INVALID_STATUS' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateCaseStatus.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/cases/:id/stage — advance stage
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/cases/:id/stage', () => {
    it('advances case treatment stage and returns 200', async () => {
      const result = { id: VALID_UUID, treatmentStage: 'IN_TREATMENT' };
      mockServices.advanceCaseStage.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treatmentStage: 'IN_TREATMENT' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.advanceCaseStage.execute).toHaveBeenCalledWith(
        VALID_UUID,
        'IN_TREATMENT',
        expect.anything(),
      );
    });

    it('rejects invalid treatmentStage value', async () => {
      const res = await app.request(`/api/v2/cases/${VALID_UUID}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treatmentStage: 'NONEXISTENT_STAGE' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.advanceCaseStage.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/cases/:id/assign — assign case
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases/:id/assign', () => {
    it('assigns a case and returns 200', async () => {
      const result = { id: VALID_UUID, hospitalId: VALID_UUID };
      mockServices.assignCase.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: VALID_UUID }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.assignCase.execute).toHaveBeenCalledWith(
        VALID_UUID,
        VALID_UUID,
        expect.anything(),
      );
    });

    it('rejects non-UUID hospitalId', async () => {
      const res = await app.request(`/api/v2/cases/${VALID_UUID}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'not-a-uuid' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.assignCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v2/cases/:id/marketing-email', () => {
    it('sends a patient case-update email for hospital outreach', async () => {
      currentSession = {
        userId: 'u-2',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/marketing-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Your personalized treatment plan',
          messagePreview: 'We prepared a personalized treatment plan for your case.\n\nPlease reply to discuss next steps.',
        }),
      });

      expect(res.status).toBe(204);
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith({
        caseId: VALID_UUID,
        patientId: 'patient-1',
        site: 'beauty',
        subject: 'Your personalized treatment plan',
        messagePreview: 'We prepared a personalized treatment plan for your case.\n\nPlease reply to discuss next steps.',
        dedupeKey: buildExpectedMarketingDedupeKey(
          VALID_UUID,
          'Your personalized treatment plan',
          'We prepared a personalized treatment plan for your case.\n\nPlease reply to discuss next steps.',
        ),
        channel: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-1',
        sourceKind: 'marketing-email',
        sourceId: expect.stringContaining(`marketing-email:${VALID_UUID}:`),
        resolveConversationId: expect.any(Function),
      });

      const [notificationInput] = mockServices.notifyPatientOfCaseUpdate.execute.mock.calls[0]!;
      await notificationInput.resolveConversationId();
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'HOSPITAL_PATIENT',
        caseId: VALID_UUID,
        hospitalId: 'hospital-1',
      }, expect.anything());
    });

    it('uses a distinct dedupe key when the subject stays the same but the body changes', async () => {
      currentSession = {
        userId: 'u-2',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };

      await app.request(`/api/v2/cases/${VALID_UUID}/marketing-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Your personalized treatment plan',
          messagePreview: 'Version one.',
        }),
      });

      await app.request(`/api/v2/cases/${VALID_UUID}/marketing-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Your personalized treatment plan',
          messagePreview: 'Version two.',
        }),
      });

      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
        dedupeKey: buildExpectedMarketingDedupeKey(VALID_UUID, 'Your personalized treatment plan', 'Version one.'),
      }));
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
        dedupeKey: buildExpectedMarketingDedupeKey(VALID_UUID, 'Your personalized treatment plan', 'Version two.'),
      }));
    });

    it('still returns 204 when patient notification delivery fails', async () => {
      currentSession = {
        userId: 'u-2',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };
      mockServices.notifyPatientOfCaseUpdate.execute.mockRejectedValueOnce(new Error('smtp down'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/marketing-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Your personalized treatment plan',
          messagePreview: 'Please review the latest proposal from our care team.',
        }),
      });

      expect(res.status).toBe(204);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('POST /api/v2/cases/:id/diagnosis', () => {
    it('saves diagnosis through the composite diagnosis use case', async () => {
      currentSession = {
        userId: 'u-2',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };
      mockServices.saveCaseDiagnosis.execute.mockResolvedValue({
        id: 'progress-1',
        type: 'DIAGNOSIS',
      });

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated diagnosis',
          icdCode: 'A01.1',
          description: 'Detailed note',
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.saveCaseDiagnosis.execute).toHaveBeenCalledWith(
        VALID_UUID,
        {
          title: 'Updated diagnosis',
          icdCode: 'A01.1',
          description: 'Detailed note',
        },
        expect.anything(),
      );
    });
  });
});
