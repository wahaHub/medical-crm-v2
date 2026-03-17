import type { IHospitalRepository, MatchedHospital } from '@medical-crm/domain';

export interface MatchHospitalsInput {
  procedureId?: string;
  procedureName?: string;
  destination?: string;
  category?: string;
}

export { MatchedHospital };

export class MatchHospitalsUseCase {
  constructor(private readonly hospitalRepo: IHospitalRepository) {}

  async execute(input: MatchHospitalsInput): Promise<{ hospitals: MatchedHospital[] }> {
    const hospitals = await this.hospitalRepo.findMatchingHospitals({
      procedureId: input.procedureId,
      destination: input.destination,
      category: input.category,
    });
    return { hospitals };
  }
}
