import type { IOrderRepository } from '@medical-crm/domain';
import { Order, OrderNumber } from '@medical-crm/domain';
import { generateId, ForbiddenError, ValidationError } from '@medical-crm/utils';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';

export interface CreateOrderInput {
  caseId?: string;
  packageId?: string;
  patientId?: string;
  type: string;
  amount: string;
  currency?: string;
  metadata?: unknown;
  idempotencyKey?: string;
}

export interface IIdempotencyGuard {
  execute<T>(key: string, operation: string, fn: () => Promise<T>): Promise<T>;
}

export class CreateOrderUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly idempotencyGuard?: IIdempotencyGuard,
  ) {}

  async execute(input: CreateOrderInput, actor: Actor): Promise<OrderDTO> {
    if (actor.role !== 'PATIENT' && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only patients and admins can create orders');
    }

    // Determine patientId: patients use own ID, admins must specify
    let resolvedPatientId: string;
    if (actor.role === 'ADMIN') {
      if (!input.patientId) throw new ValidationError('Admin must specify patientId when creating an order');
      resolvedPatientId = input.patientId;
    } else {
      resolvedPatientId = actor.userId;
    }

    const createOrder = async (): Promise<OrderDTO> => {
      const orderNumberStr = await this.orderRepo.nextOrderNumber();
      const entity = new Order({
        id: generateId(),
        orderNumber: new OrderNumber(orderNumberStr),
        patientId: resolvedPatientId,
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
    };

    if (input.idempotencyKey && this.idempotencyGuard) {
      return this.idempotencyGuard.execute(input.idempotencyKey, 'CREATE_ORDER', createOrder);
    }

    return createOrder();
  }
}
