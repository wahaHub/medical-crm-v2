import { AiChatMessage, AiChatSession as AiChatSessionEntity, type AiChatNextAction } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { buildChatbotBlocks, extractStoredChatbotBlocks } from './chatbot-block-builder.js';
import { resolveChatbotV2FaqGrounding } from './chatbot-v2-faq-grounding.js';
import { buildChatbotV2PostTurnContext, buildChatbotV2TurnContext } from './chatbot-v2-context.js';

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
    'Briefly thank them and explain the most helpful CRM-approved next step.',
    'Use the CRM chatbotV2 context as the source of truth for what can be shown next.',
    'Do not decide whether hospital selection should begin. Only describe recommendations or selection if CRM already exposes those resources.',
  ].filter(Boolean).join(' ');
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
  if (!input.widgetSessionId) {
    return;
  }

  let session = await input.services.aiChatSessionRepo.findBySessionId(input.widgetSessionId, input.site);
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

  try {
    const statusSnapshot = session.statusSnapshot ?? {};
    const chatbotV2Turn = await buildChatbotV2TurnContext({
      services: input.services,
      sessionId: session.sessionId,
      site: session.site,
      userMessage: 'Explain the process',
      classifierOverride: {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      },
    });
    const faqGrounding = chatbotV2Turn.foundation.requiresFaqGrounding
      ? await resolveChatbotV2FaqGrounding({
          services: input.services,
          scopeId: chatbotV2Turn.foundation.scopeId,
          hospitalType: session.hospitalType,
          query: 'Explain the process',
          activeHospitalContext: chatbotV2Turn.foundation.activeHospitalContext,
        })
      : null;
    const difyResponse = await input.services.difyApi.createChatMessage({
      inputs: {
        hospitalType: session.hospitalType,
        sessionId: session.sessionId,
        assistantMessageId,
        currentStatus: JSON.stringify(statusSnapshot),
        conversationSummary: statusSnapshot.conversationSummary,
        destination: input.destination ?? null,
        category: input.category ?? null,
        procedureId: input.procedureId ?? null,
        bootstrapMode: 'WIDGET_STARTER',
        ...(faqGrounding ? { faqGrounding: JSON.stringify(faqGrounding) } : {}),
        chatbotV2: JSON.stringify(chatbotV2Turn.preTurn),
      },
      query: buildWidgetStarterPrompt(input),
      user: session.sessionId,
      conversationId: session.difyConversationId,
    });

    session = await input.services.aiChatSessionRepo.findBySessionId(session.sessionId, session.site) ?? session;

    const normalized = normalizeStarterDifyResponse(difyResponse);
    if (!session.difyConversationId && normalized.conversationId) {
      const updatedSession = typeof input.services.aiChatSessionRepo.setDifyConversationId === 'function'
        ? await input.services.aiChatSessionRepo.setDifyConversationId(session.sessionId, session.site, normalized.conversationId)
        : await input.services.aiChatSessionRepo.save(new AiChatSessionEntity({
            ...session,
            difyConversationId: normalized.conversationId,
            updatedAt: new Date(),
          }));
      session = updatedSession ?? session;
    }

    const richAction = normalized.internalNextAction ?? normalized.nextAction;
    const postTurnChatbotV2 = buildChatbotV2PostTurnContext({
      foundation: chatbotV2Turn.foundation,
      preTurn: chatbotV2Turn.preTurn,
      userMessage: 'Explain the process',
      refreshedStatusSnapshot: session.statusSnapshot,
      assistantNextAction: normalized.nextAction,
      assistantInternalNextAction: richAction,
    });
    const templateId = await resolveQuestionnaireTemplateId(
      input.services,
      richAction,
      input.caseId,
    );
    const blocks = buildChatbotBlocks({
      richAction,
      allowedResourceTypes: postTurnChatbotV2.resources.map((resource) => resource.resourceType),
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
        chatbotV2: postTurnChatbotV2,
        classifierResult: chatbotV2Turn.foundation.classification,
        ...(blocks.length > 0 ? { blocks } : {}),
      },
    });
  } catch (error) {
    try {
      await input.services.aiChatMessageRepo.updateMessage(assistantMessageId, {
        content: GENERIC_WIDGET_STARTER_CONTENT,
        nextAction: null,
        shortlist: [],
        writebackStatus: 'failed',
        metadata: {
          widgetStarterSeed: true,
          widgetStarterVersion: WIDGET_STARTER_VERSION,
          draftState: 'provider_error',
          failureStage: 'widget_starter_generation',
          failureRecordedAt: new Date().toISOString(),
          internalNextAction: null,
          chatbotV2: null,
          classifierResult: null,
          blocks: [],
        },
      });
    } catch {
      // Preserve the original provider failure below even if the fallback writeback also fails.
    }
    throw error;
  }
}

async function resolveQuestionnaireTemplateId(
  services: ReturnType<typeof getServices>,
  richAction: string | null | undefined,
  caseId: string | null,
): Promise<string | null> {
  if (richAction !== 'REQUEST_DOC_UPLOAD' || !caseId) {
    return null;
  }

  const caseEntity = typeof services.caseRepo?.findById === 'function'
    ? await Promise.resolve(services.caseRepo.findById(caseId)).catch(() => null)
    : null;
  if (readMedicalFormStatus(caseEntity?.structuredData as Record<string, unknown> | null) === 'SUBMITTED') {
    return null;
  }
  const caseTemplateId = asString(caseEntity?.questionCollectorTemplateId);
  if (caseTemplateId) {
    return caseTemplateId;
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

function readMedicalFormStatus(structuredData: Record<string, unknown> | null): 'NOT_STARTED' | 'SKIPPED' | 'SUBMITTED' {
  const patientHospitalSelection = asRecord(structuredData?.['patientHospitalSelection']);
  const rawStatus = asString(patientHospitalSelection['medicalFormStatus']);
  return rawStatus === 'SKIPPED' || rawStatus === 'SUBMITTED' ? rawStatus : 'NOT_STARTED';
}
