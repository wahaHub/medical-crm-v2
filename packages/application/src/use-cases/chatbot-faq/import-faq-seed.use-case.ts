import { readFileSync } from 'node:fs';
import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ChatbotFaqItem } from '@medical-crm/domain';
import type { AiSyncTaskService } from '../../services/ai-sync-task.service.js';

export interface FaqSeedCategoryRecord {
  id: string;
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId: string | null;
  scope: 'GENERAL' | 'HOSPITAL';
  sortOrder: number;
  isActive: boolean;
}

export interface FaqSeedItemRecord {
  id: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId: string | null;
  scope: 'GENERAL' | 'HOSPITAL';
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface FaqSeedEvaluationQueryRecord {
  id: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  query: string;
  expectedScope: 'GENERAL_ONLY' | 'HOSPITAL_AWARE';
  expectedCategories: string[];
  expectedHospitalId: string | null;
  notes: string;
}

export interface FaqSeedCorpus {
  categories: FaqSeedCategoryRecord[];
  faqItems: FaqSeedItemRecord[];
  evaluationQueries: FaqSeedEvaluationQueryRecord[];
}

export interface ImportFaqSeedInput {
  seed?: FaqSeedCorpus;
  seedPath?: string;
}

export interface ImportFaqSeedResult {
  categoriesCreated: number;
  categoriesUpdated: number;
  categoriesSkipped: number;
  faqItemsCreated: number;
  faqItemsUpdated: number;
  faqItemsSkipped: number;
}

export class ImportFaqSeedUseCase {
  constructor(
    private readonly faqRepo: IChatbotFaqRepository,
    private readonly aiSyncTaskService?: AiSyncTaskService,
  ) {}

  async execute(input: ImportFaqSeedInput): Promise<ImportFaqSeedResult> {
    const seed = this.resolveSeed(input);
    validateSeed(seed);
    const categoryKeys = new Set(
      seed.categories.map((category) => categorySeedKey(category.name, category.hospitalType, category.hospitalId, category.scope)),
    );

    for (const faqItem of seed.faqItems) {
      const key = categorySeedKey(faqItem.category, faqItem.hospitalType, faqItem.hospitalId, faqItem.scope);
      if (!categoryKeys.has(key)) {
        throw new Error(
          `Seed FAQ item references unknown category: ${faqItem.category} (${faqItem.hospitalType}, ${faqItem.hospitalId ?? 'GENERAL'}, ${faqItem.scope})`,
        );
      }
    }

    const existingCategories = await this.loadExistingCategories(seed.categories);
    const result: ImportFaqSeedResult = {
      categoriesCreated: 0,
      categoriesUpdated: 0,
      categoriesSkipped: 0,
      faqItemsCreated: 0,
      faqItemsUpdated: 0,
      faqItemsSkipped: 0,
    };

    for (const category of seed.categories) {
      const key = categoryKey(category.name, category.hospitalType, category.hospitalId);
      const existing = existingCategories.get(key);

      if (existing && isSameCategory(existing, category)) {
        result.categoriesSkipped += 1;
        continue;
      }

      if (existing) {
        await this.faqRepo.updateCategory(existing.id, {
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        });
        result.categoriesUpdated += 1;
      } else {
        await this.faqRepo.createCategory({
          name: category.name,
          hospitalType: category.hospitalType,
          hospitalId: category.hospitalId,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        });
        result.categoriesCreated += 1;
      }
    }

    for (const faqItem of seed.faqItems) {
      const existing = await this.faqRepo.findById(faqItem.id);
      if (existing && isSameFaqItem(existing, faqItem)) {
        if (this.aiSyncTaskService) {
          await this.aiSyncTaskService.enqueueFaqUpsert(toFaqSyncPayload(existing));
        }
        result.faqItemsSkipped += 1;
        continue;
      }

      const saved = await this.faqRepo.save(new ChatbotFaqItem({
        id: faqItem.id,
        category: faqItem.category,
        question: faqItem.question,
        answer: faqItem.answer,
        hospitalType: faqItem.hospitalType,
        hospitalId: faqItem.hospitalId,
        keywords: faqItem.keywords,
        sortOrder: faqItem.sortOrder,
        isActive: faqItem.isActive,
        attachments: existing?.attachments ?? [],
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      }));

      if (this.aiSyncTaskService) {
        await this.aiSyncTaskService.enqueueFaqUpsert(toFaqSyncPayload(saved));
      }

      if (existing) {
        result.faqItemsUpdated += 1;
      } else {
        result.faqItemsCreated += 1;
      }
    }

    return result;
  }

  private resolveSeed(input: ImportFaqSeedInput): FaqSeedCorpus {
    if (input.seed) {
      return input.seed;
    }
    if (!input.seedPath) {
      throw new Error('ImportFaqSeedUseCase requires either seed or seedPath');
    }
    return JSON.parse(readFileSync(input.seedPath, 'utf8')) as FaqSeedCorpus;
  }

