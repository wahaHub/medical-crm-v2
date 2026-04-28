import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomainError, ForbiddenError, NotFoundError, mapErrorToStatus } from '@medical-crm/utils';

const {
  mockAccess,
  mockMkdtemp,
  mockReaddir,
  mockReadFile,
  mockWriteFile,
  mockSpawn,
} = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockMkdtemp: vi.fn(),
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: mockAccess,
  mkdtemp: mockMkdtemp,
  readdir: mockReaddir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

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
  getDocumentPreview: { execute: vi.fn() },
  deleteDocument: { execute: vi.fn() },
  mediaUpload: { createUploadIntent: vi.fn() },
  getConversation: { execute: vi.fn() },
  messageRepo: { findById: vi.fn() },
  storage: { getSignedUrl: vi.fn() },
  getCaseProgress: { execute: vi.fn() },
  addCaseProgress: { execute: vi.fn() },
  caseRepo: { findById: vi.fn() },
  documentRepo: { findById: vi.fn() },
  patientRepo: { findById: vi.fn() },
  hospitalRepo: { findById: vi.fn() },
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

app.onError((err, c) => {
  if (err instanceof DomainError) {
    const status = mapErrorToStatus(err.code);
    return c.json({ error: err.message, code: err.code }, status as 400 | 401 | 403 | 404 | 500);
  }
  if (err instanceof Error && 'code' in err) {
    const code = String((err as Error & { code: unknown }).code);
    const status = mapErrorToStatus(code);
    return c.json({ error: err.message, code }, status as 400 | 401 | 403 | 404 | 500);
  }
  return c.json({ error: 'Internal server error' }, 500);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CASE_UUID = '00000000-0000-0000-0000-000000000001';
const DOC_UUID = '00000000-0000-0000-0000-000000000002';
const ASSOCIATED_HOSPITAL_UUID = '10000000-0000-0000-0000-000000000002';
const UNRELATED_HOSPITAL_UUID = '10000000-0000-0000-0000-000000000099';
const CONVERSATION_ID = 'conversation-1';
const MESSAGE_ID = 'message-1';
const PDF_STORAGE_KEY = 'crm/dev/messages/conversation-1/asset-1/report.pdf';

function mockSuccessfulBabelDocRun() {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  mockAccess.mockResolvedValue(undefined);
  mockMkdtemp
    .mockResolvedValueOnce('/tmp/pdftranslate-source-1')
    .mockResolvedValueOnce('/tmp/babeldoc-1');
  mockReaddir.mockResolvedValue([
    { name: 'report.zh.pdf', isDirectory: () => false },
  ]);
  mockWriteFile.mockResolvedValue(undefined);
  mockSpawn.mockReturnValue({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, callback: (value?: unknown) => void) => {
      if (event === 'close') callback(0);
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Documents routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getDocumentPreview.execute.mockReset();
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
    mockServices.getDocumentPreview.execute.mockResolvedValue({
      body: new Uint8Array([37, 80, 68, 70]),
      contentType: 'application/pdf',
      fileName: 'report.pdf',
    });
    mockServices.documentRepo.findById.mockResolvedValue({
      id: DOC_UUID,
      caseId: CASE_UUID,
      documentType: 'INVITATION',
      status: 'ACTIVE',
    });
    mockServices.createConversation.execute.mockResolvedValue({
      id: CONVERSATION_ID,
      caseId: CASE_UUID,
      category: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
    });
    mockServices.getConversation.execute.mockResolvedValue({
      id: CONVERSATION_ID,
      caseId: CASE_UUID,
      category: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
    });
    mockServices.messageRepo.findById.mockResolvedValue({
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      attachments: [{
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: PDF_STORAGE_KEY,
      }],
    });
    mockServices.storage.getSignedUrl.mockResolvedValue('https://signed.example.com/report.pdf?token=abc');
    mockServices.hospitalRepo.findById.mockResolvedValue({
      id: ASSOCIATED_HOSPITAL_UUID,
      name: 'Associated Hospital',
    });
    mockServices.chcRepo.findByCaseAndHospital.mockResolvedValue(null);
    mockReadFile.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })));
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
      expect(mockServices.createConversation.execute).not.toHaveBeenCalled();
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({
        caseId: CASE_UUID,
        patientId: 'patient-1',
        site: 'beauty',
        subject: 'Your invitation letter is available',
        messagePreview: 'Your hospital uploaded a medical invitation letter for your case.',
        dedupeKey: `document:${DOC_UUID}`,
        channel: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-1',
        sourceKind: 'document',
        sourceId: DOC_UUID,
        resolveConversationId: expect.any(Function),
      }));

      const [notificationInput] = mockServices.notifyPatientOfCaseUpdate.execute.mock.calls[0]!;
      await notificationInput.resolveConversationId();
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'HOSPITAL_PATIENT',
        caseId: CASE_UUID,
        hospitalId: 'hospital-1',
      }, expect.anything());
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
      expect(mockServices.createConversation.execute).not.toHaveBeenCalled();
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({
        subject,
        channel: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-1',
        sourceKind: 'document',
        sourceId: DOC_UUID,
        resolveConversationId: expect.any(Function),
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
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'ADMIN_PATIENT',
        hospitalId: null,
        sourceKind: 'document',
        sourceId: DOC_UUID,
        resolveConversationId: expect.any(Function),
      }));

      const [notificationInput] = mockServices.notifyPatientOfCaseUpdate.execute.mock.calls[0]!;
      await notificationInput.resolveConversationId();
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'ADMIN_PATIENT',
        caseId: CASE_UUID,
      }, expect.anything());
    });

    it('rejects invalid explicit hospitalId format for admin document notifications', async () => {
      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'hospital-2' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.notifyPatientOfCaseUpdate.execute).not.toHaveBeenCalled();
      expect(mockServices.createConversation.execute).not.toHaveBeenCalled();
    });

    it('rejects unrelated explicit hospital routing for admin document notifications', async () => {
      mockServices.hospitalRepo.findById.mockResolvedValue({
        id: UNRELATED_HOSPITAL_UUID,
        name: 'Unrelated Hospital',
      });
      mockServices.chcRepo.findByCaseAndHospital.mockResolvedValue(null);

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: UNRELATED_HOSPITAL_UUID }),
      });

      expect(res.status).toBe(403);
      expect(mockServices.notifyPatientOfCaseUpdate.execute).not.toHaveBeenCalled();
      expect(mockServices.createConversation.execute).not.toHaveBeenCalled();
    });

    it('routes admin document notifications to an associated hospital conversation when hospitalId is explicit', async () => {
      mockServices.createConversation.execute.mockResolvedValue({
        id: 'hospital-conversation-1',
        caseId: CASE_UUID,
        category: 'HOSPITAL_PATIENT',
        hospitalId: ASSOCIATED_HOSPITAL_UUID,
      });
      mockServices.hospitalRepo.findById.mockResolvedValue({
        id: ASSOCIATED_HOSPITAL_UUID,
        name: 'Associated Hospital',
      });
      mockServices.chcRepo.findByCaseAndHospital.mockResolvedValue({
        id: 'chc-1',
        caseId: CASE_UUID,
        hospitalId: ASSOCIATED_HOSPITAL_UUID,
        subStatus: 'DISTRIBUTED',
        removedAt: null,
      });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/notify-patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: ASSOCIATED_HOSPITAL_UUID }),
      });

      expect(res.status).toBe(204);
      expect(mockServices.notifyPatientOfCaseUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'HOSPITAL_PATIENT',
        hospitalId: ASSOCIATED_HOSPITAL_UUID,
        sourceKind: 'document',
        sourceId: DOC_UUID,
        resolveConversationId: expect.any(Function),
      }));

      const [notificationInput] = mockServices.notifyPatientOfCaseUpdate.execute.mock.calls[0]!;
      await notificationInput.resolveConversationId();
      expect(mockServices.createConversation.execute).toHaveBeenCalledWith({
        category: 'HOSPITAL_PATIENT',
        caseId: CASE_UUID,
        hospitalId: ASSOCIATED_HOSPITAL_UUID,
      }, expect.anything());
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

  describe('POST /api/v2/documents/translate', () => {
    it('rejects caller-supplied sourceUrl fetch input', async () => {
      const res = await app.request('/api/v2/documents/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'https://evil.example/internal.pdf',
          fileName: 'report.pdf',
          targetLanguage: 'zh',
        }),
      });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: expect.stringContaining('sourceUrl is not accepted'),
      });
      expect(mockServices.storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects when the attachment storage key is not on the message', async () => {
      const res = await app.request('/api/v2/documents/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          storageKey: 'crm/dev/messages/conversation-1/asset-2/other.pdf',
          fileName: 'other.pdf',
          targetLanguage: 'zh',
        }),
      });

      expect(res.status).toBe(404);
      expect(mockServices.storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects when the actor cannot access the conversation', async () => {
      mockServices.getConversation.execute.mockRejectedValueOnce(new ForbiddenError('Access denied to this conversation'));

      const res = await app.request('/api/v2/documents/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          storageKey: PDF_STORAGE_KEY,
          fileName: 'report.pdf',
          targetLanguage: 'zh',
        }),
      });

      expect(res.status).toBe(403);
      expect(mockServices.storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects URL-like storage keys before signing', async () => {
      const res = await app.request('/api/v2/documents/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          storageKey: 'https://signed.example.com/report.pdf',
          fileName: 'report.pdf',
          targetLanguage: 'zh',
        }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('translates an authorized PDF attachment using its verified storage key', async () => {
      mockSuccessfulBabelDocRun();

      const res = await app.request('/api/v2/documents/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          storageKey: PDF_STORAGE_KEY,
          fileName: 'report.pdf',
          targetLanguage: 'zh',
        }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.getConversation.execute).toHaveBeenCalledWith(CONVERSATION_ID, expect.anything());
      expect(mockServices.storage.getSignedUrl).toHaveBeenCalledWith(PDF_STORAGE_KEY);
      expect(fetch).toHaveBeenCalledWith('https://signed.example.com/report.pdf?token=abc');
      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/pdftranslate-source-1/report.pdf', expect.any(Buffer));
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
  // GET /api/v2/cases/:caseId/documents/:docId/preview — preview document
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/documents/:docId/preview', () => {
    it('allows an admin to preview a document in a case', async () => {
      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/preview`);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('filename="report.pdf"');
      expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''report.pdf");
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
      expect(mockServices.getDocumentPreview.execute).toHaveBeenCalledWith(
        CASE_UUID,
        DOC_UUID,
        expect.objectContaining({ role: 'ADMIN', userId: 'u-1' }),
      );
    });

    it('uses an ASCII fallback and RFC 5987 filename for non-ASCII preview filenames', async () => {
      mockServices.getDocumentPreview.execute.mockResolvedValue({
        body: new Uint8Array([37, 80, 68, 70]),
        contentType: 'application/pdf',
        fileName: '报告.pdf',
      });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/preview`);

      expect(res.status).toBe(200);
      const contentDisposition = res.headers.get('content-disposition') ?? '';
      expect(contentDisposition).toContain('filename="__.pdf"');
      expect(contentDisposition).toContain("filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf");
    });

    it('allows a hospital to preview only when the hospital has case access', async () => {
      currentSession = {
        userId: 'hospital-user-1',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: ASSOCIATED_HOSPITAL_UUID,
      };

      const allowed = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/preview`);
      expect(allowed.status).toBe(200);
      expect(mockServices.getDocumentPreview.execute).toHaveBeenLastCalledWith(
        CASE_UUID,
        DOC_UUID,
        expect.objectContaining({ role: 'HOSPITAL', hospitalId: ASSOCIATED_HOSPITAL_UUID }),
      );

      mockServices.getDocumentPreview.execute.mockReset();
      mockServices.getDocumentPreview.execute.mockImplementation(async () => {
        throw new ForbiddenError('Access denied to this case');
      });
      currentSession = {
        userId: 'hospital-user-2',
        email: 'unrelated@test.com',
        roles: ['HOSPITAL'],
        hospitalId: UNRELATED_HOSPITAL_UUID,
      };

      const denied = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/preview`);
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: 'Access denied to this case', code: 'FORBIDDEN' });
    });

    it('returns 404 when the document does not belong to the case', async () => {
      mockServices.getDocumentPreview.execute.mockReset();
      mockServices.getDocumentPreview.execute.mockImplementation(async () => {
        throw new NotFoundError(`Document ${DOC_UUID} not found`);
      });
      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/preview`);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: `Document ${DOC_UUID} not found`, code: 'NOT_FOUND' });
    });

    it('returns 404 when the document is deleted', async () => {
      mockServices.getDocumentPreview.execute.mockReset();
      mockServices.getDocumentPreview.execute.mockImplementation(async () => {
        throw new NotFoundError(`Document ${DOC_UUID} not found`);
      });

      const res = await app.request(`/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/preview`);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: `Document ${DOC_UUID} not found`, code: 'NOT_FOUND' });
    });

    it('does not accept an arbitrary url query parameter or fetch arbitrary URLs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await app.request(
        `/api/v2/cases/${CASE_UUID}/documents/${DOC_UUID}/preview?url=https%3A%2F%2Fevil.example%2Ffile.pdf`,
      );

      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockServices.getDocumentPreview.execute).toHaveBeenCalledWith(
        CASE_UUID,
        DOC_UUID,
        expect.objectContaining({ role: 'ADMIN' }),
      );
      expect(mockServices.getDocumentPreview.execute.mock.calls.at(-1)).toHaveLength(3);
      fetchSpy.mockRestore();
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
