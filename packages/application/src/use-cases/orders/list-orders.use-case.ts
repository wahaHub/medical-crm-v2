import type { IOrderRepository, OrderListQuery } from '@medical-crm/domain';
import type { OrderDTO } from '../../dtos/order.dto.js';
import type { Actor } from '../../types/actor.js';
import { toOrderDTO } from '../../mappers/order.mapper.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';

export class ListOrdersUseCase {
  constructor(private readonly orderRepo: IOrderRepository) {}

  async execute(
    query: OrderListQuery,
    actor: Actor,
  ): Promise<{ data: OrderDTO[]; total: number; page: number; limit: number }> {
    // Patients see only their own orders
    const patientSiteScope = getAdminPatientSiteScope(actor);
    const effectiveQuery: OrderListQuery = actor.role === 'PATIENT'
      ? { ...query, patientId: actor.userId }
      : patientSiteScope
        ? { ...query, patientSiteScope }
        : query;

    const result = await this.orderRepo.findAll(effectiveQuery);

    return {
      data: result.data.map((e) => toOrderDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
