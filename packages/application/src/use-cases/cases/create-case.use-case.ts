import { Case, type ICaseRepository } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { CaseDTO } from '../../dtos/case.dto.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export interface CreateCaseInput {
  patientId: string;
  patientName: string;
  patientCountry?: string;
  patientLanguage?: string;
  primaryDiagnosis?: string;
  symptoms?: string[];
  medicalHistory?: string;
}

const MAX_RETRIES = 3;

export class CreateCaseUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(input: CreateCaseInput, actor: Actor): Promise<CaseDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can create cases');
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const caseNumber = await this.caseRepo.nextCaseNumber();
      const now = new Date();

      const entity = new Case({
        id: generateId(),
        caseNumber,
        patientId: input.patientId,
        patientName: input.patientName,
        patientCountry: input.patientCountry ?? null,
        patientLanguage: input.patientLanguage ?? 'en',
        assignedHospitalId: null,
        primaryDiagnosis: input.primaryDiagnosis ?? null,
        diagnosisCode: null,
        symptoms: input.symptoms ?? null,
        medicalHistory: input.medicalHistory ?? null,
        aiSummary: null,
        aiSummaryLanguage: null,
        riskLevel: null,
        status: 'DRAFT',
        stage: 'PENDING_ASSIGNMENT',
        assignedAt: null,
        createdAt: now,
        updatedAt: now,
        assignmentStatus: 'UNASSIGNED',
        treatmentStage: null,
        conditionSummary: null,
        structuredData: null,
        riskFlags: null,
        priority: null,
        lastEventAt: null,
        aiSummaryStatus: 'PENDING',
        questionCollectorTemplateId: null,
      });

      try {
        const saved = await this.caseRepo.save(entity);
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
