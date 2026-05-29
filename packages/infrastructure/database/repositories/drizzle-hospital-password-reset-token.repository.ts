import { eq } from 'drizzle-orm';
import type { IHospitalPasswordResetTokenRepository } from '@medical-crm/domain';
import { HospitalPasswordResetToken } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { hospitalPasswordResetTokens } from '../schema/index.js';

export class DrizzleHospitalPasswordResetTokenRepository implements IHospitalPasswordResetTokenRepository {
  constructor(private readonly db: CrmDb) {}

  async findByToken(token: string): Promise<HospitalPasswordResetToken | null> {
    const tokenHash = HospitalPasswordResetToken.hashToken(token);
    const rows = await this.db
      .select()
      .from(hospitalPasswordResetTokens)
      .where(eq(hospitalPasswordResetTokens.tokenHash, tokenHash))
      .limit(1);

    if (rows.length === 0) return null;
    return this.rowToEntity(rows[0]!);
  }

  async findByUserId(userId: string): Promise<HospitalPasswordResetToken[]> {
    const rows = await this.db
      .select()
      .from(hospitalPasswordResetTokens)
      .where(eq(hospitalPasswordResetTokens.userId, userId));

    return rows.map((row) => this.rowToEntity(row));
  }

  async save(token: HospitalPasswordResetToken): Promise<HospitalPasswordResetToken> {
    const now = new Date().toISOString();
    const values = {
      id: token.id,
      userId: token.userId,
      hospitalId: token.hospitalId,
      keycloakUserId: token.keycloakUserId,
      tokenHash: token.tokenHash,
      email: token.email,
      expiresAt: token.expiresAt.toISOString(),
      usedAt: token.usedAt ? token.usedAt.toISOString() : null,
      createdAt: token.createdAt.toISOString(),
      updatedAt: now,
    };

    const rows = await this.db
      .insert(hospitalPasswordResetTokens)
      .values(values)
      .onConflictDoUpdate({
        target: hospitalPasswordResetTokens.id,
        set: {
          usedAt: values.usedAt,
          updatedAt: now,
        },
      })
      .returning();

    return this.rowToEntity(rows[0]!);
  }

  private rowToEntity(row: typeof hospitalPasswordResetTokens.$inferSelect): HospitalPasswordResetToken {
    return new HospitalPasswordResetToken({
      id: row.id,
      userId: row.userId,
      hospitalId: row.hospitalId ?? null,
      keycloakUserId: row.keycloakUserId,
      tokenHash: row.tokenHash,
      email: row.email,
      expiresAt: new Date(row.expiresAt),
      usedAt: row.usedAt ? new Date(row.usedAt) : null,
      createdAt: new Date(row.createdAt),
    });
  }
}
