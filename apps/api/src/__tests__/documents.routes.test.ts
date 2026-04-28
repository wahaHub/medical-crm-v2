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
  mediaUpload: { createUploadIntent: vi.fn() },
  getCaseProgress: { execute: vi.fn() },
  addCaseProgress: { execute: vi.fn() },
  caseRepo: { findById: vi.fn() },
  documentRepo: { findById: vi.fn() },
  patientRepo: { findById: vi.fn() },
  createConversation: { execute: vi.fn() },
  notifyPatientOfCaseUpdate: { execute: vi.fn() },
  chcRepo: { findByCaseAndHospital: vi.fn() },
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

let currentSession = {
  userId: 'u-1',
  email: 'admin@test.com',
  roles: ['ADMIN'],
  hospitalId: null,
};

app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
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
    currentSession = {
      userId: 'u-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
    mockServices.caseRepo.findById.mockResolvedValue({
      id: CASE_UUID,
      patientId: 'patient-1',
      assignedHospitalId: 'hospital-1',
    });
    mockServices.patientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      site: 'beauty',
    });
    mockServices.listDocuments.execute.mockResolvedValue([
      {
        id: DOC_UUID,
        documentType: 'INVITATION',
      },
    ]);
    mockServices.documentRepo.findById.mockResolvedValue({
      id: DOC_UUID,
      caseId: CASE_UUID,
      documentType: 'INVITATION',
      status: 'ACTIVE',
    });
    mockServices.createConversation.execute.mockResolvedValue({
      id: 'conversation-1',
      caseId: CASE_UUID,
      category: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
    });
    mockServices.chcRepo.findByCaseAndHospital.mockResolvedValue(null);
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
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue({
        uploadUrl: 'https://storage.example.com/upload',
        storageKey: 'crm/dev/cases/documents/case-1/asset-1/report.pdf',
        expiresIn: 600,
        asset: { fileName: 'report.pdf', mimeType: 'application/pdf', fileSize: 1024, storageKey: 'crm/dev/cases/documents/case-1/asset-1/report.pdf' },
      });
      mockServices.uploadDocument.execute.mockResolvedValue({ documentId: DOC_UUID });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.documentId).toBe(DOC_UUID);
      expect(json.upload.uploadUrl).toBe('https://storage.example.com/upload');
      expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledOnce();
      expect(mockServices.uploadDocument.execute).toHaveBeenCalledOnce();

      const [input] = mockServices.uploadDocument.execute.mock.calls[0]!;
      expect(input).toMatchObject({ caseId: CASE_UUID, fileName: 'report.pdf', storageKey: 'crm/dev/cases/documents/case-1/asset-1/report.pdf' });
    });

    it('does not notify the patient before the invitation file upload completes', async () => {
      currentSession = {
        userId: 'hospital-1',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue({
        uploadUrl: 'https://storage.example.com/upload',
        storageKey: 'crm/dev/cases/documents/case-1/asset-1/invitation.pdf',
        expiresIn: 600,
        asset: { fileName: 'invitation.pdf', mimeType: 'application/pdf', fileSize: 1024, storageKey: 'crm/dev/cases/documents/case-1/asset-1/invitation.pdf' },
      });
      mockServices.uploadDocument.execute.mockResolvedValue({ documentId: DOC_UUID });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'invitation.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          documentType: 'INVITATION',
        }),
      });

      expect(res.status).toBe(201);
      expect(mockServices.notifyPatientOfCaseUpdate.execute).not.toHaveBeenCalled();
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

  describe('POST /api/v2/cases/:caseId/documents/:docId/notify-patient', () => {
    it('notifies the patient when a hospital confirms an uploaded invitation document', async () => {
      currentSession = {
        userId: 'hospital-1',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
      });

      expect(res.status).toBe(204);
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'HOSPITAL_PATIENT',
        caseId: CASE_UUID,
        hospitalId: 'hospital-1',
      }, expect.anything());
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith({
        caseId: CASE_UUID,
        patientId: 'patient-1',
        site: 'beauty',
        subject: 'Your invitation letter is available',
        messagePreview: 'Your hospital uploaded a medical invitation letter for your case.',
        dedupeKey: `document:${DOC_UUID}`,
        conversationId: 'conversation-1',
        channel: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-1',
        sourceKind: 'document',
        sourceId: DOC_UUID,
      });
    });

    it.each([
      ['INVITATION', 'Your invitation letter is available'],
      ['DIAGNOSIS', 'Your diagnosis document is available'],
      ['QUOTE', 'Your treatment quote is available'],
    ])('routes hospital %s notifications to the hospital-patient conversation', async (documentType, subject) => {
      currentSession = {
        userId: 'hospital-1',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };
      mockServices.documentRepo.findById.mockResolvedValue({
        id: DOC_UUID,
        caseId: CASE_UUID,
        documentType,
        status: 'ACTIVE',
      });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
      });

      expect(res.status).toBe(204);
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'HOSPITAL_PATIENT',
        caseId: CASE_UUID,
        hospitalId: 'hospital-1',
      }, expect.anything());
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({
        subject,
        conversationId: 'conversation-1',
        channel: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-1',
        sourceKind: 'document',
        sourceId: DOC_UUID,
      }));
    });

    it('routes admin document notifications to the admin-patient conversation by default', async () => {
      mockServices.createConversation.execute.mockResolvedValue({
        id: 'admin-conversation-1',
        caseId: CASE_UUID,
        category: 'ADMIN_PATIENT',
        hospitalId: null,
      });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
      });

      expect(res.status).toBe(204);
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'ADMIN_PATIENT',
        caseId: CASE_UUID,
      }, expect.anything());
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'admin-conversation-1',
        channel: 'ADMIN_PATIENT',
        hospitalId: null,
        sourceKind: 'document',
        sourceId: DOC_UUID,
      }));
    });

    it('routes admin document notifications to a hospital conversation when hospitalId is explicit', async () => {
      mockServices.createConversation.execute.mockResolvedValue({
        id: 'hospital-conversation-1',
        caseId: CASE_UUID,
        category: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-2',
      });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'hospital-2' }),
      });

      expect(res.status).toBe(204);
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'HOSPITAL_PATIENT',
        caseId: CASE_UUID,
        hospitalId: 'hospital-2',
      }, expect.anything());
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'hospital-conversation-1',
        channel: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-2',
        sourceKind: 'document',
        sourceId: DOC_UUID,
      }));
    });

    it('returns 204 even if invitation notification delivery fails', async () => {
      currentSession = {
        userId: 'hospital-1',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };
      mockServices.notifyPatientOfCaseUpdate.execute.mockRejectedValueOnce(new Error('smtp down'));

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
      });

      expect(res.status).toBe(204);
    });

    it('allows a distributed hospital contact to notify the patient about an invitation document', async () => {
      currentSession = {
        userId: 'hospital-2',
        email: 'distributed@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-2',
      };
      mockServices.caseRepo.findById.mockResolvedValue({
        id: CASE_UUID,
        patientId: 'patient-1',
        assignedHospitalId: 'hospital-1',
      });
      mockServices.chcRepo.findByCaseAndHospital.mockResolvedValue({
        id: 'chc-1',
        caseId: CASE_UUID,
        hospitalId: 'hospital-2',
        subStatus: 'DISTRIBUTED',
        removedAt: null,
      });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
      });

      expect(res.status).toBe(204);
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledOnce();
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
