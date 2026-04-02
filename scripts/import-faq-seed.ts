import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCrmDb } from '../packages/infrastructure/database/crm-client.ts';
import { DrizzleChatbotFaqRepository } from '../packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts';
import { ImportFaqSeedUseCase } from '../packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_SEED_PATH = resolve(REPO_ROOT, 'docs/seed-data/faq-category-aware-retrieval.seed.json');

async function main() {
  const seedPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_SEED_PATH;
  readFileSync(seedPath, 'utf8');
  const faqRepo = new DrizzleChatbotFaqRepository(getCrmDb());
  const useCase = new ImportFaqSeedUseCase(faqRepo);
  const result = await useCase.execute({ seedPath });

  console.log(`Imported FAQ seed from ${seedPath}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
