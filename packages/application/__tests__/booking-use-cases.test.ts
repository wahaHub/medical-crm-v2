import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBookingRequestUseCase } from '../src/use-cases/booking/create-booking-request.use-case.js';
import { GetHospitalRecommendationsUseCase } from '../src/use-cases/booking/get-hospital-recommendations.use-case.js';
import { SaveHospitalSelectionsUseCase } from '../src/use-cases/booking/save-hospital-selections.use-case.js';
import { CompleteSignupUseCase } from '../src/use-cases/booking/complete-signup.use-case.js';
import type { IBookingRequestRepository } from '@medical-crm/domain';
import { BookingRequest, BookingRequestNumber, BookingRequestHospital } from '@medical-crm/domain';

// ——— Factories ———

function makeMockBooking(overrides: Partial<ConstructorParameters<typeof BookingRequest>[0]> = {}): BookingRequest {
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

function makeMockBRH(overrides: Partial<ConstructorParameters<typeof BookingRequestHospital>[0]> = {}): BookingRequestHospital {
  return new BookingRequestHospital({
    id: 'brh-1',
    bookingRequestId: 'br-1',
    hospitalId: 'hospital-1',
    isRecommended: true,
    matchScore: 85,
    recommendationReason: 'Top rated',
    selectedByPatient: false,
    selectedAt: null,
    ...overrides,
  });
}

function createMockBookingRepo(): IBookingRequestRepository {
  return {
    findById: vi.fn(),
    findByUserId: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    nextRequestNumber: vi.fn().mockResolvedValue('BR-20260316-0001'),
    findHospitalsByBookingId: vi.fn().mockResolvedValue([]),
    saveHospitals: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    updateHospitalSelections: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// CreateBookingRequestUseCase
// ============================================================================
describe('CreateBookingRequestUseCase', () => {
  let bookingRepo: IBookingRequestRepository;

  beforeEach(() => {
    bookingRepo = createMockBookingRepo();
  });

  it('creates a booking request with PENDING status', async () => {
    const uc = new CreateBookingRequestUseCase(bookingRepo);
    const result = await uc.execute({
      conditionType: 'COSMETIC',
      conditionCategory: 'Rhinoplasty',
      conditionDescription: 'Nose reshaping',
      preferredLanguage: 'en',
    });

    expect(result.requestNumber).toBe('BR-20260316-0001');
    expect(result.status).toBe('PENDING');
    expect(result.conditionType).toBe('COSMETIC');
    expect(result.conditionCategory).toBe('Rhinoplasty');
    expect(result.userId).toBeNull();
    expect(bookingRepo.save).toHaveBeenCalledOnce();
  });

  it('defaults preferredLanguage to en', async () => {
    const uc = new CreateBookingRequestUseCase(bookingRepo);
    const result = await uc.execute({
      conditionType: 'DENTAL',
      conditionCategory: 'Implants',
    });

    expect(result.preferredLanguage).toBe('en');
  });

  it('passes destinationPreference correctly', async () => {
    const uc = new CreateBookingRequestUseCase(bookingRepo);
    const result = await uc.execute({
      conditionType: 'MEDICAL',
      conditionCategory: 'Cardiology',
      destinationPreference: { country: 'Thailand', city: 'Bangkok' },
    });

    expect(result.destinationPreference).toEqual({ country: 'Thailand', city: 'Bangkok' });
  });
});

// ============================================================================
// GetHospitalRecommendationsUseCase
// ============================================================================
describe('GetHospitalRecommendationsUseCase', () => {
  let bookingRepo: IBookingRequestRepository;

  beforeEach(() => {
    bookingRepo = createMockBookingRepo();
  });

  it('returns booking request with empty hospital list (stub)', async () => {
    const booking = makeMockBooking();
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);

    const uc = new GetHospitalRecommendationsUseCase(bookingRepo);
    const result = await uc.execute('br-1');

    expect(result.bookingRequest.id).toBe('br-1');
    expect(result.hospitals).toEqual([]);
    expect(bookingRepo.findHospitalsByBookingId).toHaveBeenCalledWith('br-1');
  });

  it('returns booking request with hospital list', async () => {
    const booking = makeMockBooking({ status: 'HOSPITALS_MATCHED' });
    const hospitals = [makeMockBRH(), makeMockBRH({ id: 'brh-2', hospitalId: 'hospital-2' })];
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);
    (bookingRepo.findHospitalsByBookingId as ReturnType<typeof vi.fn>).mockResolvedValue(hospitals);

    const uc = new GetHospitalRecommendationsUseCase(bookingRepo);
    const result = await uc.execute('br-1');

    expect(result.bookingRequest.status).toBe('HOSPITALS_MATCHED');
    expect(result.hospitals).toHaveLength(2);
    expect(result.hospitals[0]!.hospitalId).toBe('hospital-1');
    expect(result.hospitals[1]!.hospitalId).toBe('hospital-2');
  });

  it('throws NotFoundError for non-existent booking', async () => {
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new GetHospitalRecommendationsUseCase(bookingRepo);
    await expect(uc.execute('nope')).rejects.toThrow('Booking request nope not found');
  });
});

// ============================================================================
// SaveHospitalSelectionsUseCase
// ============================================================================
describe('SaveHospitalSelectionsUseCase', () => {
  let bookingRepo: IBookingRequestRepository;

  beforeEach(() => {
    bookingRepo = createMockBookingRepo();
  });

  it('saves selections and transitions to SELECTIONS_SAVED', async () => {
    const booking = makeMockBooking({ status: 'HOSPITALS_MATCHED' });
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);

    const uc = new SaveHospitalSelectionsUseCase(bookingRepo);
    const result = await uc.execute('br-1', {
      hospitalIds: ['hospital-1', 'hospital-2'],
    });

    expect(result.status).toBe('SELECTIONS_SAVED');
    expect(bookingRepo.updateHospitalSelections).toHaveBeenCalledWith('br-1', ['hospital-1', 'hospital-2']);
    expect(bookingRepo.save).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError for non-existent booking', async () => {
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new SaveHospitalSelectionsUseCase(bookingRepo);
    await expect(uc.execute('nope', { hospitalIds: ['h-1'] })).rejects.toThrow('not found');
  });

  it('throws ValidationError if status is not HOSPITALS_MATCHED', async () => {
    const booking = makeMockBooking({ status: 'PENDING' });
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);

    const uc = new SaveHospitalSelectionsUseCase(bookingRepo);
    await expect(uc.execute('br-1', { hospitalIds: ['h-1'] })).rejects.toThrow(
      'Cannot save selections: booking request status is PENDING',
    );
  });

  it('throws ValidationError if status is COMPLETED', async () => {
    const booking = makeMockBooking({ status: 'COMPLETED' });
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);

    const uc = new SaveHospitalSelectionsUseCase(bookingRepo);
    await expect(uc.execute('br-1', { hospitalIds: ['h-1'] })).rejects.toThrow(
      'Cannot save selections: booking request status is COMPLETED',
    );
  });
});

