import { Case, type ICaseRepository, type IPatientRepository, PatientAuthService } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';

export interface InitOnboardingInput {
  email: string;
  name: string;
  phone?: string;
  preferredLanguage: string;
  procedureId?: string;
  destination?: string;
  category?: string;
}

export interface InitOnboardingOutput {
  patientId: string;
  caseId: string;
  token: string;
  isExistingPatient: boolean;
}

const MAX_RETRIES = 3;

export class InitOnboardingUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: InitOnboardingInput): Promise<InitOnboardingOutput> {
    // 1. Find or create patient
    let patient = await this.patientRepo.findByEmail(input.email);
    const isExisting = !!patient;

    if (!patient) {
      patient = await this.patientRepo.createTempPatient({
        email: input.email,
        name: input.name,
        phone: input.phone,
        preferredLanguage: input.preferredLanguage,
      });
    }

    // 2. Create case in DRAFT status (Case-first onboarding)
    let savedCase: Case | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const caseNumber = await this.caseRepo.nextCaseNumber();
      const now = new Date();
      const entity = new Case({
        id: generateId(),
        caseNumber,
        patientId: patient.id,
        patientName: input.name,
        patientCountry: input.destination ?? null,
        patientLanguage: input.preferredLanguage,
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
        savedCase = await this.caseRepo.save(entity);
        break;
      } catch (err: unknown) {
        const isUniqueViolation =
          err instanceof Error && err.message.includes('unique');
        if (!isUniqueViolation || attempt === MAX_RETRIES - 1) {
          throw err;
        }
      }
    }

    if (!savedCase) {
      throw new Error('Failed to create case after retries');
    }

    // 3. Create session token for the patient
    const token = await this.authService.createSessionToken(patient.id);

    return {
      patientId: patient.id,
      caseId: savedCase.id,
      token,
      isExistingPatient: isExisting,
    };
  }
}
