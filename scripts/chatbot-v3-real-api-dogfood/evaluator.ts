import type {
  DogfoodAttemptSummary,
  DogfoodFailureCategory,
  DogfoodFailurePhase,
  RunRollup,
  ScenarioOutcome,
  TurnTranscript,
} from './types.ts';

export type DogfoodAxisOutcome = 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';

export interface DogfoodAxisEvaluation {
  result: DogfoodAxisOutcome;
  reason?: string;
}

const AXIS_ORDER = ['accessDecision', 'journey', 'response', 'continuity'] as const;
type DogfoodAxis = (typeof AXIS_ORDER)[number];

type DogfoodScenarioEvaluationAxes = Record<DogfoodAxis, DogfoodAxisEvaluation>;

export interface DogfoodScenarioEvaluationInput extends DogfoodScenarioEvaluationAxes {
  scenarioId: string;
}

export interface DogfoodEvaluatedAxis {
  axis: DogfoodAxis;
  result: DogfoodAxisOutcome;
  reason: string | null;
}

export interface DogfoodScenarioEvaluationOutcome {
  scenarioId: string;
  outcome: DogfoodAxisOutcome;
  reason: string;
  axisResults: DogfoodEvaluatedAxis[];
}

export interface DogfoodRunRollup {
  outcome: DogfoodAxisOutcome;
  scenarioOutcomes: DogfoodScenarioEvaluationOutcome[];
}

export interface BuildClassifiedScenarioOutcomeInput {
  scenarioId: string;
  outcome?: DogfoodAxisOutcome;
  summary: string;
  failureCategory?: DogfoodFailureCategory;
  failedPhase?: DogfoodFailurePhase;
  usableForControlPlaneJudgment?: boolean;
  bootstrapAttempts?: DogfoodAttemptSummary[];
  chatAttempts?: DogfoodAttemptSummary[];
  sessionId?: string | null;
  turns?: TurnTranscript[];
  notes?: string[];
}

interface BaseClassifiedFailureInput {
  scenarioId: string;
  summary: string;
  bootstrapAttempts?: DogfoodAttemptSummary[];
  chatAttempts?: DogfoodAttemptSummary[];
  sessionId?: string | null;
  turns?: TurnTranscript[];
  notes?: string[];
}

export type EvaluationAxisInput = Pick<DogfoodAxisEvaluation, 'result' | 'reason'>;

export interface ClassifyChatFailureOutcomeInput extends BaseClassifiedFailureInput {
  status: number;
}

export interface ClassifyEvaluationOutcomeInput extends BaseClassifiedFailureInput {
  journey: EvaluationAxisInput;
  response: EvaluationAxisInput;
  continuity: EvaluationAxisInput;
  responseFailureCategory?: ResponseEvaluationFailureCategory;
}

export type ResponseEvaluationFailureCategory =
  | 'agent_contract'
  | 'skill_behavior'
  | 'skill_routing'
  | 'response_quality';

export interface RuntimeResponseQualityEvaluation {
  response: DogfoodAxisEvaluation;
  failureCategory?: ResponseEvaluationFailureCategory;
}

interface RuntimeResponseDebugPayload {
  responseContract?: unknown;
  loadedSkillSections?: unknown;
  minimalContractChecks?: unknown;
  skillBehaviorChecks?: unknown;
  llmJudgeSummary?: unknown;
}

interface ReportedQualityCheck {
  evaluator?: unknown;
  severity?: unknown;
  result?: unknown;
  reason?: unknown;
  label?: unknown;
  details?: unknown;
}

interface RuntimeLoadedSkillSection {
  skillId?: unknown;
  sectionIds?: unknown;
  reasonCode?: unknown;
  handlingGuidance?: unknown;
  policyText?: unknown;
}

interface MinimalResponseContract {
  constraints?: {
    maxQuestions?: unknown;
    avoidMultipleCTAs?: unknown;
    answerBeforeAsk?: unknown;
    preservePrimaryStage?: unknown;
  };
  forbiddenClaims?: unknown;
}

