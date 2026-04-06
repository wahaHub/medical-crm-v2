import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

type HospitalType = 'COSMETIC' | 'REGULAR';
type FaqScope = 'GENERAL' | 'HOSPITAL';
type EvalScope = 'GENERAL_ONLY' | 'HOSPITAL_AWARE';

interface SeedCategory {
  id: string;
  name: string;
  hospitalType: HospitalType;
  hospitalId: string | null;
  scope: FaqScope;
  sortOrder: number;
  isActive: boolean;
}

interface SeedFaqItem {
  id: string;
  hospitalType: HospitalType;
  hospitalId: string | null;
  scope: FaqScope;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
}

interface EvaluationQuery {
  id: string;
  hospitalType: HospitalType;
  query: string;
  expectedScope: EvalScope;
  expectedCategories: string[];
  expectedHospitalId: string | null;
  notes: string;
}

interface CategoryDef {
  name: string;
  topic: string;
  answerCore: string;
  keywords: string[];
}

interface HospitalDef {
  id: string;
  name: string;
  specialty: string;
  tone: string;
}

interface DomainDef {
  hospitalType: HospitalType;
  label: string;
  generalCategories: CategoryDef[];
  hospitals: HospitalDef[];
}

interface SeedCorpus {
  categories: SeedCategory[];
  faqItems: SeedFaqItem[];
  evaluationQueries: EvaluationQuery[];
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SEED_DIR = join(REPO_ROOT, 'docs/seed-data');
const SEED_JSON_PATH = join(SEED_DIR, 'faq-category-aware-retrieval.seed.json');
const README_PATH = join(SEED_DIR, 'faq-category-aware-retrieval.readme.md');
const EXPECTED_EVAL_BUCKETS = {
  general: 20,
  hospital: 20,
  multi: 20,
  ambiguous: 10,
  negative: 10,
} as const;

const GENERAL_QUESTION_TEMPLATES = [
  'What should I know about {topic} before I get started?',
  'How is {topic} usually handled for international patients?',
  'Are there any special requirements around {topic}?',
  'What happens if I am not ready yet for {topic}?',
  'How long does review around {topic} usually take?',
  'Can you still help if I am comparing options around {topic}?',
  'Does {topic} usually affect pricing, timing, or travel planning?',
  'What is the safest next step if my main concern is {topic}?',
  'What do patients usually misunderstand about {topic} at the beginning?',
] as const;

const GENERAL_ANSWER_TAILS = [
  'We usually start with a short review and then point you to the next step.',
  'If you already have records, photos, or imaging, the review is usually more precise.',
  'If you are traveling from abroad, we can align the timing so the plan stays realistic.',
  'We avoid guessing and only move forward when the information is enough.',
  'A coordinator can help you compare options before you commit.',
  'The next step is usually to collect the minimum information needed for a useful review.',
  'We keep the process simple so you know what happens first and what can wait.',
  'If the case is not ready yet, we can still explain what to prepare next.',
] as const;

const HOSPITAL_QUESTION_TEMPLATES = [
  'For {hospitalName}, what should I know about {topic}?',
  'Does {hospitalName} have any special requirements around {topic}?',
  'How does {hospitalName} usually handle {topic} for international patients?',
  'What are the main rules at {hospitalName} for {topic}?',
  'Before I choose {hospitalName}, what should I prepare for {topic}?',
] as const;

const HOSPITAL_ANSWER_TAILS = [
  'Please prepare the requested materials before the case is scheduled.',
  'If you already have recent records, the team can review them faster.',
  'The hospital can usually adjust timing if your travel window is tight.',
  'A coordinator can help confirm the exact rule before you book.',
] as const;

const DOMAINS: Record<HospitalType, DomainDef> = {
  COSMETIC: {
    hospitalType: 'COSMETIC',
    label: 'cosmetic medical travel',
    generalCategories: [
      {
        name: 'Consultation Process',
        topic: 'consultation process',
        answerCore: 'We usually begin with a short intake, ask what procedures you are considering, and explain which hospital materials we need before moving forward.',
        keywords: ['consultation', 'intake', 'review', 'procedure'],
      },
      {
        name: 'Medical Documents',
        topic: 'medical documents',
        answerCore: 'We usually want recent photos, prior procedure notes, and any relevant reports so the review is based on evidence instead of guessing.',
        keywords: ['documents', 'records', 'reports', 'photos'],
      },
      {
        name: 'Procedure Eligibility',
        topic: 'procedure eligibility',
        answerCore: 'Eligibility usually depends on your goals, medical background, timing, and whether the case is safe to review remotely first.',
        keywords: ['eligibility', 'suitability', 'candidate', 'approval'],
      },
      {
        name: 'Recovery and Aftercare',
        topic: 'recovery and aftercare',
        answerCore: 'Recovery planning usually covers swelling, rest, follow-up timing, and the practical limits on travel right after treatment.',
        keywords: ['recovery', 'aftercare', 'healing', 'follow-up'],
      },
      {
        name: 'Travel and Stay',
        topic: 'travel and stay',
        answerCore: 'We usually align travel dates, stay length, and post-procedure rest so the trip is realistic and not rushed.',
        keywords: ['travel', 'stay', 'arrival', 'lodging'],
      },
      {
        name: 'Pricing and Package Scope',
        topic: 'pricing and package scope',
        answerCore: 'Price depends on what is included in the package, whether follow-up care is covered, and whether stay or transfers are bundled.',
        keywords: ['pricing', 'package', 'cost', 'inclusions'],
      },
      {
        name: 'Risks and Limitations',
        topic: 'risks and limitations',
        answerCore: 'We explain the common risks, the realistic limits of the procedure, and what information is needed before anyone can give a useful plan.',
        keywords: ['risks', 'limitations', 'safety', 'expectations'],
      },
      {
        name: 'Timeline and Scheduling',
        topic: 'timeline and scheduling',
        answerCore: 'Scheduling usually depends on case review, travel timing, and how much lead time is needed before the procedure date.',
        keywords: ['timeline', 'schedule', 'lead time', 'availability'],
      },
      {
        name: 'Companion and Support',
        topic: 'companion and support',
        answerCore: 'We can explain when a companion is helpful, what support is available, and how much help is realistic during recovery.',
        keywords: ['companion', 'support', 'family', 'assistance'],
      },
      {
        name: 'Language and Translation Support',
        topic: 'language and translation support',
        answerCore: 'Translation support usually covers the core review and logistics so you can understand the plan without relying on guesswork.',
        keywords: ['language', 'translation', 'interpreter', 'support'],
      },
      {
        name: 'Why Medora / Care Coordination',
        topic: 'why Medora and care coordination',
        answerCore: 'Our role is to reduce uncertainty, coordinate the case review, and keep the hospital process understandable and organized.',
        keywords: ['coordination', 'medora', 'support', 'process'],
      },
      {
        name: 'Revision / Follow-up Planning',
        topic: 'revision and follow-up planning',
        answerCore: 'Follow-up planning usually depends on how the initial result heals, whether revision is even relevant, and how the hospital handles review loops.',
        keywords: ['revision', 'follow-up', 'recheck', 'plan'],
      },
    ],
    hospitals: [
      {
        id: '4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0001',
        name: 'Seoul Aesthetic Center',
        specialty: 'rhinoplasty, eyelid surgery, facial contouring',
        tone: 'structured international workflow and clear pre-op document expectations',
      },
      {
        id: '4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0002',
        name: 'Bangkok Beauty Institute',
        specialty: 'body contouring, breast procedures, skin-focused packages',
        tone: 'package-heavy planning with more recovery and stay coordination',
      },
      {
        id: '4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0003',
        name: 'Istanbul Aesthetics Hospital',
        specialty: 'rhinoplasty, hair transplant, combo procedures',
        tone: 'more specific photo and document requirements before review',
      },
    ],
  },
  REGULAR: {
    hospitalType: 'REGULAR',
    label: 'general medical travel',
    generalCategories: [
      {
        name: 'Case Review Process',
        topic: 'case review process',
        answerCore: 'We usually start with a short case review so the hospital can decide which records or imaging matter before it commits to next steps.',
        keywords: ['case review', 'intake', 'triage', 'review'],
      },
      {
        name: 'Medical Records and Imaging',
        topic: 'medical records and imaging',
        answerCore: 'We usually ask for recent records, scans, and the most relevant imaging so the hospital can avoid reviewing the case blind.',
        keywords: ['records', 'imaging', 'scans', 'reports'],
      },
      {
        name: 'Treatment Eligibility',
        topic: 'treatment eligibility',
        answerCore: 'Eligibility usually depends on diagnosis, prior treatments, timing, and whether the hospital believes an international review is appropriate.',
        keywords: ['eligibility', 'candidate', 'diagnosis', 'approval'],
      },
      {
        name: 'Diagnosis and Second Opinion',
        topic: 'diagnosis and second opinion',
        answerCore: 'A second opinion usually becomes useful when the current plan is unclear, complex, or needs a more specialized review.',
        keywords: ['diagnosis', 'second opinion', 'specialist', 'review'],
      },
      {
        name: 'Hospital Selection Criteria',
        topic: 'hospital selection criteria',
        answerCore: 'Hospital choice usually depends on specialty fit, case complexity, timing, and how well the team can review your records.',
        keywords: ['hospital choice', 'selection', 'criteria', 'specialty'],
      },
      {
        name: 'Travel and Admission Planning',
        topic: 'travel and admission planning',
        answerCore: 'We usually align the travel window, admission timing, and case review so the plan stays practical for international patients.',
        keywords: ['travel', 'admission', 'planning', 'timing'],
      },
      {
        name: 'Length of Stay and Follow-up',
        topic: 'length of stay and follow-up',
        answerCore: 'The required stay depends on the treatment, how quickly follow-up is needed, and what the hospital expects after admission.',
        keywords: ['stay', 'follow-up', 'hospitalization', 'monitoring'],
      },
      {
        name: 'Pricing and Cost Scope',
        topic: 'pricing and cost scope',
        answerCore: 'Cost depends on the treatment scope, what the hospital includes, and whether follow-up or stay is bundled.',
        keywords: ['pricing', 'cost', 'package', 'scope'],
      },
      {
        name: 'Interpreter and Coordination Support',
        topic: 'interpreter and coordination support',
        answerCore: 'We can explain how translation and coordination support works so the hospital discussion stays clear and practical.',
        keywords: ['interpreter', 'translation', 'coordination', 'support'],
      },
      {
        name: 'Risks, Outcomes, and Limits',
        topic: 'risks, outcomes, and limits',
        answerCore: 'We explain the realistic limits, common risks, and what the hospital can or cannot promise before the case is reviewed.',
        keywords: ['risks', 'outcomes', 'limits', 'expectations'],
      },
      {
        name: 'Caregiver / Family Support',
        topic: 'caregiver and family support',
        answerCore: 'Family support usually matters when the patient needs help during admission, travel, or early recovery planning.',
        keywords: ['caregiver', 'family', 'support', 'assistance'],
      },
      {
        name: 'Post-treatment Monitoring',
        topic: 'post-treatment monitoring',
        answerCore: 'Follow-up monitoring usually covers how the hospital wants to check recovery, results, and any next-step questions.',
        keywords: ['follow-up', 'monitoring', 'recovery', 'review'],
      },
    ],
    hospitals: [
      {
        id: '4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0011',
        name: 'Seoul Advanced Medical Center',
        specialty: 'orthopedics, spine, sports injury',
        tone: 'imaging-heavy review process with a strong second-opinion workflow',
      },
      {
        id: '4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0012',
        name: 'Bangkok International Care Hospital',
        specialty: 'digestive medicine, cardiovascular care, chronic disease support',
        tone: 'coordination-heavy with family and admission logistics',
      },
      {
        id: '4d7a1d34-6bb8-46aa-a7b6-36e7f7cb0013',
        name: 'Tokyo Precision Treatment Center',
        specialty: 'oncology second opinion, complex surgery planning, precision treatment review',
        tone: 'strict case review and tighter document specificity',
      },
    ],
  },
};

const HOSPITAL_CATEGORY_DEFS: CategoryDef[] = [
  {
    name: 'Hospital Review Requirements',
    topic: 'hospital review requirements',
    answerCore: 'This hospital usually asks for a complete case file, recent photos or imaging, and any prior treatment history before confirming review timing.',
    keywords: ['review', 'requirements', 'documents', 'case file'],
  },
  {
    name: 'Hospital Scheduling Rules',
    topic: 'hospital scheduling rules',
    answerCore: 'Scheduling usually happens after the review is complete and the hospital confirms that the timeline is realistic.',
    keywords: ['scheduling', 'timing', 'booking', 'availability'],
  },
  {
    name: 'Hospital Stay and Companion Policy',
    topic: 'hospital stay and companion policy',
    answerCore: 'This hospital usually has a clear stay policy and can explain when a companion is useful during the visit.',
    keywords: ['stay', 'companion', 'policy', 'support'],
  },
  {
    name: 'Hospital Recovery Instructions',
    topic: 'hospital recovery instructions',
    answerCore: 'Recovery instructions usually cover rest, follow-up, medication timing, and what the hospital expects after discharge.',
    keywords: ['recovery', 'instructions', 'discharge', 'follow-up'],
  },
  {
    name: 'Hospital International Patient Process',
    topic: 'hospital international patient process',
    answerCore: 'The international patient process usually covers the handoff from review to booking, translation support, and admission coordination.',
    keywords: ['international', 'patient', 'coordination', 'process'],
  },
  {
    name: 'Hospital Pricing / Deposit Notes',
    topic: 'hospital pricing and deposit notes',
    answerCore: 'This hospital usually explains deposit timing, what is included in the quote, and what is billed separately.',
    keywords: ['pricing', 'deposit', 'quote', 'billing'],
  },
];

function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const seed = buildSeedCorpus();
  const seedJson = `${JSON.stringify(seed, null, 2)}\n`;
  const readme = buildReadme(seed);

