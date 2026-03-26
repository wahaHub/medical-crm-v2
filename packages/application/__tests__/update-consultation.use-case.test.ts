import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateConsultationUseCase } from '../src/use-cases/consultations/update-consultation.use-case.js';

const mockTranslationTaskService = { enqueue: vi.fn() };
import { UpdateConsultationStatusUseCase } from '../src/use-cases/consultations/update-consultation-status.use-case.js';
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

// ─── UpdateConsultationUseCase ────────────────────────────────────────────────

describe('UpdateConsultationUseCase', () => {
  let useCase: UpdateConsultationUseCase;
  let mockConsultationRepo: IConsultationRepository;

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn().mockResolvedValue(makeConsultation()),
      findMany: vi.fn(),
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((entity: Consultation) => Promise.resolve(entity)),
      countByFilters: vi.fn(),
    };

    useCase = new UpdateConsultationUseCase(mockConsultationRepo, mockTranslationTaskService as any);
  });

  it('throws NotFoundError when consultation does not exist', async () => {
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-id', {}, adminActor),
    ).rejects.toThrow('Consultation missing-id not found');
  });

  it('throws ForbiddenError when HOSPITAL actor does not own the consultation', async () => {
    await expect(
      useCase.execute('consult-1', {}, otherHospitalActor),
    ).rejects.toThrow('Access denied to this consultation');
  });

  it('ADMIN can update any consultation', async () => {
    const result = await useCase.execute('consult-1', { notes: 'Updated notes' }, adminActor);

    expect(result.id).toBe('consult-1');
    expect(mockConsultationRepo.save).toHaveBeenCalledOnce();
  });

  it('HOSPITAL can update their own consultation', async () => {
    const result = await useCase.execute('consult-1', { notes: 'Hospital notes' }, hospitalActor);

    expect(result.id).toBe('consult-1');
  });

  it('updates scheduledAt when provided', async () => {
    const newDate = new Date('2026-04-01T14:00:00Z');
    const result = await useCase.execute('consult-1', { scheduledAt: newDate }, adminActor);

    expect(result.scheduledAt).toBe(newDate.toISOString());
  });

  it('updates durationMinutes when provided', async () => {
    const result = await useCase.execute('consult-1', { durationMinutes: 45 }, adminActor);

    expect(result.durationMinutes).toBe(45);
  });

  it('updates consultationLink when provided', async () => {
    const result = await useCase.execute(
      'consult-1',
      { consultationLink: 'https://meet.example.com/new-link' },
      adminActor,
    );

    expect(result.consultationLink).toBe('https://meet.example.com/new-link');
  });

  it('updates notes when provided', async () => {
    const result = await useCase.execute('consult-1', { notes: 'New consultation notes' }, adminActor);

    expect(result.notes).toBe('New consultation notes');
  });

  it('updates aiTranslation when provided', async () => {
    const result = await useCase.execute('consult-1', { aiTranslation: true }, adminActor);

    expect(result.aiTranslation).toBe(true);
  });

  it('updates patientLanguage when provided', async () => {
    const result = await useCase.execute('consult-1', { patientLanguage: 'en' }, adminActor);

    expect(result.patientLanguage).toBe('en');
  });

  it('does not update fields that are not provided (partial update)', async () => {
    const consultation = makeConsultation({
      durationMinutes: 90,
      consultationLink: 'https://original.link',
      notes: 'Original notes',
    });
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(consultation);

    const result = await useCase.execute('consult-1', { notes: 'Only notes updated' }, adminActor);

    expect(result.durationMinutes).toBe(90);
    expect(result.consultationLink).toBe('https://original.link');
    expect(result.notes).toBe('Only notes updated');
  });

  it('updates multiple fields at once', async () => {
    const newDate = new Date('2026-04-15T09:00:00Z');
    const result = await useCase.execute(
      'consult-1',
      {
        scheduledAt: newDate,
        durationMinutes: 30,
        consultationLink: 'https://new.link',
        notes: 'Multi-update',
        aiTranslation: true,
        patientLanguage: 'en',
      },
      adminActor,
    );

    expect(result.scheduledAt).toBe(newDate.toISOString());
    expect(result.durationMinutes).toBe(30);
    expect(result.consultationLink).toBe('https://new.link');
    expect(result.notes).toBe('Multi-update');
    expect(result.aiTranslation).toBe(true);
    expect(result.patientLanguage).toBe('en');
  });

  it('returns a ConsultationDTO', async () => {
    const result = await useCase.execute('consult-1', {}, adminActor);

    expect(typeof result.id).toBe('string');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(result.caseId).toBe('case-1');
  });

  it('calls save exactly once with the updated entity', async () => {
    await useCase.execute('consult-1', { notes: 'Saved once' }, adminActor);

    expect(mockConsultationRepo.save).toHaveBeenCalledOnce();
  });
});

// ─── UpdateConsultationStatusUseCase ─────────────────────────────────────────

