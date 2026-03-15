import { eq } from 'drizzle-orm';
import type { IPatientRepository, PatientBasicInfo } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';

export class DrizzlePatientRepository implements IPatientRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<PatientBasicInfo | null> {
    const rows = await this.db
      .select({
        id: users.id,
        patientCode: users.patientCode,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      id: row.id,
      patientCode: row.patientCode ?? null,
    };
  }
}
