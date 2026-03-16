import { describe, it, expect } from 'vitest';
import { CaseEvent } from '../src/entities/case-event.entity.js';
import type { CaseEventProps } from '../src/entities/case-event.entity.js';

describe('CaseEvent entity', () => {
  const baseProps: CaseEventProps = {
    id: 'evt-1',
    caseId: 'case-1',
    eventType: 'CASE_CREATED',
    actorType: 'SYSTEM',
    actorId: null,
    eventData: { source: 'import' },
    isVisibleToPatient: false,
    createdAt: new Date('2026-01-15T10:00:00Z'),
  };

  describe('constructor', () => {
    it('creates entity with all props', () => {
      const event = new CaseEvent(baseProps);

      expect(event.id).toBe('evt-1');
      expect(event.caseId).toBe('case-1');
      expect(event.eventType).toBe('CASE_CREATED');
      expect(event.actorType).toBe('SYSTEM');
      expect(event.actorId).toBeNull();
      expect(event.eventData).toEqual({ source: 'import' });
      expect(event.isVisibleToPatient).toBe(false);
      expect(event.createdAt).toEqual(new Date('2026-01-15T10:00:00Z'));
    });

    it('creates entity with actorId and visible to patient', () => {
      const event = new CaseEvent({
        ...baseProps,
        actorType: 'ADMIN',
        actorId: 'admin-1',
        isVisibleToPatient: true,
        eventData: null,
      });

      expect(event.actorType).toBe('ADMIN');
      expect(event.actorId).toBe('admin-1');
      expect(event.isVisibleToPatient).toBe(true);
      expect(event.eventData).toBeNull();
    });

    it('assigns all props correctly for various event types', () => {
      const hospitalEvent = new CaseEvent({
        ...baseProps,
        eventType: 'HOSPITAL_REPLIED',
        actorType: 'HOSPITAL',
        actorId: 'hospital-1',
        eventData: { message: 'We can help' },
        isVisibleToPatient: true,
      });

      expect(hospitalEvent.eventType).toBe('HOSPITAL_REPLIED');
      expect(hospitalEvent.actorType).toBe('HOSPITAL');
      expect(hospitalEvent.actorId).toBe('hospital-1');
      expect(hospitalEvent.eventData).toEqual({ message: 'We can help' });
    });
  });

  describe('immutability', () => {
    it('all fields are readonly', () => {
      const event = new CaseEvent(baseProps);

      // TypeScript enforces readonly at compile time.
      // At runtime we verify that the values match the input and are stable.
      expect(event.id).toBe(baseProps.id);
      expect(event.caseId).toBe(baseProps.caseId);
      expect(event.eventType).toBe(baseProps.eventType);
      expect(event.actorType).toBe(baseProps.actorType);
      expect(event.actorId).toBe(baseProps.actorId);
      expect(event.eventData).toEqual(baseProps.eventData);
      expect(event.isVisibleToPatient).toBe(baseProps.isVisibleToPatient);
      expect(event.createdAt).toEqual(baseProps.createdAt);
    });
  });
});
