import type { IConsultationRepository, IConsultationTranscriptRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationTranscriptDTO } from '../../dtos/consultation.dto.js';
import { toConsultationTranscriptDTO } from '../../mappers/consultation.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetConsultationTranscriptUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly transcriptRepo: IConsultationTranscriptRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(consultationId: string, actor: Actor): Promise<ConsultationTranscriptDTO> {
    const consultation = await this.consultationRepo.findById(consultationId);
    if (!consultation) {
      throw new NotFoundError(`Consultation ${consultationId} not found`);
    }

    if (actor.role === 'HOSPITAL') {
      if (consultation.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Access denied to this consultation');
      }
    }
    if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCase(actor, consultation.caseId);
    }

    const transcript = await this.transcriptRepo.findByConsultationId(consultationId);
    if (!transcript) {
      throw new NotFoundError(`Transcript for consultation ${consultationId} not found`);
    }

    return toConsultationTranscriptDTO(transcript);
  }
}
