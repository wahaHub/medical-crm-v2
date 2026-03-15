import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadDocumentUseCase } from '../src/use-cases/documents/upload-document.use-case.js';
import type {
  ICaseRepository,
  IDocumentRepository,
  ICaseProgressRepository,
  IStorageService,
  PresignedUploadResult,
} from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('UploadDocumentUseCase', () => {
  let useCase: UploadDocumentUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockDocumentRepo: IDocumentRepository;
  let mockProgressRepo: ICaseProgressRepository;
  let mockStorageService: IStorageService;

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

  const fakeUploadResult: PresignedUploadResult = {
    uploadUrl: 'https://storage.example.com/upload',
    storageKey: 'documents/case-1/doc-id/report.pdf',
    path: 'documents/case-1/doc-id/report.pdf',
    token: 'fake-token',
    expiresIn: 3600,
  };

  const validInput = {
    caseId: 'case-1',
    fileName: 'report.pdf',
    fileSize: 102400,
    mimeType: 'application/pdf',
    documentType: 'MEDICAL_REPORT',
    sensitivity: 'NORMAL',
    language: 'en',
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
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((doc) => Promise.resolve(doc)),
      softDelete: vi.fn(),
    };

    mockProgressRepo = {
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((progress) => Promise.resolve(progress)),
    };

    mockStorageService = {
      createPresignedUpload: vi.fn().mockResolvedValue(fakeUploadResult),
      getSignedUrl: vi.fn(),
      getSignedUrls: vi.fn(),
    };

    useCase = new UploadDocumentUseCase(
      mockDocumentRepo,
      mockCaseRepo,
      mockProgressRepo,
      mockStorageService,
    );
  });

  it('generates storage key as documents/{caseId}/{uuid}/{fileName}', async () => {
    const result = await useCase.execute(validInput, adminActor);

    expect(mockStorageService.createPresignedUpload).toHaveBeenCalledOnce();
    const [storageKey, mimeType] = (mockStorageService.createPresignedUpload as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(storageKey).toMatch(/^documents\/case-1\/[^/]+\/report\.pdf$/);
    expect(mimeType).toBe('application/pdf');
    expect(result.documentId).toBeTruthy();
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

  it('calls storageService.createPresignedUpload and returns presigned result', async () => {
    const result = await useCase.execute(validInput, adminActor);

    expect(result.upload).toEqual(fakeUploadResult);
    expect(mockStorageService.createPresignedUpload).toHaveBeenCalledOnce();
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
