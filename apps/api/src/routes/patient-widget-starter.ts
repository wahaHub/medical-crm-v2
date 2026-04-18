import { AiChatMessage, type AiChatNextAction } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { buildChatbotBlocks, extractStoredChatbotBlocks } from './chatbot-block-builder.js';
import { buildChatbotV2TurnContext } from './chatbot-v2-context.js';

const GENERIC_WIDGET_STARTER_CONTENT = 'Thanks for sharing your details. We have opened your patient case and the next step will appear here shortly.';
const WIDGET_STARTER_VERSION = 'crm-v1';

function isWidgetStarterMessage(message: { role: string; content: string; metadata: Record<string, unknown> }): boolean {
  if (message.role !== 'ASSISTANT') {
    return false;
  }

  if (message.metadata['widgetStarterSeed'] === true) {
    return true;
  }

  if (extractStoredChatbotBlocks(message.metadata).length > 0) {
    return true;
  }

  return message.content.trim() === GENERIC_WIDGET_STARTER_CONTENT;
}

function isCurrentWidgetStarterVersion(message: { content: string; metadata: Record<string, unknown> }) {
  if (
    message.metadata['widgetStarterSeed'] !== true
    || message.metadata['widgetStarterVersion'] !== WIDGET_STARTER_VERSION
  ) {
    return false;
  }

  const draftState = asString(message.metadata['draftState']);
  if (draftState === 'succeeded') {
    return true;
  }

  if (draftState === 'pending' || draftState === 'provider_error') {
    return false;
  }

  return message.content.trim().length > 0 || extractStoredChatbotBlocks(message.metadata).length > 0;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function selectStarterAction(resourceTypes: string[]): AiChatNextAction | null {
  return resourceTypes.includes('PROCESS_GUIDE')
    ? 'EXPLAIN_MEDICAL_TRAVEL_PROCESS'
    : null;
}

export async function seedWidgetStarterMessage(input: {
  services: ReturnType<typeof getServices>;
  widgetSessionId?: string | null;
  caseId: string;
  site: import('@medical-crm/domain').PatientSite;
  destination?: string | null;
  category?: string | null;
  procedureId?: string | null;
}): Promise<void> {
  void input.destination;
  void input.category;
  void input.procedureId;

  if (!input.widgetSessionId) {
    return;
  }

  const session = await input.services.aiChatSessionRepo.findBySessionId(input.widgetSessionId, input.site);
  if (!session) {
    return;
  }

  const existingMessages = await input.services.aiChatMessageRepo.listBySession(session.id, 20);
  const existingStarterMessage = existingMessages.find((message) => isWidgetStarterMessage(message));
  const hasNonStarterMessages = existingMessages.some((message) => !isWidgetStarterMessage(message));

  if (hasNonStarterMessages) {
    return;
  }

  if (existingStarterMessage && isCurrentWidgetStarterVersion(existingStarterMessage)) {
    return;
  }

  const assistantMessageId = existingStarterMessage?.id ?? generateId();

  if (!existingStarterMessage) {
    await input.services.aiChatMessageRepo.create(new AiChatMessage({
      id: assistantMessageId,
      sessionId: session.id,
      role: 'ASSISTANT',
      content: '',
      intent: null,
      riskLevel: null,
      canAnswer: null,
      nextAction: null,
      secondaryAction: null,
      responseMode: null,
      citations: [],
      reasonCodes: [],
      shortlist: [],
      metadata: {
        widgetStarterSeed: true,
        widgetStarterVersion: WIDGET_STARTER_VERSION,
        draftState: 'pending',
      },
      createdAt: new Date(),
    }));
  }

  const chatbotV2Turn = await buildChatbotV2TurnContext({
    services: input.services,
    sessionId: session.sessionId,
    site: session.site,
    userMessage: '',
  });
  const resourceTypes = chatbotV2Turn.preTurn.resources.map((resource) => resource.resourceType);
  const starterAction = selectStarterAction(resourceTypes);
  const blocks = buildChatbotBlocks({
    richAction: starterAction,
    allowedResourceTypes: resourceTypes,
    shortlist: [],
    sessionCaseId: input.caseId,
    sessionConsultationStatus: session.statusSnapshot?.consultationStatus,
  });

  await input.services.aiChatMessageRepo.updateMessage(assistantMessageId, {
    content: GENERIC_WIDGET_STARTER_CONTENT,
    nextAction: starterAction,
    shortlist: [],
    writebackStatus: 'succeeded',
    metadata: {
      widgetStarterSeed: true,
      widgetStarterVersion: WIDGET_STARTER_VERSION,
      draftState: 'succeeded',
      internalNextAction: starterAction,
      chatbotV2: chatbotV2Turn.preTurn,
      classifierResult: chatbotV2Turn.foundation.classification,
      ...(blocks.length > 0 ? { blocks } : {}),
    },
  });
}
