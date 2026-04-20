import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const LOCALES = ['en', 'zh', 'fr', 'de', 'es', 'bn'] as const;

const REQUIRED_DYNAMIC_KEYS = [
  'hospital.cases.detail.quote.status.pending',
  'hospital.cases.detail.quote.status.accepted',
  'hospital.cases.detail.quote.status.rejected',
  'hospital.cases.detail.quote.status.expired',
  'hospital.cases.detail.diagnosis.severity.mild',
  'hospital.cases.detail.diagnosis.severity.moderate',
  'hospital.cases.detail.diagnosis.severity.severe',
] as const;

const OWNED_ERROR_FILES = [
  'apps/hospital/src/app/error.tsx',
  'apps/hospital/src/app/(portal)/consultations/error.tsx',
  'apps/hospital/src/app/(portal)/messages/error.tsx',
  'apps/hospital/src/app/(portal)/cases/[id]/error.tsx',
] as const;

const OWNED_SANITIZED_COMPONENTS = [
  'apps/hospital/src/components/settings-view.tsx',
  'apps/hospital/src/components/faq-list.tsx',
  'apps/hospital/src/components/email-templates-list.tsx',
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

function collectHospitalSourceFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const absolutePath = join(dirPath, entry.name);
    const relativePath = absolutePath.slice(ROOT.length + 1);

    if (entry.isDirectory()) {
      if (relativePath.includes('/__tests__') || relativePath.startsWith('apps/hospital/src/app/api')) {
        return [];
      }

      return collectHospitalSourceFiles(absolutePath);
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [relativePath];
  });
}

describe('hospital i18n catalog coverage', () => {
  it('keeps owned hospital error surfaces off raw message slicing and permissive fallback appends', () => {
    for (const relativePath of OWNED_ERROR_FILES) {
      const source = readFileSync(join(ROOT, relativePath), 'utf8');

      expect(source, `${relativePath} should not slice raw error.message`).not.toContain('error.message.slice(');
    }

    for (const relativePath of OWNED_SANITIZED_COMPONENTS) {
      const source = readFileSync(join(ROOT, relativePath), 'utf8');

      expect(source, `${relativePath} should use a localized with-detail pattern`).toContain('hospital.common.errors.withDetail');
      expect(
        source,
        `${relativePath} should not append arbitrary short backend details to the fallback`,
      ).not.toContain("fallback.endsWith('.') ? ' ' : ': '");
    }
  });

  it('keeps hospital portal shell and page keys present in every locale', () => {
    const targetFiles = collectHospitalSourceFiles(join(ROOT, 'apps/hospital/src'));
    const localeBundles = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        JSON.parse(
          readFileSync(join(ROOT, `packages/shared/i18n/src/locales/${locale}.json`), 'utf8'),
        ) as Record<string, unknown>,
      ]),
    ) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

    const missing: string[] = [];

    for (const relativePath of targetFiles) {
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

  it('keeps required dynamic hospital keys present in every locale', () => {
    const localeBundles = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        JSON.parse(
          readFileSync(join(ROOT, `packages/shared/i18n/src/locales/${locale}.json`), 'utf8'),
        ) as Record<string, unknown>,
      ]),
    ) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

    const missing: string[] = [];

    for (const key of REQUIRED_DYNAMIC_KEYS) {
      for (const locale of LOCALES) {
        if (getValue(localeBundles[locale], key) === undefined) {
          missing.push(`${locale}:${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
