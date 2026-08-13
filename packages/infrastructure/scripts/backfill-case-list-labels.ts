import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import OpenAI from 'openai';
import postgres from 'postgres';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const ENV_CANDIDATES = [resolve(REPO_ROOT, 'apps/api/.env'), resolve(REPO_ROOT, '.env')];
const MODEL = process.env['CASE_LIST_LABEL_MODEL'] ?? 'gpt-5.5';
const BATCH_SIZE = 20;

interface CaseInput { id: string; phone: string | null; fallbackCountry: string | null; text: string; }
interface ListLabel { disease: string | null; country: string | null; }

function loadRuntimeEnv(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  for (const envPath of ENV_CANDIDATES) if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

async function generateLabels(client: OpenAI, inputs: CaseInput[]): Promise<Record<string, ListLabel>> {
  const response = await client.chat.completions.create({
    model: MODEL,
    reasoning_effort: 'none',
    max_completion_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Return JSON only as {"caseId":{"disease":"...","country":"..."}} for every provided caseId. disease is a concise 2-6 word English medical concern OR requested procedure (examples: "General check-up", "Knee osteoarthritis", "Rhinoplasty & facial augmentation"). Never return a sentence or "Unspecified concern"; return null if no meaningful label is possible. country: infer the country from an international phone number if unambiguous; otherwise use fallbackCountry; return null if uncertain. Use standard English country names.' },
      { role: 'user', content: JSON.stringify(inputs) },
    ],
  });
  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error(`Model returned no JSON (finish reason: ${response.choices[0]?.finish_reason ?? 'unknown'})`);
  const parsed = JSON.parse(content) as Record<string, unknown>;
  return Object.fromEntries(inputs.map(({ id }) => {
    const value = parsed[id] as Record<string, unknown> | undefined;
    const rawDisease = clean(value?.['disease'], 120);
    return [id, {
      disease: rawDisease && !/^unspecified(?: medical)? concern$/i.test(rawDisease) ? rawDisease : null,
      country: clean(value?.['country'], 100),
    }];
  }));
}

async function main(): Promise<void> {
  loadRuntimeEnv();
  const databaseUrl = process.env['DATABASE_URL']?.trim();
  const apiKey = process.env['OPENAI_API_KEY']?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const sql = postgres(databaseUrl);
  const client = new OpenAI({ apiKey });
  try {
    const rows = await sql<CaseInput[]>`
      SELECT c.id, u.phone,
        COALESCE(NULLIF(TRIM(u.country), ''), NULLIF(TRIM(c.structured_data->'entryProfile'->>'country'), ''), NULLIF(TRIM(c.patient_country), '')) AS "fallbackCountry",
        LEFT(CONCAT_WS(E'\n', NULLIF(TRIM(c.structured_data->'entryProfile'->>'disease'), ''), NULLIF(TRIM(c.condition_summary), ''), NULLIF(TRIM(c.primary_diagnosis), ''), NULLIF(TRIM(c.medical_history), ''), NULLIF(TRIM(c.ai_summary), ''), NULLIF(TRIM(c.symptoms::text), '')), 4000) AS text
      FROM cases c LEFT JOIN users u ON u.id = c.patient_id
      WHERE c.list_disease_label IS NULL OR c.list_country_label IS NULL
      ORDER BY c.created_at ASC
    `;
    console.log(`Found ${rows.length} case(s) missing a persisted list label; model: ${MODEL}`);
    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE);
      const labels = await generateLabels(client, batch);
      await sql.begin(async (tx) => {
        for (const input of batch) {
          const label = labels[input.id]!;
          await tx.unsafe(
            `UPDATE cases
             SET list_disease_label = COALESCE(list_disease_label, $1),
                 list_country_label = COALESCE(list_country_label, $2)
             WHERE id = $3`,
            [label.disease ?? '', label.country ?? '', input.id],
          );
        }
      });
      console.log(`Saved ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
    }
  } finally { await sql.end(); }
}

main().catch((error) => { console.error('Case list label backfill failed:', error); process.exit(1); });
