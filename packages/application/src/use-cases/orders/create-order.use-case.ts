import type { IOrderRepository } from '@medical-crm/domain';
import { Order, OrderNumber } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';

export interface CreateOrderInput {
  caseId?: string;
  packageId?: string;
  type: string;
  amount: string;
  currency?: string;
  metadata?: unknown;
  idempotencyKey?: string;
}

export class CreateOrderUseCase {
  constructor(private readonly orderRepo: IOrderRepository) {}

  async execute(input: CreateOrderInput, actor: Actor): Promise<OrderDTO> {
    const orderNumberStr = await this.orderRepo.nextOrderNumber();
    const entity = new Order({
      id: generateId(),
      orderNumber: new OrderNumber(orderNumberStr),
      patientId: actor.userId,
      caseId: input.caseId ?? null,
      packageId: input.packageId ?? null,
      type: input.type as import('@medical-crm/domain').OrderType,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      status: 'PENDING_PAYMENT',
      paymentMethod: null,
      paidAt: null,
      completedAt: null,
      refundedAmount: null,
      refundReason: null,
      metadata: input.metadata ?? null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.orderRepo.save(entity);
    return toOrderDTO(saved);
  }
}
