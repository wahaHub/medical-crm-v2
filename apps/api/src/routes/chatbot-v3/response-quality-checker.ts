import type {
  LoadedSkillSection,
  ResponseContract,
  DomainSkillRequest,
} from '@medical-crm/application';

export type ResponseQualityResult = 'pass' | 'warn' | 'fail';
export type ResponseQualitySeverity = 'hard' | 'soft' | 'observed';

export interface MinimalContractCheck {
  id: 'max_questions' | 'answer_before_ask' | 'multiple_ctas' | 'forbidden_claim' | 'preserve_stage_language';
  evaluator: 'deterministic';
  severity: ResponseQualitySeverity;
  result: ResponseQualityResult;
  reason?: string;
}

export interface SkillBehaviorCheck {
  id: string;
  skillId: LoadedSkillSection['skillId'];
  sectionHint: DomainSkillRequest['sectionHints'];
  evaluator: 'deterministic' | 'llm_judge';
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
  constraints: Pick<ResponseContract['constraints'], 'maxQuestions' | 'avoidMultipleCTAs'>
    & Partial<Pick<ResponseContract['constraints'], 'answerBeforeAsk' | 'preservePrimaryStage'>>;
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

  if (responseContract.constraints.answerBeforeAsk) {
    const asksBeforeAnswer = startsWithAsk(responseText);
    checks.push({
      id: 'answer_before_ask',
      evaluator: 'deterministic',
      severity: asksBeforeAnswer ? 'hard' : 'observed',
      result: asksBeforeAnswer ? 'fail' : 'pass',
      ...(asksBeforeAnswer
        ? { reason: 'Response appears to ask for an action before giving the answer.' }
        : {}),
    });
  }

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

  if ((responseContract.constraints.preservePrimaryStage ?? options.preservePrimaryStage) && hasStageMutationLanguage(responseText)) {
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
      case 'policy_skill':
        return checkPolicySkill(responseText, section, options);
      case 'pricing_skill':
        return checkPricingSkill(responseText, section, options);
      case 'treatment_skill':
        return checkDocumentsSkill(responseText, section, options);
      case 'medical_advice_skill':
        return checkSafetyScopeSkill(responseText, section, options);
      case 'hospital_skill':
        return checkHospitalRecommendationSkill(responseText, section, options);
      case 'handoff_skill':
        return checkHumanHandoffSkill(responseText, section, options);
      default:
        return [];
    }
  });
}

