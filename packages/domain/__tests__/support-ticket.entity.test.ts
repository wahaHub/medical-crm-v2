import { describe, it, expect } from 'vitest';
import { SupportTicket } from '../src/entities/support-ticket.entity.js';
import { TicketNumber } from '../src/value-objects/ticket-number.js';
import type { TicketStatus } from '../src/enums/index.js';

describe('SupportTicket entity', () => {
  function createTestTicket(overrides: Partial<ConstructorParameters<typeof SupportTicket>[0]> = {}) {
    return new SupportTicket({
      id: 'ticket-1',
      ticketNumber: new TicketNumber('TKT-20260101-0001'),
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
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a ticket with all fields', () => {
      const t = createTestTicket();
      expect(t.id).toBe('ticket-1');
      expect(t.ticketNumber.value).toBe('TKT-20260101-0001');
      expect(t.patientId).toBe('patient-1');
      expect(t.status).toBe('OPEN');
      expect(t.priority).toBe('MEDIUM');
      expect(t.type).toBe('GENERAL_QUESTIONS');
      expect(t.description).toBe('Test description');
      expect(t.version).toBe(1);
    });
  });

  describe('transitionStatus', () => {
    it('allows OPEN -> ASSIGNED', () => {
      const t = createTestTicket({ status: 'OPEN' });
      t.transitionStatus('ASSIGNED');
      expect(t.status).toBe('ASSIGNED');
    });

    it('allows ASSIGNED -> PENDING_INFO', () => {
      const t = createTestTicket({ status: 'ASSIGNED' });
      t.transitionStatus('PENDING_INFO');
      expect(t.status).toBe('PENDING_INFO');
    });

    it('allows ASSIGNED -> RESOLVED', () => {
      const t = createTestTicket({ status: 'ASSIGNED' });
      t.transitionStatus('RESOLVED');
      expect(t.status).toBe('RESOLVED');
    });

    it('allows PENDING_INFO -> ASSIGNED', () => {
      const t = createTestTicket({ status: 'PENDING_INFO' });
      t.transitionStatus('ASSIGNED');
      expect(t.status).toBe('ASSIGNED');
    });

    it('allows RESOLVED -> CLOSED', () => {
      const t = createTestTicket({ status: 'RESOLVED' });
      t.transitionStatus('CLOSED');
      expect(t.status).toBe('CLOSED');
    });

    it('allows RESOLVED -> ASSIGNED (reopen)', () => {
      const t = createTestTicket({ status: 'RESOLVED' });
      t.transitionStatus('ASSIGNED');
      expect(t.status).toBe('ASSIGNED');
    });

    it('throws on CLOSED -> any (terminal state)', () => {
      const t = createTestTicket({ status: 'CLOSED' });
      const allStatuses: TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_INFO', 'RESOLVED', 'CLOSED'];
      for (const status of allStatuses) {
        expect(() => t.transitionStatus(status)).toThrow(
          `Cannot transition ticket status from CLOSED to ${status}`,
        );
      }
    });

    it('throws on OPEN -> RESOLVED (must be assigned first)', () => {
      const t = createTestTicket({ status: 'OPEN' });
      expect(() => t.transitionStatus('RESOLVED')).toThrow(
        'Cannot transition ticket status from OPEN to RESOLVED',
      );
    });

    it('throws on OPEN -> CLOSED', () => {
      const t = createTestTicket({ status: 'OPEN' });
      expect(() => t.transitionStatus('CLOSED')).toThrow(
        'Cannot transition ticket status from OPEN to CLOSED',
      );
    });

    it('updates updatedAt on transition', () => {
      const t = createTestTicket({ status: 'OPEN' });
      const before = t.updatedAt;
      t.transitionStatus('ASSIGNED');
      expect(t.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('assign', () => {
    it('transitions OPEN -> ASSIGNED and sets assignedTo', () => {
      const t = createTestTicket({ status: 'OPEN' });
      t.assign('admin-1');
      expect(t.status).toBe('ASSIGNED');
      expect(t.assignedTo).toBe('admin-1');
    });

    it('throws when trying to assign from invalid state', () => {
      const t = createTestTicket({ status: 'CLOSED' });
      expect(() => t.assign('admin-1')).toThrow();
    });
  });

  describe('resolve', () => {
    it('transitions ASSIGNED -> RESOLVED and sets resolution details', () => {
      const t = createTestTicket({ status: 'ASSIGNED' });
      t.resolve('Issue fixed');
      expect(t.status).toBe('RESOLVED');
      expect(t.resolutionNote).toBe('Issue fixed');
      expect(t.resolvedAt).toBeInstanceOf(Date);
    });

    it('throws when resolving from OPEN', () => {
      const t = createTestTicket({ status: 'OPEN' });
      expect(() => t.resolve('Not assignable')).toThrow();
    });

    it('throws when resolving from CLOSED', () => {
      const t = createTestTicket({ status: 'CLOSED' });
      expect(() => t.resolve('Nope')).toThrow();
    });
  });

  describe('close', () => {
    it('transitions RESOLVED -> CLOSED', () => {
      const t = createTestTicket({ status: 'RESOLVED' });
      t.close();
      expect(t.status).toBe('CLOSED');
    });

    it('throws when closing from OPEN', () => {
      const t = createTestTicket({ status: 'OPEN' });
      expect(() => t.close()).toThrow();
    });

    it('throws when closing from ASSIGNED', () => {
      const t = createTestTicket({ status: 'ASSIGNED' });
      expect(() => t.close()).toThrow();
    });
  });
});
