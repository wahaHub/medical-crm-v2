import { ValidationError } from '@medical-crm/utils';

const QUOTE_NUMBER_REGEX = /^QT-\d{8}-\d{4}$/;

export class QuoteNumber {
  readonly value: string;

  constructor(value: string) {
    if (!QUOTE_NUMBER_REGEX.test(value)) {
      throw new ValidationError(`Invalid quote number format: ${value}`);
    }
    this.value = value;
  }

  static generate(sequenceNum: number): QuoteNumber {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(sequenceNum).padStart(4, '0');
    return new QuoteNumber(`QT-${y}${m}${d}-${seq}`);
  }
}
