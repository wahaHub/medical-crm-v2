import { describe, expect, it, vi } from 'vitest';
import { IdempotencyGuard } from '../../database/idempotency.js';

describe('IdempotencyGuard', () => {
  it('returns cached jsonb objects without re-parsing them as strings', async () => {
    const cachedResult = {
      statusUpdated: { engagementMode: 'LIGHT_DISCOVERY' },
      timelineEventsWritten: [],
    };
    const execute = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ result: cachedResult }]);
    const guard = new IdempotencyGuard({ execute } as any);

    await expect(
      guard.execute(
        'session-1:assistant-1:v1',
        'ai_policy_writeback',
        async () => ({ unreachable: true }),
      ),
    ).resolves.toEqual(cachedResult);
  });
});