  private async loadExistingCategories(
    categories: FaqSeedCategoryRecord[],
  ): Promise<Map<string, Awaited<ReturnType<IChatbotFaqRepository['listCategories']>>[number]>> {
    const uniqueScopes = new Map<string, { hospitalType: 'REGULAR' | 'COSMETIC'; hospitalId: string | null }>();

    for (const category of categories) {
      const key = `${category.hospitalType}::${category.hospitalId ?? 'GENERAL'}`;
      if (!uniqueScopes.has(key)) {
        uniqueScopes.set(key, {
          hospitalType: category.hospitalType,
          hospitalId: category.hospitalId,
        });
      }
    }

    const map = new Map<string, Awaited<ReturnType<IChatbotFaqRepository['listCategories']>>[number]>();
    for (const scope of uniqueScopes.values()) {
      const existing = await this.faqRepo.listCategories({
        hospitalType: scope.hospitalType,
        hospitalId: scope.hospitalId,
      });
      for (const category of existing) {
        map.set(categoryKey(category.name, category.hospitalType, category.hospitalId), category);
      }
    }

    return map;
  }
}

function categoryKey(name: string, hospitalType: 'REGULAR' | 'COSMETIC', hospitalId: string | null): string {
  return `${hospitalType}::${hospitalId ?? 'GENERAL'}::${name.trim()}`;
}

function categorySeedKey(
  name: string,
  hospitalType: 'REGULAR' | 'COSMETIC',
  hospitalId: string | null,
  scope: 'GENERAL' | 'HOSPITAL',
): string {
  return `${scope}::${categoryKey(name, hospitalType, hospitalId)}`;
}

function validateSeed(seed: FaqSeedCorpus): void {
  for (const category of seed.categories) {
    if (category.scope !== 'GENERAL' && category.scope !== 'HOSPITAL') {
      throw new Error(`Seed category has invalid scope: ${category.id}`);
    }
    if (category.hospitalId && !isUuid(category.hospitalId)) {
      throw new Error(`Seed category has invalid hospitalId: ${category.id}`);
    }
    if (category.scope === 'GENERAL' && category.hospitalId !== null) {
      throw new Error(`GENERAL seed category must not have hospitalId: ${category.id}`);
    }
    if (category.scope === 'HOSPITAL' && !category.hospitalId) {
      throw new Error(`HOSPITAL seed category must have hospitalId: ${category.id}`);
    }
  }

  for (const faqItem of seed.faqItems) {
    if (!isUuid(faqItem.id)) {
      throw new Error(`Seed FAQ item has invalid id: ${faqItem.id}`);
    }
    if (faqItem.scope !== 'GENERAL' && faqItem.scope !== 'HOSPITAL') {
      throw new Error(`Seed FAQ item has invalid scope: ${faqItem.id}`);
    }
    if (faqItem.hospitalId && !isUuid(faqItem.hospitalId)) {
      throw new Error(`Seed FAQ item has invalid hospitalId: ${faqItem.id}`);
    }
    if (faqItem.scope === 'GENERAL' && faqItem.hospitalId !== null) {
      throw new Error(`GENERAL seed FAQ item must not have hospitalId: ${faqItem.id}`);
    }
    if (faqItem.scope === 'HOSPITAL' && !faqItem.hospitalId) {
      throw new Error(`HOSPITAL seed FAQ item must have hospitalId: ${faqItem.id}`);
    }
  }
}

function isSameCategory(
  existing: Awaited<ReturnType<IChatbotFaqRepository['listCategories']>>[number],
  category: FaqSeedCategoryRecord,
): boolean {
  return existing.name === category.name
    && existing.hospitalType === category.hospitalType
    && existing.hospitalId === category.hospitalId
    && existing.sortOrder === category.sortOrder
    && existing.isActive === category.isActive;
}

function isSameFaqItem(existing: ChatbotFaqItem, faqItem: FaqSeedItemRecord): boolean {
  return existing.category === faqItem.category
    && existing.question === faqItem.question
    && existing.answer === faqItem.answer
    && existing.hospitalType === faqItem.hospitalType
    && existing.hospitalId === faqItem.hospitalId
    && existing.sortOrder === faqItem.sortOrder
    && existing.isActive === faqItem.isActive
    && sameStringArray(existing.keywords, faqItem.keywords);
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toFaqSyncPayload(
  faqItem: Pick<ChatbotFaqItem, 'id' | 'category' | 'question' | 'answer' | 'hospitalType' | 'hospitalId' | 'keywords' | 'isActive' | 'attachments'>,
) {
  return {
    faqId: faqItem.id,
    category: faqItem.category,
    question: faqItem.question,
    answer: faqItem.answer,
    hospitalType: faqItem.hospitalType,
    hospitalId: faqItem.hospitalId,
    keywords: faqItem.keywords,
    attachments: faqItem.attachments,
    isActive: faqItem.isActive,
  };
}
