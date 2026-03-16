import type { BookingRequest } from '../entities/booking-request.entity.js';
import type { BookingRequestHospital } from '../entities/booking-request-hospital.entity.js';

export interface IBookingRequestRepository {
  findById(id: string, tx?: unknown): Promise<BookingRequest | null>;
  findByUserId(userId: string): Promise<BookingRequest[]>;
  save(entity: BookingRequest, tx?: unknown): Promise<BookingRequest>;
  nextRequestNumber(): Promise<string>;

  // Hospital links
  findHospitalsByBookingId(bookingRequestId: string): Promise<BookingRequestHospital[]>;
  saveHospitals(entities: BookingRequestHospital[]): Promise<BookingRequestHospital[]>;
  updateHospitalSelections(bookingRequestId: string, hospitalIds: string[]): Promise<void>;
}