  if (checkOnly) {
    const failures: string[] = [];
    assertFileMatches(SEED_JSON_PATH, seedJson, 'seed JSON', failures);
    assertFileMatches(README_PATH, readme, 'README', failures);
    validateCounts(seed, failures);
    if (failures.length > 0) {
      console.error(failures.map((failure) => `- ${failure}`).join('\n'));
      process.exit(1);
    }
    console.log('FAQ seed corpus check passed.');
    console.log(formatCounts(seed));
    return;
  }

  mkdirSync(SEED_DIR, { recursive: true });
  writeFileSync(SEED_JSON_PATH, seedJson);
  writeFileSync(README_PATH, readme);

  console.log(`Wrote ${SEED_JSON_PATH}`);
  console.log(`Wrote ${README_PATH}`);
  console.log(formatCounts(seed));
}

function buildSeedCorpus(): SeedCorpus {
  const categories = [
    ...buildGeneralCategories(DOMAINS.COSMETIC),
    ...buildGeneralCategories(DOMAINS.REGULAR),
    ...buildHospitalCategories(DOMAINS.COSMETIC),
    ...buildHospitalCategories(DOMAINS.REGULAR),
  ];

  const faqItems = [
    ...buildGeneralFaqItems(DOMAINS.COSMETIC),
    ...buildGeneralFaqItems(DOMAINS.REGULAR),
    ...buildHospitalFaqItems(DOMAINS.COSMETIC),
    ...buildHospitalFaqItems(DOMAINS.REGULAR),
  ];

  const evaluationQueries = [
    ...buildEvaluationQueries(DOMAINS.COSMETIC),
    ...buildEvaluationQueries(DOMAINS.REGULAR),
  ];

  return {
    categories: sortCategories(categories),
    faqItems: sortFaqItems(faqItems),
    evaluationQueries: sortEvaluationQueries(evaluationQueries),
  };
}

