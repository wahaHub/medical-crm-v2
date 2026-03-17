import { eq } from 'drizzle-orm';
import type { IHospitalRepository, HospitalInfo, MatchedHospital, FindMatchingHospitalsInput } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { hospitals } from '../schema/index.js';

export class DrizzleHospitalRepository implements IHospitalRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<HospitalInfo | null> {
    const rows = await this.db
      .select({
        id: hospitals.id,
        name: hospitals.name,
        status: hospitals.status,
      })
      .from(hospitals)
      .where(eq(hospitals.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
    };
  }

  async findMatchingHospitals(_input: FindMatchingHospitalsInput): Promise<MatchedHospital[]> {
    // TODO: implement hospital matching query with filters (procedure, destination, category)
    return [];
  }
}
