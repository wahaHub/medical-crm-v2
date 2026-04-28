import type {
  LoadedSkillSection,
  PrimaryAction,
  ResponseContract,
  SupervisorEventModifier,
  SupervisorEventTarget,
  SupervisorEventType,
} from '@medical-crm/application';

export type ResponseQualityResult = 'pass' | 'warn' | 'fail';
export type ResponseQualitySeverity = 'hard' | 'soft' | 'observed';

export interface MinimalContractCheck {
  id: 'max_questions' | 'multiple_ctas' | 'forbidden_claim' | 'preserve_stage_language';
  evaluator: 'deterministic';
  severity: ResponseQualitySeverity;
  result: ResponseQualityResult;
  reason?: string;
}

interface DomainSkillRequest {
  sectionHints: {
    eventType: SupervisorEventType;
    target: SupervisorEventTarget;
    modifier: SupervisorEventModifier;
    primaryActionType: PrimaryAction['type'];
  };
}

export interface SkillBehaviorCheck {
  id: string;
  skillId: LoadedSkillSection['skillId'];
  sectionHint: DomainSkillRequest['sectionHints'];
  evaluator: 'deterministic';
  severity: ResponseQualitySeverity;
  result: ResponseQualityResult;
  reason?: string;
}

export interface SkillBehaviorCheckOptions {
  sectionHints?: Partial<Record<LoadedSkillSection['skillId'], DomainSkillRequest['sectionHints']>>;
  candidateHospitalIds?: string[];
  candidateHospitalNames?: string[];
}

export interface MinimalContractCheckOptions {
  preservePrimaryStage?: boolean;
}

type MinimalResponseContract = Pick<ResponseContract, 'forbiddenClaims'> & {
  constraints: Pick<ResponseContract['constraints'], 'maxQuestions' | 'avoidMultipleCTAs'>;
};

export function checkMinimalContract(
  responseText: string,
  responseContract: MinimalResponseContract,
  options: MinimalContractCheckOptions = {},
): MinimalContractCheck[] {
  const checks: MinimalContractCheck[] = [];
  const questionCount = countQuestions(responseText);

  checks.push({
    id: 'max_questions',
    evaluator: 'deterministic',
    severity: questionCount > responseContract.constraints.maxQuestions ? 'hard' : 'observed',
    result: questionCount > responseContract.constraints.maxQuestions ? 'fail' : 'pass',
    ...(questionCount > responseContract.constraints.maxQuestions
      ? { reason: `Found ${questionCount} questions; maximum is ${responseContract.constraints.maxQuestions}.` }
      : {}),
  });

  const ctaCount = countCtaAsks(responseText);
  checks.push({
    id: 'multiple_ctas',
    evaluator: 'deterministic',
    severity: responseContract.constraints.avoidMultipleCTAs && ctaCount > 1 ? 'hard' : 'observed',
    result: responseContract.constraints.avoidMultipleCTAs && ctaCount > 1 ? 'fail' : 'pass',
    ...(responseContract.constraints.avoidMultipleCTAs && ctaCount > 1
      ? { reason: `Found ${ctaCount} CTA-like asks while avoidMultipleCTAs is enabled.` }
      : {}),
  });

  for (const forbiddenClaim of responseContract.forbiddenClaims ?? []) {
    if (containsPhrase(responseText, forbiddenClaim)) {
      checks.push({
        id: 'forbidden_claim',
        evaluator: 'deterministic',
        severity: 'hard',
        result: 'fail',
        reason: `Response contains forbidden claim: ${forbiddenClaim}`,
      });
    }
  }

  if (options.preservePrimaryStage && hasStageMutationLanguage(responseText)) {
    checks.push({
      id: 'preserve_stage_language',
      evaluator: 'deterministic',
      severity: 'hard',
      result: 'fail',
      reason: 'Response claims the user was moved to another journey stage while the primary stage should be preserved.',
    });
  }

  return checks;
}

export function checkSkillBehavior(
  responseText: string,
  loadedSkillSections: LoadedSkillSection[],
  options: SkillBehaviorCheckOptions = {},
): SkillBehaviorCheck[] {
  return loadedSkillSections.flatMap((section) => {
    switch (section.skillId) {
      case 'pricing_skill':
        return checkPricingSkill(responseText, section, options);
      case 'documents_skill':
        return checkDocumentsSkill(responseText, section, options);
      case 'safety_scope_skill':
        return checkSafetyScopeSkill(responseText, section, options);
      case 'hospital_recommendation_skill':
        return checkHospitalRecommendationSkill(responseText, section, options);
      case 'human_handoff_skill':
        return checkHumanHandoffSkill(responseText, section, options);
      default:
        return [];
    }
  });
}

