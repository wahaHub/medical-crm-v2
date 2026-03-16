import { Consultation, type IConsultationRepository, type ICaseRepository } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';

export interface CreateConsultationInput {
  caseId: string;
  scheduledAt: Date;
  durationMinutes?: number;
  consultationLink?: string;
  aiTranslation?: boolean;
  patientLanguage?: string;
  notes?: string;
}

export class CreateConsultationUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(input: CreateConsultationInput, actor: Actor): Promise<ConsultationDTO> {
    const caseEntity = await this.caseRepo.findById(input.caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${input.caseId} not found`);
    }

    if (actor.role === 'HOSPITAL') {
      if (caseEntity.assignedHospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Access denied to this case');
      }
    }

    const now = new Date();

    const entity = new Consultation({
      id: generateId(),
      caseId: input.caseId,
      hospitalId: caseEntity.assignedHospitalId ?? '',
      patientId: caseEntity.patientId,
      doctorId: null,
      status: 'SCHEDULED',
      scheduledAt: input.scheduledAt,
      startedAt: null,
      endedAt: null,
      durationMinutes: input.durationMinutes ?? 30,
      actualDuration: null,
      consultationLink: input.consultationLink ?? null,
      aiTranslation: input.aiTranslation ?? false,
      patientLanguage: input.patientLanguage ?? caseEntity.patientLanguage,
      notes: input.notes ?? null,
      videoStorageKey: null,
      videoSize: null,
      videoDuration: null,
      videoThumbnail: null,
      videoUploadedAt: null,
      aiSummary: null,
      aiSummaryCreatedAt: null,
      aiSummaryStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.consultationRepo.save(entity);
    return toConsultationDTO(saved);
  }
}
