import { eq, and } from 'drizzle-orm';
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
        preferredLanguage: users.preferredLanguage,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      id: row.id,
      patientCode: row.patientCode ?? null,
      preferredLanguage: row.preferredLanguage,
    };
  }

  async findByEmail(email: string): Promise<PatientBasicInfo | null> {
    const [row] = await this.db
      .select({ id: users.id, patientCode: users.patientCode, preferredLanguage: users.preferredLanguage })
      .from(users)
      .where(and(eq(users.email, email), eq(users.role, 'PATIENT')))
      .limit(1);
    return row ?? null;
  }

  async createTempPatient(input: {
    email: string;
    name: string;
    phone: string;
    preferredLanguage: string;
  }): Promise<PatientBasicInfo> {
    const [row] = await this.db.insert(users).values({
      email: input.email,
      name: input.name,
      phone: input.phone,
      role: 'PATIENT',
      preferredLanguage: input.preferredLanguage,
      status: 'active',
      updatedAt: new Date().toISOString(),
    }).returning({ id: users.id, patientCode: users.patientCode, preferredLanguage: users.preferredLanguage });
    return row!;
  }

  async updatePasswordHash(userId: string, hash: string): Promise<void> {
    await this.db.update(users).set({ passwordHash: hash, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
  }
}
