import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordCaseEventUseCase } from '../src/use-cases/events/record-case-event.use-case.js';
import { ListCaseEventsUseCase } from '../src/use-cases/events/list-case-events.use-case.js';
import { GetCaseTimelineUseCase } from '../src/use-cases/events/get-case-timeline.use-case.js';
import type { ICaseEventRepository } from '@medical-crm/domain';
import { CaseEvent } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

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

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new ListCaseEventsUseCase(mockRepo);
  });

  it('returns events mapped to DTOs', async () => {
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
    const result = await useCase.execute('case-999', adminActor);

    expect(mockRepo.findByCaseId).toHaveBeenCalledWith('case-999');
    expect(result).toEqual([]);
  });
});

// --------------- GetCaseTimelineUseCase ---------------
describe('GetCaseTimelineUseCase', () => {
  let useCase: GetCaseTimelineUseCase;
  let mockRepo: ICaseEventRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new GetCaseTimelineUseCase(mockRepo);
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
    const result = await useCase.execute('case-999', adminActor);

    expect(mockRepo.findVisibleByCaseId).toHaveBeenCalledWith('case-999');
    expect(result).toEqual([]);
  });
});