function checkPricingSkill(
  responseText: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): SkillBehaviorCheck[] {
  if (!hasUnsupportedFixedPrice(responseText)) {
    return [passCheck('pricing_unsupported_fixed_price', section, options)];
  }

  return [failCheck(
    'pricing_unsupported_fixed_price',
    section,
    options,
    'Response appears to promise a guaranteed or fixed total price.',
  )];
}

function checkDocumentsSkill(
  responseText: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): SkillBehaviorCheck[] {
  if (!isRejectionOrHesitationSection(section)) {
    return [];
  }

  if (!pressuresDocumentUpload(responseText)) {
    return [passCheck('documents_pressure_after_rejection', section, options)];
  }

  return [failCheck(
    'documents_pressure_after_rejection',
    section,
    options,
    'Response pressures the user to upload after rejection or hesitation.',
  )];
}

function checkSafetyScopeSkill(
  responseText: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): SkillBehaviorCheck[] {
  const checks: SkillBehaviorCheck[] = [];

  checks.push(hasDiagnosisClaim(responseText)
    ? failCheck('safety_scope_diagnosis', section, options, 'Response appears to diagnose the user.')
    : passCheck('safety_scope_diagnosis', section, options));

  checks.push(hasMedicationRecommendation(responseText)
    ? failCheck('safety_scope_medication', section, options, 'Response appears to recommend medication.')
    : passCheck('safety_scope_medication', section, options));

  checks.push(hasOutcomeGuarantee(responseText)
    ? failCheck('safety_scope_guarantee', section, options, 'Response appears to guarantee a medical outcome.')
    : passCheck('safety_scope_guarantee', section, options));

  return checks;
}

function checkHospitalRecommendationSkill(
  responseText: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): SkillBehaviorCheck[] {
  if (!mentionsInventedHospital(responseText, options)) {
    return [passCheck('hospital_recommendation_candidate_integrity', section, options)];
  }

  return [failCheck(
    'hospital_recommendation_candidate_integrity',
    section,
    options,
    'Response appears to recommend a hospital outside the provided candidate set.',
  )];
}

function checkHumanHandoffSkill(
  responseText: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): SkillBehaviorCheck[] {
  if (!hasUnsupportedHandoffPromise(responseText)) {
    return [passCheck('human_handoff_unsupported_promise', section, options)];
  }

  return [failCheck(
    'human_handoff_unsupported_promise',
    section,
    options,
    'Response appears to promise unsupported human handoff timing or guarantees.',
  )];
}

function passCheck(
  id: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): SkillBehaviorCheck {
  return {
    id,
    skillId: section.skillId,
    sectionHint: resolveSectionHint(section, options),
    evaluator: 'deterministic',
    severity: 'observed',
    result: 'pass',
  };
}

function failCheck(
  id: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
  reason: string,
): SkillBehaviorCheck {
  return {
    id,
    skillId: section.skillId,
    sectionHint: resolveSectionHint(section, options),
    evaluator: 'deterministic',
    severity: 'hard',
    result: 'fail',
    reason,
  };
}

function resolveSectionHint(
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): DomainSkillRequest['sectionHints'] {
  return options.sectionHints?.[section.skillId] ?? fallbackSectionHint(section.skillId);
}

function fallbackSectionHint(skillId: LoadedSkillSection['skillId']): DomainSkillRequest['sectionHints'] {
  switch (skillId) {
    case 'pricing_skill':
      return {
        eventType: 'USER_ASKED_QUESTION',
        target: 'pricing',
        modifier: 'ask',
        primaryActionType: 'ANSWER',
      };
    case 'documents_skill':
      return {
        eventType: 'USER_RESPONDED_TO_REQUEST',
        target: 'documents',
        modifier: 'unknown',
        primaryActionType: 'HANDLE_RESPONSE',
      };
    case 'safety_scope_skill':
      return {
        eventType: 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
        target: 'unknown',
        modifier: 'ask',
        primaryActionType: 'REDIRECT',
      };
    case 'hospital_recommendation_skill':
      return {
        eventType: 'USER_ASKED_QUESTION',
        target: 'recommendation',
        modifier: 'ask',
        primaryActionType: 'PRESENT_OPTIONS',
      };
    case 'human_handoff_skill':
      return {
        eventType: 'USER_REQUESTED_HUMAN',
        target: 'human',
        modifier: 'ask',
        primaryActionType: 'ESCALATE',
      };
    default:
      return {
        eventType: 'USER_MESSAGE_UNCLEAR',
        target: 'unknown',
        modifier: 'unknown',
        primaryActionType: 'CLARIFY',
      };
  }
}

