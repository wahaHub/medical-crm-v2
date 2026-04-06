import type { z } from 'zod';
import { chatbotMessageBlockSchema } from '@medical-crm/validation';

type ChatbotMessageBlock = z.infer<typeof chatbotMessageBlockSchema>;

export interface BlockBuildContext {
  richAction: string | null | undefined;
  shortlist: Array<Record<string, unknown>>;
  sessionCaseId?: string | null;
  sessionConsultationStatus?: string | null;
  templateId?: string | null;
  conversionDraft?: {
    sessionId: string;
    name?: string;
    email?: string;
    country?: string;
    conditionSummary?: string;
    budget?: string;
  } | null;
}

export function buildChatbotBlocks(input: BlockBuildContext): ChatbotMessageBlock[] {
  const candidates: unknown[] = [];

  switch (input.richAction) {
    case 'EXPLAIN_MEDICAL_TRAVEL_PROCESS':
      candidates.push({
        id: 'process-modal-1',
        type: 'PROCESS_MODAL_TRIGGER',
        modalKey: 'MEDICAL_TRAVEL_PROCESS',
        title: 'How the process works',
        description: 'See the overall medical travel journey.',
        ctaLabel: 'Open process guide',
      });
      break;

    case 'REQUEST_DOC_UPLOAD':
      if (input.templateId) {
        candidates.push({
          id: 'questionnaire-trigger-1',
          type: 'QUESTIONNAIRE_MODAL_TRIGGER',
          templateId: input.templateId,
          title: 'Complete your medical questionnaire',
          description: 'This helps us guide the next step more accurately.',
          ctaLabel: 'Open questionnaire',
        });
      }
      break;

    case 'SHOW_HOSPITAL_RECOMMENDATIONS':
      if (input.sessionCaseId) {
        const hospitals = input.shortlist
          .slice(0, 3)
          .map((item) => ({
            hospitalId: asString(item['hospitalId']),
            name: asString(item['name']),
            reason: asString(item['reason']),
            summary: asString(item['summary']),
            ctaUrl: asString(item['ctaUrl']),
            thumbnailUrl: asString(item['thumbnailUrl']),
            thumbnailFallbackUrls: asStringArray(item['thumbnailFallbackUrls']),
            slug: asString(item['slug']),
            city: asString(item['city']),
            matchType: asString(item['matchType']),
            reasonCodes: Array.isArray(item['reasonCodes'])
              ? item['reasonCodes'].filter((code): code is string => typeof code === 'string')
              : undefined,
          }))
          .filter((item): item is {
            hospitalId: string;
            name?: string;
            reason?: string;
            summary?: string;
            ctaUrl?: string;
            thumbnailUrl?: string;
            thumbnailFallbackUrls?: string[];
            slug?: string;
            city?: string;
            matchType?: string;
            reasonCodes?: string[];
          } => Boolean(item.hospitalId));

        if (hospitals.length > 0) {
          candidates.push({
            id: 'hospital-cards-1',
            type: 'HOSPITAL_RECOMMENDATION_CARDS',
            title: 'Recommended hospitals',
            description: 'Based on your current information, these look like the closest matches.',
            caseId: input.sessionCaseId,
            selectPath: '/select-hospitals',
            hospitals,
          });
        }
      }
      break;

    case 'INVITE_ONLINE_CONSULT':
      if (input.conversionDraft) {
        candidates.push({
          id: 'consult-booking-1',
          type: 'ONLINE_CONSULT_BOOKING_CARD',
          title: 'Request online consultation',
          description: 'Submit your consultation request and we will confirm the next step.',
          requestedAction: 'INVITE_ONLINE_CONSULT',
          convertPath: '/api/v2/chatbot/convert',
          consultationStatus: input.sessionConsultationStatus ?? 'not_started',
          conversionDraft: input.conversionDraft,
        });
      }
      break;

    default:
      break;
  }

  return candidates
    .map((candidate) => chatbotMessageBlockSchema.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function extractStoredChatbotBlocks(metadata: Record<string, unknown>): ChatbotMessageBlock[] {
  const rawBlocks = metadata['blocks'];
  if (!Array.isArray(rawBlocks)) {
    return [];
  }

  return rawBlocks
    .map((candidate) => chatbotMessageBlockSchema.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  return values.length > 0 ? values : undefined;
}
