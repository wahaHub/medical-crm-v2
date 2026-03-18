import { eq, and } from 'drizzle-orm';
import type { IUserRepository, CreateUserInput, UserProfile, UpdateUserProfileInput } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';

export class DrizzleUserRepository implements IUserRepository {
  constructor(private readonly db: CrmDb) {}

  async create(input: CreateUserInput): Promise<{ id: string }> {
    const now = new Date().toISOString();
    const rows = await this.db
      .insert(users)
      .values({
        id: input.id,
        email: input.email,
        name: input.name,
        role: input.role,
        hospitalId: input.hospitalId,
        preferredLanguage: input.preferredLanguage,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id });

    return { id: rows[0]!.id };
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
        preferredLanguage: users.preferredLanguage,
        hospitalId: users.hospitalId,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      preferredLanguage: row.preferredLanguage,
      hospitalId: row.hospitalId ?? null,
    };
  }

  async update(id: string, input: UpdateUserProfileInput): Promise<void> {
    const updateFields: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.email !== undefined) updateFields.email = input.email;
    if (input.preferredLanguage !== undefined) updateFields.preferredLanguage = input.preferredLanguage;

    await this.db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, id));
  }
}
