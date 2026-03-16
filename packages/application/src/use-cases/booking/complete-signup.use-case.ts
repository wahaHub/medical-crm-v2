import type { IBookingRequestRepository } from '@medical-crm/domain';
import { NotFoundError, ValidationError } from '@medical-crm/utils';

export interface CompleteSignupInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface CompleteSignupResult {
  message: string;
  bookingRequestId: string;
}

/**
 * CompleteSignup use case — STUBBED for Phase 2.
 *
 * Full implementation (deferred) would:
 * 1. Create a Keycloak user with PATIENT role
 * 2. Create a user record in the CRM DB
 * 3. Create a Case from the booking request data
 * 4. Create case_hospital_contacts for selected hospitals
 * 5. Transition booking request status → COMPLETED
 * 6. Return auth tokens + case details
 *
 * TODO: Implement the full flow when patient auth is scoped.
 * This requires: TransactionRunner, IKeycloakAdminService (patient methods),
 * IUserRepository, ICaseRepository, ICHCRepository.
 */
export class CompleteSignupUseCase {
  constructor(private readonly bookingRepo: IBookingRequestRepository) {}

  async execute(bookingRequestId: string, _input: CompleteSignupInput): Promise<CompleteSignupResult> {
    const booking = await this.bookingRepo.findById(bookingRequestId);
    if (!booking) {
      throw new NotFoundError(`Booking request ${bookingRequestId} not found`);
    }

    if (booking.status !== 'SELECTIONS_SAVED') {
      throw new ValidationError(
        `Cannot complete signup: booking request status is ${booking.status}, expected SELECTIONS_SAVED`,
      );
    }

    // Stubbed — return message instead of full Keycloak + DB transaction flow
    return {
      message: 'Patient signup flow is stubbed for Phase 2',
      bookingRequestId,
    };
  }
}
