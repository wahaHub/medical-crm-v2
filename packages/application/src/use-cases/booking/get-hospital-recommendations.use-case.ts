import type { IBookingRequestRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { BookingRequestDTO, BookingRequestHospitalDTO } from '../../dtos/booking-request.dto.js';
import { toBookingRequestDTO, toBookingRequestHospitalDTO } from '../../mappers/booking-request.mapper.js';

export interface GetHospitalRecommendationsResult {
  bookingRequest: BookingRequestDTO;
  hospitals: BookingRequestHospitalDTO[];
}

export class GetHospitalRecommendationsUseCase {
  constructor(private readonly bookingRepo: IBookingRequestRepository) {}

  async execute(bookingId: string): Promise<GetHospitalRecommendationsResult> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundError(`Booking request ${bookingId} not found`);
    }

    // For now, return the booking request with its hospital list (stub — actual matching logic deferred)
    const hospitals = await this.bookingRepo.findHospitalsByBookingId(bookingId);

    return {
      bookingRequest: toBookingRequestDTO(booking),
      hospitals: hospitals.map(toBookingRequestHospitalDTO),
    };
  }
}
