import { eq } from 'drizzle-orm';
import type { IRegistrationTokenRepository } from '@medical-crm/domain';
import { RegistrationToken } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { hospitalRegistrationTokens } from '../schema/index.js';

export class DrizzleRegistrationTokenRepository implements IRegistrationTokenRepository {
  constructor(private readonly db: CrmDb) {}

  async findByToken(token: string): Promise<RegistrationToken | null> {
    const rows = await this.db
      .select()
      .from(hospitalRegistrationTokens)
      .where(eq(hospitalRegistrationTokens.token, token))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByHospitalId(hospitalId: string): Promise<RegistrationToken[]> {
    const rows = await this.db
      .select()
      .from(hospitalRegistrationTokens)
      .where(eq(hospitalRegistrationTokens.hospitalId, hospitalId));

    return rows.map((r) => this.rowToEntity(r));
  }

  async save(token: RegistrationToken): Promise<RegistrationToken> {
    const now = new Date().toISOString();
    const values = {
      id: token.id,
      hospitalId: token.hospitalId,
      token: token.token,
      email: token.email,
      expiresAt: token.expiresAt.toISOString(),
      usedAt: token.usedAt ? token.usedAt.toISOString() : null,
      keycloakUserId: token.keycloakUserId,
      createdAt: token.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(hospitalRegistrationTokens)
      .values(values)
      .onConflictDoUpdate({
        target: hospitalRegistrationTokens.id,
        set: {
          usedAt: values.usedAt,
          keycloakUserId: values.keycloakUserId,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  private rowToEntity(row: typeof hospitalRegistrationTokens.$inferSelect): RegistrationToken {
    return new RegistrationToken({
      id: row.id,
      hospitalId: row.hospitalId,
      token: row.token,
      email: row.email,
      expiresAt: new Date(row.expiresAt),
      usedAt: row.usedAt ? new Date(row.usedAt) : null,
      keycloakUserId: row.keycloakUserId ?? null,
      createdAt: new Date(row.createdAt),
    });
  }
}
