import type { IBookingRequestRepository } from '@medical-crm/domain';
import { BookingRequest, BookingRequestNumber } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import type { BookingRequestDTO } from '../../dtos/booking-request.dto.js';
import { toBookingRequestDTO } from '../../mappers/booking-request.mapper.js';

export interface CreateBookingRequestInput {
  conditionType: string;
  conditionCategory: string;
  conditionDescription?: string;
  destinationPreference?: unknown;
  preferredLanguage?: string;
}

export class CreateBookingRequestUseCase {
  constructor(private readonly bookingRepo: IBookingRequestRepository) {}

  async execute(input: CreateBookingRequestInput): Promise<BookingRequestDTO> {
    const requestNumberStr = await this.bookingRepo.nextRequestNumber();
    const entity = new BookingRequest({
      id: generateId(),
      userId: null,
      requestNumber: new BookingRequestNumber(requestNumberStr),
      conditionType: input.conditionType as import('@medical-crm/domain').BookingConditionType,
      conditionCategory: input.conditionCategory,
      conditionDescription: input.conditionDescription ?? null,
      destinationPreference: input.destinationPreference ?? null,
      preferredLanguage: input.preferredLanguage ?? 'en',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.bookingRepo.save(entity);
    return toBookingRequestDTO(saved);
  }
}
