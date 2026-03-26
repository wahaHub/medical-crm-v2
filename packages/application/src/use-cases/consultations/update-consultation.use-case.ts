import type { IConsultationRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';

export interface UpdateConsultationInput {
  scheduledAt?: Date;
  durationMinutes?: number;
  consultationLink?: string;
  notes?: string;
  aiTranslation?: boolean;
  patientLanguage?: string;
}

export class UpdateConsultationUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

  async execute(
    id: string,
    input: UpdateConsultationInput,
    actor: Actor,
  ): Promise<ConsultationDTO> {
    const entity = await this.consultationRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Consultation ${id} not found`);
    }

    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this consultation');
    }

    if (input.scheduledAt !== undefined) entity.scheduledAt = input.scheduledAt;
    if (input.durationMinutes !== undefined) entity.durationMinutes = input.durationMinutes;
    if (input.consultationLink !== undefined) entity.consultationLink = input.consultationLink;
    if (input.notes !== undefined) entity.notes = input.notes;
    if (input.aiTranslation !== undefined) entity.aiTranslation = input.aiTranslation;
    if (input.patientLanguage !== undefined) entity.patientLanguage = input.patientLanguage;
    entity.updatedAt = new Date();

    const saved = await this.consultationRepo.save(entity);

    if (input.notes !== undefined) {
      await this.translationTaskService.enqueue({
        sourceDb: 'crm',
        entityType: 'consultation',
        entityId: saved.id,
        fieldsToTranslate: { notes: input.notes },
      });
    }

    return toConsultationDTO(saved);
  }
}