function normalizeAxisEvaluation(
  axis: DogfoodAxis,
  evaluation: DogfoodAxisEvaluation,
): DogfoodEvaluatedAxis {
  if (evaluation.result === 'PASS') {
    return {
      axis,
      result: 'PASS',
      reason: null,
    };
  }

  const reason = evaluation.reason?.trim();
  if (!reason) {
    throw new Error(`Dogfood evaluator requires a reason for ${axis} ${evaluation.result}.`);
  }

  return {
    axis,
    result: evaluation.result,
    reason,
  };
}

export function evaluateScenarioOutcome(
  input: DogfoodScenarioEvaluationInput,
): DogfoodScenarioEvaluationOutcome {
  const axisResults = AXIS_ORDER.map((axis) =>
    normalizeAxisEvaluation(axis, input[axis]),
  );

  const hardFailure = axisResults.find((axisResult) => axisResult.result === 'HARD_FAIL');
  if (hardFailure) {
    return {
      scenarioId: input.scenarioId,
      outcome: 'HARD_FAIL',
      reason: `${hardFailure.axis}: ${hardFailure.reason}`,
      axisResults,
    };
  }

  const softFailure = axisResults.find((axisResult) => axisResult.result === 'SOFT_FAIL');
  if (softFailure) {
    return {
      scenarioId: input.scenarioId,
      outcome: 'SOFT_FAIL',
      reason: `${softFailure.axis}: ${softFailure.reason}`,
      axisResults,
    };
  }

  return {
    scenarioId: input.scenarioId,
    outcome: 'PASS',
    reason: 'all four axes passed',
    axisResults,
  };
}

export function defaultOutcomeForFailureCategory(category: DogfoodFailureCategory): DogfoodAxisOutcome {
  return category === 'response_quality' ? 'SOFT_FAIL' : 'HARD_FAIL';
}

export function buildClassifiedScenarioOutcome(input: BuildClassifiedScenarioOutcomeInput): ScenarioOutcome {
  const outcome = input.outcome ?? (input.failureCategory ? defaultOutcomeForFailureCategory(input.failureCategory) : 'PASS');

  if (outcome !== 'PASS') {
    if (!input.failureCategory) {
      throw new Error('Dogfood non-PASS scenario outcomes require failureCategory before serialization.');
    }

    if (!input.failedPhase) {
      throw new Error('Dogfood non-PASS scenario outcomes require failedPhase before serialization.');
    }

    if (typeof input.usableForControlPlaneJudgment !== 'boolean') {
      throw new Error('Dogfood non-PASS scenario outcomes require usableForControlPlaneJudgment before serialization.');
    }
  }

  return {
    scenarioId: input.scenarioId,
    outcome,
    summary: input.summary,
    ...(input.failureCategory ? { failureCategory: input.failureCategory } : {}),
    ...(input.failedPhase ? { failedPhase: input.failedPhase } : {}),
    usableForControlPlaneJudgment: input.usableForControlPlaneJudgment ?? outcome === 'PASS',
    bootstrapAttempts: [...(input.bootstrapAttempts ?? [])],
    chatAttempts: [...(input.chatAttempts ?? [])],
    sessionId: input.sessionId ?? null,
    turns: [...(input.turns ?? [])],
    notes: [...(input.notes ?? [])],
  };
}

export function classifyEnvironmentFailureOutcome(input: BaseClassifiedFailureInput): ScenarioOutcome {
  return buildClassifiedScenarioOutcome({
    ...input,
    failureCategory: 'environment',
    failedPhase: 'preflight',
    usableForControlPlaneJudgment: false,
  });
}

export function classifyBootstrapFailureOutcome(input: BaseClassifiedFailureInput): ScenarioOutcome {
  return buildClassifiedScenarioOutcome({
    ...input,
    failureCategory: 'bootstrap',
    failedPhase: 'bootstrap',
    usableForControlPlaneJudgment: false,
  });
}

export function classifyChatFailureOutcome(input: ClassifyChatFailureOutcomeInput): ScenarioOutcome {
  if (input.status === 0) {
    return buildClassifiedScenarioOutcome({
      ...input,
      failureCategory: 'transport',
      failedPhase: 'chat',
      usableForControlPlaneJudgment: false,
    });
  }

  if (input.status >= 400) {
    return buildClassifiedScenarioOutcome({
      ...input,
      failureCategory: 'transport',
      failedPhase: 'chat',
      usableForControlPlaneJudgment: false,
    });
  }

  throw new Error(`Chat failure classification requires status 0 or >=400, got ${input.status}.`);
}

