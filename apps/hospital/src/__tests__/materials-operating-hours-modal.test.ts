import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SOURCE_PATH =
  '/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/hospital/src/components/materials-tabs.tsx';

describe('OperatingHoursModal state sync', () => {
  it('derives structured hours from stable day keys instead of translated day label arrays', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('const OPERATING_HOURS_DAY_KEYS = [');
    expect(source).toContain('function parseHoursString(hours: string | undefined)');
    expect(source).toContain('setStructuredHours(parseHoursString(hours));');
    expect(source).toContain('}, [hours]);');
    expect(source).not.toContain('parseHoursString(hours, dayNames)');
    expect(source).not.toContain('}, [dayNames, hours]);');
  });
});
