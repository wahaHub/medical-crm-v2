import type { ICaseRepository, ICHCRepository, IConversationRepository } from '@medical-crm/domain';
import { CaseHospitalContact, Conversation } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';

export interface SelectHospitalsInput {
  caseId: string;
  hospitalIds: string[];
  customHospitalRequest?: string;
  patientId: string;
}

export class SelectHospitalsUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly conversationRepo: IConversationRepository,
  ) {}

  async execute(input: SelectHospitalsInput): Promise<CaseHospitalContactDTO[]> {
    // Verify patient owns the case
    const caseEntity = await this.caseRepo.findById(input.caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${input.caseId} not found`);
    if (caseEntity.patientId !== input.patientId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const existingSelection = asRecord(caseEntity.structuredData?.['patientHospitalSelection']);
    const updatedSelection: Record<string, unknown> = {
      ...existingSelection,
    };
    if (input.customHospitalRequest !== undefined) {
      updatedSelection['customHospitalRequest'] = normalizeCustomHospitalRequest(input.customHospitalRequest);
    }
    caseEntity.structuredData = {
      ...(caseEntity.structuredData ?? {}),
      patientHospitalSelection: updatedSelection,
    };
    await this.caseRepo.save(caseEntity);

    const now = new Date();
    const results: CaseHospitalContactDTO[] = [];
    const selectedHospitalIds = [...new Set(input.hospitalIds)];
    const existingContacts = await this.chcRepo.findByCaseId(input.caseId) ?? [];
    const existingContactsByHospitalId = new Map(
      existingContacts.map((contact) => [contact.hospitalId, contact]),
    );

    for (const contact of existingContacts) {
      if (selectedHospitalIds.includes(contact.hospitalId) || contact.removedAt) {
        continue;
      }

      contact.remove('PATIENT_SELECTION_REPLACED');
      await this.chcRepo.save(contact);
    }

    for (const hospitalId of selectedHospitalIds) {
      const existing = existingContactsByHospitalId.get(hospitalId)
        ?? await this.chcRepo.findByCaseAndHospital(input.caseId, hospitalId);
      if (existing) {
        if (existing.removedAt || existing.subStatus === 'REMOVED') {
          existing.subStatus = 'DISTRIBUTED';
          existing.selectedByPatientAt = now;
          existing.removedAt = null;
          existing.removedReason = null;
          existing.updatedAt = now;
          const restored = await this.chcRepo.save(existing);
          results.push(toCaseHospitalContactDTO(restored));
          continue;
        }

        results.push(toCaseHospitalContactDTO(existing));
        continue;
      }

      // Create CHC record
      const chc = new CaseHospitalContact({
        id: generateId(),
        caseId: input.caseId,
        hospitalId,
        subStatus: 'DISTRIBUTED',
        selectedByPatientAt: now,
        distributedAt: now,
        firstReplyAt: null,
        quoteId: null,
        patientViewedQuoteAt: null,
        patientAcceptedAt: null,
        patientRejectedAt: null,
        reminderSentAt: null,
        removedAt: null,
        removedReason: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      const saved = await this.chcRepo.save(chc);
      results.push(toCaseHospitalContactDTO(saved));

      // Create a conversation for patient-hospital communication
      const conversation = new Conversation({
        id: generateId(),
        caseId: input.caseId,
        category: 'HOSPITAL_PATIENT',
        title: null,
        hospitalId,
        lastMessageId: null,
        lastMessageAt: null,
        lastMessagePreview: null,
        lastSenderId: null,
        createdAt: now,
        updatedAt: now,
      });
      await this.conversationRepo.save(conversation);
    }

    return results;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeCustomHospitalRequest(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