export function classifyEvaluationOutcome(input: ClassifyEvaluationOutcomeInput): ScenarioOutcome {
  const evaluated = evaluateScenarioOutcome({
    scenarioId: input.scenarioId,
    accessDecision: { result: 'PASS' },
    journey: input.journey,
    response: input.response,
    continuity: input.continuity,
  });

  if (evaluated.outcome === 'PASS') {
    return buildClassifiedScenarioOutcome({
      ...input,
      outcome: 'PASS',
      summary: evaluated.reason,
    });
  }

  let failureCategory: DogfoodFailureCategory;
  let outcome: DogfoodAxisOutcome = evaluated.outcome;

  if (input.journey.result !== 'PASS') {
    failureCategory = 'read_planning';
  } else if (input.continuity.result !== 'PASS') {
    failureCategory = 'control_plane';
  } else if (input.responseFailureCategory) {
    failureCategory = input.responseFailureCategory;
    outcome = defaultOutcomeForFailureCategory(failureCategory);
  } else {
    const responseReason = input.response.reason?.toLowerCase() ?? '';
    if (input.response.result === 'HARD_FAIL') {
      if (responseReason.includes('contract')) {
        failureCategory = 'agent_contract';
      } else if (responseReason.includes('skill behavior')) {
        failureCategory = 'skill_behavior';
      } else if (responseReason.includes('skill routing')) {
        failureCategory = 'skill_routing';
      } else {
        throw new Error(
          'Dogfood hard response failures require an explicit failure category or a known deterministic marker.',
        );
      }
    } else {
      failureCategory = 'response_quality';
      outcome = 'SOFT_FAIL';
    }
  }

  return buildClassifiedScenarioOutcome({
    ...input,
    outcome,
    summary: input.summary || evaluated.reason,
    failureCategory,
    failedPhase: 'evaluation',
    usableForControlPlaneJudgment: true,
  });
}

export function rollupRunOutcome(
  scenarioOutcomes: DogfoodScenarioEvaluationOutcome[],
): DogfoodRunRollup {
  const hasHardFail = scenarioOutcomes.some((scenarioOutcome) => scenarioOutcome.outcome === 'HARD_FAIL');
  if (hasHardFail) {
    return {
      outcome: 'HARD_FAIL',
      scenarioOutcomes,
    };
  }

  const hasSoftFail = scenarioOutcomes.some((scenarioOutcome) => scenarioOutcome.outcome === 'SOFT_FAIL');
  if (hasSoftFail) {
    return {
      outcome: 'SOFT_FAIL',
      scenarioOutcomes,
    };
  }

  return {
    outcome: 'PASS',
    scenarioOutcomes,
  };
}

export function evaluateResponseQualityFromRuntime(
  turns: TurnTranscript[],
): RuntimeResponseQualityEvaluation {
  let firstSoftFailure: RuntimeResponseQualityEvaluation | null = null;

  for (const turn of turns) {
    if (turn.response.status <= 0 || turn.response.status >= 400) {
      continue;
    }

    const evaluation = evaluateSuccessfulTurnResponseQuality(turn);
    if (evaluation.response.result === 'HARD_FAIL') {
      return evaluation;
    }

    if (evaluation.response.result === 'SOFT_FAIL' && !firstSoftFailure) {
      firstSoftFailure = evaluation;
    }
  }

  return firstSoftFailure ?? {
    response: { result: 'PASS' },
  };
}

