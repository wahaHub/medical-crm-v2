import type { LlmNodeAdapter } from '@medical-crm/application';
import type { FaqItemRecord } from './tool-gateway.js';
import type { FaqWorkerTask } from './worker-task.js';
import {
  buildFaqAnswerPrompt,
  buildFaqPlanPrompt,
  FAQ_ANSWER_PROMPT_VERSION,
  FAQ_PLAN_PROMPT_VERSION,
} from './faq-prompts.js';

export type FaqPlan = {
  category?: string;
  query: string;
  reason: string;
};

export type FaqAnswerResult = {
  answer: string;
  citedFaqIds: string[];
  confidence: 'high' | 'medium' | 'low';
  policyGrounded?: boolean;
};

export interface FaqLlmRunMetadata {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
}

export interface FaqPlanInput {
  task: FaqWorkerTask;
}

export interface FaqAnswerInput {
  task: FaqWorkerTask;
  plan: FaqPlan;
  matches: FaqItemRecord[];
  details: FaqItemRecord[];
}

export interface FaqLlmAdapterOptions {
  plan?: LlmNodeAdapter<FaqPlanInput, unknown>;
  answer?: LlmNodeAdapter<FaqAnswerInput, unknown>;
}

export class FaqLlmAdapter {
  readonly planPromptVersion: string;
  readonly answerPromptVersion: string;
  private lastPlanRunMetadata: FaqLlmRunMetadata | null = null;
  private lastAnswerRunMetadata: FaqLlmRunMetadata | null = null;

  constructor(private readonly options: FaqLlmAdapterOptions = {}) {
    this.planPromptVersion = options.plan?.promptVersion ?? FAQ_PLAN_PROMPT_VERSION;
    this.answerPromptVersion = options.answer?.promptVersion ?? FAQ_ANSWER_PROMPT_VERSION;
  }

  async plan(input: FaqPlanInput): Promise<FaqPlan> {
    buildFaqPlanPrompt(input);
    const fallback = buildFallbackFaqPlan(input);
    const metadataBase = {
      nodePromptVersion: this.planPromptVersion,
      nodeModel: this.options.plan?.model,
    } satisfies FaqLlmRunMetadata;

    if (!this.options.plan) {
      this.lastPlanRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }

    try {
      const raw = await this.options.plan.run(input);
      const sanitized = sanitizeFaqPlan(raw, fallback);
      this.lastPlanRunMetadata = {
        ...metadataBase,
        fallbackUsed: sanitized.fallbackUsed,
        schemaValidationFailed: sanitized.schemaValidationFailed,
      };
      return sanitized.plan;
    } catch {
      this.lastPlanRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }
  }

  async answer(input: FaqAnswerInput): Promise<FaqAnswerResult> {
    buildFaqAnswerPrompt(input);
    const fallback = composeFallbackFaqAnswer(
      input.matches,
      input.details,
      input.task.latestUserMessage,
      input.task,
    );
    const metadataBase = {
      nodePromptVersion: this.answerPromptVersion,
      nodeModel: this.options.answer?.model,
    } satisfies FaqLlmRunMetadata;

    if (!this.options.answer) {
      this.lastAnswerRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }

    try {
      const raw = await this.options.answer.run(input);
      const sanitized = sanitizeFaqAnswerResult(raw, fallback);
      this.lastAnswerRunMetadata = {
        ...metadataBase,
        fallbackUsed: sanitized.fallbackUsed,
        schemaValidationFailed: sanitized.schemaValidationFailed,
      };
      return sanitized.answer;
    } catch {
      this.lastAnswerRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }
  }

  getLastRunMetadata(): FaqLlmRunMetadata | null {
    const answerMetadata = this.lastAnswerRunMetadata;
    const planMetadata = this.lastPlanRunMetadata;
    if (!answerMetadata && !planMetadata) {
      return null;
    }

    return {
      nodePromptVersion: answerMetadata?.nodePromptVersion ?? planMetadata?.nodePromptVersion,
      nodeModel: answerMetadata?.nodeModel ?? planMetadata?.nodeModel,
      fallbackUsed: Boolean(answerMetadata?.fallbackUsed || planMetadata?.fallbackUsed),
      schemaValidationFailed: Boolean(
        answerMetadata?.schemaValidationFailed || planMetadata?.schemaValidationFailed,
      ),
    };
  }
}

