import { eq, and, sql } from 'drizzle-orm';
import type { IPatientRepository, PatientBasicInfo } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';

export class DrizzlePatientRepository implements IPatientRepository {
  constructor(private readonly db: CrmDb) {}

  private isUniqueEmailViolation(err: unknown): boolean {
    let current: unknown = err;
    while (current) {
      if (current instanceof Error) {
        const message = current.message.toLowerCase();
        if (message.includes('users_email_key') || message.includes('duplicate key value')) {
          return true;
        }
      }
      current =
        typeof current === 'object'
          && current !== null
          && 'cause' in current
          ? (current as { cause?: unknown }).cause
          : undefined;
    }
    return false;
  }

  private isMissingColumnError(err: unknown, columnName: string): boolean {
    let current: unknown = err;
    while (current) {
      if (current instanceof Error) {
        const message = current.message.toLowerCase();
        if (message.includes(`column "${columnName.toLowerCase()}"`) && message.includes('does not exist')) {
          return true;
        }
      }
      current =
        typeof current === 'object'
          && current !== null
          && 'cause' in current
          ? (current as { cause?: unknown }).cause
          : undefined;
    }
    return false;
  }

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
    phone?: string;
    preferredLanguage: string;
  }): Promise<PatientBasicInfo> {
    const baseValues = {
      email: input.email,
      name: input.name,
      role: 'PATIENT' as const,
      preferredLanguage: input.preferredLanguage,
      status: 'active' as const,
      updatedAt: new Date().toISOString(),
    };

    const withPhone = input.phone?.trim()
      ? { ...baseValues, phone: input.phone.trim() }
      : baseValues;

    try {
      const [row] = await this.db.insert(users).values(withPhone).returning({
        id: users.id,
        patientCode: users.patientCode,
        preferredLanguage: users.preferredLanguage,
      });
      return row!;
    } catch (err: unknown) {
      // If email already exists (possibly under a non-PATIENT role), reuse it.
      if (this.isUniqueEmailViolation(err)) {
        const [existingUser] = await this.db
          .select({
            id: users.id,
            patientCode: users.patientCode,
            preferredLanguage: users.preferredLanguage,
          })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);
        if (existingUser) {
          return existingUser;
        }
      }

      // Backward compatibility: some local DBs still miss "phone"/"password_hash".
      const hasLegacySchema =
        this.isMissingColumnError(err, 'phone')
        || this.isMissingColumnError(err, 'password_hash');
      if (!hasLegacySchema) throw err;

      await this.db.execute(sql`
        insert into "users" (
          "email", "name", "role", "status", "updated_at", "preferred_language"
        ) values (
          ${input.email}, ${input.name}, 'PATIENT', 'active', ${new Date().toISOString()}, ${input.preferredLanguage}
        )
      `);

      const created = await this.findByEmail(input.email);
      if (!created) {
        throw new Error('Failed to create patient on legacy database schema');
      }
      return created;
    }
  }

  async updatePasswordHash(userId: string, hash: string): Promise<void> {
    try {
      await this.db
        .update(users)
        .set({ passwordHash: hash, updatedAt: new Date().toISOString() })
        .where(eq(users.id, userId));
    } catch (err: unknown) {
      if (this.isMissingColumnError(err, 'password_hash')) {
        throw new Error('Database schema is outdated: missing users.password_hash column. Please run latest migrations.');
      }
      throw err;
    }
  }
}
