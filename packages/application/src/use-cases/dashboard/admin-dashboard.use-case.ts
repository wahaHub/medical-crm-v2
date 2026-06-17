import type { ICaseRepository, ISupportTicketRepository, IOrderRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { AdminDashboardDTO } from '../../dtos/dashboard.dto.js';
import type { Actor } from '../../types/actor.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';

export class AdminDashboardUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly ticketRepo: ISupportTicketRepository,
    private readonly orderRepo: IOrderRepository,
  ) {}

  async execute(actor: Actor): Promise<AdminDashboardDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can access the admin dashboard');
    }

    const patientSiteScope = getAdminPatientSiteScope(actor) ?? undefined;

    // 1. Case stats via existing countByFilters method
    const caseStats = await this.caseRepo.countByFilters({ patientSiteScope });

    // 2. Open tickets count — use findAll with status=OPEN and limit 1 to just get the total
    const openTicketsResult = await this.ticketRepo.findAll({
      status: 'OPEN',
      page: 1,
      limit: 1,
      patientSiteScope,
    });

    // 3. Pending orders — use findAll with status filter
    const pendingOrdersResult = await this.orderRepo.findAll({
      status: 'PENDING_PAYMENT',
      page: 1,
      limit: 1,
      patientSiteScope,
    });

    // 4. Recent cases — use findMany with limit=5
    const recentCasesResult = await this.caseRepo.findMany({ page: 1, limit: 5, patientSiteScope });

    return {
      stats: {
        totalCases: caseStats.total,
        unassignedCases: caseStats.unassigned,
        assignedCases: caseStats.assigned,
        openTickets: openTicketsResult.total,
        pendingOrders: pendingOrdersResult.total,
      },
      recentCases: recentCasesResult.data.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber.value,
        assignmentStatus: c.assignmentStatus,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
