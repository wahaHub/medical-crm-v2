import type { IOrderRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class UpdateOrderStatusUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(id: string, status: string, actor: Actor): Promise<OrderDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    const entity = await this.orderRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Order ${id} not found`);
    }
    await this.adminAccess?.assertActorCanAccessCaseOrPatient(actor, { caseId: entity.caseId, patientId: entity.patientId });

    entity.transitionStatus(status as import('@medical-crm/domain').OrderStatus);

    const saved = await this.orderRepo.save(entity);
    return toOrderDTO(saved);
  }
}
