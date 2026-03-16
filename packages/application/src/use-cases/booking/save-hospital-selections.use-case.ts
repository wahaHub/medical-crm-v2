import type { IBookingRequestRepository } from '@medical-crm/domain';
import { NotFoundError, ValidationError } from '@medical-crm/utils';
import type { BookingRequestDTO } from '../../dtos/booking-request.dto.js';
import { toBookingRequestDTO } from '../../mappers/booking-request.mapper.js';

export interface SaveHospitalSelectionsInput {
  hospitalIds: string[];
}

export class SaveHospitalSelectionsUseCase {
  constructor(private readonly bookingRepo: IBookingRequestRepository) {}

  async execute(bookingRequestId: string, input: SaveHospitalSelectionsInput): Promise<BookingRequestDTO> {
    const booking = await this.bookingRepo.findById(bookingRequestId);
    if (!booking) {
      throw new NotFoundError(`Booking request ${bookingRequestId} not found`);
    }

    // Only allow saving selections from HOSPITALS_MATCHED state
    if (booking.status !== 'HOSPITALS_MATCHED') {
      throw new ValidationError(
        `Cannot save selections: booking request status is ${booking.status}, expected HOSPITALS_MATCHED`,
      );
    }

    // Update the hospital selections
    await this.bookingRepo.updateHospitalSelections(bookingRequestId, input.hospitalIds);

    // Transition status
    booking.saveSelections();
    const saved = await this.bookingRepo.save(booking);

    return toBookingRequestDTO(saved);
  }
}