export function composeFallbackFaqAnswer(
  matches: FaqItemRecord[],
  details: FaqItemRecord[],
  latestUserMessage: string,
  task?: FaqWorkerTask,
): FaqAnswerResult {
  const redirectFallback = composeRedirectFallbackAnswer(task);
  if (redirectFallback) {
    return redirectFallback;
  }

  const sourceItems = details.length > 0 ? details : matches;
  const citedFaqIds = dedupeFaqIds(sourceItems.map((item) => item.id)).slice(0, 3);

  if (sourceItems.length === 0) {
    const skillFallback = composeSkillGroundedFallbackAnswer(task);
    if (skillFallback) {
      return skillFallback;
    }

    return {
      answer: `I can help with that, but I could not find an exact FAQ answer yet for "${clampText(latestUserMessage, 120)}".`,
      citedFaqIds: [],
      confidence: 'low',
    };
  }

  if (sourceItems.length === 1) {
    const firstItem = sourceItems[0];
    if (!firstItem) {
      return {
        answer: `I can help with that, but I could not find an exact FAQ answer yet for "${clampText(latestUserMessage, 120)}".`,
        citedFaqIds: [],
        confidence: 'low',
      };
    }

    return {
      answer: `I can help with that. ${firstItem.answer}`,
      citedFaqIds,
      confidence: 'medium',
    };
  }

  const summaries = sourceItems
    .slice(0, 2)
    .map((item) => `${item.question}: ${item.answer}`);

  return {
    answer: `I can help with that. Here are the closest FAQ answers: ${summaries.join(' ')}`,
    citedFaqIds,
    confidence: 'medium',
  };
}