// ============================================================================
// CompleteSignupUseCase
// ============================================================================
describe('CompleteSignupUseCase', () => {
  let bookingRepo: IBookingRequestRepository;

  beforeEach(() => {
    bookingRepo = createMockBookingRepo();
  });

  it('returns stubbed message for valid booking', async () => {
    const booking = makeMockBooking({ status: 'SELECTIONS_SAVED' });
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);

    const uc = new CompleteSignupUseCase(bookingRepo);
    const result = await uc.execute('br-1', {
      email: 'patient@example.com',
      password: 'securePassword123',
      fullName: 'John Doe',
      phone: '+1234567890',
    });

    expect(result.message).toBe('Patient signup flow is stubbed for Phase 2');
    expect(result.bookingRequestId).toBe('br-1');
  });

  it('throws NotFoundError for non-existent booking', async () => {
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new CompleteSignupUseCase(bookingRepo);
    await expect(
      uc.execute('nope', {
        email: 'patient@example.com',
        password: 'securePassword123',
        fullName: 'John Doe',
      }),
    ).rejects.toThrow('not found');
  });

  it('throws ValidationError if status is not SELECTIONS_SAVED', async () => {
    const booking = makeMockBooking({ status: 'PENDING' });
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);

    const uc = new CompleteSignupUseCase(bookingRepo);
    await expect(
      uc.execute('br-1', {
        email: 'patient@example.com',
        password: 'securePassword123',
        fullName: 'John Doe',
      }),
    ).rejects.toThrow('Cannot complete signup: booking request status is PENDING');
  });

  it('throws ValidationError if status is COMPLETED', async () => {
    const booking = makeMockBooking({ status: 'COMPLETED' });
    (bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(booking);

    const uc = new CompleteSignupUseCase(bookingRepo);
    await expect(
      uc.execute('br-1', {
        email: 'patient@example.com',
        password: 'securePassword123',
        fullName: 'John Doe',
      }),
    ).rejects.toThrow('Cannot complete signup: booking request status is COMPLETED');
  });
});
