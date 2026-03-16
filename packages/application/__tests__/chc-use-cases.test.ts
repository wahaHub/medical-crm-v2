import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddHospitalToCaseUseCase } from '../src/use-cases/quotes/add-hospital-to-case.use-case.js';
import { RemoveHospitalFromCaseUseCase } from '../src/use-cases/quotes/remove-hospital-from-case.use-case.js';
import { SendReminderUseCase } from '../src/use-cases/quotes/send-reminder.use-case.js';
import { ListCaseHospitalContactsUseCase } from '../src/use-cases/quotes/list-case-hospital-contacts.use-case.js';
import type { ICHCRepository } from '@medical-crm/domain';
import { CaseHospitalContact } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hospital-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

function makeMockCHC(overrides: Partial<ConstructorParameters<typeof CaseHospitalContact>[0]> = {}) {
  return new CaseHospitalContact({
    id: 'chc-1',
    caseId: 'case-1',
    hospitalId: 'hosp-1',
    subStatus: 'DISTRIBUTED',
    selectedByPatientAt: null,
    distributedAt: new Date('2026-01-01'),
    firstReplyAt: null,
    quoteId: null,
    patientViewedQuoteAt: null,
    patientAcceptedAt: null,
    patientRejectedAt: null,
    reminderSentAt: null,
    removedAt: null,
    removedReason: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function createMockRepo(): ICHCRepository {
  return {
    findById: vi.fn(),
    findByCaseAndHospital: vi.fn(),
    findByCaseId: vi.fn(),
    findByHospitalId: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    rejectOthersByCaseExcept: vi.fn(),
  };
}

// --------------- AddHospitalToCaseUseCase ---------------
describe('AddHospitalToCaseUseCase', () => {
  let useCase: AddHospitalToCaseUseCase;
  let mockRepo: ICHCRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new AddHospitalToCaseUseCase(mockRepo);
  });

  it('creates a CHC with DISTRIBUTED status for ADMIN', async () => {
    (mockRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute('case-1', 'hosp-1', adminActor);

    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(result.subStatus).toBe('DISTRIBUTED');
    expect(result.caseId).toBe('case-1');
    expect(result.hospitalId).toBe('hosp-1');
    expect(result.distributedAt).toBeTruthy();
  });

  it('throws ForbiddenError for HOSPITAL actor', async () => {
    await expect(
      useCase.execute('case-1', 'hosp-1', hospitalActor),
    ).rejects.toThrow('Only admins can add hospitals to cases');
  });

  it('throws ConflictError if CHC already exists for case+hospital pair', async () => {
    (mockRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockCHC());

    await expect(
      useCase.execute('case-1', 'hosp-1', adminActor),
    ).rejects.toThrow('Hospital already added to this case');
  });
});

// --------------- RemoveHospitalFromCaseUseCase ---------------
describe('RemoveHospitalFromCaseUseCase', () => {
  let useCase: RemoveHospitalFromCaseUseCase;
  let mockRepo: ICHCRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new RemoveHospitalFromCaseUseCase(mockRepo);
  });

  it('sets REMOVED status and removedAt', async () => {
    (mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockCHC());

    const result = await useCase.execute('chc-1', 'No longer needed', adminActor);

    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(result.subStatus).toBe('REMOVED');
    expect(result.removedAt).toBeTruthy();
    expect(result.removedReason).toBe('No longer needed');
  });

  it('sets removedReason to null when reason is undefined', async () => {
    (mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockCHC());

    const result = await useCase.execute('chc-1', undefined, adminActor);

    expect(result.subStatus).toBe('REMOVED');
    expect(result.removedReason).toBeNull();
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute('chc-1', undefined, hospitalActor),
    ).rejects.toThrow('Only admins can remove hospitals from cases');
  });

  it('throws NotFoundError when CHC does not exist', async () => {
    (mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('chc-999', undefined, adminActor),
    ).rejects.toThrow('CaseHospitalContact chc-999 not found');
  });
});

// --------------- SendReminderUseCase ---------------
describe('SendReminderUseCase', () => {
  let useCase: SendReminderUseCase;
  let mockRepo: ICHCRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new SendReminderUseCase(mockRepo);
  });

  it('updates reminderSentAt', async () => {
    (mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockCHC());

    const result = await useCase.execute('chc-1', adminActor);

    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(result.reminderSentAt).toBeTruthy();
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute('chc-1', hospitalActor),
    ).rejects.toThrow('Only admins can send reminders');
  });

  it('throws NotFoundError when CHC does not exist', async () => {
    (mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('chc-999', adminActor),
    ).rejects.toThrow('CaseHospitalContact chc-999 not found');
  });
});

// --------------- ListCaseHospitalContactsUseCase ---------------
describe('ListCaseHospitalContactsUseCase', () => {
  let useCase: ListCaseHospitalContactsUseCase;
  let mockRepo: ICHCRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new ListCaseHospitalContactsUseCase(mockRepo);
  });

  it('returns all CHCs for ADMIN with caseId filter', async () => {
    const chcs = [makeMockCHC(), makeMockCHC({ id: 'chc-2', hospitalId: 'hosp-2' })];
    (mockRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(chcs);

    const result = await useCase.execute({ caseId: 'case-1', page: 1, limit: 20 }, adminActor);

    expect(mockRepo.findByCaseId).toHaveBeenCalledWith('case-1');
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('scopes by hospitalId for HOSPITAL actor', async () => {
    const chcs = [makeMockCHC()];
    (mockRepo.findByHospitalId as ReturnType<typeof vi.fn>).mockResolvedValue({ data: chcs, total: 1 });

    const result = await useCase.execute({ page: 1, limit: 20 }, hospitalActor);

    expect(mockRepo.findByHospitalId).toHaveBeenCalledWith('hosp-1', expect.objectContaining({ hospitalId: 'hosp-1' }));
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('throws ForbiddenError for HOSPITAL actor without hospitalId', async () => {
    const badActor: Actor = { ...hospitalActor, hospitalId: null };

    await expect(
      useCase.execute({ page: 1, limit: 20 }, badActor),
    ).rejects.toThrow('Hospital actor missing hospitalId');
  });

  it('returns empty when no filter is provided for ADMIN', async () => {
    const result = await useCase.execute({ page: 1, limit: 20 }, adminActor);

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('uses caseId filter over hospitalId when both present', async () => {
    const chcs = [makeMockCHC()];
    (mockRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(chcs);

    const result = await useCase.execute(
      { caseId: 'case-1', hospitalId: 'hosp-1', page: 1, limit: 20 },
      adminActor,
    );

    expect(mockRepo.findByCaseId).toHaveBeenCalledWith('case-1');
    expect(mockRepo.findByHospitalId).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
  });
});
