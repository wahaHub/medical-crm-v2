import type {
  ICaseRepository,
  ICHCRepository,
  IConversationRepository,
  IPatientRepository,
  IUserRepository,
} from '@medical-crm/domain';
import { Conversation } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';

export interface PatientSessionState {
  id: string;
  patientId: string;
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
  patientCode: string | null;
  preferredLanguage: string;
  caseId: string | null;
  nextStep: 'select-hospitals' | 'messages-ready';
  selectedHospitalIds: string[];
  customHospitalRequest: string | null;
  medicalFormStatus: 'NOT_STARTED' | 'SKIPPED' | 'SUBMITTED';
  medicalFormSkippedAt: Date | null;
  medicalFormSubmittedAt: Date | null;
  medicalFormResponseId: string | null;
  profileSubmitted: true;
  chatUnlocked: true;
}

export class GetPatientSessionStateUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly userRepo: IUserRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly conversationRepo: IConversationRepository,
  ) {}

  async execute(input: { patientId: string }): Promise<PatientSessionState> {
    const [patient, userProfile, cases] = await Promise.all([
      this.patientRepo.findById(input.patientId),
      this.userRepo.findById(input.patientId),
      this.caseRepo.findByPatientId(input.patientId),
    ]);

    if (!patient || !userProfile) {
      throw new Error('Patient not found');
    }

    const latestCase = [...cases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    const entryProfile = getEntryProfile(latestCase?.structuredData ?? null);
    const customHospitalRequest = getCustomHospitalRequest(latestCase?.structuredData ?? null);
    const medicalFormMetadata = getMedicalFormMetadata(latestCase?.structuredData ?? null);
    const chcs = latestCase ? await this.chcRepo.findByCaseId(latestCase.id) : [];
    if (latestCase) {
      await this.ensureAdminConversation(input.patientId, latestCase.id);
    }
    const selectedHospitalIds = chcs
      .filter((contact) => !contact.removedAt)
      .map((contact) => contact.hospitalId);

    return {
      id: patient.id,
      patientId: patient.id,
      name: entryProfile?.name ?? latestCase?.patientName ?? userProfile.name,
      email: entryProfile?.email ?? userProfile.email,
      phone: entryProfile?.phone ?? userProfile.phone ?? null,
      age: entryProfile?.age ?? null,
      gender: entryProfile?.gender ?? null,
      country: entryProfile?.country ?? latestCase?.patientCountry ?? null,
      whatsapp: entryProfile?.whatsapp ?? null,
      messenger: entryProfile?.messenger ?? null,
      department: entryProfile?.department ?? null,
      departmentCode: entryProfile?.departmentCode ?? null,
      disease: entryProfile?.disease ?? null,
      destination: entryProfile?.destination ?? null,
      treatmentTime: entryProfile?.treatmentTime ?? null,
      patientCode: patient.patientCode,
      preferredLanguage: patient.preferredLanguage,
      caseId: latestCase?.id ?? null,
      nextStep: 'select-hospitals',
      selectedHospitalIds,
      customHospitalRequest,
      medicalFormStatus: medicalFormMetadata.medicalFormStatus,
      medicalFormSkippedAt: medicalFormMetadata.medicalFormSkippedAt,
      medicalFormSubmittedAt: medicalFormMetadata.medicalFormSubmittedAt,
      medicalFormResponseId: medicalFormMetadata.medicalFormResponseId,
      profileSubmitted: true,
      chatUnlocked: true,
    };
  }

  private async ensureAdminConversation(patientId: string, caseId: string): Promise<void> {
    const conversations = await this.conversationRepo.findByPatientId(patientId);
    const hasAdminConversation = conversations.some((conversation) =>
      conversation.caseId === caseId && conversation.category === 'ADMIN_PATIENT',
    );

    if (hasAdminConversation) {
      return;
    }

    const now = new Date();
    await this.conversationRepo.save(new Conversation({
      id: generateId(),
      caseId,
      hospitalId: null,
      category: 'ADMIN_PATIENT',
      title: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: now,
      updatedAt: now,
    }));
  }
}

type EntryProfile = {
  name: string | null;
  email: string | null;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getEntryProfile(structuredData: Record<string, unknown> | null): EntryProfile | null {
  const entryProfile = asRecord(structuredData?.['entryProfile']);
  if (!entryProfile) {
    return null;
  }

  return {
    name: asNullableString(entryProfile['name']),
    email: asNullableString(entryProfile['email']),
    phone: asNullableString(entryProfile['phone']),
    age: asNullableString(entryProfile['age']),
    gender: asNullableString(entryProfile['gender']),
    country: asNullableString(entryProfile['country']),
    whatsapp: asNullableString(entryProfile['whatsapp']),
    messenger: asNullableString(entryProfile['messenger']),
    department: asNullableString(entryProfile['department']),
    departmentCode: asNullableString(entryProfile['departmentCode']),
    disease: asNullableString(entryProfile['disease']),
    destination: asNullableString(entryProfile['destination']),
    treatmentTime: asNullableString(entryProfile['treatmentTime']),
  };
}

function getCustomHospitalRequest(structuredData: Record<string, unknown> | null): string | null {
  const patientHospitalSelection = asRecord(structuredData?.['patientHospitalSelection']);
  return asNullableString(patientHospitalSelection?.['customHospitalRequest']);
}

function asNullableDate(value: unknown): Date | null {
  if (typeof value === 'string' || value instanceof Date) {
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

type MedicalFormMetadata = {
  medicalFormStatus: 'NOT_STARTED' | 'SKIPPED' | 'SUBMITTED';
  medicalFormSkippedAt: Date | null;
  medicalFormSubmittedAt: Date | null;
  medicalFormResponseId: string | null;
};

function getMedicalFormMetadata(structuredData: Record<string, unknown> | null): MedicalFormMetadata {
  const patientHospitalSelection = asRecord(structuredData?.['patientHospitalSelection']);
  const rawStatus = patientHospitalSelection?.['medicalFormStatus'];
  const medicalFormStatus: 'NOT_STARTED' | 'SKIPPED' | 'SUBMITTED' =
    rawStatus === 'SKIPPED' || rawStatus === 'SUBMITTED' ? rawStatus : 'NOT_STARTED';

  return {
    medicalFormStatus,
    medicalFormSkippedAt: asNullableDate(patientHospitalSelection?.['medicalFormSkippedAt']),
    medicalFormSubmittedAt: asNullableDate(patientHospitalSelection?.['medicalFormSubmittedAt']),
    medicalFormResponseId: asNullableString(patientHospitalSelection?.['medicalFormResponseId']),
  };
}
