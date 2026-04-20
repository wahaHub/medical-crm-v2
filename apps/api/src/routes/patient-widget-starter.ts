import { AiChatMessage } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { extractStoredChatbotBlocks } from './chatbot-block-builder.js';

const GENERIC_WIDGET_STARTER_CONTENT = 'Hello, welcome to Medora Health. We have received your basic intake information. The next step will appear here shortly.';
const WIDGET_STARTER_VERSION = 'static-v1';

function isWidgetStarterMessage(message: { role: string; content: string; metadata: Record<string, unknown> }): boolean {
  if (message.role !== 'ASSISTANT') {
    return false;
  }

  if (message.metadata['widgetStarterSeed'] === true) {
    return true;
  }

  return extractStoredChatbotBlocks(message.metadata).length === 0
    && message.content.trim() === GENERIC_WIDGET_STARTER_CONTENT;
}

function isCurrentWidgetStarterVersion(message: { content: string; metadata: Record<string, unknown> }) {
  return message.metadata['widgetStarterSeed'] === true
    && message.metadata['widgetStarterVersion'] === WIDGET_STARTER_VERSION
    && message.content.trim() === GENERIC_WIDGET_STARTER_CONTENT;
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
  void input.caseId;
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

  const payload = {
    content: GENERIC_WIDGET_STARTER_CONTENT,
    nextAction: null,
    shortlist: [],
    writebackStatus: 'succeeded',
    metadata: {
      widgetStarterSeed: true,
      widgetStarterVersion: WIDGET_STARTER_VERSION,
      draftState: 'succeeded',
      starterMode: 'static',
      blocks: [],
    },
  } as const;

  if (existingStarterMessage) {
    await input.services.aiChatMessageRepo.updateMessage(existingStarterMessage.id, payload);
    return;
  }

  await input.services.aiChatMessageRepo.create(new AiChatMessage({
    id: generateId(),
    sessionId: session.id,
    role: 'ASSISTANT',
    content: payload.content,
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: payload.nextAction,
    secondaryAction: null,
    responseMode: null,
    citations: [],
    reasonCodes: [],
    shortlist: payload.shortlist,
    metadata: payload.metadata,
    createdAt: new Date(),
  }));
}
