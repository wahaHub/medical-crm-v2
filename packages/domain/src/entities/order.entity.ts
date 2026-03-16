import type { OrderType, OrderStatus } from '../enums/index.js';
import type { OrderNumber } from '../value-objects/order-number.js';
import { ValidationError } from '@medical-crm/utils';
import { ORDER_STATUS_TRANSITIONS } from '../state-machine/order-status-transitions.js';

export interface OrderProps {
  id: string;
  orderNumber: OrderNumber;
  patientId: string;
  caseId: string | null;
  packageId: string | null;
  type: OrderType;
  amount: string;  // decimal as string
  currency: string;
  status: OrderStatus;
  paymentMethod: string | null;
  paidAt: Date | null;
  completedAt: Date | null;
  refundedAmount: string | null;
  refundReason: string | null;
  metadata: unknown | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  readonly id: string;
  readonly orderNumber: OrderNumber;
  readonly patientId: string;
  caseId: string | null;
  packageId: string | null;
  type: OrderType;
  amount: string;
  currency: string;
  status: OrderStatus;
  paymentMethod: string | null;
  paidAt: Date | null;
  completedAt: Date | null;
  refundedAmount: string | null;
  refundReason: string | null;
  metadata: unknown | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: OrderProps) {
    this.id = props.id;
    this.orderNumber = props.orderNumber;
    this.patientId = props.patientId;
    this.caseId = props.caseId;
    this.packageId = props.packageId;
    this.type = props.type;
    this.amount = props.amount;
    this.currency = props.currency;
    this.status = props.status;
    this.paymentMethod = props.paymentMethod;
    this.paidAt = props.paidAt;
    this.completedAt = props.completedAt;
    this.refundedAmount = props.refundedAmount;
    this.refundReason = props.refundReason;
    this.metadata = props.metadata;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  transitionStatus(to: OrderStatus): void {
    const allowed = ORDER_STATUS_TRANSITIONS[this.status];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition order status from ${this.status} to ${to}`,
      );
    }
    this.status = to;
    this.updatedAt = new Date();
  }

  markPaid(paymentMethod: string): void {
    this.transitionStatus('PAID');
    this.paymentMethod = paymentMethod;
    this.paidAt = new Date();
  }

  startProgress(): void {
    this.transitionStatus('IN_PROGRESS');
  }

  complete(): void {
    this.transitionStatus('COMPLETED');
    this.completedAt = new Date();
  }

  cancel(): void {
    this.transitionStatus('CANCELLED');
  }

  refund(amount: string, reason: string): void {
    this.transitionStatus('REFUNDED');
    this.refundedAmount = amount;
    this.refundReason = reason;
  }
}
