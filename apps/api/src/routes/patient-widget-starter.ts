import { AiChatMessage } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { buildChatbotBlocks, extractStoredChatbotBlocks } from './chatbot-block-builder.js';

const GENERIC_WIDGET_STARTER_CONTENT = 'Thanks for sharing your details. We have opened your patient case and the next step will appear here shortly.';

function buildHospitalReason(tags: string[], procedureCount: number): string | undefined {
  const normalizedTags = tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0);
  if (normalizedTags.length > 0) {
    return normalizedTags.slice(0, 2).join(' • ');
  }

  if (procedureCount > 0) {
    return `${procedureCount} relevant procedures`;
  }

  return undefined;
}

function hasHospitalRecommendationBlocks(messages: Array<{ metadata: Record<string, unknown> }>): boolean {
  return messages.some((message) =>
    extractStoredChatbotBlocks(message.metadata).some((block) => block.type === 'HOSPITAL_RECOMMENDATION_CARDS'),
  );
}

function getExistingHospitalRecommendationCount(message: { metadata: Record<string, unknown> } | null | undefined): number {
  if (!message) {
    return 0;
  }

  const recommendationBlock = extractStoredChatbotBlocks(message.metadata)
    .find((block) => block.type === 'HOSPITAL_RECOMMENDATION_CARDS');

  if (!recommendationBlock || !Array.isArray(recommendationBlock.hospitals)) {
    return 0;
  }

  return recommendationBlock.hospitals.length;
}

function isWidgetStarterMessage(message: { role: string; content: string; metadata: Record<string, unknown> }): boolean {
  if (message.role !== 'ASSISTANT') {
    return false;
  }

  if (message.metadata['widgetStarterSeed'] === true) {
    return true;
  }

  if (extractStoredChatbotBlocks(message.metadata).some((block) => block.type === 'HOSPITAL_RECOMMENDATION_CARDS')) {
    return true;
  }

  return message.content.trim() === GENERIC_WIDGET_STARTER_CONTENT;
}

export async function seedWidgetStarterMessage(input: {
  services: ReturnType<typeof getServices>;
  widgetSessionId?: string | null;
  caseId: string;
  destination?: string | null;
  category?: string | null;
  procedureId?: string | null;
}): Promise<void> {
  if (!input.widgetSessionId) {
    return;
  }

  const session = await input.services.aiChatSessionRepo.findBySessionId(input.widgetSessionId);
  if (!session) {
    return;
  }

  const existingMessages = await input.services.aiChatMessageRepo.listBySession(session.id, 20);
  const existingStarterMessage = existingMessages.find((message) => isWidgetStarterMessage(message));

  let shortlist: Array<Record<string, unknown>> = [];

  if (input.destination || input.category || input.procedureId) {
    try {
      const matched = await input.services.matchHospitals.execute({
        destination: input.destination ?? undefined,
        category: input.category ?? undefined,
        procedureId: input.procedureId ?? undefined,
      });
      shortlist = matched.hospitals.slice(0, 3).map((hospital) => ({
        hospitalId: hospital.id,
        name: hospital.nameEn ?? hospital.name,
        thumbnailUrl: hospital.logoUrl ?? undefined,
        reason: buildHospitalReason(hospital.tags, hospital.procedureCount),
        summary: buildHospitalReason(hospital.tags, hospital.procedureCount),
        thumbnailFallbackUrls: [],
      }));
    } catch (error) {
      console.warn('Failed to seed widget starter hospital recommendations:', error);
    }
  }

  const blocks = buildChatbotBlocks({
    richAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
    shortlist,
    sessionCaseId: input.caseId,
  });

  const content = blocks.length > 0
    ? ''
    : GENERIC_WIDGET_STARTER_CONTENT;

  const existingRecommendationCount = getExistingHospitalRecommendationCount(existingStarterMessage);

  if (blocks.length === 0 && existingStarterMessage) {
    return;
  }

  if (blocks.length > 0 && existingRecommendationCount > 0 && existingRecommendationCount <= 3) {
    return;
  }

  if (existingStarterMessage) {
    await input.services.aiChatMessageRepo.updateMessage(existingStarterMessage.id, {
      content,
      nextAction: blocks.length > 0 ? 'SHOW_HOSPITAL_RECOMMENDATIONS' : null,
      shortlist,
      writebackStatus: 'succeeded',
      metadata: {
        ...existingStarterMessage.metadata,
        widgetStarterSeed: true,
        internalNextAction: blocks.length > 0 ? 'SHOW_HOSPITAL_RECOMMENDATIONS' : null,
        ...(blocks.length > 0 ? { blocks } : {}),
      },
    });
    return;
  }

  await input.services.aiChatMessageRepo.create(new AiChatMessage({
    id: generateId(),
    sessionId: session.id,
    role: 'ASSISTANT',
    content,
    intent: null,
    riskLevel: null,
    canAnswer: true,
    nextAction: blocks.length > 0 ? 'SHOW_HOSPITAL_RECOMMENDATIONS' : null,
    citations: [],
    shortlist,
    writebackStatus: 'succeeded',
    metadata: {
      widgetStarterSeed: true,
      internalNextAction: blocks.length > 0 ? 'SHOW_HOSPITAL_RECOMMENDATIONS' : null,
      ...(blocks.length > 0 ? { blocks } : {}),
    },
    createdAt: new Date(),
  }));
}
