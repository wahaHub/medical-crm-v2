import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatientDashboardUseCase } from '../src/use-cases/dashboard/patient-dashboard.use-case.js';
import { AdminDashboardUseCase } from '../src/use-cases/dashboard/admin-dashboard.use-case.js';
import { HospitalDashboardUseCase } from '../src/use-cases/dashboard/hospital-dashboard.use-case.js';
import type {
  ICaseRepository,
  IOrderRepository,
  IJourneyRepository,
  ISupportTicketRepository,
  IQuoteRepository,
  IConsultationRepository,
} from '@medical-crm/domain';
import { Case, CaseNumber, Order, OrderNumber, JourneyMilestone } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ——— Actors ———
const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@medicaltourismchina.health',
  role: 'ADMIN',
  hospitalId: null,
};

const beautyAdminActor: Actor = {
  userId: 'admin-2',
  email: 'contact@medorabeauty.com',
  role: 'ADMIN',
  hospitalId: null,
};

const patientActor: Actor = {
  userId: 'patient-1',
  email: 'patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hospital-1',
};

const hospitalActorMissingId: Actor = {
  userId: 'hospital-user-2',
  email: 'hospital2@test.com',
  role: 'HOSPITAL',
  hospitalId: null,
};

// ——— Factories ———
function makeMockCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}): Case {
  return new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    patientName: 'John Doe',
    patientCountry: 'US',
    patientLanguage: 'en',
    assignedHospitalId: null,
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'PENDING_ASSIGNMENT',
    assignedAt: null,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    assignmentStatus: 'UNASSIGNED',
    treatmentStage: null,
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

function makeMockOrder(overrides: Partial<ConstructorParameters<typeof Order>[0]> = {}): Order {
  return new Order({
    id: 'order-1',
    orderNumber: new OrderNumber('ORD-20260316-0001'),
    patientId: 'patient-1',
    caseId: null,
    packageId: 'pkg-1',
    type: 'CONSULTATION',
    amount: '1000.00',
    currency: 'USD',
    status: 'PENDING_PAYMENT',
    paymentMethod: null,
    paidAt: null,
    completedAt: null,
    refundedAmount: null,
    refundReason: null,
    metadata: null,
    version: 1,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function makeMockMilestone(overrides: Partial<ConstructorParameters<typeof JourneyMilestone>[0]> = {}): JourneyMilestone {
  return new JourneyMilestone({
    id: 'milestone-1',
    caseId: 'case-1',
    eventType: 'SURGERY_DATE',
    eventDate: new Date('2026-08-01'),
    note: 'Upcoming surgery',
    isVisibleToPatient: true,
    createdBy: 'admin-1',
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

// ——— Mock Repos ———
function createMockCaseRepo(): ICaseRepository {
  return {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
    nextCaseNumber: vi.fn(),
    countByFilters: vi.fn(),
  };
}

function createMockOrderRepo(): IOrderRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    nextOrderNumber: vi.fn(),
  };
}

function createMockJourneyRepo(): IJourneyRepository {
  return {
    findJourneyByCaseId: vi.fn(),
    saveJourney: vi.fn(),
    findMilestoneById: vi.fn(),
    findMilestonesByCaseId: vi.fn(),
    saveMilestone: vi.fn(),
    deleteMilestone: vi.fn(),
  };
}

function createMockTicketRepo(): ISupportTicketRepository {
  return {
    findById: vi.fn(),
    findByPatientId: vi.fn(),
    findByAssignedTo: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    nextTicketNumber: vi.fn(),
  };
}

function createMockQuoteRepo(): IQuoteRepository {
  return {
    findById: vi.fn(),
    findByCaseId: vi.fn(),
    findByHospitalId: vi.fn(),
    save: vi.fn(),
    nextQuoteNumber: vi.fn(),
    rejectPendingByCaseExcept: vi.fn(),
  };
}

function createMockConsultationRepo(): IConsultationRepository {
  return {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByCaseId: vi.fn(),
    save: vi.fn(),
    countByFilters: vi.fn(),
  };
}

// ============================================================================
// PatientDashboardUseCase
// ============================================================================
describe('PatientDashboardUseCase', () => {
  let caseRepo: ICaseRepository;
  let orderRepo: IOrderRepository;
  let journeyRepo: IJourneyRepository;
  let uc: PatientDashboardUseCase;

  beforeEach(() => {
    caseRepo = createMockCaseRepo();
    orderRepo = createMockOrderRepo();
    journeyRepo = createMockJourneyRepo();
    uc = new PatientDashboardUseCase(caseRepo, orderRepo, journeyRepo);
  });

  it('returns correct dashboard shape for a patient', async () => {
    const mockCase = makeMockCase();
    const mockOrder1 = makeMockOrder({ id: 'o1', status: 'PENDING_PAYMENT' });
    const mockOrder2 = makeMockOrder({ id: 'o2', status: 'IN_PROGRESS' });
    const mockOrder3 = makeMockOrder({ id: 'o3', status: 'COMPLETED' });
    const mockMilestone = makeMockMilestone();

    vi.mocked(caseRepo.findByPatientId).mockResolvedValue([mockCase]);
    vi.mocked(journeyRepo.findMilestonesByCaseId).mockResolvedValue([mockMilestone]);
    vi.mocked(orderRepo.findAll).mockResolvedValue({
      data: [mockOrder1, mockOrder2, mockOrder3],
      total: 3,
    });

    const result = await uc.execute(patientActor);

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]).toEqual({
      id: 'case-1',
      caseNumber: 'CASE-2026-0001',
      assignmentStatus: 'UNASSIGNED',
      treatmentStage: null,
    });

    expect(result.upcomingMilestones).toHaveLength(1);
    expect(result.upcomingMilestones[0]!.eventType).toBe('SURGERY_DATE');

    expect(result.ordersSummary).toEqual({
      pendingPayment: 1,
      inProgress: 1,
      completed: 1,
    });

    expect(result.unreadMessageCount).toBe(0);
  });

  it('returns empty dashboard when patient has no cases', async () => {
    vi.mocked(caseRepo.findByPatientId).mockResolvedValue([]);
    vi.mocked(orderRepo.findAll).mockResolvedValue({ data: [], total: 0 });

    const result = await uc.execute(patientActor);

    expect(result.cases).toHaveLength(0);
    expect(result.upcomingMilestones).toHaveLength(0);
    expect(result.ordersSummary).toEqual({
      pendingPayment: 0,
      inProgress: 0,
      completed: 0,
    });
  });

  it('filters out past milestones', async () => {
    const pastMilestone = makeMockMilestone({
      id: 'past-1',
      eventDate: new Date('2020-01-01'),
    });
    const futureMilestone = makeMockMilestone({
      id: 'future-1',
      eventDate: new Date('2027-01-01'),
    });

    vi.mocked(caseRepo.findByPatientId).mockResolvedValue([makeMockCase()]);
    vi.mocked(journeyRepo.findMilestonesByCaseId).mockResolvedValue([pastMilestone, futureMilestone]);
    vi.mocked(orderRepo.findAll).mockResolvedValue({ data: [], total: 0 });

    const result = await uc.execute(patientActor);

    expect(result.upcomingMilestones).toHaveLength(1);
    expect(result.upcomingMilestones[0]!.id).toBe('future-1');
  });

  it('throws ForbiddenError when non-patient accesses patient dashboard', async () => {
    await expect(uc.execute(adminActor)).rejects.toThrow('Only patients can access the patient dashboard');
    await expect(uc.execute(hospitalActor)).rejects.toThrow('Only patients can access the patient dashboard');
  });
});

// ============================================================================
// AdminDashboardUseCase
// ============================================================================
describe('AdminDashboardUseCase', () => {
  let caseRepo: ICaseRepository;
  let ticketRepo: ISupportTicketRepository;
  let orderRepo: IOrderRepository;
  let uc: AdminDashboardUseCase;

  beforeEach(() => {
    caseRepo = createMockCaseRepo();
    ticketRepo = createMockTicketRepo();
    orderRepo = createMockOrderRepo();
    uc = new AdminDashboardUseCase(caseRepo, ticketRepo, orderRepo);
  });

  it('returns correct dashboard shape for admin', async () => {
    const mockCase = makeMockCase();

    vi.mocked(caseRepo.countByFilters).mockResolvedValue({
      total: 50,
      unassigned: 10,
      assigned: 20,
      inTreatment: 10,
      postTreatment: 5,
      completed: 3,
      followUp: 2,
    });

    vi.mocked(ticketRepo.findAll).mockResolvedValue({ data: [], total: 7 });
    vi.mocked(orderRepo.findAll).mockResolvedValue({ data: [], total: 3 });
    vi.mocked(caseRepo.findMany).mockResolvedValue({ data: [mockCase], total: 50 });

    const result = await uc.execute(adminActor);

    expect(result.stats).toEqual({
      totalCases: 50,
      unassignedCases: 10,
      assignedCases: 20,
      openTickets: 7,
      pendingOrders: 3,
    });

    expect(result.recentCases).toHaveLength(1);
    expect(result.recentCases[0]).toEqual({
      id: 'case-1',
      caseNumber: 'CASE-2026-0001',
      assignmentStatus: 'UNASSIGNED',
      createdAt: '2026-03-16T00:00:00.000Z',
    });
  });

  it('scopes all admin dashboard case-derived counts for regular admins', async () => {
    vi.mocked(caseRepo.countByFilters).mockResolvedValue({
      total: 0,
      unassigned: 0,
      assigned: 0,
      inTreatment: 0,
      postTreatment: 0,
      completed: 0,
      followUp: 0,
    });
    vi.mocked(ticketRepo.findAll).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(orderRepo.findAll).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(caseRepo.findMany).mockResolvedValue({ data: [], total: 0 });

    await uc.execute(adminActor);

    const expectedScope = { mode: 'EXCLUDE', site: 'beauty' };
    expect(caseRepo.countByFilters).toHaveBeenCalledWith({ patientSiteScope: expectedScope });
    expect(caseRepo.findMany).toHaveBeenCalledWith({ page: 1, limit: 5, patientSiteScope: expectedScope });
    expect(ticketRepo.findAll).toHaveBeenCalledWith({ status: 'OPEN', page: 1, limit: 1, patientSiteScope: expectedScope });
    expect(orderRepo.findAll).toHaveBeenCalledWith({ status: 'PENDING_PAYMENT', page: 1, limit: 1, patientSiteScope: expectedScope });
  });

  it('scopes all admin dashboard case-derived counts for beauty admins', async () => {
    vi.mocked(caseRepo.countByFilters).mockResolvedValue({
      total: 0,
      unassigned: 0,
      assigned: 0,
      inTreatment: 0,
      postTreatment: 0,
      completed: 0,
      followUp: 0,
    });
    vi.mocked(ticketRepo.findAll).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(orderRepo.findAll).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(caseRepo.findMany).mockResolvedValue({ data: [], total: 0 });

    await uc.execute(beautyAdminActor);

    const expectedScope = { mode: 'ONLY', site: 'beauty' };
    expect(caseRepo.countByFilters).toHaveBeenCalledWith({ patientSiteScope: expectedScope });
    expect(caseRepo.findMany).toHaveBeenCalledWith({ page: 1, limit: 5, patientSiteScope: expectedScope });
    expect(ticketRepo.findAll).toHaveBeenCalledWith({ status: 'OPEN', page: 1, limit: 1, patientSiteScope: expectedScope });
    expect(orderRepo.findAll).toHaveBeenCalledWith({ status: 'PENDING_PAYMENT', page: 1, limit: 1, patientSiteScope: expectedScope });
  });

  it('throws ForbiddenError when non-admin accesses admin dashboard', async () => {
    await expect(uc.execute(patientActor)).rejects.toThrow('Only admins can access the admin dashboard');
    await expect(uc.execute(hospitalActor)).rejects.toThrow('Only admins can access the admin dashboard');
  });
});

// ============================================================================
// HospitalDashboardUseCase
// ============================================================================
describe('HospitalDashboardUseCase', () => {
  let caseRepo: ICaseRepository;
  let quoteRepo: IQuoteRepository;
  let consultationRepo: IConsultationRepository;
  let uc: HospitalDashboardUseCase;

  beforeEach(() => {
    caseRepo = createMockCaseRepo();
    quoteRepo = createMockQuoteRepo();
    consultationRepo = createMockConsultationRepo();
    uc = new HospitalDashboardUseCase(caseRepo, quoteRepo, consultationRepo);
  });

  it('returns correct dashboard shape for hospital', async () => {
    const mockCase = makeMockCase({
      assignedHospitalId: 'hospital-1',
      assignmentStatus: 'ASSIGNED',
      treatmentStage: 'IN_TREATMENT',
    });

    vi.mocked(caseRepo.countByFilters).mockResolvedValue({
      total: 15,
      unassigned: 0,
      assigned: 15,
      inTreatment: 8,
      postTreatment: 3,
      completed: 2,
      followUp: 2,
    });

    vi.mocked(quoteRepo.findByHospitalId).mockResolvedValue({ data: [], total: 4 });

    vi.mocked(consultationRepo.countByFilters).mockResolvedValue({
      total: 30,
      scheduled: 10,
      completed: 18,
      todayCount: 3,
      needsTranslation: 2,
    });

    vi.mocked(caseRepo.findMany).mockResolvedValue({ data: [mockCase], total: 15 });

    const result = await uc.execute(hospitalActor);

    expect(result.stats).toEqual({
      assignedCases: 15,
      pendingQuotes: 4,
      todayConsultations: 3,
      activeOrders: 0,
    });

    expect(result.recentCases).toHaveLength(1);
    expect(result.recentCases[0]).toEqual({
      id: 'case-1',
      caseNumber: 'CASE-2026-0001',
      treatmentStage: 'IN_TREATMENT',
      createdAt: '2026-03-16T00:00:00.000Z',
    });
  });

  it('throws ForbiddenError when non-hospital accesses hospital dashboard', async () => {
    await expect(uc.execute(adminActor)).rejects.toThrow('Only hospital users can access the hospital dashboard');
    await expect(uc.execute(patientActor)).rejects.toThrow('Only hospital users can access the hospital dashboard');
  });

  it('throws ForbiddenError when hospital actor has no hospitalId', async () => {
    await expect(uc.execute(hospitalActorMissingId)).rejects.toThrow('Hospital actor missing hospitalId');
  });
});