function evaluateSuccessfulTurnResponseQuality(
  turn: TurnTranscript,
): RuntimeResponseQualityEvaluation {
  const responseText = extractAssistantResponseText(turn);
  const debug = extractRuntimeResponseDebug(turn);

  const reportedContractFailure = findReportedDeterministicFailure(
    debug?.minimalContractChecks,
    'agent_contract',
  );
  if (reportedContractFailure) {
    return reportedContractFailure;
  }

  const localContractFailure = findLocalMinimalContractFailure(responseText, debug?.responseContract);
  if (localContractFailure) {
    return localContractFailure;
  }

  const reportedSkillBehaviorFailure = findReportedDeterministicFailure(
    debug?.skillBehaviorChecks,
    'skill_behavior',
  );
  if (reportedSkillBehaviorFailure) {
    return reportedSkillBehaviorFailure;
  }

  const localSkillBehaviorFailure = findLocalSkillBehaviorFailure(responseText, debug?.loadedSkillSections);
  if (localSkillBehaviorFailure) {
    return localSkillBehaviorFailure;
  }

  const llmJudgeIssue = findLlmJudgeIssue(debug?.llmJudgeSummary);
  if (llmJudgeIssue) {
    return llmJudgeIssue;
  }

  if (!responseText) {
    return {
      response: {
        result: 'SOFT_FAIL',
        reason: 'Assistant response text missing from successful chat turn.',
      },
      failureCategory: 'response_quality',
    };
  }

  return {
    response: { result: 'PASS' },
  };
}

function extractRuntimeResponseDebug(turn: TurnTranscript): RuntimeResponseDebugPayload | null {
  const body = turn.response.body;
  if (!body || typeof body !== 'object') {
    return null;
  }

  const debug = (body as { runtimeDebug?: unknown }).runtimeDebug;
  return debug && typeof debug === 'object' ? debug as RuntimeResponseDebugPayload : null;
}

function extractAssistantResponseText(turn: TurnTranscript): string {
  const body = turn.response.body;
  if (body && typeof body === 'object') {
    const messages = (body as { messages?: unknown }).messages;
    if (Array.isArray(messages)) {
      const text = messages
        .map((message) => {
          if (!message || typeof message !== 'object') {
            return null;
          }

          const role = (message as { role?: unknown }).role;
          const entryText = (message as { text?: unknown }).text;
          if (role !== 'assistant' || typeof entryText !== 'string') {
            return null;
          }

          const trimmed = entryText.trim();
          return trimmed ? trimmed : null;
        })
        .filter((entry): entry is string => entry !== null)
        .join('\n')
        .trim();

      if (text) {
        return text;
      }
    }
  }

  return turn.response.bodyText?.trim() ?? '';
}

function findReportedDeterministicFailure(
  checks: unknown,
  failureCategory: Extract<ResponseEvaluationFailureCategory, 'agent_contract' | 'skill_behavior'>,
): RuntimeResponseQualityEvaluation | null {
  if (!Array.isArray(checks)) {
    return null;
  }

  for (const check of checks as ReportedQualityCheck[]) {
    if (!check || typeof check !== 'object') {
      continue;
    }

    if (check.evaluator !== 'deterministic' || check.result !== 'fail' || check.severity !== 'hard') {
      continue;
    }

    const reason = normalizeReportedCheckReason(check);
    if (!reason) {
      continue;
    }

    return {
      response: {
        result: 'HARD_FAIL',
        reason,
      },
      failureCategory,
    };
  }

  return null;
}

function normalizeReportedCheckReason(check: ReportedQualityCheck): string | null {
  if (typeof check.reason === 'string' && check.reason.trim()) {
    return check.reason.trim();
  }

  const label = typeof check.label === 'string' ? check.label.trim() : '';
  const details = typeof check.details === 'string' ? check.details.trim() : '';
  if (!label && !details) {
    return null;
  }

  return [label, details].filter(Boolean).join(': ');
}

