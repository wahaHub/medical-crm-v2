import type {
  IMaterialsRepository,
  MaterialsHospitalInfo,
  MaterialsProcedure,
  MaterialsSurgeon,
  MaterialsBeforeAfterCase,
} from '@medical-crm/domain';

/**
 * Hospital type resolver — looks up whether a hospital is COSMETIC or REGULAR
 * from the CRM database, so materials queries go to the correct Supabase.
 */
export type HospitalTypeResolver = (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>;

/**
 * Routes materials repository calls to the correct Supabase-backed repository
 * based on hospital type.
 *
 * - COSMETIC hospitals → Main Supabase (SupabaseMaterialsRepository)
 * - REGULAR hospitals  → China Medical Supabase (ChinaMedicalMaterialsRepository)
 */
export class RoutingMaterialsRepository implements IMaterialsRepository {
  constructor(
    private readonly cosmeticRepo: IMaterialsRepository,
    private readonly regularRepo: IMaterialsRepository,
    private readonly sharedReviewPackageRepo: IMaterialsRepository,
    private readonly resolveType: HospitalTypeResolver,
  ) {}

  private async getRepo(hospitalId: string): Promise<IMaterialsRepository> {
    const type = await this.resolveType(hospitalId);
    return type === 'COSMETIC' ? this.cosmeticRepo : this.regularRepo;
  }

  async getHospitalInfo(hospitalId: string): Promise<MaterialsHospitalInfo | null> {
    const repo = await this.getRepo(hospitalId);
    return repo.getHospitalInfo(hospitalId);
  }

  async updateHospitalInfo(hospitalId: string, data: Partial<MaterialsHospitalInfo>): Promise<MaterialsHospitalInfo> {
    const repo = await this.getRepo(hospitalId);
    return repo.updateHospitalInfo(hospitalId, data);
  }

  async listProcedures(hospitalId: string): Promise<MaterialsProcedure[]> {
    const repo = await this.getRepo(hospitalId);
    return repo.listProcedures(hospitalId);
  }

  async createProcedure(data: Omit<MaterialsProcedure, 'id'>): Promise<MaterialsProcedure> {
    const repo = await this.getRepo(data.hospitalId);
    return repo.createProcedure(data);
  }

  async updateProcedure(id: string, hospitalId: string, data: Partial<MaterialsProcedure>): Promise<MaterialsProcedure> {
    const repo = await this.getRepo(hospitalId);
    return repo.updateProcedure(id, hospitalId, data);
  }

  async deleteProcedure(id: string, hospitalId: string): Promise<void> {
    const repo = await this.getRepo(hospitalId);
    return repo.deleteProcedure(id, hospitalId);
  }

  async listSurgeons(hospitalId: string): Promise<MaterialsSurgeon[]> {
    const repo = await this.getRepo(hospitalId);
    return repo.listSurgeons(hospitalId);
  }

  async createSurgeon(data: Omit<MaterialsSurgeon, 'id'>): Promise<MaterialsSurgeon> {
    const repo = await this.getRepo(data.hospitalId);
    return repo.createSurgeon(data);
  }

  async updateSurgeon(id: string, hospitalId: string, data: Partial<MaterialsSurgeon>): Promise<MaterialsSurgeon> {
    const repo = await this.getRepo(hospitalId);
    return repo.updateSurgeon(id, hospitalId, data);
  }

  async deleteSurgeon(id: string, hospitalId: string): Promise<void> {
    const repo = await this.getRepo(hospitalId);
    return repo.deleteSurgeon(id, hospitalId);
  }

  async listBeforeAfterCases(hospitalId: string): Promise<MaterialsBeforeAfterCase[]> {
    const repo = await this.getRepo(hospitalId);
    return repo.listBeforeAfterCases(hospitalId);
  }

  async createBeforeAfterCase(data: Omit<MaterialsBeforeAfterCase, 'id'>): Promise<MaterialsBeforeAfterCase> {
    const repo = await this.getRepo(data.hospitalId);
    return repo.createBeforeAfterCase(data);
  }

  async updateBeforeAfterCase(id: string, hospitalId: string, data: Partial<MaterialsBeforeAfterCase>): Promise<MaterialsBeforeAfterCase> {
    const repo = await this.getRepo(hospitalId);
    return repo.updateBeforeAfterCase(id, hospitalId, data);
  }

  async deleteBeforeAfterCase(id: string, hospitalId: string): Promise<void> {
    const repo = await this.getRepo(hospitalId);
    return repo.deleteBeforeAfterCase(id, hospitalId);
  }

  async listReviews(hospitalId: string): ReturnType<IMaterialsRepository['listReviews']> {
    return this.sharedReviewPackageRepo.listReviews(hospitalId);
  }

  async createReview(
    data: Parameters<IMaterialsRepository['createReview']>[0],
  ): ReturnType<IMaterialsRepository['createReview']> {
    return this.sharedReviewPackageRepo.createReview(data);
  }

  async updateReview(
    id: string,
    hospitalId: string,
    data: Parameters<IMaterialsRepository['updateReview']>[2],
  ): ReturnType<IMaterialsRepository['updateReview']> {
    return this.sharedReviewPackageRepo.updateReview(id, hospitalId, data);
  }

  async deleteReview(id: string, hospitalId: string): Promise<void> {
    return this.sharedReviewPackageRepo.deleteReview(id, hospitalId);
  }

  async listPackages(hospitalId: string): ReturnType<IMaterialsRepository['listPackages']> {
    return this.sharedReviewPackageRepo.listPackages(hospitalId);
  }

  async getPackage(id: string, hospitalId: string): ReturnType<IMaterialsRepository['getPackage']> {
    return this.sharedReviewPackageRepo.getPackage(id, hospitalId);
  }

  async createPackage(
    data: Parameters<IMaterialsRepository['createPackage']>[0],
  ): ReturnType<IMaterialsRepository['createPackage']> {
    return this.sharedReviewPackageRepo.createPackage(data);
  }

  async updatePackage(
    id: string,
    hospitalId: string,
    data: Parameters<IMaterialsRepository['updatePackage']>[2],
  ): ReturnType<IMaterialsRepository['updatePackage']> {
    return this.sharedReviewPackageRepo.updatePackage(id, hospitalId, data);
  }

  async deletePackage(id: string, hospitalId: string): Promise<void> {
    return this.sharedReviewPackageRepo.deletePackage(id, hospitalId);
  }
}
