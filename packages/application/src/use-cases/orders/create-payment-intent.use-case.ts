import type { IOrderRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError, ValidationError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface PaymentIntentResult {
  clientSecret: string;
  orderId: string;
}

export class CreatePaymentIntentUseCase {
  constructor(private readonly orderRepo: IOrderRepository) {}

  async execute(orderId: string, actor: Actor): Promise<PaymentIntentResult> {
    if (actor.role !== 'PATIENT') {
      throw new ForbiddenError('Patient only');
    }

    const entity = await this.orderRepo.findById(orderId);
    if (!entity) {
      throw new NotFoundError(`Order ${orderId} not found`);
    }

    if (entity.patientId !== actor.userId) {
      throw new ForbiddenError('Not authorized');
    }

    if (entity.status !== 'PENDING_PAYMENT') {
      throw new ValidationError('Order is not awaiting payment');
    }

    // Stub: return mock payment intent (Phase 2 placeholder)
    return {
      clientSecret: `pi_mock_${entity.id}`,
      orderId: entity.id,
    };
  }
}
