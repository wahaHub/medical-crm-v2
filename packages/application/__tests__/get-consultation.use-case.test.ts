import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetConsultationUseCase } from '../src/use-cases/consultations/get-consultation.use-case.js';
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
const otherHospitalActor: Actor = { userId: 'h-2', email: 'h2@test.com', role: 'HOSPITAL', hospitalId: 'hosp-2' };

describe('GetConsultationUseCase', () => {
  let useCase: GetConsultationUseCase;
  let mockConsultationRepo: IConsultationRepository;

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn().mockResolvedValue(makeConsultation()),
      findMany: vi.fn(),
      findByCaseId: vi.fn(),
      save: vi.fn(),
      countByFilters: vi.fn(),
    };

    useCase = new GetConsultationUseCase(mockConsultationRepo);
  });

  it('ADMIN can view any consultation', async () => {
    const result = await useCase.execute('consult-1', adminActor);

    expect(result.id).toBe('consult-1');
    expect(mockConsultationRepo.findById).toHaveBeenCalledWith('consult-1');
  });

  it('HOSPITAL can view a consultation when hospitalId matches', async () => {
    const result = await useCase.execute('consult-1', hospitalActor);

    expect(result.id).toBe('consult-1');
    expect(result.hospitalId).toBe('hosp-1');
  });

  it('throws ForbiddenError when HOSPITAL actor does not own the consultation', async () => {
    await expect(
      useCase.execute('consult-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this consultation');
  });

  it('throws NotFoundError when consultation does not exist', async () => {
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-id', adminActor),
    ).rejects.toThrow('Consultation missing-id not found');
  });

  it('throws NotFoundError with correct message for HOSPITAL actor on missing consultation', async () => {
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-id', hospitalActor),
    ).rejects.toThrow('Consultation missing-id not found');
  });

  it('returns ConsultationDTO with ISO string dates', async () => {
    const result = await useCase.execute('consult-1', adminActor);

    expect(typeof result.createdAt).toBe('string');
    expect(result.createdAt).toBe('2026-03-15T08:00:00.000Z');
    expect(result.scheduledAt).toBe('2026-03-20T10:00:00.000Z');
  });

  it('maps all fields correctly in the DTO', async () => {
    const result = await useCase.execute('consult-1', adminActor);

    expect(result.caseId).toBe('case-1');
    expect(result.hospitalId).toBe('hosp-1');
    expect(result.patientId).toBe('patient-1');
    expect(result.doctorId).toBeNull();
    expect(result.status).toBe('SCHEDULED');
    expect(result.durationMinutes).toBe(60);
    expect(result.aiTranslation).toBe(false);
    expect(result.patientLanguage).toBe('zh');
    expect(result.aiSummaryStatus).toBe('PENDING');
  });

  it('returns null for optional fields that are not set', async () => {
    const result = await useCase.execute('consult-1', adminActor);

    expect(result.startedAt).toBeNull();
    expect(result.endedAt).toBeNull();
    expect(result.actualDuration).toBeNull();
    expect(result.consultationLink).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.videoStorageKey).toBeNull();
    expect(result.aiSummary).toBeNull();
  });
});
