import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadDocumentUseCase } from '../src/use-cases/documents/upload-document.use-case.js';
import type {
  ICaseRepository,
  IDocumentRepository,
  ICaseProgressRepository,
  ICHCRepository,
} from '@medical-crm/domain';
import { Case, CaseNumber, Document } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('UploadDocumentUseCase', () => {
  let useCase: UploadDocumentUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockDocumentRepo: IDocumentRepository;
  let mockProgressRepo: ICaseProgressRepository;
  let mockChcRepo: ICHCRepository;

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    hospitalId: null,
  };

  const hospitalActor: Actor = {
    userId: 'hospital-user-1',
    email: 'hospital@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-1',
  };

  const makeFreshCase = (assignedHospitalId: string | null = null) =>
    new Case({
      id: 'case-1',
      caseNumber: new CaseNumber('CASE-2026-0001'),
      patientId: 'patient-1',
      patientName: 'Jane Doe',
      patientCountry: null,
      patientLanguage: 'en',
      assignedHospitalId,
      primaryDiagnosis: null,
      diagnosisCode: null,
      symptoms: null,
      medicalHistory: null,
      aiSummary: null,
      aiSummaryLanguage: null,
      riskLevel: null,
      status: 'ACTIVE',
      stage: 'TRANSFERRED_TO_HOSPITAL',
      assignedAt: null,
      createdAt: new Date('2026-01-10T08:00:00Z'),
      updatedAt: new Date('2026-01-10T08:00:00Z'),
    });

  const validInput = {
    caseId: 'case-1',
    fileName: 'report.pdf',
    fileSize: 102400,
    mimeType: 'application/pdf',
    documentType: 'MEDICAL_REPORT',
    sensitivity: 'NORMAL',
    language: 'en',
    storageKey: 'crm/dev/cases/documents/case-1/asset-123/report.pdf',
  };

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockImplementation(() => Promise.resolve(makeFreshCase('hosp-1'))),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockDocumentRepo = {
      findById: vi.fn(),
      findByStorageKey: vi.fn().mockResolvedValue(null),
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((doc) => Promise.resolve(doc)),
      softDelete: vi.fn(),
    };

    mockProgressRepo = {
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((progress) => Promise.resolve(progress)),
    };
    mockChcRepo = {
      findById: vi.fn(),
      findByCaseAndHospital: vi.fn().mockResolvedValue(null),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn(),
      rejectOthersByCaseExcept: vi.fn(),
    };

    useCase = new UploadDocumentUseCase(
      mockDocumentRepo,
      mockCaseRepo,
      mockProgressRepo,
      mockChcRepo,
    );
  });

  it('uses the provided storageKey and returns documentId', async () => {
    const result = await useCase.execute(validInput, adminActor);

    expect(result.documentId).toBeTruthy();
    expect(result).not.toHaveProperty('upload');
  });

  it('returns the existing document when storageKey was already saved', async () => {
    vi.mocked(mockDocumentRepo.findByStorageKey).mockResolvedValue(new Document({
      id: 'doc-existing',
      caseId: 'case-1',
      uploadedById: 'admin-1',
      fileName: 'report.pdf',
      fileSize: 102400,
      mimeType: 'application/pdf',
      storageKey: validInput.storageKey,
      documentType: 'MEDICAL_REPORT',
      sensitivity: 'NORMAL',
      language: 'en',
      isTranslated: false,
      status: 'PENDING',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    }));

    const result = await useCase.execute(validInput, adminActor);

    expect(result.documentId).toBe('doc-existing');
    expect(mockDocumentRepo.save).not.toHaveBeenCalled();
    expect(mockProgressRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute(validInput, adminActor),
    ).rejects.toThrow('Case case-1 not found');
  });

  it('throws ForbiddenError when hospital actor accesses a different hospital case', async () => {
    mockCaseRepo.findById = vi.fn().mockImplementation(() =>
      Promise.resolve(makeFreshCase('other-hosp')),
    );

    await expect(
      useCase.execute(validInput, hospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('allows hospital actor to upload to their own assigned case', async () => {
    // makeFreshCase defaults to assignedHospitalId = 'hosp-1' (same as hospitalActor)
    const result = await useCase.execute(validInput, hospitalActor);

    expect(result.documentId).toBeTruthy();
    expect(mockDocumentRepo.save).toHaveBeenCalledOnce();
  });

  it('allows hospital actor to upload to a distributed case contact', async () => {
    mockCaseRepo.findById = vi.fn().mockImplementation(() =>
      Promise.resolve(makeFreshCase('primary-hosp')),
    );
    vi.mocked(mockChcRepo.findByCaseAndHospital).mockResolvedValue({
      id: 'chc-1',
      caseId: 'case-1',
      hospitalId: 'hosp-1',
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: null,
      distributedAt: new Date('2026-03-01T08:00:00Z'),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date('2026-03-01T08:00:00Z'),
      updatedAt: new Date('2026-03-01T08:00:00Z'),
    } as any);

    const result = await useCase.execute(validInput, hospitalActor);

    expect(result.documentId).toBeTruthy();
    expect(mockDocumentRepo.save).toHaveBeenCalledOnce();
  });

  it('saves document metadata to repo with correct fields', async () => {
    await useCase.execute(validInput, adminActor);

    expect(mockDocumentRepo.save).toHaveBeenCalledOnce();
    const savedDoc = (mockDocumentRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedDoc.caseId).toBe('case-1');
    expect(savedDoc.uploadedById).toBe('admin-1');
    expect(savedDoc.fileName).toBe('report.pdf');
    expect(savedDoc.fileSize).toBe(102400);
    expect(savedDoc.mimeType).toBe('application/pdf');
    expect(savedDoc.documentType).toBe('MEDICAL_REPORT');
    expect(savedDoc.sensitivity).toBe('NORMAL');
    expect(savedDoc.language).toBe('en');
    expect(savedDoc.isTranslated).toBe(false);
    expect(savedDoc.status).toBe('PENDING');
    expect(savedDoc.storageKey).toBe('crm/dev/cases/documents/case-1/asset-123/report.pdf');
  });

  it('creates a DOCUMENT_UPLOAD progress entry', async () => {
    const result = await useCase.execute(validInput, adminActor);

    expect(mockProgressRepo.save).toHaveBeenCalledOnce();
    const savedProgress = (mockProgressRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedProgress.progressType).toBe('DOCUMENT_UPLOAD');
    expect(savedProgress.caseId).toBe('case-1');
    expect(savedProgress.title).toContain('report.pdf');
    expect(savedProgress.metadata).toMatchObject({ documentId: result.documentId });
    expect(savedProgress.recordedById).toBe('admin-1');
  });
});
