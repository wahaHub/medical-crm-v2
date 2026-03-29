import type { AiPolicyEngagementMode } from '../../dtos/ai-policy.dto.js';

export interface EngagementModeResolverInput {
  userMessage: string;
  statusSnapshot?: {
    leadMaturity?: string;
    riskLevel?: string;
    pendingOffer?: {
      type: string;
      payload?: Record<string, unknown>;
    } | null;
    pendingQuestion?: {
      type: string;
      payload?: Record<string, unknown>;
    } | null;
  };
  recentMessages?: Array<{
    role: string;
    content: string;
    nextAction?: string | null;
    resolvedIntent?: string | null;
  }>;
  profile?: {
    conditionOrGoal?: string | null;
    conditionCategory?: string | null;
    preferredDestination?: string[];
    preferredLanguage?: string | null;
    budgetBand?: string | null;
    urgencyLevel?: string | null;
    existingReportsStatus?: string;
    objectionTags?: string[];
    leadStage?: string;
    nextBestAction?: string | null;
    memorySummary?: string;
  } | null;
  candidateSignals?: Record<string, unknown>;
}

export interface EngagementModeResolution {
  engagementMode: AiPolicyEngagementMode;
  reasonCodes: string[];
}

const GREETING_PATTERNS = [
  /^(hi|hello|hey|yo|thanks|thank you|ping|test|testing)\b/i,
  /^(你好|您好|嗨|在吗|在不在)\b/,
];

const TRUST_BUILDING_PATTERNS = [
  /\bhow do you\b/i,
  /\bwhy (should|would) i\b/i,
  /\bhow can i trust\b/i,
  /\bwhat do you do\b/i,
  /\bwalk me through\b/i,
  /\bexplain\b/i,
  /\bprocess\b/i,
  /\bservice\b/i,
  /\bhospital\b/i,
  /\bpackage\b/i,
  /\brecommend/i,
  /\bconsult/i,
  /\btravel\b/i,
];

const DEEP_PROGRESS_PATTERNS = [
  /\bstart now\b/i,
  /\bupload now\b/i,
  /\bconnect me to (a )?person\b/i,
  /\btalk to (a )?human\b/i,
  /\bcreate (a )?case\b/i,
  /\bbook\b/i,
  /\bproceed\b/i,
  /\bgo ahead\b/i,
  /\bmove forward\b/i,
  /\bbegin\b/i,
  /\bcontinue\b/i,
];

const CRISIS_PATTERNS = [
  /\bhurt myself\b/i,
  /\bkill myself\b/i,
  /\bdon't want to live\b/i,
  /\bsuicide\b/i,
  /\bend my life\b/i,
  /\bchest pain\b/i,
  /\bshortness of breath\b/i,
  /\bsevere bleeding\b/i,
];

const AFFIRMATIVE_PATTERNS = [
  /\byes\b/i,
  /\byep\b/i,
  /\byes please\b/i,
  /\bsure\b/i,
  /\bok(?:ay)?\b/i,
  /\bgo ahead\b/i,
  /\bcontinue\b/i,
  /\bplease do\b/i,
  /\bthat's fine\b/i,
];

export class EngagementModeResolverService {
  // engagement_mode is a runtime routing mode. It should not be used as a
  // proxy for longer-horizon business maturity, which is tracked separately.
  resolve(input: EngagementModeResolverInput): EngagementModeResolution {
    const userMessage = normalizeText(input.userMessage);
    const candidateRisk = normalizeText(input.candidateSignals?.['possibleRisk']);
    const candidateIntent = normalizeText(input.candidateSignals?.['possibleIntent']);

    if (isCrisisSignal(userMessage, candidateRisk)) {
      return {
        engagementMode: 'DEEP_WORKFLOW',
        reasonCodes: ['risk_override', 'crisis_signal_detected'],
      };
    }

    if (isDirectProgressionRequest(userMessage, candidateIntent)) {
      return {
        engagementMode: 'DEEP_WORKFLOW',
        reasonCodes: ['explicit_progression_request'],
      };
    }

    if (hasActivePendingContext(input.statusSnapshot) && isAffirmative(userMessage)) {
      return {
        engagementMode: 'DEEP_WORKFLOW',
        reasonCodes: ['pending_context_confirmed'],
      };
    }

    if (isGreetingOnly(userMessage)) {
      return {
        engagementMode: 'LIGHT_DISCOVERY',
        reasonCodes: ['low_signal_greeting'],
      };
    }

    if (looksLikeTrustBuildingOrQualification(userMessage, input)) {
      return {
        engagementMode: 'QUALIFIED_EXPLORATION',
        reasonCodes: ['trust_building_signal'],
      };
    }

    if (hasKnownUserDetails(input.profile) || hasRecentBusinessSignal(input.recentMessages)) {
      return {
        engagementMode: 'QUALIFIED_EXPLORATION',
        reasonCodes: ['known_context_signal'],
      };
    }

    return {
      engagementMode: 'LIGHT_DISCOVERY',
      reasonCodes: ['default_light_path'],
    };
  }
}

