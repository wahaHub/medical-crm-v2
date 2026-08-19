import type {
  ICaseRepository,
  IPatientRepository,
  ICaseEventRepository,
  IAuditLogRepository,
  CaseSourceChannel,
  PatientSite,
} from '@medical-crm/domain';
import { Case, CaseEvent } from '@medical-crm/domain';
import { generateId, ForbiddenError, ValidationError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface CreateManualCaseInput {
  patientName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  sourceChannel: Exclude<CaseSourceChannel, 'WEB_ONBOARDING'>;
  conditionSummary?: string;
  patientCountry?: string;
  patientLanguage?: string;
  patientSite?: PatientSite;
}

const MAX_RETRIES = 3;

/**
 * Case Lifecycle Phase 1: manually register a case for a patient who reached out
 * via an offline channel (email / WhatsApp / phone call / referral).
 * Reuses the existing patient record when the email matches; otherwise creates a
 * passwordless patient profile. Never touches the website onboarding flow.
 */
export class CreateManualCaseUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly patientRepo: IPatientRepository,
    private readonly eventRepo: ICaseEventRepository,
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(input: CreateManualCaseInput, actor: Actor): Promise<CaseDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can manually create cases');
    }

    const email = input.email?.trim() || undefined;
    const phone = input.phone?.trim() || undefined;
    const whatsapp = input.whatsapp?.trim() || undefined;
    if (!email && !phone && !whatsapp) {
      throw new ValidationError('At least one contact method (email, phone, or whatsapp) is required');
    }

    const site: PatientSite = input.patientSite ?? 'china';
    const preferredLanguage = input.patientLanguage ?? 'en';

    // Reuse the existing patient profile when the email matches (same conflict-reuse
    // semantics as the onboarding flow); otherwise create a passwordless patient.
    let patient = email ? await this.patientRepo.findByEmail(email, site) : null;
    const patientReused = Boolean(patient);
    if (!patient) {
      patient = email
        ? await this.patientRepo.createTempPatient({
          email,
          name: input.patientName,
          phone,
          whatsapp,
          preferredLanguage,
          site,
        })
        : await this.patientRepo.createOfflinePatient({
          name: input.patientName,
          phone,
          whatsapp,
          preferredLanguage,
          site,
        });
    }

    await this.adminAccess?.assertActorCanAccessPatient(actor, patient.id);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const caseNumber = await this.caseRepo.nextCaseNumber();
      const now = new Date();

      const entity = new Case({
        id: generateId(),
        caseNumber,
        patientId: patient.id,
        patientName: input.patientName,
        patientCountry: input.patientCountry ?? null,
        patientLanguage: preferredLanguage,
        assignedHospitalId: null,
        primaryDiagnosis: null,
        diagnosisCode: null,
        symptoms: null,
        medicalHistory: null,
        aiSummary: null,
        aiSummaryLanguage: null,
        riskLevel: null,
        status: 'DRAFT',
        stage: 'PENDING_ASSIGNMENT',
        assignedAt: null,
        createdAt: now,
        updatedAt: now,
        assignmentStatus: 'UNASSIGNED',
        treatmentStage: 'INTAKE',
        conditionSummary: input.conditionSummary ?? null,
        structuredData: null,
        riskFlags: null,
        priority: null,
        lastEventAt: null,
        aiSummaryStatus: 'PENDING',
        questionCollectorTemplateId: null,
        sourceChannel: input.sourceChannel,
        createdByAdminId: actor.userId,
      });

      try {
        const saved = await this.caseRepo.save(entity);

        await this.eventRepo.save(new CaseEvent({
          id: generateId(),
          caseId: saved.id,
          eventType: 'CASE_CREATED',
          actorType: 'ADMIN',
          actorId: actor.userId,
          eventData: {
            source: 'MANUAL',
            sourceChannel: input.sourceChannel,
            patientReused,
            contact: {
              ...(email ? { email } : {}),
              ...(phone ? { phone } : {}),
              ...(whatsapp ? { whatsapp } : {}),
            },
          },
          isVisibleToPatient: false,
          createdAt: new Date(),
        }));

        await this.auditLogRepo.record({
          userId: actor.userId,
          event: 'CASE_CREATED',
          caseId: saved.id,
          metadata: {
            source: 'MANUAL',
            sourceChannel: input.sourceChannel,
            patientId: patient.id,
            patientReused,
          },
        });

        return toCaseDTO(saved);
      } catch (err: unknown) {
        const isUniqueViolation =
          err instanceof Error && err.message.includes('unique');
        if (!isUniqueViolation || attempt === MAX_RETRIES - 1) {
          throw err;
        }
      }
    }

    throw new Error('Failed to create case after retries');
  }
}
