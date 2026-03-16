import { describe, it, expect } from 'vitest';
import { BookingRequest } from '../src/entities/booking-request.entity.js';
import { BookingRequestHospital } from '../src/entities/booking-request-hospital.entity.js';
import { BookingRequestNumber } from '../src/value-objects/booking-request-number.js';

// ============================================================================
// BookingRequestNumber value object
// ============================================================================
describe('BookingRequestNumber', () => {
  it('accepts valid format BR-YYYYMMDD-XXXX', () => {
    const brn = new BookingRequestNumber('BR-20260316-0001');
    expect(brn.value).toBe('BR-20260316-0001');
  });

  it('rejects invalid format', () => {
    expect(() => new BookingRequestNumber('INVALID')).toThrow('Invalid booking request number format');
    expect(() => new BookingRequestNumber('BR-2026031-0001')).toThrow('Invalid booking request number format');
    expect(() => new BookingRequestNumber('QT-20260316-0001')).toThrow('Invalid booking request number format');
  });

  it('generates a number with correct format', () => {
    const brn = BookingRequestNumber.generate(42);
    expect(brn.value).toMatch(/^BR-\d{8}-0042$/);
  });

  it('pads sequence number to 4 digits', () => {
    const brn = BookingRequestNumber.generate(1);
    expect(brn.value).toMatch(/-0001$/);
  });
});

