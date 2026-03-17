import {
  CaseHospitalContact,
  Conversation,
  type ICHCRepository,
  type IConversationRepository,
} from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';

export interface SelectHospitalsInput {
  caseId: string;
  hospitalIds: string[];
  patientId: string;
}

export class SelectHospitalsUseCase {
  constructor(
    private readonly caseHospitalContactRepo: ICHCRepository,
    private readonly conversationRepo: IConversationRepository,
  ) {}

  async execute(input: SelectHospitalsInput): Promise<{ conversationIds: string[] }> {
    if (input.hospitalIds.length === 0) {
      throw new Error('At least one hospital must be selected');
    }

    const conversationIds: string[] = [];
    const now = new Date();

    for (const hospitalId of input.hospitalIds) {
      // Create case_hospital_contact with DISTRIBUTED status
      const contact = new CaseHospitalContact({
        id: generateId(),
        caseId: input.caseId,
        hospitalId,
        subStatus: 'DISTRIBUTED',
        selectedByPatientAt: null,
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

      await this.caseHospitalContactRepo.save(contact);

      // Create conversation for this hospital-patient pair
      const conversation = new Conversation({
        id: generateId(),
        caseId: input.caseId,
        hospitalId,
        category: 'HOSPITAL_PATIENT',
        title: null,
        lastMessageId: null,
        lastMessageAt: null,
        lastMessagePreview: null,
        lastSenderId: null,
        createdAt: now,
        updatedAt: now,
      });

      const saved = await this.conversationRepo.save(conversation);
      conversationIds.push(saved.id);
    }

    return { conversationIds };
  }
}
