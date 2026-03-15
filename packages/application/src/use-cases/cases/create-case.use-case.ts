import { Case, type ICaseRepository } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface CreateCaseInput {
  patientId: string;
  patientName: string;
  patientCountry?: string;
  patientLanguage?: string;
  primaryDiagnosis?: string;
  symptoms?: string[];
  medicalHistory?: string;
}

export class CreateCaseUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(input: CreateCaseInput, actor: Actor): Promise<Case> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can create cases');
    }

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
    });

    return this.caseRepo.save(entity);
  }
}
