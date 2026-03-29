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

    if (/upload|report|scan|document|file/i.test(message)) {
      return {
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        reasonCodes: ['documents_requested'],
      };
    }

    if (/recommend|hospital|option/i.test(message)) {
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
