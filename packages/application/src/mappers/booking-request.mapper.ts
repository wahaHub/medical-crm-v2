import type { BookingRequest, BookingRequestHospital } from '@medical-crm/domain';
import type { BookingRequestDTO, BookingRequestHospitalDTO } from '../dtos/booking-request.dto.js';

export function toBookingRequestDTO(entity: BookingRequest): BookingRequestDTO {
  return {
    id: entity.id,
    userId: entity.userId,
    requestNumber: entity.requestNumber.value,
    conditionType: entity.conditionType,
    conditionCategory: entity.conditionCategory,
    conditionDescription: entity.conditionDescription,
    destinationPreference: entity.destinationPreference,
    preferredLanguage: entity.preferredLanguage,
    status: entity.status,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toBookingRequestHospitalDTO(entity: BookingRequestHospital): BookingRequestHospitalDTO {
  return {
    id: entity.id,
    bookingRequestId: entity.bookingRequestId,
    hospitalId: entity.hospitalId,
    isRecommended: entity.isRecommended,
    matchScore: entity.matchScore,
    recommendationReason: entity.recommendationReason,
    selectedByPatient: entity.selectedByPatient,
    selectedAt: entity.selectedAt?.toISOString() ?? null,
  };
}
