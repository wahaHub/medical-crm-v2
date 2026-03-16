import { ValidationError } from '@medical-crm/utils';

const TICKET_NUMBER_REGEX = /^TKT-\d{8}-\d{4}$/;

export class TicketNumber {
  readonly value: string;

  constructor(value: string) {
    if (!TICKET_NUMBER_REGEX.test(value)) {
      throw new ValidationError(`Invalid ticket number format: ${value}`);
    }
    this.value = value;
  }

  static generate(sequenceNum: number): TicketNumber {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(sequenceNum).padStart(4, '0');
    return new TicketNumber(`TKT-${y}${m}${d}-${seq}`);
  }
}
