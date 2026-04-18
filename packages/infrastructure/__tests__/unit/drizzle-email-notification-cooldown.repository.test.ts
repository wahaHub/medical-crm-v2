import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleEmailNotificationCooldownRepository } from '../../database/repositories/drizzle-email-notification-cooldown.repository.js';

describe('DrizzleEmailNotificationCooldownRepository', () => {
  const insertReturning = vi.fn();
  const onConflictDoNothing = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing,
  }));
  const insert = vi.fn(() => ({
    values: insertValues,
  }));

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({
    returning: updateReturning,
  }));
  const updateSet = vi.fn(() => ({
    where: updateWhere,
  }));
  const update = vi.fn(() => ({
    set: updateSet,
  }));

  const repository = new DrizzleEmailNotificationCooldownRepository({
    insert,
    update,
  } as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acquires a fresh slot when the insert wins', async () => {
    insertReturning.mockResolvedValueOnce([{ id: 'slot-1' }]);

    await expect(repository.tryAcquireSlot({
      recipientId: 'admin-1',
      notificationKind: 'admin.new_case',
      dedupeKey: 'case-1',
      cooldownMs: 5 * 60 * 1000,
      now: new Date('2026-04-18T10:00:00.000Z'),
    })).resolves.toBe(true);

    expect(update).not.toHaveBeenCalled();
  });

  it('acquires an expired slot by updating after an insert conflict', async () => {
    insertReturning.mockResolvedValueOnce([]);
    updateReturning.mockResolvedValueOnce([{ id: 'slot-1' }]);

    await expect(repository.tryAcquireSlot({
      recipientId: 'admin-1',
      notificationKind: 'admin.new_case',
      dedupeKey: 'case-1',
      cooldownMs: 5 * 60 * 1000,
      now: new Date('2026-04-18T10:06:00.000Z'),
    })).resolves.toBe(true);

    expect(update).toHaveBeenCalledOnce();
  });

  it('returns false when a conflicting slot is still inside the cooldown window', async () => {
    insertReturning.mockResolvedValueOnce([]);
    updateReturning.mockResolvedValueOnce([]);

    await expect(repository.tryAcquireSlot({
      recipientId: 'admin-1',
      notificationKind: 'admin.new_case',
      dedupeKey: 'case-1',
      cooldownMs: 5 * 60 * 1000,
      now: new Date('2026-04-18T10:01:00.000Z'),
    })).resolves.toBe(false);
  });
});
