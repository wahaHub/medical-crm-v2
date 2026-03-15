import { eq, and } from 'drizzle-orm';
import type { IUserRepository, CreateUserInput } from '@medical-crm/domain';
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
}
