import { and, eq, lte } from 'drizzle-orm';
import type { IEmailNotificationCooldownRepository } from '@medical-crm/domain';
import type { CrmDb } from '../crm-client.js';
import { emailNotificationCooldowns } from '../schema/index.js';

export class DrizzleEmailNotificationCooldownRepository implements IEmailNotificationCooldownRepository {
  constructor(private readonly db: CrmDb) {}

  async tryAcquireSlot(input: {
    recipientId: string;
    notificationKind: string;
    dedupeKey: string;
    cooldownMs: number;
    now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const nowIso = now.toISOString();
    const cooldownCutoffIso = new Date(now.getTime() - input.cooldownMs).toISOString();

    const existingRows = await this.db
      .select({
        id: emailNotificationCooldowns.id,
        lastSentAt: emailNotificationCooldowns.lastSentAt,
      })
      .from(emailNotificationCooldowns)
      .where(and(
        eq(emailNotificationCooldowns.recipientId, input.recipientId),
        eq(emailNotificationCooldowns.notificationKind, input.notificationKind),
        eq(emailNotificationCooldowns.dedupeKey, input.dedupeKey),
      ))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      await this.db.insert(emailNotificationCooldowns).values({
        recipientId: input.recipientId,
        notificationKind: input.notificationKind,
        dedupeKey: input.dedupeKey,
        lastSentAt: nowIso,
        updatedAt: nowIso,
      });
      return true;
    }

    const updated = await this.db
      .update(emailNotificationCooldowns)
      .set({
        lastSentAt: nowIso,
        updatedAt: nowIso,
      })
      .where(and(
        eq(emailNotificationCooldowns.id, existing.id),
        lte(emailNotificationCooldowns.lastSentAt, cooldownCutoffIso),
      ))
      .returning({ id: emailNotificationCooldowns.id });

    return updated.length > 0;
  }

  async releaseSlot(input: {
    recipientId: string;
    notificationKind: string;
    dedupeKey: string;
  }): Promise<void> {
    await this.db
      .delete(emailNotificationCooldowns)
      .where(and(
        eq(emailNotificationCooldowns.recipientId, input.recipientId),
        eq(emailNotificationCooldowns.notificationKind, input.notificationKind),
        eq(emailNotificationCooldowns.dedupeKey, input.dedupeKey),
      ));
  }
}
