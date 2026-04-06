import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FaqSeedCorpus } from '../packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_SEED_PATH = resolve(REPO_ROOT, 'docs/seed-data/faq-category-aware-retrieval.seed.json');
const DEFAULT_REPORT_PATH = resolve(REPO_ROOT, 'docs/seed-data/faq-category-aware-retrieval.eval-report.json');
const ENV_CANDIDATES = [
  resolve(REPO_ROOT, 'apps/api/.env'),
  resolve(REPO_ROOT, '.env'),
];

function ensureRuntimeEnv() {
  if (typeof process.loadEnvFile === 'function') {
    for (const envPath of ENV_CANDIDATES) {
      if (!existsSync(envPath)) continue;
      process.loadEnvFile(envPath);
    }
  }
}

async function main() {
  ensureRuntimeEnv();
  const seedPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_SEED_PATH;
  const apiBaseUrl = process.env['FAQ_EVAL_BASE_URL']?.trim() || 'http://localhost:3001';
  const internalSecret = process.env['INTERNAL_API_SECRET']?.trim();
  if (!internalSecret) {
    throw new Error('INTERNAL_API_SECRET is required to run FAQ retrieval evaluation.');
  }

  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as FaqSeedCorpus;
  const results = [];

  for (const query of seed.evaluationQueries) {
    const response = await fetch(`${apiBaseUrl}/api/v2/internal/faq-retrieval/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': internalSecret,
      },
      body: JSON.stringify({
        version: 'v1',
        request_id: `faq-eval:${query.id}`,
        session_id: `faq-eval:${query.id}`,
        actor: 'OPERATOR',
        source_channel: 'seed_eval',
        hospital_type: query.hospitalType,
        payload: {
          query_id: query.id,
          query: query.query,
          expected_scope: query.expectedScope,
          expected_categories: query.expectedCategories,
          expected_hospital_id: query.expectedHospitalId,
          notes: query.notes,
          page_context: query.expectedHospitalId
            ? {
              type: 'HOSPITAL_DETAIL',
              hospitalId: query.expectedHospitalId,
            }
            : null,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`FAQ eval request failed for ${query.id}: ${response.status} ${await response.text()}`);
    }

    const body = await response.json() as { ok: boolean; data: Record<string, unknown> };
    results.push(body.data);
  }

  const buckets = summarizeBuckets(results as Array<{ queryId: string | null; pass: boolean | null }>);
  for (const bucket of buckets) {
    console.log(`${bucket.label} pass rate: ${bucket.passed}/${bucket.total}`);
  }

  mkdirSync(resolve(REPO_ROOT, 'docs/seed-data'), { recursive: true });
  writeFileSync(DEFAULT_REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    apiBaseUrl,
    seedPath,
    buckets,
    results,
  }, null, 2));

  console.log(`Saved FAQ retrieval evaluation report to ${DEFAULT_REPORT_PATH}`);
}

function summarizeBuckets(results: Array<{ queryId: string | null; pass: boolean | null }>) {
  const buckets = new Map<string, { label: string; passed: number; total: number }>();

  for (const result of results) {
    const label = inferBucketLabel(result.queryId ?? '');
    const entry = buckets.get(label) ?? { label, passed: 0, total: 0 };
    entry.total += 1;
    if (result.pass === true) {
      entry.passed += 1;
    }
    buckets.set(label, entry);
  }

  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function inferBucketLabel(queryId: string): string {
  if (queryId.includes('general')) return 'GENERAL_ONLY';
  if (queryId.includes('hospital')) return 'HOSPITAL_AWARE';
  if (queryId.includes('multi')) return 'MULTI_CATEGORY';
  if (queryId.includes('ambiguous')) return 'AMBIGUOUS';
  if (queryId.includes('negative')) return 'NEGATIVE';
  return 'OTHER';
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
