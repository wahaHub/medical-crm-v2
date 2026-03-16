import type { ICHCRepository, ICaseRepository, TransactionRunner, Transaction } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError, ValidationError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class AdminResetAssignmentUseCase {
  constructor(
    private readonly chcRepo: ICHCRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly txRunner: TransactionRunner,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can reset assignments');

    await this.txRunner.run(async (tx: Transaction) => {
      // 1. Find the case
      const caseEntity = await this.caseRepo.findById(caseId, tx);
      if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);
      if (caseEntity.assignmentStatus !== 'ASSIGNED') {
        throw new ValidationError('Case is not assigned');
      }

      // 2. Unassign the case
      caseEntity.transitionAssignmentStatus('UNASSIGNED');
      caseEntity.assignedHospitalId = null;
      caseEntity.assignedAt = null;
      await this.caseRepo.save(caseEntity, tx);

      // 3. Find the accepted CHC and reset all CHCs to DISTRIBUTED
      const chcs = await this.chcRepo.findByCaseId(caseId, tx);
      for (const chc of chcs) {
        if (chc.subStatus === 'ACCEPTED' || chc.subStatus === 'REJECTED') {
          // Reset to DISTRIBUTED — we can't use transitionSubStatus here since
          // ACCEPTED is terminal. Do a direct status reset for admin override.
          chc.subStatus = 'DISTRIBUTED';
          chc.patientAcceptedAt = null;
          chc.patientRejectedAt = null;
          chc.updatedAt = new Date();
          await this.chcRepo.save(chc, tx);
        }
      }
    });
  }
}
