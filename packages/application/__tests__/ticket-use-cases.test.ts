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

// ——— Actors ———
const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
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

// ============================================================================
// CreateTicketUseCase
// ============================================================================
describe('CreateTicketUseCase', () => {
  let ticketRepo: ISupportTicketRepository;

  beforeEach(() => {
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

  it('admin sees all tickets', async () => {
    const tickets = [makeMockTicket()];
    (ticketRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: tickets, total: 1 });

    const uc = new ListTicketsUseCase(ticketRepo);
    const result = await uc.execute({ page: 1, limit: 20 }, adminActor);

    expect(ticketRepo.findAll).toHaveBeenCalledOnce();
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('patient sees only own tickets', async () => {
    const tickets = [makeMockTicket()];
    (ticketRepo.findByPatientId as ReturnType<typeof vi.fn>).mockResolvedValue({ data: tickets, total: 1 });

    const uc = new ListTicketsUseCase(ticketRepo);
    const result = await uc.execute({ page: 1, limit: 20 }, patientActor);

    expect(ticketRepo.findByPatientId).toHaveBeenCalledWith('patient-1', expect.anything());
    expect(result.data).toHaveLength(1);
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
