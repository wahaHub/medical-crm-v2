import type { ChatbotFaqCategory, ChatbotFaqItem, IChatbotFaqRepository } from '@medical-crm/domain';

export interface EvaluateFaqRetrievalPageContext {
  type: 'HOSPITAL_DETAIL';
  hospitalId: string;
  hospitalName?: string;
}

export interface EvaluateFaqRetrievalInput {
  queryId?: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  query: string;
  expectedScope?: 'GENERAL_ONLY' | 'HOSPITAL_AWARE';
  expectedCategories?: string[];
  expectedHospitalId?: string | null;
  notes?: string;
  pageContext?: EvaluateFaqRetrievalPageContext | null;
}

export interface EvaluateFaqRetrievalResult {
  queryId: string | null;
  query: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  expectedScope: 'GENERAL_ONLY' | 'HOSPITAL_AWARE' | null;
  expectedCategories: string[];
  expectedHospitalId: string | null;
  actualScope: 'GENERAL_ONLY' | 'HOSPITAL_AWARE';
  actualCategories: string[];
  activeHospitalId: string | null;
  categoryListSourceUsed: 'GENERAL_ONLY' | 'GENERAL_PLUS_HOSPITAL';
  availableCategories: Array<{
    name: string;
    sortOrder: number;
  }>;
  pass: boolean | null;
  notes: string[];
}

export class EvaluateFaqRetrievalUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(input: EvaluateFaqRetrievalInput): Promise<EvaluateFaqRetrievalResult> {
    const activeHospitalId = input.pageContext?.type === 'HOSPITAL_DETAIL'
      ? input.pageContext.hospitalId
      : null;

    const generalCategories = await this.faqRepo.listCategories({
      hospitalType: input.hospitalType,
      hospitalId: null,
      isActive: true,
    });
    const hospitalCategories = activeHospitalId
      ? await this.faqRepo.listCategories({
        hospitalType: input.hospitalType,
        hospitalId: activeHospitalId,
        isActive: true,
      })
      : [];

    const availableCategories = dedupeCategories([...generalCategories, ...hospitalCategories]);
    const generalFaqs = await this.listFaqItems({
      hospitalType: input.hospitalType,
      hospitalId: null,
    });
    const hospitalFaqs = activeHospitalId
      ? await this.listFaqItems({
        hospitalType: input.hospitalType,
        hospitalId: activeHospitalId,
      })
      : [];

    const actualCategories = resolveCategories({
      query: input.query,
      availableCategories,
      faqItems: [...generalFaqs, ...hospitalFaqs],
    });
    const actualScope = activeHospitalId ? 'HOSPITAL_AWARE' : 'GENERAL_ONLY';

    return {
      queryId: input.queryId ?? null,
      query: input.query,
      hospitalType: input.hospitalType,
      expectedScope: input.expectedScope ?? null,
      expectedCategories: [...(input.expectedCategories ?? [])],
      expectedHospitalId: input.expectedHospitalId ?? null,
      actualScope,
      actualCategories,
      activeHospitalId,
      categoryListSourceUsed: activeHospitalId ? 'GENERAL_PLUS_HOSPITAL' : 'GENERAL_ONLY',
      availableCategories,
      pass: evaluatePass({
        expectedScope: input.expectedScope,
        expectedCategories: input.expectedCategories,
        expectedHospitalId: input.expectedHospitalId,
        actualScope,
        actualCategories,
        activeHospitalId,
      }),
      notes: buildNotes({
        input,
        actualCategories,
        actualScope,
        activeHospitalId,
        availableCategoryCount: availableCategories.length,
      }),
    };
  }

  private async listFaqItems(input: {
    hospitalType: 'REGULAR' | 'COSMETIC';
    hospitalId: string | null;
  }): Promise<ChatbotFaqItem[]> {
    const result = await this.faqRepo.findAll({
      page: 1,
      limit: 1000,
      hospitalType: input.hospitalType,
      hospitalId: input.hospitalId,
      isActive: true,
    });

    return result.data;
  }
}

function dedupeCategories(categories: ChatbotFaqCategory[]): Array<{ name: string; sortOrder: number }> {
  const deduped = new Map<string, { name: string; sortOrder: number }>();
  for (const category of categories) {
    const existing = deduped.get(category.name);
    if (!existing || category.sortOrder < existing.sortOrder) {
      deduped.set(category.name, {
        name: category.name,
        sortOrder: category.sortOrder,
      });
    }
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name);
  });
}