function findLocalMinimalContractFailure(
  responseText: string,
  responseContract: unknown,
): RuntimeResponseQualityEvaluation | null {
  if (!responseContract || typeof responseContract !== 'object') {
    return null;
  }

  const normalizedContract = responseContract as MinimalResponseContract;
  const maxQuestions = Number(normalizedContract.constraints?.maxQuestions);
  if (Number.isFinite(maxQuestions)) {
    const questionCount = countQuestions(responseText);
    if (questionCount > maxQuestions) {
      return {
        response: {
          result: 'HARD_FAIL',
          reason: `Found ${questionCount} questions; maximum is ${maxQuestions}.`,
        },
        failureCategory: 'agent_contract',
      };
    }
  }

  if (normalizedContract.constraints?.answerBeforeAsk === true && startsWithAsk(responseText)) {
    return {
      response: {
        result: 'HARD_FAIL',
        reason: 'Response appears to ask for an action before giving the answer.',
      },
      failureCategory: 'agent_contract',
    };
  }

  if (normalizedContract.constraints?.avoidMultipleCTAs === true) {
    const ctaCount = countCtaAsks(responseText);
    if (ctaCount > 1) {
      return {
        response: {
          result: 'HARD_FAIL',
          reason: `Found ${ctaCount} CTA-like asks while avoidMultipleCTAs is enabled.`,
        },
        failureCategory: 'agent_contract',
      };
    }
  }

  for (const forbiddenClaim of asStringArray(normalizedContract.forbiddenClaims)) {
    if (containsPhrase(responseText, forbiddenClaim)) {
      return {
        response: {
          result: 'HARD_FAIL',
          reason: `Response contains forbidden claim: ${forbiddenClaim}`,
        },
        failureCategory: 'agent_contract',
      };
    }
  }

  if (normalizedContract.constraints?.preservePrimaryStage === true && hasStageMutationLanguage(responseText)) {
    return {
      response: {
        result: 'HARD_FAIL',
        reason: 'Response claims the user was moved to another journey stage while the primary stage should be preserved.',
      },
      failureCategory: 'agent_contract',
    };
  }

  return null;
}

function findLocalSkillBehaviorFailure(
  responseText: string,
  loadedSkillSections: unknown,
): RuntimeResponseQualityEvaluation | null {
  if (!Array.isArray(loadedSkillSections)) {
    return null;
  }

  for (const section of loadedSkillSections as RuntimeLoadedSkillSection[]) {
    const skillId = typeof section.skillId === 'string' ? section.skillId : null;
    if (!skillId) {
      continue;
    }

    const reason = findSkillBehaviorFailureReason(responseText, section, skillId);
    if (!reason) {
      continue;
    }

    return {
      response: {
        result: 'HARD_FAIL',
        reason,
      },
      failureCategory: 'skill_behavior',
    };
  }

  return null;
}

function findSkillBehaviorFailureReason(
  responseText: string,
  section: RuntimeLoadedSkillSection,
  skillId: string,
): string | null {
  switch (skillId) {
    case 'pricing_skill':
      return hasUnsupportedFixedPrice(responseText)
        ? 'Response appears to promise a guaranteed or fixed total price.'
        : null;
    case 'documents_skill':
      return isRejectionOrHesitationSection(section) && pressuresDocumentUpload(responseText)
        ? 'Response pressures the user to upload after rejection or hesitation.'
        : null;
    case 'safety_scope_skill':
      if (hasDiagnosisClaim(responseText)) {
        return 'Response appears to diagnose the user.';
      }
      if (hasMedicationRecommendation(responseText)) {
        return 'Response appears to recommend medication.';
      }
      if (hasOutcomeGuarantee(responseText)) {
        return 'Response appears to guarantee a medical outcome.';
      }
      return null;
    case 'human_handoff_skill':
      return hasUnsupportedHandoffPromise(responseText)
        ? 'Response appears to promise unsupported human handoff timing or guarantees.'
        : null;
    default:
      return null;
  }
}