function countQuestions(responseText: string): number {
  return (responseText.match(/[?\uFF1F]/g) ?? []).length;
}

function countCtaAsks(responseText: string): number {
  const normalized = normalize(responseText);
  const ctaPatterns = [
    /\bplease\s+(upload|send|share|book|schedule|call|contact|complete|provide|answer)\b/g,
    /\b(upload|send|share|book|schedule|call|contact|complete|provide|answer)\b[^.!?]{0,40}\b(now|today|next|when you can)\b/g,
    /\bwould you like to\b/g,
    /\bcan you\s+(upload|send|share|book|schedule|complete|provide|answer)\b/g,
  ];

  return ctaPatterns.reduce((count, pattern) => count + (normalized.match(pattern) ?? []).length, 0);
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
  const normalized = normalize(responseText);
  if (hasPricingUncertaintyDisclaimer(normalized)) {
    return false;
  }

  return /\bfixed\s+price\b/.test(normalized)
    || /\bguaranteed\s+(fixed\s+)?price\b/.test(normalized)
    || /[$\uFFE5]\s?\d[\d,]*(?:\.\d+)?/.test(normalized) && /\b(guaranteed|fixed|flat|package)\b/.test(normalized);
}

function hasPricingUncertaintyDisclaimer(normalized: string): boolean {
  return /\b(cannot|can not|can't|unable to|not able to)\s+(give|provide|quote|promise)\s+(a\s+)?fixed\s+price\s+before\s+(review|assessment|evaluation)\b/.test(normalized)
    || /\b(no|not)\s+(fixed|guaranteed)\s+price\s+(before|until)\s+(review|assessment|evaluation)\b/.test(normalized);
}

function isRejectionOrHesitationSection(section: LoadedSkillSection): boolean {
  const sectionContext = normalize([
    section.reasonCode,
    ...section.sectionIds,
    ...section.handlingGuidance,
    ...section.policyText,
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
  return /\b(this|that|it)\s+is\s+(pneumonia|cancer|diabetes|stroke|infection|tumou?r|heart attack)\b/.test(normalize(responseText))
    || /\byou\s+have\s+(pneumonia|cancer|diabetes|stroke|infection|tumou?r|a heart attack)\b/.test(normalize(responseText));
}

function hasMedicationRecommendation(responseText: string): boolean {
  const normalized = stripMedicationSafetyDisclaimers(normalize(responseText));
  return /\b(take|start|use|increase|stop)\s+(antibiotics?|insulin|aspirin|ibuprofen|steroids?|opioids?|painkillers?|medication|medicine)\b/.test(normalized);
}

function hasOutcomeGuarantee(responseText: string): boolean {
  return /\bguarantee(d)?\s+(a\s+)?(cure|recovery|full recovery|outcome|result)\b/.test(normalize(responseText))
    || /\bwill\s+(cure|fully recover|recover completely)\b/.test(normalize(responseText));
}

function stripMedicationSafetyDisclaimers(normalized: string): string {
  return normalized
    .replace(/\b(do not|don't|never)\s+(stop|start|take|use|increase)\s+(antibiotics?|insulin|aspirin|ibuprofen|steroids?|opioids?|painkillers?|medication|medicine)\s+without\s+(your\s+)?(doctor|clinician|physician)\b/g, ' ')
    .replace(/\bask\s+(your\s+)?(doctor|clinician|physician)\s+before\s+(changing|starting|stopping|taking|using|increasing)\s+(treatment|medication|medicine|antibiotics?)\b/g, ' ');
}

function mentionsInventedHospital(responseText: string, options: SkillBehaviorCheckOptions): boolean {
  const candidateIds = new Set((options.candidateHospitalIds ?? []).map(normalize));
  const mentionedIds = normalize(responseText).match(/\bhospital-[a-z0-9-]+\b/g) ?? [];
  if (mentionedIds.some((id) => !candidateIds.has(id))) {
    return true;
  }

  const candidateNames = new Set((options.candidateHospitalNames ?? []).map(normalize));
  const mentionedNames = extractHospitalNames(responseText).map(normalize);
  return mentionedNames.some((name) => !candidateNames.has(name));
}

function extractHospitalNames(responseText: string): string[] {
  return responseText.match(/\b[A-Z][A-Za-z&'.-]*(?:\s+[A-Z][A-Za-z&'.-]*){0,5}\s+(?:Hospital|Clinic|Medical Center|Cancer Center|Medical Centre)\b/g) ?? [];
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
