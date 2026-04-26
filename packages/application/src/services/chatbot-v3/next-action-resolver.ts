import type { ChatbotV3DispatchAgent } from './types.js';
import type { NextAction } from './supervisor-event.types.js';

export interface NextActionExecution {
  agent: ChatbotV3DispatchAgent | null;
  isSystemRendered: boolean;
}

export function resolveNextActionExecution(action: NextAction): NextActionExecution {
  switch (action.type) {
    case 'ANSWER_FAQ':
    case 'CLARIFY_INTENT':
      return { agent: 'FaqAgent', isSystemRendered: false };
    case 'SAFE_MEDICAL_REDIRECT':
    case 'OUT_OF_SCOPE_REDIRECT':
      return { agent: null, isSystemRendered: true };
    case 'COLLECT_MINIMAL_TRIAGE':
    case 'REQUEST_MEDICAL_DOCUMENTS':
      return { agent: 'RecordsAgent', isSystemRendered: false };
    case 'GENERATE_RECOMMENDATION':
    case 'ASK_RECOMMENDATION_SELECTION':
      return { agent: 'RecommendationAgent', isSystemRendered: false };
    case 'OFFER_ONLINE_CONSULT':
      return { agent: 'ConsultAgent', isSystemRendered: false };
    case 'CREATE_HANDOFF':
      return { agent: 'HandoffAgent', isSystemRendered: false };
    case 'SHOW_PROCESS_OVERVIEW':
      return { agent: null, isSystemRendered: true };
  }
}