function buildGeneralCategories(domain: DomainDef): SeedCategory[] {
  return domain.generalCategories.map((category, index) => ({
    id: `${slugify(domain.hospitalType)}-general-${slugify(category.name)}`,
    name: category.name,
    hospitalType: domain.hospitalType,
    hospitalId: null,
    scope: 'GENERAL',
    sortOrder: (index + 1) * 10,
    isActive: true,
  }));
}

function buildHospitalCategories(domain: DomainDef): SeedCategory[] {
  const categories: SeedCategory[] = [];
  for (const hospital of domain.hospitals) {
    HOSPITAL_CATEGORY_DEFS.forEach((category, index) => {
      categories.push({
        id: `${slugify(domain.hospitalType)}-${hospital.id}-${slugify(category.name)}`,
        name: category.name,
        hospitalType: domain.hospitalType,
        hospitalId: hospital.id,
        scope: 'HOSPITAL',
        sortOrder: (index + 1) * 10,
        isActive: true,
      });
    });
  }
  return categories;
}

function buildGeneralFaqItems(domain: DomainDef): SeedFaqItem[] {
  const items: SeedFaqItem[] = [];
  domain.generalCategories.forEach((category, categoryIndex) => {
    GENERAL_QUESTION_TEMPLATES.forEach((template, templateIndex) => {
        items.push({
          id: deterministicUuid(`${domain.hospitalType}:GENERAL:${category.name}:${templateIndex + 1}`),
        hospitalType: domain.hospitalType,
        hospitalId: null,
        scope: 'GENERAL',
        category: category.name,
        question: template
          .replace('{topic}', category.topic),
        answer: `${category.answerCore} ${GENERAL_ANSWER_TAILS[(categoryIndex + templateIndex) % GENERAL_ANSWER_TAILS.length]}`,
        keywords: category.keywords,
        isActive: true,
        sortOrder: (templateIndex + 1) * 10,
      });
    });
  });
  return items;
}

