import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateTicketUseCase } from '../src/use-cases/tickets/create-ticket.use-case.js';
import { ListTicketsUseCase } from '../src/use-cases/tickets/list-tickets.use-case.js';
import { GetTicketUseCase } from '../src/use-cases/tickets/get-ticket.use-case.js';
import { AssignTicketUseCase } from '../src/use-cases/tickets/assign-ticket.use-case.js';
import { ReplyToTicketUseCase } from '../src/use-cases/tickets/reply-to-ticket.use-case.js';
import { UpdateTicketStatusUseCase } from '../src/use-cases/tickets/update-ticket-status.use-case.js';
import { CloseTicketUseCase } from '../src/use-cases/tickets/close-ticket.use-case.js';
import type { ISupportTicketRepository, ISupportTicketReplyRepository } from '@medical-crm/domain';
import { SupportTicket, TicketNumber, SupportTicketReply } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../src/access/admin-patient-site-access.js';

// ——— Actors ———
const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const beautyAdminActor: Actor = {
  userId: 'beauty-admin-1',
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

const otherPatientActor: Actor = {
  userId: 'patient-2',
  email: 'other@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

// ——— Mocks ———
const mockTranslationTaskService = { enqueue: vi.fn() };

// ——— Factories ———
function makeMockTicket(overrides: Partial<ConstructorParameters<typeof SupportTicket>[0]> = {}): SupportTicket {
  return new SupportTicket({
    id: 'ticket-1',
    ticketNumber: new TicketNumber('TKT-20260316-0001'),
    patientId: 'patient-1',
    caseId: null,
    type: 'GENERAL_QUESTIONS',
    priority: 'MEDIUM',
    status: 'OPEN',
    subject: 'Test subject',
    description: 'Test description',
    sourcePage: null,
    assignedTo: null,
    slaDeadline: null,
    resolutionNote: null,
    resolvedAt: null,
    version: 1,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function makeMockReply(overrides: Partial<ConstructorParameters<typeof SupportTicketReply>[0]> = {}): SupportTicketReply {
  return new SupportTicketReply({
    id: 'reply-1',
    ticketId: 'ticket-1',
    authorId: 'admin-1',
    authorRole: 'ADMIN',
    content: 'Test reply',
    isInternalNote: false,
    attachments: null,
    createdAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function createMockTicketRepo(): ISupportTicketRepository {
  return {
    findById: vi.fn(),
    findByPatientId: vi.fn(),
    findByAssignedTo: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    nextTicketNumber: vi.fn().mockResolvedValue('TKT-20260316-0001'),
  };
}

function createMockReplyRepo(): ISupportTicketReplyRepository {
  return {
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    findByTicketId: vi.fn().mockResolvedValue([]),
  };
}

function makeAdminAccess(overrides: Partial<AdminPatientSiteAccessPolicy> = {}): AdminPatientSiteAccessPolicy {
  return {
    assertActorCanAccessCase: vi.fn().mockResolvedValue(undefined),
    assertActorCanAccessCaseOrPatient: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AdminPatientSiteAccessPolicy;
}

// ============================================================================
// CreateTicketUseCase
// ============================================================================
describe('CreateTicketUseCase', () => {
  let ticketRepo: ISupportTicketRepository;

  beforeEach(() => {
    mockTranslationTaskService.enqueue.mockClear();
    ticketRepo = createMockTicketRepo();
  });

  it('creates a ticket successfully', async () => {
    const uc = new CreateTicketUseCase(ticketRepo, mockTranslationTaskService as any);
    const result = await uc.execute({
      type: 'GENERAL_QUESTIONS',
      description: 'I have a question',
      subject: 'My question',
    }, patientActor);

    expect(result.ticketNumber).toBe('TKT-20260316-0001');
    expect(result.patientId).toBe('patient-1');
    expect(result.status).toBe('OPEN');
    expect(result.type).toBe('GENERAL_QUESTIONS');
    expect(result.description).toBe('I have a question');
    expect(ticketRepo.save).toHaveBeenCalledOnce();
  });

  it('allows admin to create tickets', async () => {
    const uc = new CreateTicketUseCase(ticketRepo, mockTranslationTaskService as any);
    const result = await uc.execute({
      type: 'FEEDBACK',
      description: 'Admin ticket',
    }, adminActor);

    expect(result.patientId).toBe('admin-1');
    expect(result.status).toBe('OPEN');
  });

  it('blocks staff from creating tickets linked to excluded patient email cases', async () => {
    const adminAccess = makeAdminAccess({
      assertActorCanAccessCase: vi.fn().mockRejectedValue(new Error('Case case-1 not found')),
    });
    const uc = new CreateTicketUseCase(ticketRepo, mockTranslationTaskService as any, adminAccess);

    await expect(
      uc.execute({
        type: 'FEEDBACK',
        description: 'Admin ticket',
        caseId: 'case-1',
      }, adminActor),
    ).rejects.toThrow('Case case-1 not found');

    expect(ticketRepo.save).not.toHaveBeenCalled();
    expect(mockTranslationTaskService.enqueue).not.toHaveBeenCalled();
  });

  it('uses default MEDIUM priority when not specified', async () => {
    const uc = new CreateTicketUseCase(ticketRepo, mockTranslationTaskService as any);
    const result = await uc.execute({
      type: 'GENERAL_QUESTIONS',
      description: 'Some issue',
    }, patientActor);

    expect(result.priority).toBe('MEDIUM');
  });
});

// ============================================================================
// ListTicketsUseCase
// ============================================================================
describe('ListTicketsUseCase', () => {
  let ticketRepo: ISupportTicketRepository;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
  });

  it('admin scopes out beauty tickets', async () => {
    const tickets = [makeMockTicket()];
    (ticketRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: tickets, total: 1 });

    const uc = new ListTicketsUseCase(ticketRepo);
    const result = await uc.execute({ page: 1, limit: 20 }, adminActor);

    expect(ticketRepo.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      patientSiteScope: { mode: 'EXCLUDE', site: 'beauty' },
      excludedPatientEmailDomains: ['example.com'],
    });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('medora beauty admin sees only beauty tickets', async () => {
    (ticketRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });

    const uc = new ListTicketsUseCase(ticketRepo);
    await uc.execute({ page: 1, limit: 20 }, beautyAdminActor);

    expect(ticketRepo.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      patientSiteScope: { mode: 'ONLY', site: 'beauty' },
      excludedPatientEmailDomains: ['example.com'],
    });
  });

  it('patient sees only own tickets', async () => {
    const tickets = [makeMockTicket()];
    (ticketRepo.findByPatientId as ReturnType<typeof vi.fn>).mockResolvedValue({ data: tickets, total: 1 });

    const uc = new ListTicketsUseCase(ticketRepo);
    const result = await uc.execute({ page: 1, limit: 20 }, patientActor);

    expect(ticketRepo.findByPatientId).toHaveBeenCalledWith('patient-1', expect.anything());
    expect(result.data).toHaveLength(1);
  });

  it('does not treat hospital users as ticket patients', async () => {
    const uc = new ListTicketsUseCase(ticketRepo);

    await expect(uc.execute({ page: 1, limit: 20 }, hospitalActor)).rejects.toThrow('Only admins and patients');
    expect(ticketRepo.findByPatientId).not.toHaveBeenCalled();
    expect(ticketRepo.findAll).not.toHaveBeenCalled();
  });

  it('admin filters example.com tickets when listing a specific case', async () => {
    (ticketRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });

    const uc = new ListTicketsUseCase(ticketRepo);
    await uc.execute({ page: 1, limit: 20, caseId: 'case-1' }, adminActor);

    expect(ticketRepo.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      caseId: 'case-1',
      patientSiteScope: { mode: 'EXCLUDE', site: 'beauty' },
      excludedPatientEmailDomains: ['example.com'],
    });
  });
});

// ============================================================================
// GetTicketUseCase
// ============================================================================
describe('GetTicketUseCase', () => {
  let ticketRepo: ISupportTicketRepository;
  let replyRepo: ISupportTicketReplyRepository;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    replyRepo = createMockReplyRepo();
  });

  it('returns ticket with replies for owner', async () => {
    const ticket = makeMockTicket();
    const replies = [makeMockReply()];
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);
    (replyRepo.findByTicketId as ReturnType<typeof vi.fn>).mockResolvedValue(replies);

    const uc = new GetTicketUseCase(ticketRepo, replyRepo);
    const result = await uc.execute('ticket-1', patientActor);

    expect(result.ticket.id).toBe('ticket-1');
    expect(result.replies).toHaveLength(1);
  });

  it('admin sees internal notes', async () => {
    const ticket = makeMockTicket();
    const replies = [
      makeMockReply({ isInternalNote: false }),
      makeMockReply({ id: 'reply-2', isInternalNote: true }),
    ];
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);
    (replyRepo.findByTicketId as ReturnType<typeof vi.fn>).mockResolvedValue(replies);

    const uc = new GetTicketUseCase(ticketRepo, replyRepo);
    const result = await uc.execute('ticket-1', adminActor);

    expect(result.replies).toHaveLength(2);
  });

  it('patient does NOT see internal notes', async () => {
    const ticket = makeMockTicket();
    const replies = [
      makeMockReply({ isInternalNote: false }),
      makeMockReply({ id: 'reply-2', isInternalNote: true }),
    ];
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);
    (replyRepo.findByTicketId as ReturnType<typeof vi.fn>).mockResolvedValue(replies);

    const uc = new GetTicketUseCase(ticketRepo, replyRepo);
    const result = await uc.execute('ticket-1', patientActor);

    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]!.isInternalNote).toBe(false);
  });

  it('throws NotFoundError for non-existent ticket', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new GetTicketUseCase(ticketRepo, replyRepo);
    await expect(uc.execute('nope', adminActor)).rejects.toThrow('Ticket nope not found');
  });

  it('throws ForbiddenError for other patient', async () => {
    const ticket = makeMockTicket({ patientId: 'patient-1' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new GetTicketUseCase(ticketRepo, replyRepo);
    await expect(uc.execute('ticket-1', otherPatientActor)).rejects.toThrow('Not authorized');
  });

  it('checks hospital direct reads against case access policy', async () => {
    const ticket = makeMockTicket({ patientId: 'patient-1', caseId: 'case-1' });
    const adminAccess = makeAdminAccess({
      assertActorCanAccessCase: vi.fn().mockRejectedValue(new Error('Case case-1 not found')),
    });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new GetTicketUseCase(ticketRepo, replyRepo, adminAccess);

    await expect(uc.execute('ticket-1', hospitalActor)).rejects.toThrow('Case case-1 not found');
    expect(adminAccess.assertActorCanAccessCase).toHaveBeenCalledWith(hospitalActor, 'case-1');
    expect(replyRepo.findByTicketId).not.toHaveBeenCalled();
  });

  it('denies hospital direct reads for tickets without a case', async () => {
    const ticket = makeMockTicket({ patientId: 'hospital-user-1', caseId: null });
    const adminAccess = makeAdminAccess();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new GetTicketUseCase(ticketRepo, replyRepo, adminAccess);

    await expect(uc.execute('ticket-1', hospitalActor)).rejects.toThrow('Not authorized');
    expect(adminAccess.assertActorCanAccessCase).not.toHaveBeenCalled();
    expect(replyRepo.findByTicketId).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AssignTicketUseCase
// ============================================================================
describe('AssignTicketUseCase', () => {
  let ticketRepo: ISupportTicketRepository;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
  });

  it('admin assigns ticket successfully', async () => {
    const ticket = makeMockTicket({ status: 'OPEN' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new AssignTicketUseCase(ticketRepo);
    const result = await uc.execute('ticket-1', 'admin-1', adminActor);

    expect(result.status).toBe('ASSIGNED');
    expect(result.assignedTo).toBe('admin-1');
    expect(ticketRepo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for non-admin', async () => {
    const uc = new AssignTicketUseCase(ticketRepo);
    await expect(uc.execute('ticket-1', 'admin-1', patientActor)).rejects.toThrow('Only admins');
  });

  it('throws NotFoundError for missing ticket', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new AssignTicketUseCase(ticketRepo);
    await expect(uc.execute('nope', 'admin-1', adminActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// ReplyToTicketUseCase
// ============================================================================
describe('ReplyToTicketUseCase', () => {
  let ticketRepo: ISupportTicketRepository;
  let replyRepo: ISupportTicketReplyRepository;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    replyRepo = createMockReplyRepo();
  });

  it('admin replies to a ticket', async () => {
    const ticket = makeMockTicket({ status: 'ASSIGNED' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new ReplyToTicketUseCase(ticketRepo, replyRepo, mockTranslationTaskService as any);
    const result = await uc.execute('ticket-1', { content: 'Admin reply' }, adminActor);

    expect(result.content).toBe('Admin reply');
    expect(result.authorRole).toBe('ADMIN');
    expect(replyRepo.save).toHaveBeenCalledOnce();
  });

  it('patient reply transitions PENDING_INFO -> ASSIGNED', async () => {
    const ticket = makeMockTicket({ status: 'PENDING_INFO', patientId: 'patient-1' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new ReplyToTicketUseCase(ticketRepo, replyRepo, mockTranslationTaskService as any);
    await uc.execute('ticket-1', { content: 'Patient response' }, patientActor);

    expect(ticket.status).toBe('ASSIGNED');
    expect(ticketRepo.save).toHaveBeenCalled();
  });

  it('patient cannot reply to another patient ticket', async () => {
    const ticket = makeMockTicket({ patientId: 'patient-1' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new ReplyToTicketUseCase(ticketRepo, replyRepo, mockTranslationTaskService as any);
    await expect(
      uc.execute('ticket-1', { content: 'Sneaky' }, otherPatientActor),
    ).rejects.toThrow('Not authorized');
  });

  it('patient cannot create internal notes', async () => {
    const ticket = makeMockTicket({ status: 'ASSIGNED', patientId: 'patient-1' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new ReplyToTicketUseCase(ticketRepo, replyRepo, mockTranslationTaskService as any);
    const result = await uc.execute(
      'ticket-1',
      { content: 'Note attempt', isInternalNote: true },
      patientActor,
    );

    expect(result.isInternalNote).toBe(false);
  });

  it('admin can create internal notes', async () => {
    const ticket = makeMockTicket({ status: 'ASSIGNED' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new ReplyToTicketUseCase(ticketRepo, replyRepo, mockTranslationTaskService as any);
    const result = await uc.execute(
      'ticket-1',
      { content: 'Internal note', isInternalNote: true },
      adminActor,
    );

    expect(result.isInternalNote).toBe(true);
  });

  it('checks hospital replies against case access policy', async () => {
    const ticket = makeMockTicket({ patientId: 'patient-1', caseId: 'case-1', status: 'ASSIGNED' });
    const adminAccess = makeAdminAccess({
      assertActorCanAccessCase: vi.fn().mockRejectedValue(new Error('Case case-1 not found')),
    });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new ReplyToTicketUseCase(ticketRepo, replyRepo, mockTranslationTaskService as any, adminAccess);

    await expect(
      uc.execute('ticket-1', { content: 'Hospital reply' }, hospitalActor),
    ).rejects.toThrow('Case case-1 not found');
    expect(adminAccess.assertActorCanAccessCase).toHaveBeenCalledWith(hospitalActor, 'case-1');
    expect(replyRepo.save).not.toHaveBeenCalled();
  });

  it('denies hospital replies for tickets without a case', async () => {
    const ticket = makeMockTicket({ patientId: 'hospital-user-1', caseId: null, status: 'ASSIGNED' });
    const adminAccess = makeAdminAccess();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new ReplyToTicketUseCase(ticketRepo, replyRepo, mockTranslationTaskService as any, adminAccess);

    await expect(
      uc.execute('ticket-1', { content: 'Hospital reply' }, hospitalActor),
    ).rejects.toThrow('Not authorized');
    expect(adminAccess.assertActorCanAccessCase).not.toHaveBeenCalled();
    expect(replyRepo.save).not.toHaveBeenCalled();
  });
});

// ============================================================================
// UpdateTicketStatusUseCase
// ============================================================================
describe('UpdateTicketStatusUseCase', () => {
  let ticketRepo: ISupportTicketRepository;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
  });

  it('admin transitions ticket status', async () => {
    const ticket = makeMockTicket({ status: 'ASSIGNED' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new UpdateTicketStatusUseCase(ticketRepo);
    const result = await uc.execute('ticket-1', 'RESOLVED', adminActor);

    expect(result.status).toBe('RESOLVED');
    expect(ticketRepo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for patient', async () => {
    const uc = new UpdateTicketStatusUseCase(ticketRepo);
    await expect(uc.execute('ticket-1', 'RESOLVED', patientActor)).rejects.toThrow('Only admins');
  });

  it('throws on invalid transition', async () => {
    const ticket = makeMockTicket({ status: 'OPEN' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new UpdateTicketStatusUseCase(ticketRepo);
    await expect(uc.execute('ticket-1', 'CLOSED', adminActor)).rejects.toThrow('Cannot transition');
  });
});

// ============================================================================
// CloseTicketUseCase
// ============================================================================
describe('CloseTicketUseCase', () => {
  let ticketRepo: ISupportTicketRepository;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
  });

  it('admin closes a resolved ticket', async () => {
    const ticket = makeMockTicket({ status: 'RESOLVED' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new CloseTicketUseCase(ticketRepo);
    const result = await uc.execute('ticket-1', adminActor);

    expect(result.status).toBe('CLOSED');
    expect(ticketRepo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for patient', async () => {
    const uc = new CloseTicketUseCase(ticketRepo);
    await expect(uc.execute('ticket-1', patientActor)).rejects.toThrow('Only admins');
  });

  it('throws on closing OPEN ticket', async () => {
    const ticket = makeMockTicket({ status: 'OPEN' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ticket);

    const uc = new CloseTicketUseCase(ticketRepo);
    await expect(uc.execute('ticket-1', adminActor)).rejects.toThrow('Cannot transition');
  });
});
