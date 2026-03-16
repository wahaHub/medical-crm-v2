import type { IOrderRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError, ValidationError } from '@medical-crm/utils';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';

export interface RequestRefundInput {
  amount: string;
  reason: string;
}

export class RequestRefundUseCase {
  constructor(private readonly orderRepo: IOrderRepository) {}

  async execute(orderId: string, input: RequestRefundInput, actor: Actor): Promise<OrderDTO> {
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

    const refundableStatuses = ['PAID', 'IN_PROGRESS', 'COMPLETED'];
    if (!refundableStatuses.includes(entity.status)) {
      throw new ValidationError(`Cannot request refund for order in ${entity.status} status`);
    }

    entity.refund(input.amount, input.reason);

    const saved = await this.orderRepo.save(entity);
    return toOrderDTO(saved);
  }
}
