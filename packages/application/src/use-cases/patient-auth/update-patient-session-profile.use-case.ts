import type { ICaseRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import { asRecord } from '../../utils/structured-data.js';

export type PatientSessionProfileUpdate = {
  name?: string;
  phone?: string;
  age?: string;
  gender?: string;
  country?: string;
  whatsapp?: string;
  messenger?: string;
  department?: string;
  departmentCode?: string;
  disease?: string;
  destination?: string;
  treatmentTime?: string;
};

const PROFILE_FIELDS: Array<keyof PatientSessionProfileUpdate> = [
  'name',
  'phone',
  'age',
  'gender',
  'country',
  'whatsapp',
  'messenger',
  'department',
  'departmentCode',
  'disease',
  'destination',
  'treatmentTime',
];

export class UpdatePatientSessionProfileUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(input: {
    patientId: string;
    profile: PatientSessionProfileUpdate;
  }) {
    const cases = await this.caseRepo.findByPatientId(input.patientId);
    const latestCase = [...cases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

    if (!latestCase) {
      throw new NotFoundError(`Patient ${input.patientId} has no case to update`);
    }

    const existingProfile = asRecord(latestCase.structuredData?.['entryProfile']) ?? {};
    const nextProfile: Record<string, unknown> = { ...existingProfile };

    for (const field of PROFILE_FIELDS) {
      if (!(field in input.profile)) {
        continue;
      }
      nextProfile[field] = normalizeOptionalText(input.profile[field]);
    }

    latestCase.structuredData = {
      ...(latestCase.structuredData ?? {}),
      entryProfile: nextProfile,
    };

    if ('name' in input.profile && nextProfile.name) {
      latestCase.patientName = String(nextProfile.name);
    }
    if ('country' in input.profile) {
      latestCase.patientCountry = normalizeOptionalText(input.profile.country);
    }
    if ('disease' in input.profile) {
      latestCase.primaryDiagnosis = normalizeOptionalText(input.profile.disease);
    }

    return this.caseRepo.save(latestCase);
  }
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
