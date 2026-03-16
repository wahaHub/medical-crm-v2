import type { IOrderRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';

export class GetOrderUseCase {
  constructor(private readonly orderRepo: IOrderRepository) {}

  async execute(id: string, actor: Actor): Promise<OrderDTO> {
    const entity = await this.orderRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Order ${id} not found`);
    }

    // Patients can only see their own orders
    if (actor.role === 'PATIENT' && entity.patientId !== actor.userId) {
      throw new ForbiddenError('Not authorized');
    }

    return toOrderDTO(entity);
  }
}