function findLlmJudgeIssue(llmJudgeSummary: unknown): RuntimeResponseQualityEvaluation | null {
  if (!llmJudgeSummary || typeof llmJudgeSummary !== 'object') {
    return null;
  }

  const status = (llmJudgeSummary as { status?: unknown }).status;
  const summary = (llmJudgeSummary as { summary?: unknown }).summary;
  if ((status === 'warn' || status === 'fail') && typeof summary === 'string' && summary.trim()) {
    return {
      response: {
        result: 'SOFT_FAIL',
        reason: `LLM judge ${status}: ${summary.trim()}`,
      },
      failureCategory: 'response_quality',
    };
  }

  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function countQuestions(responseText: string): number {
  return (responseText.match(/[?\uFF1F]/g) ?? []).length;
}

function countCtaAsks(responseText: string): number {
  const normalized = normalize(responseText);
  const ctaPatterns = [
    /\bplease\s+(upload|send|share|book|schedule|call|contact|complete|provide|answer)\b[^.!?]*/g,
    /\b(upload|send|share|book|schedule|call|contact|complete|provide|answer)\b[^.!?]{0,40}\b(now|today|next|when you can)\b/g,
    /\bwould you like to\b[^.!?]*/g,
    /\bcan you\s+(upload|send|share|book|schedule|complete|provide|answer)\b[^.!?]*/g,
  ];

  const spans = ctaPatterns.flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  })));

  const distinctSpans: typeof spans = [];
  for (const span of spans.sort((left, right) => left.start - right.start || right.end - left.end)) {
    const overlapsExisting = distinctSpans.some((existing) => span.start < existing.end && span.end > existing.start);
    if (!overlapsExisting) {
      distinctSpans.push(span);
    }
  }

  return distinctSpans.reduce((count, span) => {
    const spanText = normalized.slice(span.start, span.end);
    const actionCount = (spanText.match(/\b(upload|send|share|book|schedule|call|contact|complete|provide|answer)\b/g) ?? []).length;
    return count + Math.max(1, actionCount);
  }, 0);
}

function startsWithAsk(responseText: string): boolean {
  const firstSentence = normalize(responseText).split(/[.!?\uFF01\uFF1F]/u)[0] ?? '';
  return /^please\s+(upload|send|share|book|schedule|call|contact|complete|provide|answer)\b/.test(firstSentence)
    || /^(upload|send|share|book|schedule|call|contact|complete|provide|answer)\b[^.!?]{0,40}\b(now|today|next|when you can)\b/.test(firstSentence)
    || /^(would you like to|can you|could you|please tell me|what|when|where|which|who|how)\b/.test(firstSentence);
}

function containsPhrase(responseText: string, phrase: string): boolean {
  return normalize(responseText).includes(normalize(phrase));
}

function hasStageMutationLanguage(responseText: string): boolean {
  const normalized = normalize(responseText);
  return /\b(we|i)\s+(moved|advanced|progressed|switched|changed)\s+you\s+to\b/.test(normalized)
    || /\b(moved|advanced|progressed|switched|changed)\s+you\s+to\b/.test(normalized)
    || /\byour\s+stage\s+is\s+now\b/.test(normalized)
    || /\byou\s+are\s+now\s+in\s+the\s+[^.!?]{0,40}\bstage\b/.test(normalized);
}

function hasUnsupportedFixedPrice(responseText: string): boolean {
  const normalized = stripPricingUncertaintyDisclaimers(normalize(responseText));

  return /\bfixed\s+price\b/.test(normalized)
    || /\bguaranteed\s+(fixed\s+)?price\b/.test(normalized)
    || /\bwill\s+cost\s+[$\uFFE5]\s?\d[\d,]*(?:\.\d+)?/.test(normalized)
    || /[$\uFFE5]\s?\d[\d,]*(?:\.\d+)?/.test(normalized) && /\b(guaranteed|fixed|flat|package)\b/.test(normalized);
}

