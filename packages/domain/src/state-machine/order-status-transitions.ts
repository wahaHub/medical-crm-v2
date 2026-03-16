import type { OrderStatus } from '../enums/index.js';

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['IN_PROGRESS', 'REFUNDED'],
  IN_PROGRESS: ['COMPLETED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],  // terminal
  REFUNDED: [],   // terminal
};
