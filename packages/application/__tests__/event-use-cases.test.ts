import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordCaseEventUseCase } from '../src/use-cases/events/record-case-event.use-case.js';
import { ListCaseEventsUseCase } from '../src/use-cases/events/list-case-events.use-case.js';
import { GetCaseTimelineUseCase } from '../src/use-cases/events/get-case-timeline.use-case.js';
import type { ICaseEventRepository, ICaseRepository, IJourneyRepository } from '@medical-crm/domain';
import { CaseEvent, Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

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

const otherHospitalActor: Actor = {
  userId: 'hospital-user-2',
  email: 'other-hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-2',
};

const patientActor: Actor = {
  userId: 'patient-1',
  email: 'patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

const otherPatientActor: Actor = {
  userId: 'patient-2',
  email: 'other-patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

function makeCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}): Case {
  return new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    assignedHospitalId: 'hosp-1',
    patientName: 'Test Patient',
    patientCountry: 'US',
    patientLanguage: 'en',
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'IN_TREATMENT',
    assignedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    assignmentStatus: 'ASSIGNED',
    treatmentStage: 'IN_TREATMENT',
    conditionSummary: null,
    structuredData: null,
    riskFlags: null,
    priority: null,
    lastEventAt: null,
    aiSummaryStatus: 'PENDING',
    questionCollectorTemplateId: null,
    ...overrides,
  });
}

function makeMockEvent(overrides: Partial<ConstructorParameters<typeof CaseEvent>[0]> = {}) {
  return new CaseEvent({
    id: 'evt-1',
    caseId: 'case-1',
    eventType: 'CASE_CREATED',
    actorType: 'ADMIN',
    actorId: 'admin-1',
    eventData: { foo: 'bar' },
    isVisibleToPatient: false,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  });
}

function createMockRepo(): ICaseEventRepository {
  return {
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    findByCaseId: vi.fn().mockResolvedValue([]),
    findVisibleByCaseId: vi.fn().mockResolvedValue([]),
  };
}

function createMockCaseRepo(): ICaseRepository {
  return {
    findById: vi.fn().mockResolvedValue(makeCase()),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
    nextCaseNumber: vi.fn(),
    countByFilters: vi.fn(),
  };
}

// --------------- RecordCaseEventUseCase ---------------
describe('RecordCaseEventUseCase', () => {
  let useCase: RecordCaseEventUseCase;
  let mockRepo: ICaseEventRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new RecordCaseEventUseCase(mockRepo);
  });

  it('creates event with correct fields and returns DTO', async () => {
    const result = await useCase.execute({
      caseId: 'case-1',
      eventType: 'CASE_CREATED',
      actorType: 'ADMIN',
      actorId: 'admin-1',
      eventData: { reason: 'new patient' },
      isVisibleToPatient: true,
    });

    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(result.caseId).toBe('case-1');
    expect(result.eventType).toBe('CASE_CREATED');
    expect(result.actorType).toBe('ADMIN');
    expect(result.actorId).toBe('admin-1');
    expect(result.eventData).toEqual({ reason: 'new patient' });
    expect(result.isVisibleToPatient).toBe(true);
    expect(result.id).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
  });

  it('defaults eventData to null and isVisibleToPatient to false', async () => {
    const result = await useCase.execute({
      caseId: 'case-1',
      eventType: 'CASE_CREATED',
      actorType: 'SYSTEM',
      actorId: null,
    });

    expect(mockRepo.save).toHaveBeenCalledOnce();
    const savedArg = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as CaseEvent;
    expect(savedArg.eventData).toBeNull();
    expect(savedArg.isVisibleToPatient).toBe(false);
  });

  it('generates a unique id for each event', async () => {
    const result1 = await useCase.execute({
      caseId: 'case-1',
      eventType: 'CASE_CREATED',
      actorType: 'ADMIN',
      actorId: 'admin-1',
    });
    const result2 = await useCase.execute({
      caseId: 'case-1',
      eventType: 'CASE_DISTRIBUTED',
      actorType: 'ADMIN',
      actorId: 'admin-1',
    });

    expect(result1.id).not.toBe(result2.id);
  });
});