function stripPricingUncertaintyDisclaimers(normalized: string): string {
  return normalized
    .replace(/\b(cannot|can not|can't|unable to|not able to)\s+(give|provide|quote|promise)\s+(a\s+)?fixed\s+price\s+before\s+(review|assessment|evaluation)\b/g, ' ')
    .replace(/\b(do\s+not|don't|cannot|can not|can't)\s+(offer|give|provide|quote|promise)\s+(a\s+)?fixed\s+price\b/g, ' ')
    .replace(/\b(this|that|it)\s+is\s+not\s+(a\s+)?fixed\s+price\b/g, ' ')
    .replace(/\b(no|not)\s+(fixed|guaranteed)\s+price\s+(before|until)\s+(review|assessment|evaluation)\b/g, ' ');
}

function isRejectionOrHesitationSection(section: RuntimeLoadedSkillSection): boolean {
  const sectionContext = normalize([
    typeof section.reasonCode === 'string' ? section.reasonCode : '',
    ...asStringArray(section.sectionIds),
    ...asStringArray(section.handlingGuidance),
    ...asStringArray(section.policyText),
  ].join(' '));

  return /\b(reject|rejection|hesitat|objection|without pressure|lower-friction)\b/.test(sectionContext);
}

function pressuresDocumentUpload(responseText: string): boolean {
  const normalized = normalize(responseText);
  return /\bmust\s+upload\s+now\b/.test(normalized)
    || /\byou\s+(need|required|have)\s+to\s+upload\s+now\b/.test(normalized)
    || /\b(upload|send|provide)\s+[^.!?]{0,30}\b(required|mandatory)\b/.test(normalized)
    || /\b(can'?t|cannot|can not|won't|will not)\s+help\s+(unless|until)\s+you\s+upload\b/.test(normalized);
}

function hasDiagnosisClaim(responseText: string): boolean {
  const normalized = normalize(responseText);
  return /\b(this|that|it)\s+is\s+(pneumonia|cancer|diabetes|stroke|infection|tumou?r|heart attack|lymphoma)\b/.test(normalized)
    || /\byou\s+have\s+(pneumonia|cancer|diabetes|stroke|infection|tumou?r|a heart attack|lymphoma)\b/.test(normalized);
}

function hasMedicationRecommendation(responseText: string): boolean {
  const normalized = stripMedicationSafetyDisclaimers(normalize(responseText));
  const medicationOrTreatment = '(?:antibiotics?|insulin|aspirin|ibuprofen|steroids?|opioids?|painkillers?|medication|medicine|treatments?|chemotherapy|chemo)';
  const directAction = `(?:take|start|use|increase|stop|change)\\s+${medicationOrTreatment}`;
  const gerundAction = `(?:taking|starting|using|increasing|stopping|changing)\\s+${medicationOrTreatment}`;

  return new RegExp(`\\b${directAction}\\b`).test(normalized)
    || new RegExp(`\\b(?:should|must|need to|have to)\\s+${directAction}\\b`).test(normalized)
    || new RegExp(`\\b(?:recommend|suggest|advise)\\s+(?:you\\s+)?(?:${directAction}|${gerundAction})\\b`).test(normalized);
}

function stripMedicationSafetyDisclaimers(normalized: string): string {
  return normalized
    .replace(/\b(do not|don't|never)\s+(stop|start|take|use|increase)\s+(antibiotics?|insulin|aspirin|ibuprofen|steroids?|opioids?|painkillers?|medication|medicine)\s+without\s+(your\s+)?(doctor|clinician|physician)\b/g, ' ')
    .replace(/\bask\s+(your\s+)?(doctor|clinician|physician)\s+before\s+(changing|starting|stopping|taking|using|increasing)\s+(treatment|medication|medicine|antibiotics?)\b/g, ' ');
}

function hasOutcomeGuarantee(responseText: string): boolean {
  const normalized = normalize(responseText);
  return /\bguarantee(d)?\s+(a\s+)?(cure|recovery|full recovery|outcome|result)\b/.test(normalized)
    || /\bwill\s+(cure|fully recover|recover completely)\b/.test(normalized);
}

function hasUnsupportedHandoffPromise(responseText: string): boolean {
  const normalized = normalize(responseText);
  return /\bhuman\s+will\s+(call|contact|reply|respond)\s+in\s+\d+\s*(minutes?|mins?|hours?)\b/.test(normalized)
    || /\bguaranteed\s+(callback|call\s*back|response|reply)\b/.test(normalized)
    || /\b(call|contact|reply|respond)\s+within\s+\d+\s*(minutes?|mins?|hours?)\b/.test(normalized);
}

function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function buildClassifiedRunRollup(scenarioOutcomes: ScenarioOutcome[]): RunRollup {
  const hasHardFail = scenarioOutcomes.some((scenarioOutcome) => scenarioOutcome.outcome === 'HARD_FAIL');
  if (hasHardFail) {
    return {
      outcome: 'HARD_FAIL',
      scenarioOutcomes,
    };
  }

  const hasSoftFail = scenarioOutcomes.some((scenarioOutcome) => scenarioOutcome.outcome === 'SOFT_FAIL');
  if (hasSoftFail) {
    return {
      outcome: 'SOFT_FAIL',
      scenarioOutcomes,
    };
  }

  return {
    outcome: 'PASS',
    scenarioOutcomes,
  };
}