function composeRedirectFallbackAnswer(task: FaqWorkerTask | undefined): FaqAnswerResult | null {
  if (!task?.responseMode || task.responseMode === 'standard') {
    return null;
  }

  if (task.responseMode === 'safe_medical_redirect') {
    const contextualAnswer = composeContextualMedicalSafetyAnswer(task);
    if (contextualAnswer) {
      return {
        answer: contextualAnswer,
        citedFaqIds: [],
        confidence: 'medium',
        policyGrounded: true,
      };
    }

    return {
      answer: [
        'I cannot confirm a diagnosis in chat, but I can still help you think about the safe next step.',
        'If the symptom is sudden, worsening, severe, or involves weakness, chest pressure, breathing trouble, fainting, uncontrolled bleeding, or other red flags, seek local urgent or emergency care first.',
        'For non-emergency cases, Medora can help organize your records and arrange an online consultation or doctor review in China.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  if (task.responseMode === 'out_of_scope_redirect') {
    return {
      answer: [
        'That request is outside Medora\'s current medical travel support scope.',
        'Medora mainly helps international patients with doctor matching in China, medical record preparation, online consultation, hospital coordination, and treatment-related travel support.',
        'If your goal is care in China, I can help explain the next medical step.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  return {
    answer: 'That is completely okay. Medora can continue from the current step whenever you are ready, or I can explain the cost, records, or contact options more clearly.',
    citedFaqIds: [],
    confidence: 'medium',
    policyGrounded: true,
  };
}

function composeSkillGroundedFallbackAnswer(task: FaqWorkerTask | undefined): FaqAnswerResult | null {
  if (!task) {
    return null;
  }

  const skillIds = new Set((task.loadedSkillSections ?? []).map((section) => section.skillId));
  const actionTarget = task.primaryAction && 'target' in task.primaryAction ? task.primaryAction.target : undefined;
  const normalized = task.latestUserMessage.toLowerCase();

  if (skillIds.has('pricing_skill') || actionTarget === 'pricing') {
    return {
      answer: [
        'Pricing depends on the records, hospital choice, doctor review, tests, and final treatment plan, so Medora should not give a fixed total before review.',
        'The online consultation is USD 400; if you do not come to China, Medora keeps that fee, and if you do come for treatment, it is applied toward the treatment cost.',
        'Public hospital cases usually have lower hospital medical fees but require a Medora coordination service fee confirmed by a human; private hospital contact has no Medora coordination service fee.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  if (skillIds.has('payment_skill') || actionTarget === 'payment') {
    return {
      answer: [
        'Payment details depend on the hospital and service arrangement.',
        'Hospital medical fees follow hospital rules, while Medora fees such as the USD 400 online consultation or public-hospital coordination fee follow the Medora service flow.',
        'For insurer coverage, direct billing, reimbursement, or claim approval, please confirm with your insurer; Medora can help organize neutral hospital documents and ask the hospital about applicable medical liability insurance.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  if (skillIds.has('travel_skill') || actionTarget === 'travel') {
    return {
      answer: [
        'Medora can support treatment-related logistics such as appointment itinerary, airport pickup, local transport, hotels near the hospital, interpretation, and practical stay coordination.',
        'The medical path should come first: records review, online consultation, and hospital direction are usually needed before final flights, hotel booking, or fixed itinerary planning.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  if (skillIds.has('policy_skill') || actionTarget === 'policy' || actionTarget === 'consult') {
    return {
      answer: [
        'The usual Medora path is to clarify the condition, collect the most useful records or summary, arrange the required online consultation before coming to China, and then coordinate hospital, appointment, travel, treatment, and follow-up steps as appropriate.',
        'The online consultation costs USD 400 and is applied toward treatment cost if you come to China for treatment.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  if (skillIds.has('hospital_skill') || actionTarget === 'hospital' || /\bdoctor|hospital|clinic|department\b/.test(normalized)) {
    const earlyNervePainDoctorQuestion = /\b(?:nerve|burning|electric|numb|numbness|tingling|sciatica|leg|thigh|foot|feet)\b/.test(normalized)
      && /\b(?:doctor|department|specialist|ortho|neuro|bone)\b/.test(normalized);
    if (earlyNervePainDoctorQuestion) {
      return {
        answer: [
          'For burning, electric, or numb leg pain, the relevant direction is often a spine, neurology, pain, or rehabilitation evaluation rather than choosing only by “bone” versus “nerve” in chat.',
          'For a specific doctor recommendation, please share any relevant records first; if you do not have records yet, a short symptom summary is enough to start and our human team can review before matching a suitable doctor.',
        ].join(' '),
        citedFaqIds: [],
        confidence: 'medium',
        policyGrounded: true,
      };
    }

    return {
      answer: [
        'Medora can help match hospitals based on your condition, city, public/private preference, records readiness, timing, and follow-up needs.',
        'For a specific doctor recommendation, please share relevant medical records first; our human team reviews the case before recommending a suitable doctor.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  if (skillIds.has('treatment_skill') || actionTarget === 'treatment') {
    return {
      answer: [
        'Medora can help assess the treatment path by organizing your diagnosis or suspected condition, main symptoms, prior tests or treatments, and useful records.',
        'Before coming to China, the standard next step is an online consultation so a Chinese specialist can review whether travel and in-person treatment are worthwhile.',
      ].join(' '),
      citedFaqIds: [],
      confidence: 'medium',
      policyGrounded: true,
    };
  }

  return null;
}

function composeContextualMedicalSafetyAnswer(task: FaqWorkerTask): string | null {
  const normalized = buildMedicalSafetyContext(task);

  if (/\b(?:chest (?:pain|pressure|tightness|heaviness)|pressure on (?:my |the )?chest|heavy stone|shortness of breath|breathing trouble|trouble breathing|cannot breathe|can't breathe|breathless)\b/.test(normalized)) {
    return [
      'Chest pressure can be urgent even if it comes and goes or you feel okay now.',
      'If it is new, happens with exertion, lasts several minutes, comes with shortness of breath, sweating, faintness, pain spreading to arm/jaw/back, or returns today, please seek local urgent or emergency care first.',
      'After immediate safety is handled, Medora can help arrange specialist review or follow-up in China.',
    ].join(' ');
  }

  if (/\b(face|facial|mouth|stroke|one side|hand tingles|hand tingling|speak|talk)\b/.test(normalized)) {
    return [
      'One-sided facial numbness or new neurologic symptoms should be treated carefully.',
      'If this is new since last night/today, worsening, or comes with face droop, arm weakness, speech trouble, severe headache, confusion, or vision changes, please seek local emergency care now rather than waiting for a routine appointment.',
      'Medora can still help with neurology follow-up or second opinion after urgent issues are ruled out.',
    ].join(' ');
  }

  if (/\b(leukemia|leukaemia|blood cancer|bruise|bruises|bruising|gum bleed|gum bleeds|gum bleeding)\b/.test(normalized)) {
    if (/\bgum bleed|gum bleeds|gum bleeding|bleeds when brushing|bleeding when brushing\b/.test(normalized)) {
      return [
        'Gum bleeding only when brushing can come from dental or gum irritation, but I cannot confirm the cause in chat.',
        'More serious bleeding means bleeding does not stop with pressure, repeated nose/gum bleeding without brushing, blood in urine/stool/vomit, many rapidly spreading bruises, faintness, severe weakness, shortness of breath, persistent fever, or feeling acutely unwell.',
        'If those are not present, this is usually more suitable for a prompt appointment and basic review such as CBC and clotting-related tests rather than automatically an emergency; Medora can help arrange specialist review in China if you want.',
      ].join(' ');
    }

    return [
      'I cannot diagnose leukemia or blood cancer in chat.',
      'For a few stable bruises without heavy or unstoppable bleeding, fainting, severe weakness, shortness of breath, persistent fever, or rapidly spreading bruises, it is usually more appropriate to arrange a prompt doctor appointment and basic blood tests such as CBC rather than automatically going to emergency.',
      'If bruising is rapidly increasing, bleeding does not stop, you feel very weak or faint, or you have fever or other severe symptoms, seek local urgent or emergency care first; Medora can help with records-based review or specialist consultation after immediate safety is handled.',
    ].join(' ');
  }

  if (/\b(?:black stool|bloody stool|blood in (?:stool|vomit|urine)|rectal bleeding|vomiting blood|right lower (?:abdomen|abdominal)|abdominal pain|severe abdominal|uncontrolled bleeding|heavy bleeding)\b/.test(normalized)) {
    return [
      'I cannot diagnose this in chat, but these details can matter for urgency.',
      'Please seek local urgent care promptly if there is black or bloody stool not clearly explained by iron, worsening abdominal pain, persistent fever, faintness, severe weakness, or uncontrolled bleeding.',
      'If it is stable, Medora can help arrange records-based review, screening, or the right specialist consultation in China.',
    ].join(' ');
  }

  if (/\b(department|specialty|specialist|ortho|neuro|oncology|respiratory|gynecology|fertility|rheumatology|ent)\b/.test(normalized)) {
    return [
      'I cannot make the final clinical routing decision in chat, but I can help narrow the likely direction.',
      'Department choice usually depends on the main symptom, duration, red flags, and any reports or prior diagnosis.',
      'Medora can review your summary or records and help match the right hospital or specialist team.',
    ].join(' ');
  }

  return null;
}

function buildMedicalSafetyContext(task: FaqWorkerTask): string {
  const recentUserMessages = (task.recentMessages ?? [])
    .filter((message) => message.role === 'USER')
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0);
  return [...recentUserMessages, task.latestUserMessage].join(' ').toLowerCase();
}

function buildFallbackFaqPlan(input: FaqPlanInput): FaqPlan {
  const latestUserMessage = normalizeString(input.task.latestUserMessage);
  return {
    query: latestUserMessage ?? 'faq question',
    reason: 'fallback faq plan derived from latest user message',
  };
}

function sanitizeFaqPlan(
  raw: unknown,
  fallback: FaqPlan,
): {
  plan: FaqPlan;
  fallbackUsed: boolean;
  schemaValidationFailed: boolean;
} {
  const record = asRecord(raw);
  const normalizedQuery = normalizeString(record.query);
  const normalizedReason = normalizeString(record.reason);
  const category = normalizeString(record.category) ?? undefined;
  const query = normalizedQuery ?? fallback.query;
  const reason = normalizedReason ?? fallback.reason;
  const fallbackUsed = normalizedQuery === null || normalizedReason === null;

  return {
    plan: {
      ...(category ? { category } : {}),
      query,
      reason,
    },
    fallbackUsed,
    schemaValidationFailed: fallbackUsed,
  };
}

function sanitizeFaqAnswerResult(
  raw: unknown,
  fallback: FaqAnswerResult,
): {
  answer: FaqAnswerResult;
  fallbackUsed: boolean;
  schemaValidationFailed: boolean;
} {
  const record = asRecord(raw);
  if (fallback.policyGrounded === true) {
    return {
      answer: fallback,
      fallbackUsed: true,
      schemaValidationFailed: true,
    };
  }

  const normalizedAnswer = normalizeString(record.answer);
  const answer = normalizedAnswer ?? fallback.answer;
  const citedFaqIds = sanitizeFaqIds(record.citedFaqIds);
  const normalizedConfidence = normalizeConfidence(record.confidence);
  const confidence = normalizedConfidence ?? fallback.confidence;
  const normalizedIds = citedFaqIds.length > 0 ? citedFaqIds : fallback.citedFaqIds;
  const hasInvalidFaqIds = hasInvalidCitedFaqIds(record.citedFaqIds);
  const fallbackUsed = normalizedAnswer === null || normalizedConfidence === null || hasInvalidFaqIds;

  return {
    answer: {
      answer,
      citedFaqIds: normalizedIds,
      confidence,
    },
    fallbackUsed,
    schemaValidationFailed: fallbackUsed,
  };
}

function hasInvalidCitedFaqIds(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }

  if (!Array.isArray(value)) {
    return true;
  }

  return value.some((candidate) => typeof candidate !== 'string' || candidate.trim().length === 0);
}

function sanitizeFaqIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeFaqIds(
    value
      .filter((candidate): candidate is string => typeof candidate === 'string')
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0),
  );
}

function dedupeFaqIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function normalizeConfidence(value: unknown): FaqAnswerResult['confidence'] | null {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? clampText(trimmed, 240) : null;
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
