import type { ICaseRepository, IDocumentRepository, IStorageService, ICHCRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../types/actor.js';
import { GetDocumentPreviewUseCase } from './get-document-preview.use-case.js';

const CASE_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_CASE_ID = '00000000-0000-0000-0000-000000000099';
const DOC_ID = '00000000-0000-0000-0000-000000000002';
const HOSPITAL_ID = '10000000-0000-0000-0000-000000000001';
const OTHER_HOSPITAL_ID = '10000000-0000-0000-0000-000000000099';
const STORAGE_KEY = 'crm/dev/cases/documents/case-1/document.pdf';
const SIGNED_URL = 'https://storage.example.com/signed/document.pdf';

const adminActor: Actor = {
  role: 'ADMIN',
  userId: 'admin-1',
  email: 'admin@test.com',
  hospitalId: null,
};

const hospitalActor: Actor = {
  role: 'HOSPITAL',
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  hospitalId: OTHER_HOSPITAL_ID,
};

describe('GetDocumentPreviewUseCase', () => {
  let documentRepo: IDocumentRepository;
  let caseRepo: ICaseRepository;
  let storageService: IStorageService;
  let chcRepo: ICHCRepository;
  let fetchFn: ReturnType<typeof vi.fn>;
  let useCase: GetDocumentPreviewUseCase;

  beforeEach(() => {
    documentRepo = {
      findById: vi.fn().mockResolvedValue(buildDocument()),
      findByCaseId: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
    } as unknown as IDocumentRepository;
    caseRepo = {
      findById: vi.fn().mockResolvedValue(buildCase()),
      findMany: vi.fn(),
      findByPatientId: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    } as unknown as ICaseRepository;
    storageService = {
      createPresignedUpload: vi.fn(),
      getSignedUrl: vi.fn().mockResolvedValue(SIGNED_URL),
      getSignedUrls: vi.fn(),
    };
    chcRepo = {
      findByCaseAndHospital: vi.fn().mockResolvedValue(null),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as ICHCRepository;
    fetchFn = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), {
      headers: { 'Content-Type': 'application/pdf' },
    }));
    useCase = new GetDocumentPreviewUseCase(documentRepo, caseRepo, storageService, chcRepo, fetchFn);
  });

  it('returns NotFoundError for mismatched case/document and does not fetch a signed URL', async () => {
    vi.mocked(documentRepo.findById).mockResolvedValue(buildDocument({ caseId: OTHER_CASE_ID }));

    await expect(useCase.execute(CASE_ID, DOC_ID, adminActor)).rejects.toBeInstanceOf(NotFoundError);

    expect(storageService.getSignedUrl).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns NotFoundError for deleted documents and does not fetch a signed URL', async () => {
    vi.mocked(documentRepo.findById).mockResolvedValue(buildDocument({ status: 'DELETED' }));

    await expect(useCase.execute(CASE_ID, DOC_ID, adminActor)).rejects.toBeInstanceOf(NotFoundError);

    expect(storageService.getSignedUrl).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects hospitals without case access and does not fetch a signed URL', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(buildCase({ assignedHospitalId: HOSPITAL_ID }));

    await expect(useCase.execute(CASE_ID, DOC_ID, hospitalActor)).rejects.toBeInstanceOf(ForbiddenError);

    expect(chcRepo.findByCaseAndHospital).toHaveBeenCalledWith(CASE_ID, OTHER_HOSPITAL_ID);
    expect(storageService.getSignedUrl).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches only the signed URL for the document storage key', async () => {
    const result = await useCase.execute(CASE_ID, DOC_ID, adminActor);

    expect(storageService.getSignedUrl).toHaveBeenCalledWith(STORAGE_KEY);
    expect(storageService.getSignedUrl).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(SIGNED_URL);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      contentType: 'application/pdf',
      fileName: 'document.pdf',
    });
    expect(new Uint8Array(result.body)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });
});

function buildDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    caseId: CASE_ID,
    uploadedById: 'admin-1',
    fileName: 'document.pdf',
    fileSize: 4,
    mimeType: 'application/pdf',
    storageKey: STORAGE_KEY,
    documentType: 'LAB',
    sensitivity: 'STANDARD',
    language: 'en',
    isTranslated: false,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as never;
}

function buildCase(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    assignedHospitalId: HOSPITAL_ID,
    ...overrides,
  } as never;
}
