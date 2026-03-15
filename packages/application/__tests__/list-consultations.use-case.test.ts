import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListConsultationsUseCase } from '../src/use-cases/consultations/list-consultations.use-case.js';
import type { IConsultationRepository } from '@medical-crm/domain';
import { Consultation } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

const makeConsultation = (overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {}) =>
  new Consultation({
    id: 'consult-1',
    caseId: 'case-1',
    hospitalId: 'hosp-1',
    patientId: 'patient-1',
    doctorId: null,
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-03-20T10:00:00Z'),
    startedAt: null,
    endedAt: null,
    durationMinutes: 60,
    actualDuration: null,
    consultationLink: null,
    aiTranslation: false,
    patientLanguage: 'zh',
    notes: null,
    videoStorageKey: null,
    videoSize: null,
    videoDuration: null,
    videoThumbnail: null,
    videoUploadedAt: null,
    aiSummary: null,
    aiSummaryCreatedAt: null,
    aiSummaryStatus: 'PENDING',
    createdAt: new Date('2026-03-15T08:00:00Z'),
    updatedAt: new Date('2026-03-15T08:00:00Z'),
    ...overrides,
  });

const adminActor: Actor = { userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN', hospitalId: null };
const hospitalActor: Actor = { userId: 'h-1', email: 'h@test.com', role: 'HOSPITAL', hospitalId: 'hosp-1' };

const defaultCursorResult = {
  data: [makeConsultation()],
  nextCursor: null,
  hasMore: false,
};

describe('ListConsultationsUseCase', () => {
  let useCase: ListConsultationsUseCase;
  let mockConsultationRepo: IConsultationRepository;

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn(),
      findMany: vi.fn().mockResolvedValue(defaultCursorResult),
      findByCaseId: vi.fn(),
      save: vi.fn(),
      countByFilters: vi.fn(),
    };

    useCase = new ListConsultationsUseCase(mockConsultationRepo);
  });

  it('throws ForbiddenError when actor is ADMIN (not HOSPITAL)', async () => {
    await expect(
      useCase.execute({}, adminActor),
    ).rejects.toThrow('Only hospital users can list consultations');
  });

  it('passes hospitalId from actor to findMany', async () => {
    await useCase.execute({}, hospitalActor);

    expect(mockConsultationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: 'hosp-1' }),
    );
  });

  it('returns ConsultationDTO[] with mapped fields', async () => {
    const result = await useCase.execute({}, hospitalActor);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe('consult-1');
    expect(result.data[0]!.caseId).toBe('case-1');
    expect(result.data[0]!.hospitalId).toBe('hosp-1');
    expect(result.data[0]!.status).toBe('SCHEDULED');
    expect(typeof result.data[0]!.scheduledAt).toBe('string');
    expect(result.data[0]!.scheduledAt).toBe('2026-03-20T10:00:00.000Z');
  });

  it('uses default limit of 20 when not provided', async () => {
    await useCase.execute({}, hospitalActor);

    expect(mockConsultationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('uses provided limit when specified', async () => {
    await useCase.execute({ limit: 10 }, hospitalActor);

    expect(mockConsultationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('returns nextCursor as null when repo returns null nextCursor', async () => {
    const result = await useCase.execute({}, hospitalActor);

    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('returns nextCursor as scheduledAt_id string when repo returns a cursor', async () => {
    mockConsultationRepo.findMany = vi.fn().mockResolvedValue({
      data: [makeConsultation()],
      nextCursor: { scheduledAt: '2026-03-20T10:00:00.000Z', id: 'consult-1' },
      hasMore: true,
    });

    const result = await useCase.execute({}, hospitalActor);

    expect(result.nextCursor).toBe('2026-03-20T10:00:00.000Z_consult-1');
    expect(result.hasMore).toBe(true);
  });

  it('parses cursor and passes it to findMany', async () => {
    const cursor = '2026-03-20T10:00:00.000Z_consult-1';
    await useCase.execute({ cursor }, hospitalActor);

    expect(mockConsultationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { scheduledAt: '2026-03-20T10:00:00.000Z', id: 'consult-1' },
      }),
    );
  });

  it('throws ValidationError when cursor format is invalid (no underscore)', async () => {
    await expect(
      useCase.execute({ cursor: 'invalidcursor' }, hospitalActor),
    ).rejects.toThrow('Invalid cursor format');
  });

  it('throws ValidationError when cursor has empty parts', async () => {
    await expect(
      useCase.execute({ cursor: '_consult-1' }, hospitalActor),
    ).rejects.toThrow('Invalid cursor format');
  });

  it('passes status filter to findMany when provided', async () => {
    await useCase.execute({ status: 'SCHEDULED' }, hospitalActor);

    expect(mockConsultationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SCHEDULED' }),
    );
  });

  it('does not pass cursor to findMany when not provided', async () => {
    await useCase.execute({}, hospitalActor);

    expect(mockConsultationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined }),
    );
  });
});