// --------------- ListCaseEventsUseCase ---------------
describe('ListCaseEventsUseCase', () => {
  let useCase: ListCaseEventsUseCase;
  let mockRepo: ICaseEventRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    mockCaseRepo = createMockCaseRepo();
    useCase = new ListCaseEventsUseCase(mockRepo, mockCaseRepo);
  });

  it('returns events mapped to DTOs for admin', async () => {
    const events = [
      makeMockEvent(),
      makeMockEvent({ id: 'evt-2', eventType: 'CASE_DISTRIBUTED' }),
    ];
    (mockRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const result = await useCase.execute('case-1', adminActor);

    expect(mockRepo.findByCaseId).toHaveBeenCalledWith('case-1');
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('evt-1');
    expect(result[0]!.eventType).toBe('CASE_CREATED');
    expect(result[0]!.createdAt).toBe('2026-01-15T10:00:00.000Z');
    expect(result[1]!.id).toBe('evt-2');
    expect(result[1]!.eventType).toBe('CASE_DISTRIBUTED');
  });

  it('returns empty array when no events exist', async () => {
    const result = await useCase.execute('case-1', adminActor);

    expect(mockRepo.findByCaseId).toHaveBeenCalledWith('case-1');
    expect(result).toEqual([]);
  });

  it('throws NotFoundError for non-existent case', async () => {
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(useCase.execute('case-999', adminActor)).rejects.toThrow('Case case-999 not found');
  });

  it('allows hospital actor for assigned case', async () => {
    const events = [makeMockEvent()];
    (mockRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const result = await useCase.execute('case-1', hospitalActor);

    expect(result).toHaveLength(1);
  });

  it('throws ForbiddenError for hospital not assigned to case', async () => {
    await expect(useCase.execute('case-1', otherHospitalActor)).rejects.toThrow('Access denied');
  });

  it('allows patient actor for own case', async () => {
    const events = [makeMockEvent()];
    (mockRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const result = await useCase.execute('case-1', patientActor);

    expect(result).toHaveLength(1);
  });

  it('throws ForbiddenError for patient not owning case', async () => {
    await expect(useCase.execute('case-1', otherPatientActor)).rejects.toThrow('Access denied');
  });
});

// --------------- GetCaseTimelineUseCase ---------------
function createMockJourneyRepo(): IJourneyRepository {
  return {
    findJourneyByCaseId: vi.fn().mockResolvedValue(null),
    saveJourney: vi.fn(),
    findMilestoneById: vi.fn().mockResolvedValue(null),
    findMilestonesByCaseId: vi.fn().mockResolvedValue([]),
    saveMilestone: vi.fn(),
    deleteMilestone: vi.fn(),
  };
}

describe('GetCaseTimelineUseCase', () => {
  let useCase: GetCaseTimelineUseCase;
  let mockRepo: ICaseEventRepository;
  let mockJourneyRepo: IJourneyRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    mockJourneyRepo = createMockJourneyRepo();
    mockCaseRepo = createMockCaseRepo();
    useCase = new GetCaseTimelineUseCase(mockRepo, mockJourneyRepo, mockCaseRepo);
  });

  it('returns timeline items sorted by timestamp desc', async () => {
    const events = [
      makeMockEvent({
        id: 'evt-1',
        eventType: 'CASE_CREATED',
        isVisibleToPatient: true,
        createdAt: new Date('2026-01-10T10:00:00.000Z'),
      }),
      makeMockEvent({
        id: 'evt-2',
        eventType: 'CASE_DISTRIBUTED',
        isVisibleToPatient: true,
        createdAt: new Date('2026-01-15T10:00:00.000Z'),
      }),
      makeMockEvent({
        id: 'evt-3',
        eventType: 'QUOTE_SENT',
        isVisibleToPatient: true,
        createdAt: new Date('2026-01-12T10:00:00.000Z'),
      }),
    ];
    (mockRepo.findVisibleByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const result = await useCase.execute('case-1', adminActor);

    expect(mockRepo.findVisibleByCaseId).toHaveBeenCalledWith('case-1');
    expect(result).toHaveLength(3);
    // Should be sorted: evt-2 (Jan 15), evt-3 (Jan 12), evt-1 (Jan 10)
    expect(result[0]!.id).toBe('evt-2');
    expect(result[1]!.id).toBe('evt-3');
    expect(result[2]!.id).toBe('evt-1');
  });

  it('returns items with source = event', async () => {
    const events = [makeMockEvent({ isVisibleToPatient: true })];
    (mockRepo.findVisibleByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const result = await useCase.execute('case-1', adminActor);

    expect(result[0]!.source).toBe('event');
    expect(result[0]!.type).toBe('CASE_CREATED');
    expect(result[0]!.data).toEqual({ foo: 'bar' });
  });

  it('returns empty array when no visible events exist', async () => {
    const result = await useCase.execute('case-1', adminActor);

    expect(mockRepo.findVisibleByCaseId).toHaveBeenCalledWith('case-1');
    expect(result).toEqual([]);
  });

  it('throws NotFoundError for non-existent case', async () => {
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(useCase.execute('case-999', adminActor)).rejects.toThrow('Case case-999 not found');
  });

  it('throws ForbiddenError for hospital not assigned to case', async () => {
    await expect(useCase.execute('case-1', otherHospitalActor)).rejects.toThrow('Access denied');
  });

  it('throws ForbiddenError for patient not owning case', async () => {
    await expect(useCase.execute('case-1', otherPatientActor)).rejects.toThrow('Access denied');
  });

  it('passes visibleOnly for patient milestones', async () => {
    const result = await useCase.execute('case-1', patientActor);

    expect(mockJourneyRepo.findMilestonesByCaseId).toHaveBeenCalledWith('case-1', { visibleOnly: true });
    expect(result).toEqual([]);
  });

  it('does not filter milestones for admin', async () => {
    await useCase.execute('case-1', adminActor);

    expect(mockJourneyRepo.findMilestonesByCaseId).toHaveBeenCalledWith('case-1', undefined);
  });

  it('does not filter milestones for hospital', async () => {
    await useCase.execute('case-1', hospitalActor);

    expect(mockJourneyRepo.findMilestonesByCaseId).toHaveBeenCalledWith('case-1', undefined);
  });
});