function isCrisisSignal(userMessage: string, candidateRisk: string | null): boolean {
  return candidateRisk === 'CRISIS' || candidateRisk === 'HIGH_RISK' || CRISIS_PATTERNS.some((pattern) => pattern.test(userMessage));
}

function isDirectProgressionRequest(userMessage: string, candidateIntent: string | null): boolean {
  if (candidateIntent && ['DEEP_WORKFLOW', 'CREATE_CASE', 'CONSULT_CONVERSION', 'REQUEST_DOCS'].includes(candidateIntent)) {
    return true;
  }

  return DEEP_PROGRESS_PATTERNS.some((pattern) => pattern.test(userMessage));
}

function isGreetingOnly(userMessage: string): boolean {
  if (userMessage.length === 0) {
    return true;
  }

  if (userMessage.length <= 10 && !containsBusinessSignal(userMessage)) {
    return true;
  }

  return GREETING_PATTERNS.some((pattern) => pattern.test(userMessage));
}

function looksLikeTrustBuildingOrQualification(
  userMessage: string,
  input: EngagementModeResolverInput,
): boolean {
  if (TRUST_BUILDING_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return true;
  }

  if (containsBusinessSignal(userMessage)) {
    return true;
  }

  if (input.profile?.memorySummary || input.profile?.conditionOrGoal || input.profile?.conditionCategory || input.profile?.preferredDestination?.length) {
    return userMessage.length > 0 && userMessage.length <= 120;
  }

  return false;
}

function hasActivePendingContext(
  statusSnapshot: EngagementModeResolverInput['statusSnapshot'],
): boolean {
  return Boolean(statusSnapshot?.pendingOffer || statusSnapshot?.pendingQuestion);
}

function isAffirmative(userMessage: string): boolean {
  return AFFIRMATIVE_PATTERNS.some((pattern) => pattern.test(userMessage));
}

function hasKnownUserDetails(profile: EngagementModeResolverInput['profile']): boolean {
  if (!profile) {
    return false;
  }

  return Boolean(
    profile.conditionOrGoal ||
      profile.conditionCategory ||
      profile.preferredDestination?.length ||
      profile.preferredLanguage ||
      profile.budgetBand ||
      profile.urgencyLevel ||
      profile.existingReportsStatus !== undefined ||
      profile.objectionTags?.length ||
      profile.leadStage ||
      profile.nextBestAction ||
      profile.memorySummary,
  );
}

function hasRecentBusinessSignal(recentMessages: EngagementModeResolverInput['recentMessages']): boolean {
  const lastAssistantMessage = [...(recentMessages ?? [])].reverse().find((message) => message.role.toUpperCase() === 'ASSISTANT');
  if (!lastAssistantMessage) {
    return false;
  }

  return Boolean(
    lastAssistantMessage.nextAction &&
      ['CONSULT_CONVERSION', 'CREATE_CASE', 'REQUEST_DOCS', 'SHOW_HOSPITAL_RECOMMENDATIONS', 'SHOW_PACKAGE', 'PROMOTE_ONLINE_CONSULT'].includes(lastAssistantMessage.nextAction),
  );
}

function containsBusinessSignal(userMessage: string): boolean {
  return /\bhospital\b/i.test(userMessage)
    || /\bpackage\b/i.test(userMessage)
    || /\bconsult/i.test(userMessage)
    || /\btravel\b/i.test(userMessage)
    || /\bupload\b/i.test(userMessage)
    || /\bdoctor\b/i.test(userMessage)
    || /\brecommend/i.test(userMessage)
    || /\bdocument\b/i.test(userMessage)
    || /\breport\b/i.test(userMessage)
    || /\bscan\b/i.test(userMessage)
    || /\bbudget\b/i.test(userMessage);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
