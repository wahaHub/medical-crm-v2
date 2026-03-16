import type { Order } from '@medical-crm/domain';
import type { OrderDTO } from '../dtos/order.dto.js';

export function toOrderDTO(entity: Order): OrderDTO {
  return {
    id: entity.id,
    orderNumber: entity.orderNumber.value,
    patientId: entity.patientId,
    caseId: entity.caseId,
    packageId: entity.packageId,
    type: entity.type,
    amount: entity.amount,
    currency: entity.currency,
    status: entity.status,
    paymentMethod: entity.paymentMethod,
    paidAt: entity.paidAt?.toISOString() ?? null,
    completedAt: entity.completedAt?.toISOString() ?? null,
    refundedAmount: entity.refundedAmount,
    refundReason: entity.refundReason,
    metadata: entity.metadata,
    version: entity.version,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