function resolveCategories(input: {
  query: string;
  availableCategories: Array<{ name: string; sortOrder: number }>;
  faqItems: ChatbotFaqItem[];
}): string[] {
  const queryTokens = tokenize(input.query);
  const normalizedQuery = queryTokens.join(' ');
  const scores = input.availableCategories.map((category) => {
    const categoryTokens = tokenize(category.name);
    let score = overlapScore(queryTokens, categoryTokens) * 8;

    if (categoryTokens.length > 0 && normalizedQuery.includes(categoryTokens.join(' '))) {
      score += 10;
    }

    const categoryFaqs = input.faqItems.filter((item) => item.category === category.name);
    let bestFaqScore = 0;
    for (const faq of categoryFaqs) {
      const faqScore = scoreFaqMatch(queryTokens, faq);
      if (faqScore > bestFaqScore) {
        bestFaqScore = faqScore;
      }
    }
    score += bestFaqScore;

    return {
      name: category.name,
      sortOrder: category.sortOrder,
      score,
    };
  });

  const positive = scores
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, 3)
    .map((entry) => entry.name);

  if (positive.length > 0) {
    return positive;
  }

  return input.availableCategories.slice(0, 1).map((category) => category.name);
}

function scoreFaqMatch(queryTokens: string[], faq: ChatbotFaqItem): number {
  const questionTokens = tokenize(faq.question);
  const keywordTokens = tokenize(faq.keywords.join(' '));
  const answerTokens = tokenize(faq.answer);

  return overlapScore(queryTokens, questionTokens) * 5
    + overlapScore(queryTokens, keywordTokens) * 6
    + overlapScore(queryTokens, answerTokens) * 2;
}

function overlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  let score = 0;
  for (const token of left) {
    if (rightSet.has(token)) {
      score += 1;
    }
  }
  return score;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'before', 'can', 'do', 'does', 'for', 'how', 'i', 'if', 'in',
  'is', 'it', 'me', 'my', 'of', 'on', 'or', 'should', 'the', 'this', 'to', 'usually', 'what',
  'when', 'with', 'you', 'your',
]);

const TOKEN_ALIASES: Record<string, string> = {
  admissions: 'admission',
  aftercare: 'recovery',
  caregivers: 'companion',
  companions: 'companion',
  consultations: 'consultation',
  coordinators: 'coordination',
  costs: 'pricing',
  diagnoses: 'diagnosis',
  docs: 'document',
  documents: 'document',
  family: 'companion',
  files: 'document',
  interpreters: 'interpreter',
  language: 'interpreter',
  languages: 'interpreter',
  lodging: 'stay',
  paperwork: 'document',
  photos: 'photo',
  records: 'record',
  reports: 'record',
  reviews: 'review',
  stays: 'stay',
  translators: 'interpreter',
};

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => TOKEN_ALIASES[token] ?? token)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function evaluatePass(input: {
  expectedScope?: 'GENERAL_ONLY' | 'HOSPITAL_AWARE';
  expectedCategories?: string[];
  expectedHospitalId?: string | null;
  actualScope: 'GENERAL_ONLY' | 'HOSPITAL_AWARE';
  actualCategories: string[];
  activeHospitalId: string | null;
}): boolean | null {
  if (!input.expectedScope && !input.expectedCategories?.length && !input.expectedHospitalId) {
    return null;
  }

  if (input.expectedScope && input.expectedScope !== input.actualScope) {
    return false;
  }

  if (input.expectedHospitalId !== undefined && (input.expectedHospitalId ?? null) !== input.activeHospitalId) {
    return false;
  }

  if (input.expectedCategories?.length) {
    const actualSet = new Set(input.actualCategories);
    for (const expected of input.expectedCategories) {
      if (!actualSet.has(expected)) {
        return false;
      }
    }
  }

  return true;
}

function buildNotes(input: {
  input: EvaluateFaqRetrievalInput;
  actualCategories: string[];
  actualScope: 'GENERAL_ONLY' | 'HOSPITAL_AWARE';
  activeHospitalId: string | null;
  availableCategoryCount: number;
}): string[] {
  const notes: string[] = [];
  notes.push(`available_categories=${input.availableCategoryCount}`);
  notes.push(`category_source=${input.activeHospitalId ? 'GENERAL_PLUS_HOSPITAL' : 'GENERAL_ONLY'}`);

  if (input.input.notes) {
    notes.push(`seed_note=${input.input.notes}`);
  }

  if (input.input.expectedScope && input.input.expectedScope !== input.actualScope) {
    notes.push(`scope_mismatch:${input.input.expectedScope}->${input.actualScope}`);
  }

  if (
    input.input.expectedHospitalId !== undefined
    && (input.input.expectedHospitalId ?? null) !== input.activeHospitalId
  ) {
    notes.push(`hospital_mismatch:${input.input.expectedHospitalId ?? 'null'}->${input.activeHospitalId ?? 'null'}`);
  }

  if (input.input.expectedCategories?.length) {
    const actualSet = new Set(input.actualCategories);
    const missing = input.input.expectedCategories.filter((category) => !actualSet.has(category));
    if (missing.length > 0) {
      notes.push(`missing_categories=${missing.join('|')}`);
    }
  }

  return notes;
}
