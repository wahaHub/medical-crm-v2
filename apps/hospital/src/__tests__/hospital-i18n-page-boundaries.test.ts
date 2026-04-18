import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT =
  '/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/hospital/src/app';

function collectTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const nextPath = join(dir, entry);
    const stats = statSync(nextPath);

    if (stats.isDirectory()) {
      files.push(...collectTsxFiles(nextPath));
      continue;
    }

    if (entry.endsWith('.tsx')) {
      files.push(nextPath);
    }
  }

  return files;
}

describe('hospital i18n page boundaries', () => {
  it('marks app pages as client components before using useHospitalI18n', () => {
    const tsxFiles = collectTsxFiles(APP_ROOT);
    const offenders = tsxFiles.filter((filePath) => {
      const source = readFileSync(filePath, 'utf8');

      if (!source.includes('useHospitalI18n(')) {
        return false;
      }

      const firstMeaningfulLine = source
        .split('\n')
        .find((line) => line.trim().length > 0);

      return firstMeaningfulLine !== "'use client';" && firstMeaningfulLine !== '"use client";';
    });

    expect(offenders).toEqual([]);
  });
});
