import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bootstrapPath = fileURLToPath(new URL('../../database/full-bootstrap.sql', import.meta.url));

describe('ai chat minimal triage bootstrap sync', () => {
  it('includes migration 036 triage summary columns in the checked-in bootstrap SQL', () => {
    const bootstrap = readFileSync(bootstrapPath, 'utf8');
    const start = bootstrap.indexOf('-- Migration: 036_ai_chat_minimal_triage_summary.sql');
    const end = bootstrap.indexOf('-- Track the current schema head', start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const triageBlock = bootstrap.slice(start, end);

    expect(triageBlock).toContain('ADD COLUMN IF NOT EXISTS minimal_triage_status VARCHAR(20) NOT NULL DEFAULT \'pending\';');
    expect(triageBlock).toContain('ADD COLUMN IF NOT EXISTS minimal_triage_answers_summary TEXT;');
    expect(bootstrap).toContain("('036_ai_chat_minimal_triage_summary.sql')");
  });
});