function buildHospitalFaqItems(domain: DomainDef): SeedFaqItem[] {
  const items: SeedFaqItem[] = [];
  for (const hospital of domain.hospitals) {
    HOSPITAL_CATEGORY_DEFS.forEach((category, categoryIndex) => {
      HOSPITAL_QUESTION_TEMPLATES.forEach((template, templateIndex) => {
        items.push({
          id: deterministicUuid(`${domain.hospitalType}:HOSPITAL:${hospital.id}:${category.name}:${templateIndex + 1}`),
          hospitalType: domain.hospitalType,
          hospitalId: hospital.id,
          scope: 'HOSPITAL',
          category: category.name,
          question: template
            .replace('{hospitalName}', hospital.name)
            .replace('{topic}', category.topic),
          answer: `${hospital.name} is usually described as ${hospital.tone}. ${category.answerCore} ${HOSPITAL_ANSWER_TAILS[(categoryIndex + templateIndex) % HOSPITAL_ANSWER_TAILS.length]}`,
          keywords: category.keywords,
          isActive: true,
          sortOrder: (templateIndex + 1) * 10,
        });
      });
    });
  }
  return items;
}

function buildEvaluationQueries(domain: DomainDef): EvaluationQuery[] {
  const generalNames = domain.generalCategories.map((category) => category.name);
  const hospital = domain.hospitals;
  const queries: EvaluationQuery[] = [];

  const generalCombos: Array<[string, string, string?]> = [
    [generalNames[0], generalNames[1]],
    [generalNames[2], generalNames[6]],
    [generalNames[3], generalNames[7]],
    [generalNames[4], generalNames[8]],
    [generalNames[5], generalNames[9]],
    [generalNames[10], generalNames[11]],
    [generalNames[1], generalNames[3], generalNames[5]],
    [generalNames[0], generalNames[4], generalNames[7]],
    [generalNames[2], generalNames[8], generalNames[11]],
    [generalNames[6], generalNames[9], generalNames[10]],
  ];

  generalCombos.forEach((cats, index) => {
    queries.push({
      id: `${slugify(domain.hospitalType)}-eval-general-${pad(index + 1)}`,
      hospitalType: domain.hospitalType,
      query: buildGeneralQueryText(domain, cats),
      expectedScope: 'GENERAL_ONLY',
      expectedCategories: cats.filter(Boolean) as string[],
      expectedHospitalId: null,
      notes: 'General-only query should avoid hospital-specific FAQ.',
    });
  });

  const hospitalCombos: Array<{ hospital: HospitalDef; categories: [string, string, string?] }> = [
    { hospital: hospital[0], categories: [generalNames[0], HOSPITAL_CATEGORY_DEFS[0].name] },
    { hospital: hospital[1], categories: [generalNames[1], HOSPITAL_CATEGORY_DEFS[1].name] },
    { hospital: hospital[2], categories: [generalNames[2], HOSPITAL_CATEGORY_DEFS[2].name] },
    { hospital: hospital[0], categories: [generalNames[3], HOSPITAL_CATEGORY_DEFS[3].name] },
    { hospital: hospital[1], categories: [generalNames[4], HOSPITAL_CATEGORY_DEFS[4].name] },
    { hospital: hospital[2], categories: [generalNames[5], HOSPITAL_CATEGORY_DEFS[5].name] },
    { hospital: hospital[0], categories: [generalNames[6], HOSPITAL_CATEGORY_DEFS[1].name, HOSPITAL_CATEGORY_DEFS[3].name] },
    { hospital: hospital[1], categories: [generalNames[7], HOSPITAL_CATEGORY_DEFS[0].name, HOSPITAL_CATEGORY_DEFS[5].name] },
    { hospital: hospital[2], categories: [generalNames[8], HOSPITAL_CATEGORY_DEFS[2].name, HOSPITAL_CATEGORY_DEFS[4].name] },
    { hospital: hospital[0], categories: [generalNames[9], HOSPITAL_CATEGORY_DEFS[0].name, HOSPITAL_CATEGORY_DEFS[2].name] },
  ];

  hospitalCombos.forEach((entry, index) => {
    queries.push({
      id: `${slugify(domain.hospitalType)}-eval-hospital-${pad(index + 1)}`,
      hospitalType: domain.hospitalType,
      query: buildHospitalAwareQueryText(domain, entry.hospital, entry.categories),
      expectedScope: 'HOSPITAL_AWARE',
      expectedCategories: entry.categories.filter(Boolean) as string[],
      expectedHospitalId: entry.hospital.id,
      notes: 'Hospital-aware query should mix hospital and general FAQ without leaking other hospitals.',
    });
  });

  const multiCombos: Array<[string, string, string]> = [
    [generalNames[0], generalNames[1], generalNames[7]],
    [generalNames[2], generalNames[3], generalNames[6]],
    [generalNames[4], generalNames[5], generalNames[8]],
    [generalNames[9], generalNames[10], generalNames[11]],
    [generalNames[1], generalNames[5], generalNames[9]],
    [generalNames[0], generalNames[6], generalNames[11]],
    [generalNames[2], generalNames[7], generalNames[8]],
    [generalNames[3], generalNames[4], generalNames[10]],
    [generalNames[0], generalNames[3], generalNames[8]],
    [generalNames[5], generalNames[6], generalNames[9]],
  ];

  multiCombos.forEach((cats, index) => {
    queries.push({
      id: `${slugify(domain.hospitalType)}-eval-multi-${pad(index + 1)}`,
      hospitalType: domain.hospitalType,
      query: buildMultiCategoryQueryText(domain, cats),
      expectedScope: 'GENERAL_ONLY',
      expectedCategories: cats,
      expectedHospitalId: null,
      notes: 'Multi-category query should retrieve from several relevant FAQ regions.',
    });
  });

  const ambiguousCombos: Array<[string, string]> = [
    [generalNames[0], generalNames[4]],
    [generalNames[1], generalNames[5]],
    [generalNames[2], generalNames[6]],
    [generalNames[3], generalNames[7]],
    [generalNames[8], generalNames[11]],
  ];

  ambiguousCombos.forEach((cats, index) => {
    queries.push({
      id: `${slugify(domain.hospitalType)}-eval-ambiguous-${pad(index + 1)}`,
      hospitalType: domain.hospitalType,
      query: buildAmbiguousQueryText(domain, cats),
      expectedScope: 'GENERAL_ONLY',
      expectedCategories: cats,
      expectedHospitalId: null,
      notes: 'Ambiguous query should still stay general unless a hospital is explicitly signaled.',
    });
  });

  const negativeCombos: Array<[string, string]> = [
    [generalNames[0], generalNames[1]],
    [generalNames[2], generalNames[3]],
    [generalNames[4], generalNames[5]],
    [generalNames[6], generalNames[7]],
    [generalNames[8], generalNames[9]],
  ];

  negativeCombos.forEach((cats, index) => {
    queries.push({
      id: `${slugify(domain.hospitalType)}-eval-negative-${pad(index + 1)}`,
      hospitalType: domain.hospitalType,
      query: buildNegativeQueryText(domain, cats),
      expectedScope: 'GENERAL_ONLY',
      expectedCategories: cats,
      expectedHospitalId: null,
      notes: 'Should not mix hospital-specific FAQ into a general-only answer.',
    });
  });

  return queries;
}

