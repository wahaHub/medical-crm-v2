import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL('../../database/migrations/0025_translation_task_chunking.sql', import.meta.url));
const bootstrapPath = fileURLToPath(new URL('../../database/full-bootstrap.sql', import.meta.url));

describe('translation task migration safety', () => {
  function getBootstrapLegacyMergeBlock(bootstrap: string) {
    const start = bootstrap.indexOf('-- Migration: 0024_unified_translation.sql');
    const end = bootstrap.indexOf('-- Migration: 002_create_message_tasks.sql');

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const translationBlock = bootstrap.slice(start, end);
    const mergeStart = translationBlock.indexOf('-- Merge duplicate pending/processing rows using the chunk-aware, single-language identity.');
    const mergeEnd = translationBlock.indexOf('-- Add translations jsonb to CRM tables');

    expect(mergeStart).toBeGreaterThan(-1);
    expect(mergeEnd).toBeGreaterThan(mergeStart);

    return translationBlock.slice(mergeStart, mergeEnd);
  }

  it('splits legacy backlog rows into single-language rows before dedupe', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/WITH legacy_backlog AS \([\s\S]*unnest\(target_languages\)[\s\S]*INSERT INTO translation_tasks[\s\S]*DELETE FROM translation_tasks tt[\s\S]*WHERE tt\.id = lb\.id;/);
    expect(migration).toContain("status IN ('pending', 'processing')");
  });

  it('prefers the freshest canonical row when collapsing duplicate identities', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('CASE status');
    expect(migration).toContain("WHEN 'processing' THEN 0");
    expect(migration).toContain("WHEN 'pending' THEN 1");
    expect(migration).toContain("WHEN 'completed' THEN 2");
    expect(migration).toContain('created_at DESC');
    expect(migration).toContain('id DESC');
  });

  it('keeps target_language not null in the synced bootstrap SQL', () => {
    const bootstrap = readFileSync(bootstrapPath, 'utf8');
    const mergeBlock = getBootstrapLegacyMergeBlock(bootstrap);

    expect(bootstrap).toContain('ALTER TABLE translation_tasks ALTER COLUMN target_language SET NOT NULL;');
    expect(mergeBlock).toContain('target_language = grouped.target_language');
    expect(mergeBlock).toContain('target_languages = ARRAY[grouped.target_language]::text[]');
    expect(mergeBlock).not.toContain('target_language = CASE');
  });
});
