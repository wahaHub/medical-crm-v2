import type { NextAction } from './supervisor-event.types.js';

export interface ReadPlan {
  domains: string[];
  reasonCode: string;
  params?: Record<string, string | undefined>;
}

export function buildReadPlan(action: NextAction): ReadPlan {
  switch (action.type) {
    case 'ANSWER_FAQ':
      return {
        domains: ['knowledge.faq'],
        reasonCode: 'answer_faq',
        params: {
          topic: action.topic,
          subtopic: action.subtopic,
        },
      };
    case 'REQUEST_MEDICAL_DOCUMENTS':
      return {
        domains: ['records.required_documents'],
        reasonCode: 'request_medical_documents',
      };
    case 'GENERATE_RECOMMENDATION':
      return {
        domains: ['records.summary', 'hospital.catalog'],
        reasonCode: 'generate_recommendation',
      };
    case 'ASK_RECOMMENDATION_SELECTION':
      return {
        domains: ['recommendation.current'],
        reasonCode: 'ask_recommendation_selection',
      };
    case 'OFFER_ONLINE_CONSULT':
      return {
        domains: ['consult.config', 'recommendation.selected'],
        reasonCode: 'offer_online_consult',
      };
    case 'CREATE_HANDOFF':
      return {
        domains: ['lead.profile', 'conversation.summary'],
        reasonCode: 'create_handoff',
      };
    default:
      return {
        domains: [],
        reasonCode: action.type.toLowerCase(),
      };
  }
}
