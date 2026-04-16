import { and, eq, ne } from 'drizzle-orm';
import type { IUserEmailLookupRepository, PatientSite, UserEmailState } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { users } from '../schema/index.js';

export class DrizzleUserEmailLookupRepository implements IUserEmailLookupRepository {
  constructor(private readonly db: CrmDb) {}

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

  async findEmailState(email: string, site: PatientSite): Promise<UserEmailState> {
    try {
      const [patientRow] = await this.db
        .select({
          id: users.id,
          role: users.role,
          site: users.patientSite,
        })
        .from(users)
        .where(and(eq(users.email, email), eq(users.role, 'PATIENT'), eq(users.patientSite, site)))
        .limit(1);

      if (patientRow) {
        return {
          state: 'PATIENT',
          userId: patientRow.id,
          site,
        };
      }

      const [row] = await this.db
        .select({
          id: users.id,
          role: users.role,
        })
        .from(users)
        .where(and(eq(users.email, email), ne(users.role, 'PATIENT')))
        .limit(1);

      if (!row) {
        return { state: 'NONE' };
      }

      return {
        state: row.role,
        userId: row.id,
      };
    } catch (err: unknown) {
      if (!this.isMissingColumnError(err, 'patient_site')) {
        throw err;
      }
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

      if (row.role === 'PATIENT') {
        return site === 'china'
          ? { state: 'PATIENT', userId: row.id, site: 'china' }
          : { state: 'NONE' };
      }

      return {
        state: row.role,
        userId: row.id,
      };
    }
  }
}
