import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetConsultationTranscriptUseCase } from '../src/use-cases/consultations/get-consultation-transcript.use-case.js';
import { GetConsultationStatsUseCase } from '../src/use-cases/consultations/get-consultation-stats.use-case.js';
import { ListCaseConsultationsUseCase } from '../src/use-cases/consultations/list-case-consultations.use-case.js';
import type { IConsultationRepository, IConsultationTranscriptRepository, ICaseRepository } from '@medical-crm/domain';
import { Consultation, ConsultationTranscript, Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ─── Factories ───────────────────────────────────────────────────────────────

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

const makeTranscript = (overrides: Partial<ConstructorParameters<typeof ConsultationTranscript>[0]> = {}) =>
  new ConsultationTranscript({
    id: 'transcript-1',
    consultationId: 'consult-1',
    originalLang: 'zh',
    translatedLang: 'en',
    entries: [{ timestamp: 0, speaker: 'Doctor', text: 'Hello', translatedText: '你好' }],
    status: 'COMPLETED',
    generatedAt: new Date('2026-03-20T11:00:00Z'),
    createdAt: new Date('2026-03-20T11:00:00Z'),
    updatedAt: new Date('2026-03-20T11:00:00Z'),
    ...overrides,
  });

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

// ─── Actors ───────────────────────────────────────────────────────────────────

const adminActor: Actor = { userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN', hospitalId: null };
const hospitalActor: Actor = { userId: 'h-1', email: 'h@test.com', role: 'HOSPITAL', hospitalId: 'hosp-1' };
const otherHospitalActor: Actor = { userId: 'h-2', email: 'h2@test.com', role: 'HOSPITAL', hospitalId: 'hosp-2' };

// ─── GetConsultationTranscriptUseCase ────────────────────────────────────────

describe('GetConsultationTranscriptUseCase', () => {
  let useCase: GetConsultationTranscriptUseCase;
  let mockConsultationRepo: IConsultationRepository;
  let mockTranscriptRepo: IConsultationTranscriptRepository;

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn().mockResolvedValue(makeConsultation()),
      findMany: vi.fn(),
      findByCaseId: vi.fn(),
      save: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockTranscriptRepo = {
      findByConsultationId: vi.fn().mockResolvedValue(makeTranscript()),
      save: vi.fn(),
    };

    useCase = new GetConsultationTranscriptUseCase(mockConsultationRepo, mockTranscriptRepo);
  });

  it('ADMIN can get transcript for any consultation', async () => {
    const result = await useCase.execute('consult-1', adminActor);

    expect(result.id).toBe('transcript-1');
    expect(result.consultationId).toBe('consult-1');
    expect(mockConsultationRepo.findById).toHaveBeenCalledWith('consult-1');
    expect(mockTranscriptRepo.findByConsultationId).toHaveBeenCalledWith('consult-1');
  });

  it('HOSPITAL can get transcript when hospitalId matches', async () => {
    const result = await useCase.execute('consult-1', hospitalActor);

    expect(result.id).toBe('transcript-1');
    expect(result.consultationId).toBe('consult-1');
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

  it('throws NotFoundError when transcript does not exist', async () => {
    mockTranscriptRepo.findByConsultationId = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('consult-1', adminActor),
    ).rejects.toThrow('Transcript for consultation consult-1 not found');
  });

  it('returns ConsultationTranscriptDTO with correct fields', async () => {
    const result = await useCase.execute('consult-1', adminActor);

    expect(result.originalLang).toBe('zh');
    expect(result.translatedLang).toBe('en');
    expect(result.status).toBe('COMPLETED');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].speaker).toBe('Doctor');
    expect(typeof result.generatedAt).toBe('string');
    expect(typeof result.createdAt).toBe('string');
  });
});

// ─── GetConsultationStatsUseCase ─────────────────────────────────────────────

describe('GetConsultationStatsUseCase', () => {
  let useCase: GetConsultationStatsUseCase;
  let mockConsultationRepo: IConsultationRepository;

  const mockStats = {
    total: 50,
    scheduled: 10,
    completed: 35,
    todayCount: 3,
    needsTranslation: 5,
  };

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      findByCaseId: vi.fn(),
      save: vi.fn(),
      countByFilters: vi.fn().mockResolvedValue(mockStats),
    };

    useCase = new GetConsultationStatsUseCase(mockConsultationRepo);
  });

  it('HOSPITAL actor can get stats for their own hospital', async () => {
    const result = await useCase.execute(hospitalActor);

    expect(result).toEqual(mockStats);
    expect(mockConsultationRepo.countByFilters).toHaveBeenCalledWith({ hospitalId: 'hosp-1' });
  });

  it('returns the correct stats shape', async () => {
    const result = await useCase.execute(hospitalActor);

    expect(result.total).toBe(50);
    expect(result.scheduled).toBe(10);
    expect(result.completed).toBe(35);
    expect(result.todayCount).toBe(3);
    expect(result.needsTranslation).toBe(5);
  });

  it('throws ForbiddenError for ADMIN actor', async () => {
    await expect(
      useCase.execute(adminActor),
    ).rejects.toThrow('Only hospital users can view consultation stats');
  });

  it('throws ForbiddenError for any non-HOSPITAL actor', async () => {
    await expect(
      useCase.execute(otherHospitalActor),
    ).resolves.toBeDefined(); // other HOSPITAL actors can still call it

    const nonHospitalActor: Actor = { userId: 'admin-2', email: 'a@test.com', role: 'ADMIN', hospitalId: null };
    await expect(
      useCase.execute(nonHospitalActor),
    ).rejects.toThrow('Only hospital users can view consultation stats');
  });
});

// ─── ListCaseConsultationsUseCase ─────────────────────────────────────────────

describe('ListCaseConsultationsUseCase', () => {
  let useCase: ListCaseConsultationsUseCase;
  let mockConsultationRepo: IConsultationRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockConsultationRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      findByCaseId: vi.fn().mockResolvedValue([makeConsultation(), makeConsultation({ id: 'consult-2' })]),
      save: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(makeCase()),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    useCase = new ListCaseConsultationsUseCase(mockConsultationRepo, mockCaseRepo);
  });

  it('ADMIN can list consultations for a case', async () => {
    const result = await useCase.execute('case-1', adminActor);

    expect(result).toHaveLength(2);
    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1');
    expect(mockConsultationRepo.findByCaseId).toHaveBeenCalledWith('case-1');
  });

  it('returns ConsultationDTO[] with correct structure', async () => {
    const result = await useCase.execute('case-1', adminActor);

    expect(result[0].id).toBe('consult-1');
    expect(result[0].caseId).toBe('case-1');
    expect(result[0].hospitalId).toBe('hosp-1');
    expect(typeof result[0].scheduledAt).toBe('string');
    expect(result[1].id).toBe('consult-2');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-case', adminActor),
    ).rejects.toThrow('Case missing-case not found');
  });

  it('throws ForbiddenError for HOSPITAL actor', async () => {
    await expect(
      useCase.execute('case-1', hospitalActor),
    ).rejects.toThrow('Only admin users can list case consultations');
  });

  it('throws ForbiddenError for any non-ADMIN actor', async () => {
    await expect(
      useCase.execute('case-1', otherHospitalActor),
    ).rejects.toThrow('Only admin users can list case consultations');
  });

  it('returns empty array when case has no consultations', async () => {
    mockConsultationRepo.findByCaseId = vi.fn().mockResolvedValue([]);

    const result = await useCase.execute('case-1', adminActor);

    expect(result).toEqual([]);
  });
});
