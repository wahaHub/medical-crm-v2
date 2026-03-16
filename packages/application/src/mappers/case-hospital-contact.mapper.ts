import type { CaseHospitalContact } from '@medical-crm/domain';
import type { CaseHospitalContactDTO } from '../dtos/case-hospital-contact.dto.js';

export function toCaseHospitalContactDTO(
  entity: CaseHospitalContact,
  hospitalName?: string,
): CaseHospitalContactDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    hospitalId: entity.hospitalId,
    hospitalName,
    subStatus: entity.subStatus,
    selectedByPatientAt: entity.selectedByPatientAt?.toISOString() ?? null,
    distributedAt: entity.distributedAt?.toISOString() ?? null,
    firstReplyAt: entity.firstReplyAt?.toISOString() ?? null,
    quoteId: entity.quoteId,
    patientViewedQuoteAt: entity.patientViewedQuoteAt?.toISOString() ?? null,
    patientAcceptedAt: entity.patientAcceptedAt?.toISOString() ?? null,
    patientRejectedAt: entity.patientRejectedAt?.toISOString() ?? null,
    reminderSentAt: entity.reminderSentAt?.toISOString() ?? null,
    removedAt: entity.removedAt?.toISOString() ?? null,
    removedReason: entity.removedReason,
    version: entity.version,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