// ============================================================================
// BookingRequest entity
// ============================================================================
describe('BookingRequest entity', () => {
  function createTestBooking(overrides: Partial<ConstructorParameters<typeof BookingRequest>[0]> = {}) {
    return new BookingRequest({
      id: 'br-1',
      userId: null,
      requestNumber: new BookingRequestNumber('BR-20260316-0001'),
      conditionType: 'COSMETIC',
      conditionCategory: 'Rhinoplasty',
      conditionDescription: 'Nose reshaping',
      destinationPreference: { country: 'South Korea' },
      preferredLanguage: 'en',
      status: 'PENDING',
      createdAt: new Date('2026-03-16'),
      updatedAt: new Date('2026-03-16'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a booking request with all fields', () => {
      const br = createTestBooking();
      expect(br.id).toBe('br-1');
      expect(br.userId).toBeNull();
      expect(br.requestNumber.value).toBe('BR-20260316-0001');
      expect(br.conditionType).toBe('COSMETIC');
      expect(br.conditionCategory).toBe('Rhinoplasty');
      expect(br.conditionDescription).toBe('Nose reshaping');
      expect(br.preferredLanguage).toBe('en');
      expect(br.status).toBe('PENDING');
    });
  });

  describe('matchHospitals', () => {
    it('transitions PENDING -> HOSPITALS_MATCHED', () => {
      const br = createTestBooking({ status: 'PENDING' });
      br.matchHospitals();
      expect(br.status).toBe('HOSPITALS_MATCHED');
    });

    it('throws from HOSPITALS_MATCHED (already matched)', () => {
      const br = createTestBooking({ status: 'HOSPITALS_MATCHED' });
      expect(() => br.matchHospitals()).toThrow(
        'Cannot transition booking request status from HOSPITALS_MATCHED to HOSPITALS_MATCHED',
      );
    });

    it('throws from COMPLETED (terminal state)', () => {
      const br = createTestBooking({ status: 'COMPLETED' });
      expect(() => br.matchHospitals()).toThrow('Cannot transition');
    });

    it('updates updatedAt on transition', () => {
      const br = createTestBooking({ status: 'PENDING' });
      const before = br.updatedAt;
      br.matchHospitals();
      expect(br.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('saveSelections', () => {
    it('transitions HOSPITALS_MATCHED -> SELECTIONS_SAVED', () => {
      const br = createTestBooking({ status: 'HOSPITALS_MATCHED' });
      br.saveSelections();
      expect(br.status).toBe('SELECTIONS_SAVED');
    });

    it('throws from PENDING (wrong state)', () => {
      const br = createTestBooking({ status: 'PENDING' });
      expect(() => br.saveSelections()).toThrow('Cannot transition');
    });
  });

  describe('complete', () => {
    it('transitions SELECTIONS_SAVED -> COMPLETED and sets userId', () => {
      const br = createTestBooking({ status: 'SELECTIONS_SAVED' });
      br.complete('user-123');
      expect(br.status).toBe('COMPLETED');
      expect(br.userId).toBe('user-123');
    });

    it('throws from PENDING (wrong state)', () => {
      const br = createTestBooking({ status: 'PENDING' });
      expect(() => br.complete('user-1')).toThrow('Cannot transition');
    });

    it('throws from COMPLETED (terminal)', () => {
      const br = createTestBooking({ status: 'COMPLETED' });
      expect(() => br.complete('user-1')).toThrow('Cannot transition');
    });
  });

  describe('expire', () => {
    it('transitions PENDING -> EXPIRED', () => {
      const br = createTestBooking({ status: 'PENDING' });
      br.expire();
      expect(br.status).toBe('EXPIRED');
    });

    it('transitions HOSPITALS_MATCHED -> EXPIRED', () => {
      const br = createTestBooking({ status: 'HOSPITALS_MATCHED' });
      br.expire();
      expect(br.status).toBe('EXPIRED');
    });

    it('transitions SELECTIONS_SAVED -> EXPIRED', () => {
      const br = createTestBooking({ status: 'SELECTIONS_SAVED' });
      br.expire();
      expect(br.status).toBe('EXPIRED');
    });

    it('throws from COMPLETED (terminal)', () => {
      const br = createTestBooking({ status: 'COMPLETED' });
      expect(() => br.expire()).toThrow('Cannot transition');
    });

    it('throws from EXPIRED (already expired)', () => {
      const br = createTestBooking({ status: 'EXPIRED' });
      expect(() => br.expire()).toThrow('Cannot transition');
    });
  });

  describe('full flow', () => {
    it('follows the complete happy path', () => {
      const br = createTestBooking({ status: 'PENDING' });
      br.matchHospitals();
      expect(br.status).toBe('HOSPITALS_MATCHED');
      br.saveSelections();
      expect(br.status).toBe('SELECTIONS_SAVED');
      br.complete('user-abc');
      expect(br.status).toBe('COMPLETED');
      expect(br.userId).toBe('user-abc');
    });
  });
});

// ============================================================================
// BookingRequestHospital entity
// ============================================================================
describe('BookingRequestHospital entity', () => {
  function createTestBRH(overrides: Partial<ConstructorParameters<typeof BookingRequestHospital>[0]> = {}) {
    return new BookingRequestHospital({
      id: 'brh-1',
      bookingRequestId: 'br-1',
      hospitalId: 'hospital-1',
      isRecommended: true,
      matchScore: 85,
      recommendationReason: 'Top rated for rhinoplasty',
      selectedByPatient: false,
      selectedAt: null,
      ...overrides,
    });
  }

  it('creates with all fields', () => {
    const brh = createTestBRH();
    expect(brh.id).toBe('brh-1');
    expect(brh.bookingRequestId).toBe('br-1');
    expect(brh.hospitalId).toBe('hospital-1');
    expect(brh.isRecommended).toBe(true);
    expect(brh.matchScore).toBe(85);
    expect(brh.selectedByPatient).toBe(false);
    expect(brh.selectedAt).toBeNull();
  });

  it('select sets selectedByPatient and selectedAt', () => {
    const brh = createTestBRH({ selectedByPatient: false, selectedAt: null });
    brh.select();
    expect(brh.selectedByPatient).toBe(true);
    expect(brh.selectedAt).toBeInstanceOf(Date);
  });

  it('deselect clears selectedByPatient and selectedAt', () => {
    const brh = createTestBRH({ selectedByPatient: true, selectedAt: new Date() });
    brh.deselect();
    expect(brh.selectedByPatient).toBe(false);
    expect(brh.selectedAt).toBeNull();
  });
});
