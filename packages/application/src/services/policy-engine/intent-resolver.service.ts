export interface IntentResolverInput {
  userMessage: string;
  pendingOffer?: {
    type: string;
    payload?: Record<string, unknown>;
  } | null;
  recentMessages?: Array<{
    role: string;
    content: string;
    nextAction?: string | null;
  }>;
  candidateSignals?: Record<string, unknown>;
}

export interface IntentResolution {
  resolvedIntent: string;
  reasonCodes: string[];
}

const AFFIRMATIVE_PATTERNS = [
  /\byes\b/i,
  /\bsure\b/i,
  /\bok(?:ay)?\b/i,
  /\bshow me\b/i,
  /\bgo ahead\b/i,
  /\bcontinue\b/i,
];

const HUMAN_HANDOFF_PATTERNS = [
  /\bhuman\b/i,
  /\badmin\b/i,
  /\bticket\b/i,
  /\bemail\b/i,
  /\bsomeone\b/i,
  /\bperson\b/i,
];

const PROCESS_PATTERNS = [
  /\bmedical travel\b/i,
  /\boverall process\b/i,
  /\bhow (do|does) (you|this) work\b/i,
  /\bjourney\b/i,
  /\bgo abroad\b/i,
  /\bgo overseas\b/i,
  /\bhow do you usually help\b/i,
  /\bwalk me through\b/i,
];

const CONSULT_PROCESS_PATTERNS = [
  /\bonline consultation\b/i,
  /\bconsultation step\b/i,
  /\bconsultation process\b/i,
  /\btelemedicine\b/i,
  /\bhow is the consultation\b/i,
];

const RECOMMENDATION_ALTERNATIVE_PATTERNS = [
  /\banother\b/i,
  /\bother hospitals?\b/i,
  /\balternative\b/i,
  /\bdifferent hospitals?\b/i,
  /\brecommend (a )?few more\b/i,
];

const RECOMMENDATION_PATTERNS = [
  /\brecommend/i,
  /\bwhich hospitals?\b/i,
  /\bshow (me )?(some )?hospitals?\b/i,
  /\bchoose hospitals?\b/i,
  /\bmatch hospitals?\b/i,
  /\bhospital options?\b/i,
];

export class IntentResolverService {
  async resolve(input: IntentResolverInput): Promise<IntentResolution> {
    const message = input.userMessage.trim();

    if (
      input.pendingOffer?.type === 'HOSPITAL_RECOMMENDATION' &&
      isAffirmative(message)
    ) {
      return {
        resolvedIntent: 'ACCEPT_HOSPITAL_RECOMMENDATION',
        reasonCodes: ['pending_offer_confirmed'],
      };
    }

    if (
      input.pendingOffer?.type === 'ONLINE_CONSULT' &&
      isAffirmative(message)
    ) {
      return {
        resolvedIntent: 'ACCEPT_ONLINE_CONSULT_INVITE',
        reasonCodes: ['consult_invite_confirmed'],
      };
    }

    if (PROCESS_PATTERNS.some((pattern) => pattern.test(message))) {
      return {
        resolvedIntent: 'ASK_MEDICAL_TRAVEL_PROCESS',
        reasonCodes: ['medical_travel_process_requested'],
      };
    }

    if (CONSULT_PROCESS_PATTERNS.some((pattern) => pattern.test(message))) {
      return {
        resolvedIntent: 'ASK_CONSULT_PROCESS',
        reasonCodes: ['consult_process_requested'],
      };
    }

    if (/upload|report|scan|document|file/i.test(message)) {
      return {
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        reasonCodes: ['documents_requested'],
      };
    }

    if (HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(message)) && /help|contact|follow up|reply|ticket|admin/i.test(message)) {
      return {
        resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
        reasonCodes: ['human_handoff_requested'],
      };
    }

    if (RECOMMENDATION_ALTERNATIVE_PATTERNS.some((pattern) => pattern.test(message))) {
      return {
        resolvedIntent: 'ASK_ALTERNATIVE_HOSPITAL_RECOMMENDATIONS',
        reasonCodes: ['alternative_recommendation_requested'],
      };
    }

    if (RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(message))) {
      return {
        resolvedIntent: 'ASK_FOR_RECOMMENDATION',
        reasonCodes: ['recommendation_interest'],
      };
    }

    return {
      resolvedIntent: 'GENERAL_CONSULT',
      reasonCodes: ['fallback_general_consult'],
    };
  }
}

function isAffirmative(message: string): boolean {
  return AFFIRMATIVE_PATTERNS.some((pattern) => pattern.test(message));
}
