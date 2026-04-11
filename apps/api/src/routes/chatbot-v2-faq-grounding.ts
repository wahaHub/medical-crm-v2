import type { getServices } from '../composition-root.js';

type Services = ReturnType<typeof getServices>;

export type ChatbotV2FaqGroundingResult = {
  faqScope: 'GENERAL_ONLY' | 'HOSPITAL_AWARE';
  categories: string[];
  groundedContext: string;
};

export async function resolveChatbotV2FaqGrounding(input: {
  services: Services;
  scopeId: string;
  hospitalType: 'COSMETIC' | 'REGULAR';
  query: string;
  activeHospitalContext?: {
    hospitalId: string;
    hospitalName: string | null;
  } | null;
}): Promise<ChatbotV2FaqGroundingResult | null> {
  const trimmedQuery = input.query.trim();
  if (trimmedQuery.length === 0) {
    return null;
  }

  const client = input.services.difyFaqGroundingApi;
  if (!client) {
    console.warn('[chatbot-v2] FAQ grounding client is not configured; skipping FAQ grounding for this turn.');
    return null;
  }

  const response = await client.createChatMessage({
    inputs: {
      hospitalType: input.hospitalType,
      query: trimmedQuery,
      activeHospitalId: input.activeHospitalContext?.hospitalId ?? null,
      activeHospitalName: input.activeHospitalContext?.hospitalName ?? null,
    },
    query: trimmedQuery,
    user: input.scopeId,
  });

  return normalizeFaqGroundingResponse(response);
}

function normalizeFaqGroundingResponse(response: Record<string, unknown>): ChatbotV2FaqGroundingResult | null {
  const parsed = parseStructuredResponse(response.answer);
  const source = parsed ?? response;

  const faqScope = readFaqScope(source);
  const categories = readCategories(source);
  const groundedContext = readGroundedContext(source);

  if (!faqScope || groundedContext.length === 0) {
    return null;
  }

  return {
    faqScope,
    categories,
    groundedContext,
  };
}

function parseStructuredResponse(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readFaqScope(value: Record<string, unknown>): ChatbotV2FaqGroundingResult['faqScope'] | null {
  const raw = asString(value.faqScope ?? value.faq_scope);
  return raw === 'GENERAL_ONLY' || raw === 'HOSPITAL_AWARE' ? raw : null;
}

function readCategories(value: Record<string, unknown>): string[] {
  const raw = value.categories;
  if (!Array.isArray(raw)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string' && item.trim().length > 0) {
      deduped.add(item.trim());
    }
  }
  return [...deduped];
}

function readGroundedContext(value: Record<string, unknown>): string {
  return asString(value.groundedContext ?? value.grounded_context ?? value.context ?? value.context_body) ?? '';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
