import type { ICHCRepository } from '@medical-crm/domain';
import { CaseHospitalContact } from '@medical-crm/domain';
import { generateId, ForbiddenError, ConflictError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';

export class AddHospitalToCaseUseCase {
  constructor(private readonly chcRepo: ICHCRepository) {}

  async execute(caseId: string, hospitalId: string, actor: Actor): Promise<CaseHospitalContactDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can add hospitals to cases');

    const existing = await this.chcRepo.findByCaseAndHospital(caseId, hospitalId);
    if (existing) throw new ConflictError('Hospital already added to this case');

    const entity = new CaseHospitalContact({
      id: generateId(),
      caseId,
      hospitalId,
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: null,
      distributedAt: new Date(),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.chcRepo.save(entity);
    return toCaseHospitalContactDTO(saved);
  }
}
