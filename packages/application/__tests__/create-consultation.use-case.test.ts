import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateConsultationUseCase } from '../src/use-cases/consultations/create-consultation.use-case.js';

const mockTranslationTaskService = { enqueue: vi.fn() };
import type { IConsultationRepository, ICaseRepository } from '@medical-crm/domain';
import { Consultation, Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

const makeCase = (overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}) =>
  new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    patientName: 'Jane Doe',
    patientCountry: 'CN',
    patientLanguage: 'zh',
    assignedHospitalId: 'hosp-1',
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: new Date('2026-01-10T08:00:00Z'),
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-10T08:00:00Z'),
    ...overrides,
  });

const adminActor: Actor = { userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN', hospitalId: null };
const hospitalActor: Actor = { userId: 'h-1', email: 'h@test.com', role: 'HOSPITAL', hospitalId: 'hosp-1' };
const otherHospitalActor: Actor = { userId: 'h-2', email: 'h2@test.com', role: 'HOSPITAL', hospitalId: 'hosp-2' };

const scheduledAt = new Date('2026-03-20T10:00:00Z');

describe('CreateConsultationUseCase', () => {
  let useCase: CreateConsultationUseCase;
  let mockConsultationRepo: IConsultationRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((entity: Consultation) => Promise.resolve(entity)),
      countByFilters: vi.fn(),
    };

    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(makeCase()),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    useCase = new CreateConsultationUseCase(mockConsultationRepo, mockCaseRepo, mockTranslationTaskService as any);
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute({ caseId: 'missing-case', scheduledAt }, adminActor),
    ).rejects.toThrow('Case missing-case not found');
  });

  it('throws ForbiddenError when HOSPITAL actor does not own the case', async () => {
    await expect(
      useCase.execute({ caseId: 'case-1', scheduledAt }, otherHospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('ADMIN can create a consultation for any case', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.caseId).toBe('case-1');
    expect(result.status).toBe('SCHEDULED');
    expect(mockConsultationRepo.save).toHaveBeenCalledOnce();
  });

  it('HOSPITAL can create a consultation for their assigned case', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, hospitalActor);

    expect(result.caseId).toBe('case-1');
    expect(result.status).toBe('SCHEDULED');
  });

  it('sets hospitalId from case.assignedHospitalId', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.hospitalId).toBe('hosp-1');
  });

  it('sets patientId from case.patientId', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.patientId).toBe('patient-1');
  });

  it('sets doctorId to null initially', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.doctorId).toBeNull();
  });

  it('sets aiSummaryStatus to PENDING', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.aiSummaryStatus).toBe('PENDING');
  });

  it('uses scheduledAt from input', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.scheduledAt).toBe(scheduledAt.toISOString());
  });

  it('uses optional durationMinutes from input', async () => {
    const result = await useCase.execute(
      { caseId: 'case-1', scheduledAt, durationMinutes: 30 },
      adminActor,
    );

    expect(result.durationMinutes).toBe(30);
  });

  it('uses default durationMinutes of 30 when not provided', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.durationMinutes).toBe(30);
  });

  it('sets consultationLink from input', async () => {
    const result = await useCase.execute(
      { caseId: 'case-1', scheduledAt, consultationLink: 'https://meet.example.com/abc' },
      adminActor,
    );

    expect(result.consultationLink).toBe('https://meet.example.com/abc');
  });

  it('sets consultationLink to null when not provided', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.consultationLink).toBeNull();
  });

  it('sets aiTranslation from input', async () => {
    const result = await useCase.execute(
      { caseId: 'case-1', scheduledAt, aiTranslation: true },
      adminActor,
    );

    expect(result.aiTranslation).toBe(true);
  });

  it('defaults aiTranslation to false when not provided', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.aiTranslation).toBe(false);
  });

  it('uses patientLanguage from input when provided', async () => {
    const result = await useCase.execute(
      { caseId: 'case-1', scheduledAt, patientLanguage: 'en' },
      adminActor,
    );

    expect(result.patientLanguage).toBe('en');
  });

  it('falls back to case.patientLanguage when patientLanguage not provided', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.patientLanguage).toBe('zh');
  });

  it('sets notes from input', async () => {
    const result = await useCase.execute(
      { caseId: 'case-1', scheduledAt, notes: 'Pre-op consultation' },
      adminActor,
    );

    expect(result.notes).toBe('Pre-op consultation');
  });

  it('sets notes to null when not provided', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.notes).toBeNull();
  });

  it('returns a ConsultationDTO with string dates', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('initialises video and aiSummary fields to null', async () => {
    const result = await useCase.execute({ caseId: 'case-1', scheduledAt }, adminActor);

    expect(result.videoStorageKey).toBeNull();
    expect(result.videoSize).toBeNull();
    expect(result.videoDuration).toBeNull();
    expect(result.videoThumbnail).toBeNull();
    expect(result.videoUploadedAt).toBeNull();
    expect(result.aiSummary).toBeNull();
    expect(result.aiSummaryCreatedAt).toBeNull();
    expect(result.startedAt).toBeNull();
    expect(result.endedAt).toBeNull();
    expect(result.actualDuration).toBeNull();
  });
});