describe('UpdateConsultationStatusUseCase', () => {
  let useCase: UpdateConsultationStatusUseCase;
  let mockConsultationRepo: IConsultationRepository;

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn().mockResolvedValue(makeConsultation()),
      findMany: vi.fn(),
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((entity: Consultation) => Promise.resolve(entity)),
      countByFilters: vi.fn(),
    };

    useCase = new UpdateConsultationStatusUseCase(mockConsultationRepo);
  });

  it('throws NotFoundError when consultation does not exist', async () => {
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-id', 'IN_PROGRESS', adminActor),
    ).rejects.toThrow('Consultation missing-id not found');
  });

  it('throws ForbiddenError when HOSPITAL actor does not own the consultation', async () => {
    await expect(
      useCase.execute('consult-1', 'IN_PROGRESS', otherHospitalActor),
    ).rejects.toThrow('Access denied to this consultation');
  });

  it('ADMIN can update status for any consultation', async () => {
    const result = await useCase.execute('consult-1', 'IN_PROGRESS', adminActor);

    expect(result.status).toBe('IN_PROGRESS');
    expect(result.startedAt).not.toBeNull();
  });

  it('HOSPITAL can update status for their own consultation', async () => {
    const result = await useCase.execute('consult-1', 'IN_PROGRESS', hospitalActor);

    expect(result.status).toBe('IN_PROGRESS');
  });

  it('calls entity.start() when target status is IN_PROGRESS (sets startedAt)', async () => {
    const result = await useCase.execute('consult-1', 'IN_PROGRESS', adminActor);

    expect(result.status).toBe('IN_PROGRESS');
    expect(result.startedAt).not.toBeNull();
  });

  it('calls entity.complete() when target status is COMPLETED (sets endedAt)', async () => {
    const inProgressConsultation = makeConsultation({ status: 'IN_PROGRESS', startedAt: new Date() });
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(inProgressConsultation);

    const result = await useCase.execute('consult-1', 'COMPLETED', adminActor);

    expect(result.status).toBe('COMPLETED');
    expect(result.endedAt).not.toBeNull();
  });

  it('calls entity.cancel() when target status is CANCELLED', async () => {
    const result = await useCase.execute('consult-1', 'CANCELLED', adminActor);

    expect(result.status).toBe('CANCELLED');
  });

  it('calls entity.noShow() when target status is NO_SHOW', async () => {
    const result = await useCase.execute('consult-1', 'NO_SHOW', adminActor);

    expect(result.status).toBe('NO_SHOW');
  });

  it('saves the entity after status transition', async () => {
    await useCase.execute('consult-1', 'IN_PROGRESS', adminActor);

    expect(mockConsultationRepo.save).toHaveBeenCalledOnce();
  });

  it('returns a ConsultationDTO with string dates', async () => {
    const result = await useCase.execute('consult-1', 'IN_PROGRESS', adminActor);

    expect(typeof result.id).toBe('string');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('throws ValidationError on invalid transition COMPLETED -> IN_PROGRESS (entity throws)', async () => {
    const completedConsultation = makeConsultation({ status: 'COMPLETED' });
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(completedConsultation);

    await expect(
      useCase.execute('consult-1', 'IN_PROGRESS', adminActor),
    ).rejects.toThrow();
  });

  it('throws ValidationError on invalid transition CANCELLED -> COMPLETED (entity throws)', async () => {
    const cancelledConsultation = makeConsultation({ status: 'CANCELLED' });
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(cancelledConsultation);

    await expect(
      useCase.execute('consult-1', 'COMPLETED', adminActor),
    ).rejects.toThrow();
  });

  it('throws ValidationError on invalid transition IN_PROGRESS -> SCHEDULED (entity throws)', async () => {
    const inProgressConsultation = makeConsultation({ status: 'IN_PROGRESS', startedAt: new Date() });
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(inProgressConsultation);

    await expect(
      useCase.execute('consult-1', 'SCHEDULED', adminActor),
    ).rejects.toThrow();
  });

  it('does not call save if entity transition throws', async () => {
    const completedConsultation = makeConsultation({ status: 'COMPLETED' });
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(completedConsultation);

    await expect(
      useCase.execute('consult-1', 'IN_PROGRESS', adminActor),
    ).rejects.toThrow();

    expect(mockConsultationRepo.save).not.toHaveBeenCalled();
  });

  it('calculates actualDuration after COMPLETED transition', async () => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const inProgressConsultation = makeConsultation({ status: 'IN_PROGRESS', startedAt });
    mockConsultationRepo.findById = vi.fn().mockResolvedValue(inProgressConsultation);

    const result = await useCase.execute('consult-1', 'COMPLETED', adminActor);

    expect(result.actualDuration).not.toBeNull();
    expect(result.actualDuration).toBeGreaterThanOrEqual(29);
    expect(result.actualDuration).toBeLessThanOrEqual(31);
  });
});
