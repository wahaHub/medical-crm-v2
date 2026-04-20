import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const HOOK_PATH =
  '/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/ui/src/hooks/use-optimistic-navigation-state.ts';

describe('useOptimisticNavigationState client boundary', () => {
  it('marks the hook module as a client component boundary', () => {
    const source = readFileSync(HOOK_PATH, 'utf8');
    const firstMeaningfulLine = source
      .split('\n')
      .find((line) => line.trim().length > 0);

    expect(firstMeaningfulLine).toBe("'use client';");
  });
});
