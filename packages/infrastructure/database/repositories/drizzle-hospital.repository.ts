import { and, eq, ilike, sql } from 'drizzle-orm';
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
        type: hospitals.type,
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
      type: row.type,
    };
  }

  async findMatchingHospitals(_input: FindMatchingHospitalsInput): Promise<MatchedHospital[]> {
    const destination = _input.destination?.trim();
    const where = destination
      ? and(
        eq(hospitals.status, 'ACTIVE'),
        ilike(hospitals.city, `%${destination}%`),
      )
      : eq(hospitals.status, 'ACTIVE');

    const rows = await this.db
      .select({
        id: hospitals.id,
        name: hospitals.name,
        nameEn: hospitals.nameEn,
        logoUrl: hospitals.logoUrl,
      })
      .from(hospitals)
      .where(where)
      .orderBy(sql`${hospitals.name} ASC`)
      .limit(10);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameEn: row.nameEn ?? null,
      rating: null,
      logoUrl: row.logoUrl ?? null,
      tags: [],
      procedureCount: 0,
    }));
  }
}
