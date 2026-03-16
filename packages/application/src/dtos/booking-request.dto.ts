export interface BookingRequestDTO {
  id: string;
  userId: string | null;
  requestNumber: string;
  conditionType: string;
  conditionCategory: string;
  conditionDescription: string | null;
  destinationPreference: unknown;
  preferredLanguage: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingRequestHospitalDTO {
  id: string;
  bookingRequestId: string;
  hospitalId: string;
  isRecommended: boolean;
  matchScore: number | null;
  recommendationReason: string | null;
  selectedByPatient: boolean;
  selectedAt: string | null;
}
