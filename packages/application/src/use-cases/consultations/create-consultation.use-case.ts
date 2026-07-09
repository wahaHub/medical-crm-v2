import { Consultation, type IConsultationRepository, type ICaseRepository, type ICHCRepository } from '@medical-crm/domain';
import { generateId, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

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
    private readonly translationTaskService: TranslationTaskService,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(input: CreateConsultationInput, actor: Actor): Promise<ConsultationDTO> {
    const caseEntity = await this.caseRepo.findById(input.caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${input.caseId} not found`);
    }
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caseEntity);

    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo);
    }
    if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCase(actor, input.caseId);
    }

    const now = new Date();
    const consultationHospitalId = actor.role === 'HOSPITAL'
      ? actor.hospitalId ?? ''
      : caseEntity.assignedHospitalId ?? '';
    const entity = new Consultation({
      id: generateId(),
      caseId: input.caseId,
      hospitalId: consultationHospitalId,
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

    if (input.notes) {
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
