import type { ICaseRepository, IQuoteRepository, IConsultationRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { HospitalDashboardDTO } from '../../dtos/dashboard.dto.js';
import type { Actor } from '../../types/actor.js';

export class HospitalDashboardUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly quoteRepo: IQuoteRepository,
    private readonly consultationRepo: IConsultationRepository,
  ) {}

  async execute(actor: Actor): Promise<HospitalDashboardDTO> {
    if (actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only hospital users can access the hospital dashboard');
    }

    if (!actor.hospitalId) {
      throw new ForbiddenError('Hospital actor missing hospitalId');
    }

    const hospitalId = actor.hospitalId;

    // 1. Case stats scoped to this hospital
    const caseStats = await this.caseRepo.countByFilters({ hospitalId });

    // 2. Pending quotes for this hospital
    const pendingQuotesResult = await this.quoteRepo.findByHospitalId(hospitalId, {
      status: 'PENDING',
      page: 1,
      limit: 1,
    });

    // 3. Today's consultations via consultation stats
    const consultationStats = await this.consultationRepo.countByFilters({ hospitalId });

    // 4. Active orders — stub at 0 (orders don't have hospitalId)
    const activeOrders = 0;

    // 5. Recent cases for this hospital
    const recentCasesResult = await this.caseRepo.findMany(
      { page: 1, limit: 5, hospitalId },
      hospitalId,
    );

    return {
      stats: {
        assignedCases: caseStats.assigned,
        pendingQuotes: pendingQuotesResult.total,
        todayConsultations: consultationStats.todayCount,
        activeOrders,
      },
      recentCases: recentCasesResult.data.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber.value,
        treatmentStage: c.treatmentStage,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
