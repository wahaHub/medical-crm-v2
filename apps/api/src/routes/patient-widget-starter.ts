import { AiChatMessage, AiChatSession as AiChatSessionEntity, type AiChatNextAction } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { buildChatbotBlocks, extractStoredChatbotBlocks } from './chatbot-block-builder.js';

const GENERIC_WIDGET_STARTER_CONTENT = 'Thanks for sharing your details. We have opened your patient case and the next step will appear here shortly.';
const WIDGET_STARTER_VERSION = 'ai-v1';

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => asRecord(item)) : [];
}

function normalizeStarterNextAction(value: string | undefined): AiChatNextAction | null {
  if (!value) {
    return null;
  }

  if (
    value === 'ANSWER_FAQ'
    || value === 'EXPLAIN_DOC_UPLOAD'
    || value === 'EXPLAIN_MEDICAL_TRAVEL_PROCESS'
    || value === 'EXPLAIN_CONSULT_PROCESS'
    || value === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    || value === 'REQUEST_DOC_UPLOAD'
    || value === 'INVITE_ONLINE_CONSULT'
    || value === 'SHOW_PACKAGE'
    || value === 'HUMAN_HANDOFF'
    || value === 'SAFETY_HANDOFF'
  ) {
    return value;
  }

  return null;
}

function parseStarterStructuredAnswer(answer: unknown) {
  if (typeof answer !== 'string') {
    return null;
  }

  const trimmed = answer.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const metadata = asRecord(parsed.metadata);
    const nextAction = normalizeStarterNextAction(
      asString(parsed.nextAction)
      ?? asString(parsed.next_action),
    );
    const internalNextAction = normalizeStarterNextAction(
      asString(parsed.internalNextAction)
      ?? asString(parsed.internal_next_action)
      ?? asString(metadata.internalNextAction)
      ?? asString(metadata.internal_next_action),
    );

    return {
      answer: asString(parsed.answer),
      nextAction,
      internalNextAction,
      shortlist: asRecordArray(parsed.shortlist),
      metadata,
    };
  } catch {
    return null;
  }
}

function normalizeStarterDifyResponse(response: Record<string, unknown>) {
  const parsed = parseStarterStructuredAnswer(response.answer);
  const metadata = asRecord(response.metadata);

  return {
    answer: parsed?.answer ?? asString(response.answer) ?? GENERIC_WIDGET_STARTER_CONTENT,
    nextAction: parsed?.nextAction ?? null,
    internalNextAction: parsed?.internalNextAction ?? null,
    shortlist: parsed?.shortlist ?? [],
    metadata: {
      ...metadata,
      ...parsed?.metadata,
    },
    conversationId: asString(response.conversation_id) ?? null,
  };
}

function buildWidgetStarterPrompt(input: {
  destination?: string | null;
  category?: string | null;
  procedureId?: string | null;
}) {
  const contextBits = [
    input.destination ? `Preferred destination: ${input.destination}.` : null,
    input.category ? `Case category: ${input.category}.` : null,
    input.procedureId ? `Procedure hint: ${input.procedureId}.` : null,
  ].filter((value): value is string => Boolean(value));

  return [
    'The patient has just completed the basic intake form and opened their case in the patient widget.',
    contextBits.join(' '),
    'Start the conversation proactively as the assistant.',
    'Briefly thank them, explain the most helpful next step, and decide whether hospital selection should begin now.',
    'Only trigger hospital recommendations if it is appropriate to begin hospital selection now.',
    'If you do trigger hospital recommendations, first explain why choosing preferred hospitals helps continue the case.',
  ].filter(Boolean).join(' ');
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

  let session = await input.services.aiChatSessionRepo.findBySessionId(input.widgetSessionId);
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

  const statusSnapshot = session.statusSnapshot ?? {};
  const difyResponse = await input.services.difyApi.createChatMessage({
    inputs: {
      hospitalType: session.hospitalType,
      sessionId: session.sessionId,
      assistantMessageId,
      currentStatus: statusSnapshot,
      conversationSummary: statusSnapshot.conversationSummary,
      pendingOffer: statusSnapshot.pendingOffer,
      pendingQuestion: statusSnapshot.pendingQuestion,
      destination: input.destination ?? null,
      category: input.category ?? null,
      procedureId: input.procedureId ?? null,
      bootstrapMode: 'WIDGET_STARTER',
    },
    query: buildWidgetStarterPrompt(input),
    user: session.sessionId,
    conversationId: session.difyConversationId,
  });

  session = await input.services.aiChatSessionRepo.findBySessionId(session.sessionId) ?? session;

  const normalized = normalizeStarterDifyResponse(difyResponse);
  if (!session.difyConversationId && normalized.conversationId) {
    const updatedSession = typeof input.services.aiChatSessionRepo.setDifyConversationId === 'function'
      ? await input.services.aiChatSessionRepo.setDifyConversationId(session.sessionId, normalized.conversationId)
      : await input.services.aiChatSessionRepo.save(new AiChatSessionEntity({
          ...session,
          difyConversationId: normalized.conversationId,
          updatedAt: new Date(),
        }));
    session = updatedSession ?? session;
  }

  const richAction = normalized.internalNextAction ?? normalized.nextAction;
  const templateId = await resolveQuestionnaireTemplateId(
    input.services,
    richAction,
    session.statusSnapshot?.pendingQuestion ?? null,
  );
  const blocks = buildChatbotBlocks({
    richAction,
    shortlist: normalized.shortlist,
    sessionCaseId: input.caseId,
    sessionConsultationStatus: session.statusSnapshot?.consultationStatus,
    templateId,
  });

  await input.services.aiChatMessageRepo.updateMessage(assistantMessageId, {
    content: normalized.answer,
    nextAction: normalized.nextAction,
    shortlist: normalized.shortlist,
    writebackStatus: 'succeeded',
    metadata: {
      ...normalized.metadata,
      widgetStarterSeed: true,
      widgetStarterVersion: WIDGET_STARTER_VERSION,
      draftState: 'succeeded',
      internalNextAction: normalized.internalNextAction,
      ...(blocks.length > 0 ? { blocks } : {}),
    },
  });
}

function resolvePendingQuestionTemplateId(
  pendingQuestion: { type: string; payload: Record<string, unknown> } | null,
): string | null {
  if (!pendingQuestion || pendingQuestion.type !== 'QUESTIONNAIRE') {
    return null;
  }

  const templateId = asString(pendingQuestion.payload['templateId']);
  return templateId ?? null;
}

async function resolveQuestionnaireTemplateId(
  services: ReturnType<typeof getServices>,
  richAction: string | null | undefined,
  pendingQuestion: { type: string; payload: Record<string, unknown> } | null,
): Promise<string | null> {
  const templateId = resolvePendingQuestionTemplateId(pendingQuestion);
  if (templateId) {
    return templateId;
  }

  if (richAction !== 'REQUEST_DOC_UPLOAD') {
    return null;
  }

  try {
    const result = await services.getTemplateByDisease.execute('DEFAULT');
    return typeof result.template.id === 'string' && result.template.id.length > 0
      ? result.template.id
      : null;
  } catch {
    return null;
  }
}