function buildGeneralQueryText(domain: DomainDef, categories: Array<string | undefined>): string {
  const [a, b, c] = categories;
  const first = a ?? 'the main topic';
  const second = b ?? first;
  const third = c ? `, and ${c}` : '';
  return `For ${domain.label}, how do ${first} and ${second}${third} fit together before I decide?`;
}

function buildHospitalAwareQueryText(domain: DomainDef, hospital: HospitalDef, categories: Array<string | undefined>): string {
  const [a, b, c] = categories;
  const first = a ?? 'the main topic';
  const second = b ?? first;
  const third = c ? `, plus ${c}` : '';
  return `For ${hospital.name}, how should I think about ${first} and ${second}${third} if I am planning a ${domain.label} case?`;
}

function buildMultiCategoryQueryText(domain: DomainDef, categories: [string, string, string]): string {
  const [a, b, c] = categories;
  return `I need ${domain.label} guidance on ${a}, ${b}, and ${c} together, because these seem connected.`;
}

function buildAmbiguousQueryText(domain: DomainDef, categories: [string, string]): string {
  const [a, b] = categories;
  return `I am still comparing options and need to understand ${a} and ${b} before I decide what matters most for ${domain.label}.`;
}

function buildNegativeQueryText(domain: DomainDef, categories: [string, string]): string {
  const [a, b] = categories;
  return `Give me only general guidance for ${domain.label} around ${a} and ${b}; do not mix in hospital-specific details unless I mention one.`;
}

