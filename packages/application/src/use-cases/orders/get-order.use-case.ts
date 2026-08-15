import type { IOrderRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetOrderUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(id: string, actor: Actor): Promise<OrderDTO> {
    const entity = await this.orderRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Order ${id} not found`);
    }

    if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCaseOrPatient(actor, { caseId: entity.caseId, patientId: entity.patientId });
    } else if (actor.role === 'HOSPITAL') {
      if (!entity.caseId) {
        throw new ForbiddenError('Not authorized');
      }
      await this.adminAccess?.assertActorCanAccessCase(actor, entity.caseId);
    } else if (actor.role === 'PATIENT' && entity.patientId !== actor.userId) {
      throw new ForbiddenError('Not authorized');
    }

    return toOrderDTO(entity);
  }
}
