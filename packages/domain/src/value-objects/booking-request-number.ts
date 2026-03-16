import { ValidationError } from '@medical-crm/utils';

const BOOKING_REQUEST_NUMBER_REGEX = /^BR-\d{8}-\d{4}$/;

export class BookingRequestNumber {
  readonly value: string;

  constructor(value: string) {
    if (!BOOKING_REQUEST_NUMBER_REGEX.test(value)) {
      throw new ValidationError(`Invalid booking request number format: ${value}`);
    }
    this.value = value;
  }

  static generate(sequenceNum: number): BookingRequestNumber {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(sequenceNum).padStart(4, '0');
    return new BookingRequestNumber(`BR-${y}${m}${d}-${seq}`);
  }
}
