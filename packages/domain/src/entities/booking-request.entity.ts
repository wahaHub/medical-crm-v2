import type { BookingRequestStatus, BookingConditionType } from '../enums/index.js';
import type { BookingRequestNumber } from '../value-objects/booking-request-number.js';
import { ValidationError } from '@medical-crm/utils';

/** Valid transitions: PENDING -> HOSPITALS_MATCHED -> SELECTIONS_SAVED -> COMPLETED */
const BOOKING_STATUS_TRANSITIONS: Record<BookingRequestStatus, BookingRequestStatus[]> = {
  PENDING: ['HOSPITALS_MATCHED', 'EXPIRED'],
  HOSPITALS_MATCHED: ['SELECTIONS_SAVED', 'EXPIRED'],
  SELECTIONS_SAVED: ['COMPLETED', 'EXPIRED'],
  COMPLETED: [],
  EXPIRED: [],
};

export interface BookingRequestProps {
  id: string;
  userId: string | null;
  requestNumber: BookingRequestNumber;
  conditionType: BookingConditionType;
  conditionCategory: string;
  conditionDescription: string | null;
  destinationPreference: unknown | null;
  preferredLanguage: string;
  status: BookingRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class BookingRequest {
  readonly id: string;
  userId: string | null;
  readonly requestNumber: BookingRequestNumber;
  readonly conditionType: BookingConditionType;
  readonly conditionCategory: string;
  conditionDescription: string | null;
  destinationPreference: unknown | null;
  preferredLanguage: string;
  status: BookingRequestStatus;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: BookingRequestProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.requestNumber = props.requestNumber;
    this.conditionType = props.conditionType;
    this.conditionCategory = props.conditionCategory;
    this.conditionDescription = props.conditionDescription;
    this.destinationPreference = props.destinationPreference;
    this.preferredLanguage = props.preferredLanguage;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  private transitionStatus(to: BookingRequestStatus): void {
    const allowed = BOOKING_STATUS_TRANSITIONS[this.status];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition booking request status from ${this.status} to ${to}`,
      );
    }
    this.status = to;
    this.updatedAt = new Date();
  }

  matchHospitals(): void {
    this.transitionStatus('HOSPITALS_MATCHED');
  }

  saveSelections(): void {
    this.transitionStatus('SELECTIONS_SAVED');
  }

  complete(userId: string): void {
    this.transitionStatus('COMPLETED');
    this.userId = userId;
  }

  expire(): void {
    this.transitionStatus('EXPIRED');
  }
}

export { BOOKING_STATUS_TRANSITIONS };
