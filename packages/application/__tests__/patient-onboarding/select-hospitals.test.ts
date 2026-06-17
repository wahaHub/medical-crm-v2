import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectHospitalsUseCase } from '../../src/use-cases/patient-onboarding/select-hospitals.use-case.js';

describe('SelectHospitalsUseCase', () => {
  let useCase: SelectHospitalsUseCase;
  let mockCaseHospitalContactRepo: any;
  let mockConversationRepo: any;

  beforeEach(() => {
    mockCaseHospitalContactRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findByCaseAndHospital: vi.fn(),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      rejectOthersByCaseExcept: vi.fn(),
    };
    mockConversationRepo = {
      save: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      findOrCreateHospitalPatientConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      findById: vi.fn(),
      findMany: vi.fn(),
    };
    useCase = new SelectHospitalsUseCase(mockCaseHospitalContactRepo, mockConversationRepo);
  });

  it('creates hospital contacts and conversations for each hospital', async () => {
    await useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['h1', 'h2'],
      patientId: 'patient-1',
    });
    // Should call save for each hospital contact
    expect(mockCaseHospitalContactRepo.save).toHaveBeenCalledTimes(2);
    // Should create a conversation for each hospital
    expect(mockConversationRepo.findOrCreateHospitalPatientConversation).toHaveBeenCalledTimes(2);
  });

  it('throws if no hospitals selected', async () => {
    await expect(
      useCase.execute({ caseId: 'case-1', hospitalIds: [], patientId: 'p1' }),
    ).rejects.toThrow();
  });

  it('returns conversation ids for each hospital', async () => {
    mockConversationRepo.findOrCreateHospitalPatientConversation
      .mockResolvedValueOnce({ id: 'conv-h1' })
      .mockResolvedValueOnce({ id: 'conv-h2' });

    const result = await useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['h1', 'h2'],
      patientId: 'patient-1',
    });

    expect(result.conversationIds).toEqual(['conv-h1', 'conv-h2']);
  });

  it('creates contact with DISTRIBUTED status and correct caseId/hospitalId', async () => {
    mockConversationRepo.findOrCreateHospitalPatientConversation.mockResolvedValue({ id: 'conv-1' });

    await useCase.execute({
      caseId: 'case-42',
      hospitalIds: ['hosp-99'],
      patientId: 'patient-1',
    });

    const savedContact = mockCaseHospitalContactRepo.save.mock.calls[0][0];
    expect(savedContact.caseId).toBe('case-42');
    expect(savedContact.hospitalId).toBe('hosp-99');
    expect(savedContact.subStatus).toBe('DISTRIBUTED');
    expect(savedContact.distributedAt).toBeInstanceOf(Date);
  });

  it('creates conversation with HOSPITAL_PATIENT category', async () => {
    mockConversationRepo.findOrCreateHospitalPatientConversation.mockResolvedValue({ id: 'conv-1' });

    await useCase.execute({
      caseId: 'case-42',
      hospitalIds: ['hosp-99'],
      patientId: 'patient-1',
    });

    const savedConv = mockConversationRepo.findOrCreateHospitalPatientConversation.mock.calls[0][0];
    expect(savedConv.caseId).toBe('case-42');
    expect(savedConv.hospitalId).toBe('hosp-99');
    expect(savedConv.category).toBe('HOSPITAL_PATIENT');
  });
});
