import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  '/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/codex-hospital-translation-chunking/packages/infrastructure/database/migrations/0025_translation_task_chunking.sql',
);
const bootstrapPath = resolve(
  '/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/.worktrees/codex-hospital-translation-chunking/packages/infrastructure/database/full-bootstrap.sql',
);

describe('translation task migration safety', () => {
  it('splits legacy backlog rows instead of leaving legacy-bat pending rows behind', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('unnest(target_languages)');
    expect(migration).toContain("status IN ('pending', 'processing')");
    expect(migration).toContain('INSERT INTO translation_tasks');
    expect(migration).toContain('DELETE FROM translation_tasks');
  });

  it('keeps target_language not null in the synced bootstrap SQL', () => {
    const bootstrap = readFileSync(bootstrapPath, 'utf8');
    expect(bootstrap).toContain('ALTER TABLE translation_tasks ALTER COLUMN target_language SET NOT NULL;');
  });
});
