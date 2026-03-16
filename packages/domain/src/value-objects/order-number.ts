import { ValidationError } from '@medical-crm/utils';

const ORDER_NUMBER_REGEX = /^ORD-\d{8}-\d{4}$/;

export class OrderNumber {
  readonly value: string;

  constructor(value: string) {
    if (!ORDER_NUMBER_REGEX.test(value)) {
      throw new ValidationError(`Invalid order number format: ${value}`);
    }
    this.value = value;
  }

  static generate(sequenceNum: number): OrderNumber {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(sequenceNum).padStart(4, '0');
    return new OrderNumber(`ORD-${y}${m}${d}-${seq}`);
  }
}
