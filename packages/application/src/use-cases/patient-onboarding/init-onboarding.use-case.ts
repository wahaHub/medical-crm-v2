import {
  AiChatSession,
  Case,
  Conversation,
  type IAiChatSessionRepository,
  type ICaseRepository,
  type IConversationRepository,
  type IPatientRepository,
  type PatientSite,
  type IUserEmailLookupRepository,
  PatientAuthService,
} from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import {
  EmailRoleConflictError,
  PatientAlreadyExistsError,
} from '../patient-auth/patient-entry-auth.errors.js';

export interface InitOnboardingInput {
  email: string;
  site: PatientSite;
  name: string;
  phone?: string;
  age?: string;
  gender?: string;
  country?: string;
  ipCountry?: string;
  whatsapp?: string;
  messenger?: string;
  department?: string;
  departmentCode?: string;
  disease?: string;
  preferredLanguage: string;
  procedureId?: string;
  destination?: string;
  treatmentTime?: string;
  category?: string;
  authenticatedPatientId?: string;
  verifiedRegisterEmail?: string;
}

export interface InitOnboardingOutput {
  patientId: string;
  caseId: string;
  nextStep: 'select-hospitals' | 'messages-ready';
  token: string;
  restoreToken: string;
  restoreCookie: string;
  isExistingPatient: boolean;
  widgetChatTarget: {
    kind: 'CHATBOT_SESSION';
    sessionId: string;
  };
}

const MAX_RETRIES = 3;

type EntryProfile = {
  name: string;
  email: string;
  phone: string | null;
  age: string | null;
  gender: string | null;
  country: string | null;
  whatsapp: string | null;
  messenger: string | null;
  department: string | null;
  departmentCode: string | null;
  disease: string | null;
  destination: string | null;
  treatmentTime: string | null;
};

function normalizeOptionalText(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildEntryProfile(input: InitOnboardingInput): EntryProfile {
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    phone: normalizeOptionalText(input.phone),
    age: normalizeOptionalText(input.age),
    gender: normalizeOptionalText(input.gender),
    country: normalizeOptionalText(input.country ?? input.ipCountry),
    whatsapp: normalizeOptionalText(input.whatsapp),
    messenger: normalizeOptionalText(input.messenger),
    department: normalizeOptionalText(input.department),
    departmentCode: normalizeOptionalText(input.departmentCode),
    disease: normalizeOptionalText(input.disease),
    destination: normalizeOptionalText(input.destination),
    treatmentTime: normalizeOptionalText(input.treatmentTime),
  };
}

export class InitOnboardingUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly userEmailLookupRepo: IUserEmailLookupRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly conversationRepo: IConversationRepository,
    private readonly aiChatSessionRepo: IAiChatSessionRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: InitOnboardingInput): Promise<InitOnboardingOutput> {
    const entryProfile = buildEntryProfile(input);
    const emailState = await this.userEmailLookupRepo.findEmailState(input.email, input.site);

    // 1. Gate by email ownership before any case creation logic.
    let patient;
    const isExisting = emailState.state === 'PATIENT';

    if (input.authenticatedPatientId && emailState.state === 'NONE') {
      const authenticatedPatient = await this.patientRepo.findById(input.authenticatedPatientId, input.site);
      if (authenticatedPatient) {
        throw new PatientAlreadyExistsError();
      }
    }

    if (emailState.state === 'PATIENT') {
      if (input.authenticatedPatientId !== emailState.userId) {
        throw new PatientAlreadyExistsError();
      }

      patient = await this.patientRepo.findById(emailState.userId, input.site)
        ?? await this.patientRepo.findByEmail(input.email, input.site);
      if (!patient) {
        throw new Error('Authenticated patient session could not be resolved');
      }
    } else if (emailState.state === 'HOSPITAL' || emailState.state === 'ADMIN') {
      throw new EmailRoleConflictError();
    } else {
      try {
        patient = await this.patientRepo.createTempPatient({
          email: input.email,
          name: input.name,
          phone: input.phone,
          preferredLanguage: input.preferredLanguage,
          site: input.site,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'PATIENT_ALREADY_EXISTS') {
          throw new PatientAlreadyExistsError();
        }
        if (err instanceof Error && err.message === 'EMAIL_ROLE_CONFLICT') {
          throw new EmailRoleConflictError();
        }
        throw err;
      }
    }

    // 2. Create a new onboarding case for the current submission.
    let savedCase: Case | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const caseNumber = await this.caseRepo.nextCaseNumber();
      const now = new Date();
      const entity = new Case({
        id: generateId(),
        caseNumber,
        patientId: patient.id,
        patientName: input.name,
        patientCountry: entryProfile.country,
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
        structuredData: {
          entryProfile,
        },
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

    const now = new Date();
    const adminConversation = new Conversation({
      id: generateId(),
      caseId: savedCase.id,
      hospitalId: null,
      category: 'ADMIN_PATIENT',
      title: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.conversationRepo.findOrCreateAdminPatientConversation(adminConversation);

    const widgetSessionId = `widget-chat:${patient.id}:${savedCase.id}`;
    try {
      const existingWidgetChatSession = await this.aiChatSessionRepo.findBySessionId(widgetSessionId, input.site);
      if (!existingWidgetChatSession) {
        await this.aiChatSessionRepo.save(new AiChatSession({
          id: generateId(),
          sessionId: widgetSessionId,
          site: input.site,
          sessionSecretHash: null,
          difyConversationId: null,
          patientId: patient.id,
          hospitalType: 'REGULAR',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      }
    } catch (error) {
      // Gracefully degrade when the chat session tables/columns are not yet
      // migrated (common during local development). Onboarding can still succeed
      // and the widget will bootstrap itself on first use.
      console.warn('init-onboarding: aiChatSession lookup/save failed, degrading gracefully.', error);
    }

    // 3. Create session token for the patient
    const token = await this.authService.createSessionToken(patient.id, input.site);
    const { restoreToken, restoreCookie } = await this.authService.createGuestRestoreArtifacts(patient.id, input.site);

    return {
      patientId: patient.id,
      caseId: savedCase.id,
      nextStep: 'select-hospitals',
      token,
      restoreToken,
      restoreCookie,
      isExistingPatient: isExisting,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: widgetSessionId,
      },
    };
  }
}