function sortCategories(categories: SeedCategory[]): SeedCategory[] {
  return [...categories].sort((left, right) => {
    if (left.hospitalType !== right.hospitalType) {
      return left.hospitalType.localeCompare(right.hospitalType);
    }
    if (left.scope !== right.scope) {
      return left.scope.localeCompare(right.scope);
    }
    if ((left.hospitalId ?? '') !== (right.hospitalId ?? '')) {
      return (left.hospitalId ?? '').localeCompare(right.hospitalId ?? '');
    }
    return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
  });
}

function sortFaqItems(items: SeedFaqItem[]): SeedFaqItem[] {
  return [...items].sort((left, right) => {
    if (left.hospitalType !== right.hospitalType) {
      return left.hospitalType.localeCompare(right.hospitalType);
    }
    if (left.scope !== right.scope) {
      return left.scope.localeCompare(right.scope);
    }
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }
    if ((left.hospitalId ?? '') !== (right.hospitalId ?? '')) {
      return (left.hospitalId ?? '').localeCompare(right.hospitalId ?? '');
    }
    return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
  });
}

function sortEvaluationQueries(items: EvaluationQuery[]): EvaluationQuery[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function buildReadme(seed: SeedCorpus): string {
  const counts = {
    categories: seed.categories.length,
    faqItems: seed.faqItems.length,
    evaluationQueries: seed.evaluationQueries.length,
  };

  const categoriesByDomain = Object.values(DOMAINS)
    .map((domain) => {
      const generalCategories = seed.categories
        .filter((category) => category.hospitalType === domain.hospitalType && category.scope === 'GENERAL')
        .map((category) => category.name)
        .join(', ');
      return [
        `### ${domain.hospitalType} general categories`,
        '',
        generalCategories,
      ].join('\n');
    })
    .join('\n\n');

  const exampleHospitals = Object.values(DOMAINS)
    .map((domain) => {
      const hospitals = domain.hospitals
        .map((hospital) => `- ${hospital.name} (${hospital.id}): ${hospital.specialty}`)
        .join('\n');
      return [
        `### ${domain.hospitalType} example hospitals`,
        '',
        hospitals,
      ].join('\n');
    })
    .join('\n\n');

  const hospitalCategorySet = HOSPITAL_CATEGORY_DEFS.map((category) => `- ${category.name}`).join('\n');

  const domainSummary = Object.values(DOMAINS)
    .map((domain) => {
      const generalCount = seed.categories.filter((category) => category.hospitalType === domain.hospitalType && category.scope === 'GENERAL').length;
      const hospitalCount = seed.categories.filter((category) => category.hospitalType === domain.hospitalType && category.scope === 'HOSPITAL').length;
      return `- ${domain.hospitalType}: ${generalCount} general categories, ${hospitalCount} hospital-scoped categories, ${domain.hospitals.length} example hospitals`;
    })
    .join('\n');

  const evaluationBuckets = [
    `- \`GENERAL_ONLY\`: queries that should stay in general FAQ only (${EXPECTED_EVAL_BUCKETS.general})`,
    `- \`HOSPITAL_AWARE\`: queries that should use hospital-specific FAQ plus general support (${EXPECTED_EVAL_BUCKETS.hospital})`,
    `- \`MULTI_CATEGORY\`: queries that should resolve to more than one FAQ region (${EXPECTED_EVAL_BUCKETS.multi})`,
    `- \`AMBIGUOUS / EDGE\`: queries that probe boundary handling (${EXPECTED_EVAL_BUCKETS.ambiguous})`,
    `- \`NEGATIVE / SHOULD-NOT-MIX\`: queries that should not leak hospital-specific FAQ into general answers (${EXPECTED_EVAL_BUCKETS.negative})`,
  ].join('\n');

  return [
    '# FAQ Seed Corpus',
    '',
    'This seed file is an intermediate CRM import source for category-aware FAQ retrieval.',
    '',
    '## How It Fits',
    '',
    '```text',
    'seed JSON',
    '-> CRM import',
    '-> CRM DB as source of truth',
    '-> CRM sync to Dify datasets',
    '-> retrieval evaluation',
    '```',
    '',
    '## Counts',
    '',
    `- categories: ${counts.categories}`,
    `- faqItems: ${counts.faqItems}`,
    `- evaluationQueries: ${counts.evaluationQueries}`,
    '',
    '## Seed Shape',
    '',
    '- top-level keys: `categories`, `faqItems`, `evaluationQueries`',
    '- `categories`: category seed rows for general and hospital-scoped FAQ',
    '- `faqItems`: FAQ seed rows bound to a category name plus hospital scope/context',
    '- `evaluationQueries`: retrieval test prompts with expected categories, scope, and optional hospital target',
    '',
    '## Domain Summary',
    '',
    domainSummary,
    '',
    '## Category Sets',
    '',
    categoriesByDomain,
    '',
    '## Shared Hospital-specific Category Set',
    '',
    hospitalCategorySet,
    '',
    '## Example Hospitals',
    '',
    exampleHospitals,
    '',
    '## Evaluation Buckets',
    '',
    evaluationBuckets,
    '',
    '## Seed Metadata Rules',
    '',
    '- `scope` is seed metadata used during import and evaluation',
    '- `scope` is not a persisted CRM category column',
    '- CRM truth for categories remains `name + hospitalType + hospitalId`',
    '',
    '## Regeneration',
    '',
    '```bash',
    'node scripts/generate-faq-seed.ts',
    'node scripts/generate-faq-seed.ts --check',
    '```',
    '',
    '## Import and Sync',
    '',
    '- import into CRM with `pnpm seed:faq:import` or `pnpm exec tsx scripts/import-faq-seed.ts`',
    '- the import script loads `apps/api/.env` or repo `.env` to find `DATABASE_URL`',
    '- import writes CRM FAQ rows first and enqueues FAQ sync outbox tasks',
    '- after import, run the AI sync outbox processor to refresh the Dify datasets:',
    '',
    '```bash',
    "curl -X POST http://localhost:3001/api/v2/internal/process-ai-sync-outbox \\",
    "  -H 'X-Internal-Secret: <INTERNAL_API_SECRET>'",
    '```',
    '',
    '- repeat the outbox call until it returns `processed: 0` and `failed: 0`',
    '',
  ].join('\n');
}

function validateCounts(seed: SeedCorpus, failures: string[]): void {
  const expectedCategories =
    Object.values(DOMAINS).reduce((sum, domain) => sum + domain.generalCategories.length + domain.hospitals.length * HOSPITAL_CATEGORY_DEFS.length, 0);
  const expectedFaqItems =
    Object.values(DOMAINS).reduce((sum, domain) => {
      const generalItems = domain.generalCategories.length * GENERAL_QUESTION_TEMPLATES.length;
      const hospitalItems = domain.hospitals.length * HOSPITAL_CATEGORY_DEFS.length * HOSPITAL_QUESTION_TEMPLATES.length;
      return sum + generalItems + hospitalItems;
    }, 0);
  const expectedEvaluationQueries =
    EXPECTED_EVAL_BUCKETS.general +
    EXPECTED_EVAL_BUCKETS.hospital +
    EXPECTED_EVAL_BUCKETS.multi +
    EXPECTED_EVAL_BUCKETS.ambiguous +
    EXPECTED_EVAL_BUCKETS.negative;

  if (seed.categories.length !== expectedCategories) {
    failures.push(`expected exactly ${expectedCategories} categories, got ${seed.categories.length}`);
  }
  if (seed.faqItems.length !== expectedFaqItems) {
    failures.push(`expected exactly ${expectedFaqItems} FAQ items, got ${seed.faqItems.length}`);
  }
  if (seed.evaluationQueries.length !== expectedEvaluationQueries) {
    failures.push(`expected exactly ${expectedEvaluationQueries} evaluation queries, got ${seed.evaluationQueries.length}`);
  }

  const bucketCounts = seed.evaluationQueries.reduce<Record<string, number>>((acc, item) => {
    const bucket = item.id.split('-eval-')[1]?.split('-')[0] ?? 'unknown';
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});
  if ((bucketCounts.general ?? 0) !== EXPECTED_EVAL_BUCKETS.general) {
    failures.push(`expected ${EXPECTED_EVAL_BUCKETS.general} general evaluation queries, got ${bucketCounts.general ?? 0}`);
  }
  if ((bucketCounts.hospital ?? 0) !== EXPECTED_EVAL_BUCKETS.hospital) {
    failures.push(`expected ${EXPECTED_EVAL_BUCKETS.hospital} hospital evaluation queries, got ${bucketCounts.hospital ?? 0}`);
  }
  if ((bucketCounts.multi ?? 0) !== EXPECTED_EVAL_BUCKETS.multi) {
    failures.push(`expected ${EXPECTED_EVAL_BUCKETS.multi} multi evaluation queries, got ${bucketCounts.multi ?? 0}`);
  }
  if ((bucketCounts.ambiguous ?? 0) !== EXPECTED_EVAL_BUCKETS.ambiguous) {
    failures.push(`expected ${EXPECTED_EVAL_BUCKETS.ambiguous} ambiguous evaluation queries, got ${bucketCounts.ambiguous ?? 0}`);
  }
  if ((bucketCounts.negative ?? 0) !== EXPECTED_EVAL_BUCKETS.negative) {
    failures.push(`expected ${EXPECTED_EVAL_BUCKETS.negative} negative evaluation queries, got ${bucketCounts.negative ?? 0}`);
  }

  seed.categories.forEach((category) => {
    if (category.scope === 'GENERAL' && category.hospitalId !== null) {
      failures.push(`general category ${category.id} must have hospitalId=null`);
    }
    if (category.scope === 'HOSPITAL' && !category.hospitalId) {
      failures.push(`hospital category ${category.id} must have hospitalId`);
    }
  });

  seed.faqItems.forEach((item) => {
    if (item.scope === 'GENERAL' && item.hospitalId !== null) {
      failures.push(`general FAQ ${item.id} must have hospitalId=null`);
    }
    if (item.scope === 'HOSPITAL' && !item.hospitalId) {
      failures.push(`hospital FAQ ${item.id} must have hospitalId`);
    }
  });

  seed.evaluationQueries.forEach((query) => {
    if (query.expectedCategories.length < 1 || query.expectedCategories.length > 3) {
      failures.push(`evaluation query ${query.id} must have 1-3 expectedCategories`);
    }
    if (query.expectedScope === 'GENERAL_ONLY' && query.expectedHospitalId !== null) {
      failures.push(`general-only evaluation query ${query.id} must have expectedHospitalId=null`);
    }
    if (query.expectedScope === 'HOSPITAL_AWARE' && !query.expectedHospitalId) {
      failures.push(`hospital-aware evaluation query ${query.id} must have expectedHospitalId`);
    }
  });

  assertUnique(seed.categories.map((category) => category.id), 'category ids', failures);
  assertUnique(seed.faqItems.map((item) => item.id), 'faq item ids', failures);
  assertUnique(seed.evaluationQueries.map((query) => query.id), 'evaluation query ids', failures);

  const categoryKeys = new Set(
    seed.categories.map((category) => [category.hospitalType, category.scope, category.hospitalId ?? '', category.name].join('::')),
  );
  seed.faqItems.forEach((item) => {
    const categoryKey = [item.hospitalType, item.scope, item.hospitalId ?? '', item.category].join('::');
    if (!categoryKeys.has(categoryKey)) {
      failures.push(`faq item ${item.id} references missing category ${item.category}`);
    }
  });

  const generalCategoryNames = new Set(
    seed.categories.filter((category) => category.scope === 'GENERAL').map((category) => `${category.hospitalType}::${category.name}`),
  );
  const hospitalCategoryNames = new Set(HOSPITAL_CATEGORY_DEFS.map((category) => category.name));
  seed.evaluationQueries.forEach((query) => {
    query.expectedCategories.forEach((categoryName) => {
      const generalKey = `${query.hospitalType}::${categoryName}`;
      if (query.expectedScope === 'GENERAL_ONLY' && !generalCategoryNames.has(generalKey)) {
        failures.push(`evaluation query ${query.id} references unknown general category ${categoryName}`);
      }
      if (
        query.expectedScope === 'HOSPITAL_AWARE' &&
        !generalCategoryNames.has(generalKey) &&
        !hospitalCategoryNames.has(categoryName)
      ) {
        failures.push(`hospital-aware evaluation query ${query.id} references unknown category ${categoryName}`);
      }
    });
  });
}

function assertUnique(values: string[], label: string, failures: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      failures.push(`duplicate ${label}: ${value}`);
      return;
    }
    seen.add(value);
  }
}

function assertFileMatches(path: string, expected: string, label: string, failures: string[]): void {
  try {
    const actual = readFileSync(path, 'utf8');
    if (actual !== expected) {
      failures.push(`${label} is out of date: ${path}`);
    }
  } catch {
    failures.push(`${label} is missing: ${path}`);
  }
}

function formatCounts(seed: SeedCorpus): string {
  return `Counts: categories=${seed.categories.length}, faqItems=${seed.faqItems.length}, evaluationQueries=${seed.evaluationQueries.length}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha1').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  const variantNibble = parseInt(hex[16]!, 16);
  hex[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8).join(''),
    hex.slice(8, 12).join(''),
    hex.slice(12, 16).join(''),
    hex.slice(16, 20).join(''),
    hex.slice(20, 32).join(''),
  ].join('-');
}

main();
