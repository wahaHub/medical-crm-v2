import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT =
  '/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/hospital-i18n-round2';

const LOCALES = ['en', 'zh', 'fr', 'de', 'es', 'bn'] as const;

const TARGET_FILES = [
  'apps/hospital/src/components/portal-shell.tsx',
  'apps/hospital/src/components/dashboard-widgets.tsx',
  'apps/hospital/src/components/cases-list.tsx',
  'apps/hospital/src/components/case-detail-panel.tsx',
  'apps/hospital/src/app/(portal)/consultations/page.tsx',
  'apps/hospital/src/components/consultations-list.tsx',
  'apps/hospital/src/components/create-consultation-modal.tsx',
  'apps/hospital/src/components/video-room.tsx',
] as const;

function getValue(source: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function collectTranslationKeys(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8');
  const keys = new Set<string>();

  for (const match of source.matchAll(/(?:\bt|tx|translateMessage)\(\s*['"]([^'"]+)['"]/g)) {
    const key = match[1];
    if (key) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}

describe('hospital i18n catalog coverage', () => {
  it('keeps hospital portal shell and page keys present in every locale', () => {
    const localeBundles = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        JSON.parse(
          readFileSync(join(ROOT, `packages/shared/i18n/src/locales/${locale}.json`), 'utf8'),
        ) as Record<string, unknown>,
      ]),
    ) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

    const missing: string[] = [];

    for (const relativePath of TARGET_FILES) {
      const absolutePath = join(ROOT, relativePath);
      const keys = collectTranslationKeys(absolutePath);

      for (const key of keys) {
        for (const locale of LOCALES) {
          if (getValue(localeBundles[locale], key) === undefined) {
            missing.push(`${locale}:${relativePath}:${key}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
