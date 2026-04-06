import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCrmDb } from '../packages/infrastructure/database/crm-client.ts';
import { DrizzleAiSyncOutboxRepository } from '../packages/infrastructure/database/repositories/drizzle-ai-sync-outbox.repository.ts';
import { DrizzleChatbotFaqRepository } from '../packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts';
import { ImportFaqSeedUseCase } from '../packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts';
import { AiSyncTaskService } from '../packages/application/src/services/ai-sync-task.service.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_SEED_PATH = resolve(REPO_ROOT, 'docs/seed-data/faq-category-aware-retrieval.seed.json');
const ENV_CANDIDATES = [
  resolve(REPO_ROOT, 'apps/api/.env'),
  resolve(REPO_ROOT, '.env'),
];

function ensureRuntimeEnv() {
  if (process.env.DATABASE_URL) {
    return;
  }

  if (typeof process.loadEnvFile === 'function') {
    for (const envPath of ENV_CANDIDATES) {
      if (!existsSync(envPath)) continue;
      process.loadEnvFile(envPath);
      if (process.env.DATABASE_URL) {
        return;
      }
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Load apps/api/.env or .env before running import-faq-seed.ts.');
  }
}

async function main() {
  ensureRuntimeEnv();
  const seedPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_SEED_PATH;
  readFileSync(seedPath, 'utf8');
  const crmDb = getCrmDb();
  const faqRepo = new DrizzleChatbotFaqRepository(crmDb);
  const aiSyncOutboxRepo = new DrizzleAiSyncOutboxRepository(crmDb);
  const aiSyncTaskService = new AiSyncTaskService(aiSyncOutboxRepo);
  const useCase = new ImportFaqSeedUseCase(faqRepo, aiSyncTaskService);
  const result = await useCase.execute({ seedPath });

  console.log(`Imported FAQ seed from ${seedPath}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
