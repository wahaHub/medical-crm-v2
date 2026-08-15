import { eq, and, ne, sql, inArray } from 'drizzle-orm';
import type { IPatientRepository, PatientAuthInfo, PatientBasicInfo, PatientSite } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';
import { withTransientDatabaseRetry } from '../transient-db-retry.js';

export class DrizzlePatientRepository implements IPatientRepository {
  constructor(private readonly db: CrmDb) {}

  private isUniqueEmailViolation(err: unknown): boolean {
    let current: unknown = err;
    while (current) {
      if (current instanceof Error) {
        const message = current.message.toLowerCase();
        if (
          message.includes('users_email_key')
          || message.includes('users_patient_email_site_key')
          || message.includes('users_non_patient_email_key')
          || message.includes('email_role_conflict')
          || message.includes('duplicate key value')
        ) {
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

  async findById(id: string, site?: PatientSite): Promise<PatientBasicInfo | null> {
    try {
      const rows = await withTransientDatabaseRetry(
        'load patient by id',
        () => this.db
          .select({
            id: users.id,
            email: users.email,
            patientCode: users.patientCode,
            preferredLanguage: users.preferredLanguage,
            site: users.patientSite,
            phone: users.phone,
            country: users.country,
          })
          .from(users)
          .where(
            site
              ? and(eq(users.id, id), eq(users.role, 'PATIENT'), eq(users.patientSite, site))
              : and(eq(users.id, id), eq(users.role, 'PATIENT')),
          )
          .limit(1),
      );

      if (rows.length === 0) return null;
      const row = rows[0]!;
      return {
        id: row.id,
        email: row.email,
        patientCode: row.patientCode ?? null,
        preferredLanguage: row.preferredLanguage,
        site: row.site ?? null,
        phone: row.phone ?? null,
        country: row.country ?? null,
      };
    } catch (err: unknown) {
      if (!this.isMissingColumnError(err, 'patient_site')) {
        throw err;
      }
      if (site && site !== 'china') return null;
      const rows = await withTransientDatabaseRetry(
        'load patient by id (legacy schema fallback)',
        () => this.db
          .select({
            id: users.id,
            email: users.email,
            patientCode: users.patientCode,
            preferredLanguage: users.preferredLanguage,
          })
          .from(users)
          .where(and(eq(users.id, id), eq(users.role, 'PATIENT')))
          .limit(1),
      );

      if (rows.length === 0) return null;
      const row = rows[0]!;
      return {
        id: row.id,
        email: row.email,
        patientCode: row.patientCode ?? null,
        preferredLanguage: row.preferredLanguage,
        site: 'china',
      };
    }
  }

  async findByIds(ids: string[]): Promise<PatientBasicInfo[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        patientCode: users.patientCode,
        preferredLanguage: users.preferredLanguage,
        site: users.patientSite,
        phone: users.phone,
        country: users.country,
      })
      .from(users)
      .where(and(eq(users.role, 'PATIENT'), inArray(users.id, ids)));
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      patientCode: row.patientCode ?? null,
      preferredLanguage: row.preferredLanguage,
      site: row.site ?? null,
      phone: row.phone ?? null,
      country: row.country ?? null,
    }));
  }

  async findByEmail(email: string, site: PatientSite): Promise<PatientBasicInfo | null> {
    try {
      const [row] = await this.db
        .select({
          id: users.id,
          patientCode: users.patientCode,
          preferredLanguage: users.preferredLanguage,
          site: users.patientSite,
        })
        .from(users)
        .where(and(eq(users.email, email), eq(users.role, 'PATIENT'), eq(users.patientSite, site)))
        .limit(1);
      return row ?? null;
    } catch (err: unknown) {
      if (!this.isMissingColumnError(err, 'patient_site')) {
        throw err;
      }
      if (site !== 'china') return null;
      const [row] = await this.db
        .select({ id: users.id, patientCode: users.patientCode, preferredLanguage: users.preferredLanguage })
        .from(users)
        .where(and(eq(users.email, email), eq(users.role, 'PATIENT')))
        .limit(1);
      return row ? { ...row, site: 'china' } : null;
    }
  }

  async findAuthByEmail(email: string, site: PatientSite): Promise<PatientAuthInfo | null> {
    try {
      const [row] = await this.db
        .select({
          id: users.id,
          patientCode: users.patientCode,
          preferredLanguage: users.preferredLanguage,
          site: users.patientSite,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(and(eq(users.email, email), eq(users.role, 'PATIENT'), eq(users.patientSite, site)))
        .limit(1);

      return row ?? null;
    } catch (err: unknown) {
      const missingPasswordHash = this.isMissingColumnError(err, 'password_hash');
      const missingPatientSite = this.isMissingColumnError(err, 'patient_site');
      if (!missingPasswordHash && !missingPatientSite) {
        throw err;
      }

      const patient = await this.findByEmail(email, site);
      if (!patient) return null;

      return {
        ...patient,
        passwordHash: null,
      };
    }
  }

  async createTempPatient(input: {
    email: string;
    name: string;
    phone?: string;
    whatsapp?: string;
    preferredLanguage: string;
    site: PatientSite;
  }): Promise<PatientBasicInfo> {
    const baseValues = {
      email: input.email,
      name: input.name,
      role: 'PATIENT' as const,
      patientSite: input.site,
      preferredLanguage: input.preferredLanguage,
      status: 'active' as const,
      updatedAt: new Date().toISOString(),
    };

    const withPhone = input.phone?.trim()
      ? { ...baseValues, phone: input.phone.trim() }
      : baseValues;

    const withContact = input.whatsapp?.trim()
      ? { ...withPhone, whatsapp: input.whatsapp.trim() }
      : withPhone;

    try {
      const [row] = await this.db.insert(users).values(withContact).returning({
        id: users.id,
        patientCode: users.patientCode,
        preferredLanguage: users.preferredLanguage,
      });
      return row!;
    } catch (err: unknown) {
      // If email already exists, only reuse it when it already belongs to a patient.
      if (this.isUniqueEmailViolation(err)) {
        if (err instanceof Error && err.message.includes('EMAIL_ROLE_CONFLICT')) {
          throw new Error('EMAIL_ROLE_CONFLICT');
        }
        const [existingNonPatient] = await this.db
          .select({
            id: users.id,
            patientCode: users.patientCode,
            preferredLanguage: users.preferredLanguage,
            role: users.role,
          })
          .from(users)
          .where(and(eq(users.email, input.email), ne(users.role, 'PATIENT')))
          .limit(1);
        if (existingNonPatient) {
          throw new Error('EMAIL_ROLE_CONFLICT');
        }

        const [existingPatient] = await this.db
          .select({
            id: users.id,
          })
          .from(users)
          .where(and(eq(users.email, input.email), eq(users.role, 'PATIENT'), eq(users.patientSite, input.site)))
          .limit(1);
        if (existingPatient) {
          throw new Error('PATIENT_ALREADY_EXISTS');
        }
      }

      // Backward compatibility: some local DBs still miss "phone"/"password_hash"/"patient_site".
      const hasLegacySchema =
        this.isMissingColumnError(err, 'phone')
        || this.isMissingColumnError(err, 'password_hash')
        || this.isMissingColumnError(err, 'patient_site');
      if (!hasLegacySchema) throw err;

      if (input.site !== 'china') {
        throw new Error('Database schema is outdated: missing users.patient_site column. Please run latest migrations.');
      }

      await this.db.execute(sql`
        insert into "users" (
          "email", "name", "role", "status", "updated_at", "preferred_language"
        ) values (
          ${input.email}, ${input.name}, 'PATIENT', 'active', ${new Date().toISOString()}, ${input.preferredLanguage}
        )
      `);

      const created = await this.findByEmail(input.email, input.site);
      if (!created) {
        throw new Error('Failed to create patient on legacy database schema');
      }
      return created;
    }
  }

  async createOfflinePatient(input: {
    name: string;
    phone?: string;
    whatsapp?: string;
    preferredLanguage: string;
    site: PatientSite;
  }): Promise<PatientBasicInfo> {
    const [row] = await this.db.insert(users).values({
      email: null,
      name: input.name,
      role: 'PATIENT' as const,
      patientSite: input.site,
      preferredLanguage: input.preferredLanguage,
      status: 'active' as const,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      updatedAt: new Date().toISOString(),
    }).returning({
      id: users.id,
      patientCode: users.patientCode,
      preferredLanguage: users.preferredLanguage,
    });
    return row!;
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
