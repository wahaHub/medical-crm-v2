import { eq } from 'drizzle-orm';
import type { IUserEmailLookupRepository, UserEmailState } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';

export class DrizzleUserEmailLookupRepository implements IUserEmailLookupRepository {
  constructor(private readonly db: CrmDb) {}

  async findEmailState(email: string): Promise<UserEmailState> {
    const [row] = await this.db
      .select({
        id: users.id,
        role: users.role,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!row) {
      return { state: 'NONE' };
    }

    return {
      state: row.role,
      userId: row.id,
    };
  }
}
