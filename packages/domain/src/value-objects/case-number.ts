import { ValidationError } from '@medical-crm/utils';

const CASE_NUMBER_REGEX = /^CASE-\d{4}-\d{3,}$/;

export class CaseNumber {
  constructor(readonly value: string) {
    if (!CASE_NUMBER_REGEX.test(value)) {
      throw new ValidationError('Invalid case number format');
    }
  }

  static generate(year: number, sequence: number): CaseNumber {
    return new CaseNumber(`CASE-${year}-${String(sequence).padStart(4, '0')}`);
  }
}