function checkPolicySkill(
  responseText: string,
  section: LoadedSkillSection,
  options: SkillBehaviorCheckOptions,
): SkillBehaviorCheck[] {
  if (!isInsuranceBoundarySection(section) && !isOnlineConsultationFeeBoundarySection(section)) {
    return [];
  }

  const checks: SkillBehaviorCheck[] = [];

  if (isInsuranceBoundarySection(section)) {
    checks.push(hasUnsupportedInsuranceClaim(responseText)
      ? failCheck('policy_insurance_claims_boundary', section, options, 'Response appears to claim Medora handles insurance claims, coverage approval, direct billing approval, or reimbursement.')
      : passCheck('policy_insurance_claims_boundary', section, options));
  }

  if (isOnlineConsultationFeeBoundarySection(section)) {
    checks.push(hasUnsupportedOnlineConsultationFeeClaim(responseText)
      ? failCheck('policy_online_consultation_fee_boundary', section, options, 'Response appears to misstate the USD 400 online consultation fee boundary.')
      : passCheck('policy_online_consultation_fee_boundary', section, options));
  }

  return checks;
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
  const checks = [
    mentionsInventedHospital(responseText, options)
      ? failCheck(
        'hospital_recommendation_candidate_integrity',
        section,
        options,
        'Response appears to recommend a hospital outside the provided candidate set.',
      )
      : passCheck('hospital_recommendation_candidate_integrity', section, options),
  ];

  if (isDoctorMatchingBoundarySection(section)) {
    checks.push(hasUnsupportedDoctorMatchingClaim(responseText)
      ? failCheck('hospital_doctor_matching_boundary', section, options, 'Response appears to recommend a doctor from symptoms alone or without records.')
      : passCheck('hospital_doctor_matching_boundary', section, options));
  }

  return checks;
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
    case 'policy_skill':
      return {
        eventType: 'USER_ASKED_QUESTION',
        target: 'policy',
        modifier: 'ask',
        primaryActionType: 'ANSWER',
      };
    case 'treatment_skill':
      return {
        eventType: 'USER_RESPONDED_TO_REQUEST',
        target: 'treatment',
        modifier: 'unknown',
        primaryActionType: 'HANDLE_RESPONSE',
      };
    case 'medical_advice_skill':
      return {
        eventType: 'USER_ASKED_QUESTION',
        target: 'medical_advice',
        modifier: 'ask',
        primaryActionType: 'REDIRECT',
      };
    case 'hospital_skill':
      return {
        eventType: 'USER_ASKED_QUESTION',
        target: 'hospital',
        modifier: 'ask',
        primaryActionType: 'PRESENT_OPTIONS',
      };
    case 'handoff_skill':
      return {
        eventType: 'USER_REQUESTED_HUMAN',
        target: 'handoff',
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
  for (const span of spans.sort((a, b) => a.start - b.start || b.end - a.end)) {
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

function isInsuranceBoundarySection(section: LoadedSkillSection): boolean {
  const sectionContext = normalize(sectionContextText(section));
  return /\binsurance\b/.test(sectionContext) && /\b(claims?|coverage|reimbursement|direct billing)\b/.test(sectionContext);
}

function hasUnsupportedInsuranceClaim(responseText: string): boolean {
  const normalized = stripInsuranceBoundaryDisclaimers(normalize(responseText));
  return /\bmedora\s+(will|can|could|shall)\s+[^.!?]{0,50}\b(handle|submit|manage|follow up|file|process)\s+[^.!?]{0,50}\binsurance\s+claims?\b/.test(normalized)
    || /\bmedora\s+(will|can|could|shall)\s+[^.!?]{0,50}\binsurance\s+claims?\b[^.!?]{0,50}\b(handle|submit|manage|follow up|file|process)\b/.test(normalized)
    || /\bmedora\s+(will|can|could|shall)\s+[^.!?]{0,50}\b(support|help with)\s+(your\s+)?insurance\s+claims?\b/.test(normalized)
    || /\b(guarantee|approve)\s+[^.!?]{0,30}\b(reimbursement|coverage)\b/.test(normalized)
    || /\b(reimbursement|coverage)\s+[^.!?]{0,30}\b(guaranteed|approved)\b/.test(normalized)
    || /\b(direct billing|coverage)\s+approval\b/.test(normalized);
}

function stripInsuranceBoundaryDisclaimers(normalized: string): string {
  return normalized
    .replace(/\b(contact|ask|check with)\s+(your\s+)?insurer\s+(directly\s+)?(?:for|about)\s+(claims?|coverage|reimbursement)\b/g, ' ')
    .replace(/\bmedora\s+can\s+organize\s+neutral\s+hospital\s+documents\b/g, ' ')
    .replace(/\bask\s+the\s+hospital\s+about\s+medical\s+liability\s+insurance\b/g, ' ')
    .replace(/\bmedora\s+(does\s+not|doesn't|cannot|can't|will\s+not|won't)\s+[^.!?]{0,50}\b(handle|submit|manage|follow up|file|process|approve|guarantee|provide|support|help with)\s+[^.!?]{0,50}\b(insurance\s+claims?|claims?|coverage|reimbursement|direct billing)\b/g, ' ')
    .replace(/\bmedora\s+(does\s+not|doesn't|cannot|can't|will\s+not|won't)\s+[^.!?]{0,50}\bprovide\s+direct billing approval\s+for\s+insurance\s+claims?\b/g, ' ');
}

function isOnlineConsultationFeeBoundarySection(section: LoadedSkillSection): boolean {
  const sectionContext = normalize(sectionContextText(section));
  return /\bonline consultation\b/.test(sectionContext) && /\busd\s*400\b/.test(sectionContext);
}

function hasUnsupportedOnlineConsultationFeeClaim(responseText: string): boolean {
  const normalized = stripOnlineConsultationFeeBoundaryDisclaimers(normalize(responseText));
  return /\b(usd\s*400|\$400|400\s*(?:usd|dollars?)|online consultation(?: fee)?)\b[^.!?]{0,80}\b(free|refundable|refund(?:ed)?|not required|optional)\b/.test(normalized)
    || /\b(free|refundable|refund(?:ed)?|not required|optional)\b[^.!?]{0,80}\b(usd\s*400|\$400|400\s*(?:usd|dollars?)|online consultation(?: fee)?)\b/.test(normalized)
    || /\bonline consultation(?: fee)?\b[^.!?]{0,80}\b(not required|optional)\b[^.!?]{0,60}\b(before|prior to)\s+(china\s+)?travel\b/.test(normalized);
}

function stripOnlineConsultationFeeBoundaryDisclaimers(normalized: string): string {
  return normalized
    .replace(/\bonline consultation(?: fee)?\b[^.!?]{0,80}\bis\s+not\s+(free|refundable)\b/g, ' ')
    .replace(/\b(usd\s*400|\$400|400\s*(?:usd|dollars?)|fee)\b[^.!?]{0,80}\bis\s+not\s+refundable\b/g, ' ');
}

function sectionContextText(section: LoadedSkillSection): string {
  return [
    section.reasonCode,
    ...section.sectionIds,
    ...section.handlingGuidance,
    ...section.policyText,
  ].join(' ');
}

function isRejectionOrHesitationSection(section: LoadedSkillSection): boolean {
  const sectionContext = normalize(sectionContextText(section));

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
  return /\b(this|that|it)\s+is\s+(pneumonia|cancer|diabetes|stroke|infection|tumou?r|heart attack|lymphoma)\b/.test(normalize(responseText))
    || /\byou\s+have\s+(pneumonia|cancer|diabetes|stroke|infection|tumou?r|a heart attack|lymphoma)\b/.test(normalize(responseText));
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
  const hasCandidateHospitalIds = Boolean(options.candidateHospitalIds?.length);
  const hasCandidateHospitalNames = Boolean(options.candidateHospitalNames?.length);

  if (!hasCandidateHospitalIds && !hasCandidateHospitalNames) {
    return false;
  }

  const candidateIds = new Set((options.candidateHospitalIds ?? []).map(normalize));
  const mentionedIds = normalize(responseText).match(/\bhospital-[a-z0-9-]+\b/g) ?? [];
  if (hasCandidateHospitalIds && mentionedIds.some((id) => !candidateIds.has(id))) {
    return true;
  }

  const candidateNames = new Set((options.candidateHospitalNames ?? []).map(normalize));
  const mentionedNames = extractHospitalNames(stripCandidateBoundaryHospitalMentions(responseText)).map(normalize);
  return Boolean(hasCandidateHospitalNames && mentionedNames.some((name) => !candidateNames.has(name)));
}

function extractHospitalNames(responseText: string): string[] {
  return responseText.match(/\b[A-Z][A-Za-z&'.-]*(?:\s+[A-Z][A-Za-z&'.-]*){0,5}\s+(?:Hospital|Clinic|Medical Center|Cancer Center|Medical Centre)\b/g) ?? [];
}

function stripCandidateBoundaryHospitalMentions(responseText: string): string {
  return responseText.replace(
    /\b(?:i|we)\s+(?:do\s+not|don't|cannot|can't)\s+have\s+\b[A-Z][A-Za-z&'.-]*(?:\s+[A-Z][A-Za-z&'.-]*){0,5}\s+(?:Hospital|Clinic|Medical Center|Cancer Center|Medical Centre)\b\s+in\s+the\s+(?:current\s+)?candidate\s+list\b/gi,
    ' ',
  );
}

function isDoctorMatchingBoundarySection(section: LoadedSkillSection): boolean {
  return /\bdoctor matching|doctor recommendation|recommend a doctor\b/.test(normalize(sectionContextText(section)));
}

function hasUnsupportedDoctorMatchingClaim(responseText: string): boolean {
  const normalized = stripDoctorMatchingBoundaryDisclaimers(normalize(responseText));
  return /\b(recommend|match|choose)\s+(?:dr\.?|doctor|professor)\s+[a-z][a-z'.-]*\b/.test(normalized)
    || /\b(?:dr\.?|doctor|professor)\s+[a-z][a-z'.-]*\s+[^.!?]{0,60}\b(best|right|recommended|good fit)\b/.test(normalized)
    || /\b(symptoms?\s+alone|based on your symptoms?)\b[^.!?]{0,80}\b(recommend|match|choose)\s+(?:a\s+)?(?:dr\.?|doctor)\b/.test(normalized)
    || /\bno\s+(medical\s+)?records?\s+(are\s+)?needed\s+[^.!?]{0,60}\bdoctor\s+recommendation\b/.test(normalized);
}

function stripDoctorMatchingBoundaryDisclaimers(normalized: string): string {
  return normalized
    .replace(/\b(?:i|we|medora)\s+(cannot|can't|can not|do\s+not|don't|will\s+not|won't)\s+recommend\s+(?:dr\.?|doctor|professor)\s+[a-z][a-z'.-]*\s+from\s+symptoms?\s+alone\b/g, ' ');
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
