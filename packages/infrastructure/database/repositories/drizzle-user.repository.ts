import { eq, and, asc, sql } from 'drizzle-orm';
import type { IUserRepository, CreateUserInput, UserProfile, UpdateUserProfileInput, NotificationPreferences } from '@medical-crm/domain';
import { ConflictError } from '@medical-crm/utils';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';

export class DrizzleUserRepository implements IUserRepository {
  constructor(private readonly db: CrmDb) {}

  private isUniqueEmailViolation(err: unknown): boolean {
    let current: unknown = err;
    while (current) {
      if (current instanceof Error) {
        const message = current.message.toLowerCase();
        if (
          message.includes('users_email_key')
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

  async create(input: CreateUserInput): Promise<{ id: string }> {
    const now = new Date().toISOString();
    try {
      const rows = await this.db
        .insert(users)
        .values({
          id: input.id,
          email: input.email,
          name: input.name,
          role: input.role,
          hospitalId: input.hospitalId,
          preferredLanguage: input.preferredLanguage,
          keycloakUserId: input.keycloakUserId ?? null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: users.id });

      return { id: rows[0]!.id };
    } catch (err: unknown) {
      if (this.isUniqueEmailViolation(err)) {
        throw new ConflictError('Email already exists');
      }
      throw err;
    }
  }

  async findPreferredLanguage(hospitalId: string): Promise<string | null> {
    const rows = await this.db
      .select({ preferredLanguage: users.preferredLanguage })
      .from(users)
      .where(
        and(
          eq(users.hospitalId, hospitalId),
          eq(users.role, 'HOSPITAL'),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0]!.preferredLanguage;
  }

  async findById(id: string): Promise<UserProfile | null> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        phone: users.phone,
        patientSite: users.patientSite,
        preferredLanguage: users.preferredLanguage,
        hospitalId: users.hospitalId,
        keycloakUserId: users.keycloakUserId,
        notificationSettings: users.notificationSettings,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      id: row.id,
      // users.email is nullable since Case Lifecycle Phase 1; admin/hospital profiles always have one
      email: row.email ?? '',
      name: row.name,
      role: row.role,
      phone: row.phone ?? null,
      patientSite: row.patientSite ?? null,
      preferredLanguage: row.preferredLanguage,
      hospitalId: row.hospitalId ?? null,
      keycloakUserId: row.keycloakUserId ?? null,
      notificationSettings: (row.notificationSettings as NotificationPreferences | null) ?? null,
    };
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        phone: users.phone,
        patientSite: users.patientSite,
        preferredLanguage: users.preferredLanguage,
        hospitalId: users.hospitalId,
        keycloakUserId: users.keycloakUserId,
        notificationSettings: users.notificationSettings,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      id: row.id,
      // findByEmail matched on a non-null email, so it is always present here
      email: row.email ?? '',
      name: row.name,
      role: row.role,
      phone: row.phone ?? null,
      patientSite: row.patientSite ?? null,
      preferredLanguage: row.preferredLanguage,
      hospitalId: row.hospitalId ?? null,
      keycloakUserId: row.keycloakUserId ?? null,
      notificationSettings: (row.notificationSettings as NotificationPreferences | null) ?? null,
    };
  }

  async update(id: string, input: UpdateUserProfileInput): Promise<void> {
    const updateFields: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.email !== undefined) updateFields.email = input.email;
    if (input.preferredLanguage !== undefined) updateFields.preferredLanguage = input.preferredLanguage;
    if (input.notificationSettings !== undefined) updateFields.notificationSettings = input.notificationSettings;

    await this.db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, id));
  }

  async listAdminEmails(): Promise<string[]> {
    const rows = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, 'ADMIN'))
      .orderBy(asc(users.email));

    return rows
      .map((row) => row.email)
      .filter((email): email is string => email !== null);
  }

  async listHospitalEmails(hospitalId: string): Promise<string[]> {
    const rows = await this.db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.role, 'HOSPITAL'), eq(users.hospitalId, hospitalId)))
      .orderBy(asc(users.email));

    return rows
      .map((row) => row.email)
      .filter((email): email is string => email !== null);
  }
}
