import type { ICaseRepository, IOrderRepository, IJourneyRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { PatientDashboardDTO } from '../../dtos/dashboard.dto.js';
import type { Actor } from '../../types/actor.js';

export class PatientDashboardUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly journeyRepo: IJourneyRepository,
  ) {}

  async execute(actor: Actor): Promise<PatientDashboardDTO> {
    if (actor.role !== 'PATIENT') {
      throw new ForbiddenError('Only patients can access the patient dashboard');
    }

    // 1. Get patient's cases
    const cases = await this.caseRepo.findByPatientId(actor.userId);

    // 2. Gather upcoming milestones from all cases
    const allMilestones: PatientDashboardDTO['upcomingMilestones'] = [];
    const now = new Date();
    for (const c of cases) {
      const milestones = await this.journeyRepo.findMilestonesByCaseId(c.id, { visibleOnly: true });
      for (const m of milestones) {
        if (m.eventDate >= now) {
          allMilestones.push({
            id: m.id,
            eventType: m.eventType,
            eventDate: m.eventDate.toISOString(),
            note: m.note,
          });
        }
      }
    }

    // Sort milestones by date ascending and take first 10
    allMilestones.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const upcomingMilestones = allMilestones.slice(0, 10);

    // 3. Orders summary — fetch all orders for patient and count by status in-memory
    const ordersResult = await this.orderRepo.findAll({
      patientId: actor.userId,
      page: 1,
      limit: 1000,
    });

    const ordersSummary = {
      pendingPayment: 0,
      inProgress: 0,
      completed: 0,
    };

    for (const order of ordersResult.data) {
      if (order.status === 'PENDING_PAYMENT') ordersSummary.pendingPayment++;
      else if (order.status === 'IN_PROGRESS' || order.status === 'PAID') ordersSummary.inProgress++;
      else if (order.status === 'COMPLETED') ordersSummary.completed++;
    }

    // 4. Unread message count — stub at 0 (no countUnreadByUserId method available)
    const unreadMessageCount = 0;

    return {
      cases: cases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber.value,
        assignmentStatus: c.assignmentStatus,
        treatmentStage: c.treatmentStage,
      })),
      upcomingMilestones,
      ordersSummary,
      unreadMessageCount,
    };
  }
}
