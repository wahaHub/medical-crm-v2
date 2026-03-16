import type { IOrderRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';

export class UpdateOrderStatusUseCase {
  constructor(private readonly orderRepo: IOrderRepository) {}

  async execute(id: string, status: string, actor: Actor): Promise<OrderDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    const entity = await this.orderRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Order ${id} not found`);
    }

    entity.transitionStatus(status as import('@medical-crm/domain').OrderStatus);

    const saved = await this.orderRepo.save(entity);
    return toOrderDTO(saved);
  }
}
