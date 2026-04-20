import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { AiChatCitation, AiChatSession } from '@medical-crm/domain';
import { AiChatMessage, AiChatSession as AiChatSessionEntity, Conversation, Message } from '@medical-crm/domain';
import { toActor, toMessageDTO } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  chatbotChatSchema,
  chatbotConvertSchema,
  chatbotEscalateSchema,
  chatbotHistoryQuerySchema,
  chatbotSessionParamSchema,
  chatbotUploadInitSchema,
} from '@medical-crm/validation';
import {
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
  AI_POLICY_RESOLVED_INTENTS,
  generateId,
} from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { PatientSiteContextError, resolvePatientSiteContext } from '../patient-site-context.js';
import { resolveChatbotV2FaqGrounding } from './chatbot-v2-faq-grounding.js';
import { buildChatbotV2PostTurnContext, buildChatbotV2TurnContext } from './chatbot-v2-context.js';
import { wsManager } from '../ws/ws-manager.js';

export const chatbotPublicRoutes = new OpenAPIHono();
export const chatbotProtectedRoutes = new OpenAPIHono();
const app = new OpenAPIHono();
const CHATBOT_SESSION_SECRET_COOKIE = 'chatbot_session_secret';
const PATIENT_SESSION_COOKIE = 'patient_session';
const PATIENT_RESTORE_COOKIE = 'patient_restore';
const AI_MIRROR_SENDER_NAME = 'Medora AI';
const AI_MIRROR_SENDER_ROLE = 'AI';
const SYSTEM_SENDER_NAME = 'System';
const HUMAN_TAKEOVER_NOTICE = 'Medora AI 已转人工，现由顾问接手';
const DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK = {
  resolvedIntent: 'UNKNOWN',
  engagementSignal: 'LIGHT_DISCOVERY',
  progressionSignal: 'NONE',
  recommendationSignal: 'NONE',
  mentionsCondition: false,
  mentionsDoctorOrHospitalNeed: false,
} as const satisfies {
  resolvedIntent: import('@medical-crm/utils').AiPolicyResolvedIntent;
  engagementSignal: import('@medical-crm/utils').AiPolicyEngagementSignal;
  progressionSignal: import('@medical-crm/utils').AiPolicyProgressionSignal;
  recommendationSignal: import('@medical-crm/utils').AiPolicyRecommendationSignal;
  mentionsCondition: boolean;
  mentionsDoctorOrHospitalNeed: boolean;
};

function buildNotificationPreview(content: string | null | undefined): string {
  const normalized = (content ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Open Medora to read the latest message.';
  return normalized.length > 180 ? `${normalized.slice(0, 179).trimEnd()}...` : normalized;
}

function getDifyChatApiKey(): string | null {
  return process.env['DIFY_APP_API_KEY'] ?? process.env['DIFY_API_KEY'] ?? null;
}

const sendChatRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/chat',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotChatSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Chatbot response' },
    401: { description: 'Missing or invalid chatbot session secret' },
    403: { description: 'Logged-in patient does not own this chatbot session' },
    500: { description: 'Chatbot provider unavailable or misconfigured' },
  },
});

chatbotPublicRoutes.openapi(sendChatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  let site;

  if (!getDifyChatApiKey()) {
    return c.json({ error: 'Dify API key is not configured' }, 500);
  }

  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }

  let session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId, site);
  let sessionSecretToSet: string | null = null;
  let effectiveHospitalType = body.hospitalType ?? null;

  if (!session) {
    if (!effectiveHospitalType) {
      return c.json({ error: 'Hospital type is required when starting a new chatbot session' }, 400);
    }
    sessionSecretToSet = createSessionSecret();
    session = await svc.aiChatSessionRepo.save(new AiChatSessionEntity({
      id: generateId(),
      sessionId: body.sessionId,
      site,
      sessionSecretHash: hashSessionSecret(sessionSecretToSet),
      difyConversationId: null,
      patientId: null,
      hospitalType: effectiveHospitalType,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  } else {
    const authorized = await authorizeSessionAccess(c, svc, session, { allowBootstrapWhenSecretMissing: true });
    if (authorized) {
      return authorized;
    }
    if (body.hospitalType && session.hospitalType !== body.hospitalType) {
      return c.json({ error: 'Hospital type does not match existing chatbot session' }, 409);
    }
    effectiveHospitalType = session.hospitalType;
    if (!session.sessionSecretHash) {
      sessionSecretToSet = createSessionSecret();
      session = await svc.aiChatSessionRepo.save(new AiChatSessionEntity({
        ...session,
        sessionSecretHash: hashSessionSecret(sessionSecretToSet),
        updatedAt: new Date(),
      }));
    }
  }

  const patientSync = await attachPatientFromCookie(c, svc, session);
  if (patientSync.error) {
    return patientSync.error;
  }
  session = patientSync.session;
  const userAttachments = body.attachments ?? [];
  const normalizedUserMessage = body.message.trim().length > 0
    ? body.message
    : (userAttachments.length > 0 ? 'Uploaded attachments' : '');

  const userMessage = await svc.aiChatMessageRepo.create(new AiChatMessage({
    id: generateId(),
    sessionId: session.id,
    role: 'USER',
    content: body.message,
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: null,
    citations: [],
    metadata: {
      ...(body.pageContext ? { pageContext: body.pageContext } : {}),
      ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
    },
    createdAt: new Date(),
  }));

  let mirroredConversation: Conversation | null = null;
  try {
    mirroredConversation = await resolveAdminConversationForChatbotSession(svc, session);
  } catch (error) {
    console.error('[chatbot-mirror] failed to resolve admin conversation', {
      sessionId: session.sessionId,
      patientId: session.patientId,
      site: session.site,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'Unable to preserve patient turn in formal conversation' }, 503);
  }

  if (mirroredConversation) {
    let mirroredPatientMessage;
    try {
      mirroredPatientMessage = await mirrorMessageIntoConversation(svc, mirroredConversation, new Message({
        id: userMessage.id,
        conversationId: mirroredConversation.id,
        senderId: session.patientId,
        senderRole: 'PATIENT',
        content: normalizedUserMessage,
        originalLanguage: null,
        translatedContent: null,
        messageType: 'TEXT',
        moderationStatus: 'ALLOWED',
        attachments: userAttachments,
        aiSummary: null,
        createdAt: userMessage.createdAt,
      }));
    } catch (error) {
      console.error('[chatbot-mirror] failed to preserve patient turn in conversation', {
        conversationId: mirroredConversation.id,
        sessionId: session.sessionId,
        messageId: userMessage.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: 'Unable to preserve patient turn in formal conversation' }, 503);
    }
    wsManager.broadcast(`conv:${mirroredConversation.id}`, {
      type: 'new_message',
      data: toMessageDTO(mirroredPatientMessage),
    });
    if (mirroredConversation.caseId && session.patientId) {
      try {
        await svc.notifyAdminsOfPatientMessage.execute({
          conversationId: mirroredConversation.id,
          caseId: mirroredConversation.caseId,
          patientId: session.patientId,
          patientName: null,
          messagePreview: buildNotificationPreview(normalizedUserMessage),
        });
      } catch (error) {
        console.warn('Failed to notify admins about a mirrored chatbot patient message:', error);
      }
    }
    if (mirroredConversation.assistantMode === 'HUMAN_TAKEOVER') {
      const suppressedAssistant = await svc.aiChatMessageRepo.create(new AiChatMessage({
        id: generateId(),
        sessionId: session.id,
        role: 'ASSISTANT',
        content: '',
        intent: null,
        riskLevel: null,
        canAnswer: false,
        nextAction: 'HUMAN_HANDOFF',
        citations: [],
        metadata: {
          assistantSuppressed: true,
          suppressionReason: 'human_takeover_active',
        },
        createdAt: new Date(),
      }));
      if (sessionSecretToSet) {
        setChatbotSessionSecretCookie(c, sessionSecretToSet);
      }
      return buildSuppressedAssistantResponse(c, session.sessionId, userMessage.id, suppressedAssistant.id);
    }
  }

  const assistantMessageId = generateId();
  await svc.aiChatMessageRepo.create(new AiChatMessage({
    id: assistantMessageId,
    sessionId: session.id,
    role: 'ASSISTANT',
    content: '',
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: null,
    citations: [],
    metadata: {
      draftState: 'pending',
    },
    createdAt: new Date(),
  }));

  let difyResponse: Record<string, unknown>;
  let chatbotV2Turn: Awaited<ReturnType<typeof buildChatbotV2TurnContext>> | null = null;
  try {
    chatbotV2Turn = await buildChatbotV2TurnContext({
      services: svc,
      sessionId: session.sessionId,
      site: session.site,
      userMessage: normalizedUserMessage,
      pageContext: body.pageContext ?? null,
    });
    const faqGrounding = chatbotV2Turn.foundation.requiresFaqGrounding
      ? await resolveChatbotV2FaqGrounding({
          services: svc,
          scopeId: chatbotV2Turn.foundation.scopeId,
          hospitalType: effectiveHospitalType,
          query: normalizedUserMessage,
          activeHospitalContext: chatbotV2Turn.foundation.activeHospitalContext,
        })
      : null;
    difyResponse = await svc.difyApi.createChatMessage({
      inputs: {
        hospitalType: effectiveHospitalType,
        sessionId: body.sessionId,
        site: session.site,
        assistantMessageId,
        attachmentsJson: JSON.stringify(userAttachments),
        pageContextJson: body.pageContext ? JSON.stringify(body.pageContext) : 'null',
        currentStatus: JSON.stringify(session.statusSnapshot),
        conversationSummary: session.statusSnapshot.conversationSummary,
        attachments: JSON.stringify(userAttachments),
        pageContext: body.pageContext ? JSON.stringify(body.pageContext) : 'null',
        ...(faqGrounding ? { faqGrounding: JSON.stringify(faqGrounding) } : {}),
        chatbotV2: JSON.stringify(chatbotV2Turn.preTurn),
      },
      query: normalizedUserMessage,
      user: body.sessionId,
      conversationId: session.difyConversationId,
    });
  } catch (error) {
    await svc.aiChatMessageRepo.updateMessage(assistantMessageId, {
      metadata: {
        draftState: 'provider_error',
        failureStage: 'provider_request',
        failureRecordedAt: new Date().toISOString(),
      },
    }).catch(() => undefined);
    return c.json({
      error: error instanceof Error ? error.message : 'Dify request failed',
    }, 502);
  }

  if (!chatbotV2Turn) {
    return c.json({ error: 'Chatbot v2 turn context missing after provider response' }, 500);
  }

  const normalized = normalizeDifyChatResponse(difyResponse);
  session = await svc.aiChatSessionRepo.findBySessionId(session.sessionId, session.site) ?? session;

  if (!session.difyConversationId && normalized.conversationId) {
    const updatedSession = typeof svc.aiChatSessionRepo.setDifyConversationId === 'function'
      ? await svc.aiChatSessionRepo.setDifyConversationId(session.sessionId, session.site, normalized.conversationId)
      : await svc.aiChatSessionRepo.save(new AiChatSessionEntity({
          ...session,
          difyConversationId: normalized.conversationId,
          updatedAt: new Date(),
        }));
    session = updatedSession ?? session;
  }

  const richAction = asString((normalized.metadata as Record<string, unknown>).internalNextAction) ?? normalized.nextAction;
  const sessionMessagesRaw = (
    richAction === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    || richAction === 'INVITE_ONLINE_CONSULT'
  )
    ? await svc.aiChatMessageRepo.listBySession(session.id, 100)
    : null;
  const sessionMessages = Array.isArray(sessionMessagesRaw) ? sessionMessagesRaw : [];
  const workflowState = richAction === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    ? extractWorkflowState(sessionMessages)
    : { caseId: null, patientId: null, ticketId: null, lastConvertAction: null };
  const sessionCaseId = workflowState.caseId ?? extractWidgetSessionCaseId(session.sessionId);
  const publicChatbotV2 = {
    ...chatbotV2Turn.preTurn,
    resources: enrichChatbotV2Resources({
      resources: chatbotV2Turn.preTurn.resources,
      shortlist: normalized.shortlist,
      sessionCaseId,
      sessionConsultationStatus: session.statusSnapshot?.consultationStatus,
      templateId: null,
      conversionDraft: null,
    }),
  };
  const postTurnChatbotV2Base = buildChatbotV2PostTurnContext({
    foundation: chatbotV2Turn.foundation,
    preTurn: chatbotV2Turn.preTurn,
    userMessage: normalizedUserMessage,
    refreshedStatusSnapshot: session.statusSnapshot,
    assistantNextAction: normalized.nextAction,
    assistantInternalNextAction: richAction,
  });
  const templateId = await resolveQuestionnaireTemplateId(
    svc,
    richAction,
    sessionCaseId,
  );
  const conversionDraft = richAction === 'INVITE_ONLINE_CONSULT'
    ? buildConsultConversionDraft(
        session.sessionId,
        mergeConsultCollectedFields(sessionMessages, normalized.collectedFields),
      )
    : null;
  const postTurnChatbotV2 = {
    ...postTurnChatbotV2Base,
    resources: enrichChatbotV2Resources({
      resources: postTurnChatbotV2Base.resources,
      shortlist: normalized.shortlist,
      sessionCaseId,
      sessionConsultationStatus: session.statusSnapshot?.consultationStatus,
      templateId,
      conversionDraft,
    }),
  };
  const assistantMessage = await svc.aiChatMessageRepo.updateMessage(assistantMessageId, {
    content: normalized.answer,
    intent: normalized.intent,
    resolvedIntent: normalized.resolvedIntent ?? normalized.intent ?? null,
    riskLevel: normalized.riskLevel,
    canAnswer: normalized.canAnswer,
    nextAction: normalized.nextAction,
    secondaryAction: normalized.secondaryAction,
    responseMode: normalized.responseMode,
    citations: normalized.citations,
    reasonCodes: normalized.reasonCodes,
    shortlist: normalized.shortlist,
    metadata: {
      ...normalized.metadata,
      draftState: 'succeeded',
      chatbotV2: {
        ...publicChatbotV2,
        resources: enrichChatbotV2Resources({
          resources: publicChatbotV2.resources,
          shortlist: normalized.shortlist,
          sessionCaseId,
          sessionConsultationStatus: session.statusSnapshot?.consultationStatus,
          templateId,
          conversionDraft,
        }),
      },
      chatbotV2Floor: postTurnChatbotV2,
      classifierResult: chatbotV2Turn.foundation.classification,
    },
  });

  if (!assistantMessage) {
    return c.json({ error: 'Assistant message draft missing after Dify response' }, 500);
  }

  if (mirroredConversation) {
    const latestConversationState = await svc.conversationRepo.findById(mirroredConversation.id);
    if (latestConversationState?.assistantMode === 'HUMAN_TAKEOVER' || normalized.nextAction === 'HUMAN_HANDOFF') {
      let handoffNotice = null;
      if (normalized.nextAction === 'HUMAN_HANDOFF') {
        handoffNotice = await transitionConversationToHumanTakeover(svc, latestConversationState ?? mirroredConversation);
      }
      await svc.aiChatMessageRepo.updateMessage(assistantMessageId, {
        content: '',
        canAnswer: false,
        nextAction: 'HUMAN_HANDOFF',
        metadata: {
          ...(assistantMessage.metadata ?? {}),
          assistantSuppressed: true,
          suppressionReason: normalized.nextAction === 'HUMAN_HANDOFF'
            ? 'assistant_requested_handoff'
            : 'human_takeover_active',
        },
      });
      if (handoffNotice) {
        wsManager.broadcast(`conv:${mirroredConversation.id}`, {
          type: 'new_message',
          data: handoffNotice,
        });
      }
      if (sessionSecretToSet) {
        setChatbotSessionSecretCookie(c, sessionSecretToSet);
      }
      return buildSuppressedAssistantResponse(c, session.sessionId, userMessage.id, assistantMessageId);
    }

    let mirroredAssistantMessage;
    try {
      mirroredAssistantMessage = await persistAssistantMirrorIfConversationAllows(svc, mirroredConversation, new Message({
        id: assistantMessage.id,
        conversationId: mirroredConversation.id,
        senderId: null,
        senderRoleOverride: AI_MIRROR_SENDER_ROLE,
        senderNameOverride: AI_MIRROR_SENDER_NAME,
        senderRole: AI_MIRROR_SENDER_ROLE,
        senderName: AI_MIRROR_SENDER_NAME,
        content: assistantMessage.content,
        originalLanguage: null,
        translatedContent: null,
        messageType: 'TEXT',
        moderationStatus: 'ALLOWED',
        attachments: [],
        aiSummary: null,
        createdAt: assistantMessage.createdAt,
      }));
    } catch (error) {
      console.error('[chatbot-mirror] failed to persist assistant reply into formal conversation', {
        conversationId: mirroredConversation.id,
        sessionId: session.sessionId,
        messageId: assistantMessage.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await invalidateAssistantDraftAfterMirrorFailure(svc, assistantMessageId);
      return c.json({ error: 'Unable to persist assistant reply in formal conversation' }, 503);
    }
    if (mirroredAssistantMessage) {
      wsManager.broadcast(`conv:${mirroredConversation.id}`, {
        type: 'new_message',
        data: toMessageDTO(mirroredAssistantMessage),
      });
    } else {
      await svc.aiChatMessageRepo.updateMessage(assistantMessageId, {
        content: '',
        canAnswer: false,
        nextAction: 'HUMAN_HANDOFF',
        metadata: {
          ...(assistantMessage.metadata ?? {}),
          assistantSuppressed: true,
          suppressionReason: 'human_takeover_active',
        },
      });
      if (sessionSecretToSet) {
        setChatbotSessionSecretCookie(c, sessionSecretToSet);
      }
      return buildSuppressedAssistantResponse(c, session.sessionId, userMessage.id, assistantMessageId);
    }
  }

  if (sessionSecretToSet) {
    setChatbotSessionSecretCookie(c, sessionSecretToSet);
  }

  return c.json({
    sessionId: session.sessionId,
    messageId: assistantMessage.id,
    answer: assistantMessage.content,
    intent: assistantMessage.intent,
    nextAction: assistantMessage.nextAction,
    topic: normalized.topic,
    riskLevel: assistantMessage.riskLevel,
    canAnswer: assistantMessage.canAnswer,
    secondaryAction: assistantMessage.secondaryAction,
    responseMode: assistantMessage.responseMode,
    citations: assistantMessage.citations,
    collectedFields: normalized.collectedFields,
    missingItems: normalized.missingItems,
    recommendedProviders: normalized.recommendedProviders,
    reasonCodes: assistantMessage.reasonCodes,
    shortlist: assistantMessage.shortlist,
    journeySnapshot: publicChatbotV2.journeySnapshot,
    resources: enrichChatbotV2Resources({
      resources: publicChatbotV2.resources,
      shortlist: normalized.shortlist,
      sessionCaseId,
      sessionConsultationStatus: session.statusSnapshot?.consultationStatus,
      templateId,
      conversionDraft,
    }),
    metadata: normalizePublicMetadataForHistory(assistantMessage.metadata),
    history: {
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    },
  }, 200);
});

const bootstrapChatbotSyncRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/sync',
  responses: {
    200: { description: 'FAQ and package full sync jobs enqueued' },
    403: { description: 'Admin only' },
  },
});

chatbotProtectedRoutes.openapi(bootstrapChatbotSyncRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  if (actor.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const svc = getServices();
  const result = await svc.bootstrapAiSync.execute(actor);
  return c.json(result, 200);
});

const convertChatRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/convert',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotConvertSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Chatbot conversation converted into case-first onboarding' },
    401: { description: 'Missing or invalid chatbot session secret' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(convertChatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const site = resolvePatientSiteContext(c);
  let session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId, site);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session);
  if (authorized) {
    return authorized;
  }

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, 200);
  const existingWorkflow = extractWorkflowState(messages);
  const existingAction = existingWorkflow.lastConvertAction ?? body.requestedAction ?? 'INVITE_ONLINE_CONSULT';

  if (!session.patientId && existingWorkflow.patientId) {
    session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, session.site, existingWorkflow.patientId)) ?? session;
  } else {
    const patientSync = await attachPatientFromCookie(c, svc, session);
    if (patientSync.error) {
      return patientSync.error;
    }
    session = patientSync.session;
  }

  if (existingWorkflow.caseId) {
    const { restoreToken } = await ensurePatientSessionCookies(c, svc, existingWorkflow.patientId ?? session.patientId);
    return c.json({
      sessionId: session.sessionId,
      patientId: existingWorkflow.patientId ?? session.patientId,
      caseId: existingWorkflow.caseId,
      restoreToken: restoreToken ?? undefined,
      requestedAction: existingAction,
      alreadyExists: true,
    }, 200);
  }

  const ensured = await ensureCaseForSession(c, svc, session, body);
  session = ensured.session;

  await recordWorkflowMessage(svc, session.id, {
    kind: 'CONVERT',
    requestedAction: body.requestedAction ?? 'INVITE_ONLINE_CONSULT',
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    form: buildLeadFormMetadata(body),
  });

  return c.json({
    sessionId: session.sessionId,
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    restoreToken: ensured.restoreToken,
    requestedAction: body.requestedAction ?? 'INVITE_ONLINE_CONSULT',
    isExistingPatient: ensured.isExistingPatient,
    alreadyExists: false,
  }, 200);
});

const escalateChatRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/escalate',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotEscalateSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Chatbot conversation escalated to support ticket' },
    401: { description: 'Missing or invalid chatbot session secret' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(escalateChatRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const site = resolvePatientSiteContext(c);
  let session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId, site);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session);
  if (authorized) {
    return authorized;
  }

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, 200);
  const existingWorkflow = extractWorkflowState(messages);
  if (!session.patientId && existingWorkflow.patientId) {
    session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, session.site, existingWorkflow.patientId)) ?? session;
  } else {
    const patientSync = await attachPatientFromCookie(c, svc, session);
    if (patientSync.error) {
      return patientSync.error;
    }
    session = patientSync.session;
  }

  if (existingWorkflow.ticketId) {
    const { restoreToken } = await ensurePatientSessionCookies(c, svc, existingWorkflow.patientId ?? session.patientId);
    if (session.status !== 'ESCALATED') {
      session = (await svc.aiChatSessionRepo.updateStatus(session.sessionId, session.site, 'ESCALATED')) ?? session;
    }
    return c.json({
      sessionId: session.sessionId,
      patientId: existingWorkflow.patientId ?? session.patientId,
      caseId: existingWorkflow.caseId,
      ticketId: existingWorkflow.ticketId,
      restoreToken: restoreToken ?? undefined,
      alreadyExists: true,
    }, 200);
  }

  const ensured = existingWorkflow.caseId
    ? await ensureExistingCaseForSession(c, svc, session, existingWorkflow.caseId, body, existingWorkflow.patientId)
    : await ensureCaseForSession(c, svc, session, body);
  session = ensured.session;

  const transcriptMessages = await svc.aiChatMessageRepo.listBySession(session.id, 50);
  const ticket = await svc.createTicket.execute({
    caseId: ensured.caseId,
    type: 'AI_ESCALATION',
    priority: 'MEDIUM',
    subject: buildEscalationSubject(body.conditionSummary),
    description: buildEscalationDescription(body, transcriptMessages),
    sourcePage: '/chatbot',
  }, {
    userId: ensured.patientId,
    email: body.email,
    role: 'PATIENT',
    hospitalId: null,
  });
  try {
    await svc.notifyAdminsOfNewTicket.execute({
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      patientId: ensured.patientId,
      patientName: body.name,
      subject: buildEscalationSubject(body.conditionSummary),
      descriptionPreview: buildEscalationDescription(body, transcriptMessages),
    });
  } catch (error) {
    console.warn('Failed to notify admins about chatbot escalation ticket:', error);
  }

  session = (await svc.aiChatSessionRepo.updateStatus(session.sessionId, session.site, 'ESCALATED')) ?? session;

  await recordWorkflowMessage(svc, session.id, {
    kind: 'ESCALATE',
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    ticketId: ticket.id,
    reason: body.reason ?? null,
    form: buildLeadFormMetadata(body),
  });

  return c.json({
    sessionId: session.sessionId,
    patientId: ensured.patientId,
    caseId: ensured.caseId,
    ticketId: ticket.id,
    restoreToken: ensured.restoreToken ?? undefined,
    alreadyExists: false,
  }, 200);
});

const initChatbotUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/uploads/init',
  request: {
    body: {
      content: { 'application/json': { schema: chatbotUploadInitSchema } },
      required: true,
    },
  },
  responses: {
    201: { description: 'Chatbot document upload initialized' },
    401: { description: 'Missing or invalid chatbot session secret' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(initChatbotUploadRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const site = resolvePatientSiteContext(c);
  const session = await svc.aiChatSessionRepo.findBySessionId(body.sessionId, site);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session, { allowBootstrapWhenSecretMissing: true });
  if (authorized) {
    return authorized;
  }

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'chatbot_request_docs',
    ownerType: 'ai_chat_session',
    ownerId: session.id,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  return c.json({
    upload: {
      uploadUrl: result.uploadUrl,
      storageKey: result.storageKey,
      expiresIn: result.expiresIn,
    },
    asset: result.asset,
  }, 201);
});

const getChatbotHistoryRoute = createRoute({
  method: 'get',
  path: '/api/v2/chatbot/history/{sessionId}',
  request: {
    params: chatbotSessionParamSchema,
    query: chatbotHistoryQuerySchema,
  },
  responses: {
    200: { description: 'Chatbot message history' },
    401: { description: 'Missing or invalid chatbot session secret' },
    403: { description: 'Logged-in patient does not own this chatbot session' },
    404: { description: 'Chatbot session not found' },
  },
});

chatbotPublicRoutes.openapi(getChatbotHistoryRoute, async (c) => {
  const { sessionId } = c.req.valid('param');
  const { limit } = c.req.valid('query');
  const svc = getServices();
  const site = resolvePatientSiteContext(c);
  const session = await svc.aiChatSessionRepo.findBySessionId(sessionId, site);

  if (!session) {
    return c.json({ error: 'Chatbot session not found' }, 404);
  }

  const authorized = await authorizeSessionAccess(c, svc, session, { allowBootstrapWhenSecretMissing: true });
  if (authorized) {
    return authorized;
  }

  const messages = await svc.aiChatMessageRepo.listBySession(session.id, limit);
  const visibleMessages = messages.filter((message) => !isProviderFailedDraft(message));
  const attachmentKeys = visibleMessages
    .flatMap((message) => extractChatbotAttachments(message))
    .map((attachment) => attachment.storageKey)
    .filter((storageKey) =>
      storageKey &&
      !storageKey.startsWith('http://') &&
      !storageKey.startsWith('https://') &&
      !storageKey.startsWith('data:'),
    );
  const signedUrls = attachmentKeys.length > 0
    ? await svc.storage.getSignedUrls(Array.from(new Set(attachmentKeys)))
    : {};

  return c.json({
    session: {
      sessionId: session.sessionId,
      hospitalType: session.hospitalType,
      status: session.status,
      patientId: session.patientId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    messages: visibleMessages.reverse().map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      nextAction: normalizePublicNextAction(message.nextAction ?? undefined),
      intent: derivePublicIntent({
        intent: message.intent,
        resolvedIntent: message.resolvedIntent
          ?? asString(message.metadata.resolvedIntent)
          ?? asString(message.metadata.resolved_intent)
          ?? null,
        nextAction: normalizePublicNextAction(message.nextAction ?? undefined),
        riskLevel: message.riskLevel,
      }),
      topic: asString(message.metadata.topic) ?? null,
      riskLevel: message.riskLevel,
      canAnswer: message.canAnswer,
      secondaryAction: message.secondaryAction,
      responseMode: message.responseMode,
      citations: message.citations,
      reasonCodes: message.reasonCodes,
      shortlist: message.shortlist,
      metadata: normalizePublicMetadataForHistory(message.metadata),
      attachments: toPublicChatbotAttachments(extractChatbotAttachments(message), signedUrls),
      createdAt: message.createdAt.toISOString(),
    })),
  }, 200);
});

async function authorizeSessionAccess(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
  options?: { allowBootstrapWhenSecretMissing?: boolean },
) {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  if (session.site && session.site !== site) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const patientToken = session.patientId ? getCookie(c, PATIENT_SESSION_COOKIE) : undefined;
  if (session.patientId) {
    if (patientToken) {
      try {
        const payload = await svc.patientAuthService.verifySessionToken(patientToken, site);
        if (payload.userId === session.patientId) {
          return null;
        }
        return c.json({ error: 'Forbidden' }, 403);
      } catch {
        // Ignore stale patient cookies here and fall back to chatbot-session authorization.
      }
    }
  }

  const rawSecret = getCookie(c, CHATBOT_SESSION_SECRET_COOKIE);
  const allowBootstrapAccess = !session?.sessionSecretHash && options?.allowBootstrapWhenSecretMissing;
  if (allowBootstrapAccess) {
    if (!session.patientId) {
      return null;
    }
    if (patientToken) {
      return c.json({ error: 'Invalid or expired patient session' }, 401);
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (!allowBootstrapAccess && (!session?.sessionSecretHash || !rawSecret || hashSessionSecret(rawSecret) !== session.sessionSecretHash)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (session.patientId) {
    if (patientToken) {
      try {
        const payload = await svc.patientAuthService.verifySessionToken(patientToken, site);
        if (payload.userId !== session.patientId) {
          return c.json({ error: 'Forbidden' }, 403);
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

async function attachPatientFromCookie(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
): Promise<{ session: AiChatSession; error: Response | null }> {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return { session, error: c.json({ error: error.message }, 400) };
    }
    throw error;
  }
  const patientToken = getCookie(c, PATIENT_SESSION_COOKIE);
  if (!patientToken) {
    return { session, error: null };
  }

  try {
    const payload = await svc.patientAuthService.verifySessionToken(patientToken, site);
    if (session.patientId && session.patientId !== payload.userId) {
      return { session, error: c.json({ error: 'Forbidden' }, 403) };
    }
    if (!session.patientId) {
      session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, session.site, payload.userId)) ?? session;
    }
    return { session, error: null };
  } catch {
    return { session, error: null };
  }
}

async function resolveAdminConversationForChatbotSession(
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
): Promise<Conversation | null> {
  const caseId = await resolveChatbotCaseIdForMirroring(svc, session);
  if (!caseId) {
    return null;
  }

  const existing = await svc.conversationRepo.findMany({
    page: 1,
    limit: 10,
    caseId,
    category: 'ADMIN_PATIENT',
  });
  const conversation = existing.data[0];
  if (conversation) {
    return conversation;
  }

  const now = new Date();
  const newConversation = new Conversation({
    id: generateId(),
    caseId,
    hospitalId: null,
    category: 'ADMIN_PATIENT',
    title: null,
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    createdAt: now,
    updatedAt: now,
  });

  return svc.conversationRepo.findOrCreateAdminPatientConversation(newConversation);
}

async function tryResolveAdminConversationForChatbotSession(
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
): Promise<Conversation | null> {
  try {
    return await resolveAdminConversationForChatbotSession(svc, session);
  } catch (error) {
    console.error('[chatbot-mirror] failed to resolve admin conversation', {
      sessionId: session.sessionId,
      patientId: session.patientId,
      site: session.site,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function resolveChatbotCaseIdForMirroring(
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
): Promise<string | null> {
  const widgetCaseId = extractWidgetSessionCaseId(session.sessionId);
  if (widgetCaseId) {
    return widgetCaseId;
  }

  const sessionMessages = await svc.aiChatMessageRepo.listBySession(session.id, 100);
  return extractWorkflowState(sessionMessages).caseId;
}

async function mirrorMessageIntoConversation(
  svc: ReturnType<typeof getServices>,
  conversation: Conversation,
  message: Message,
  tx?: unknown,
): Promise<Message> {
  const messageRepo = svc.messageRepo as typeof svc.messageRepo & {
    save(entity: Message, transaction?: unknown): Promise<Message>;
  };
  const conversationRepo = svc.conversationRepo as typeof svc.conversationRepo & {
    save(entity: Conversation, transaction?: unknown): Promise<Conversation>;
  };
  const saved = await messageRepo.save(message, tx);
  conversation.updateLastMessage({
    id: saved.id,
    content: saved.content,
    senderId: saved.senderId,
    createdAt: saved.createdAt,
  });
  await conversationRepo.save(conversation, tx);
  return saved;
}

async function persistAssistantMirrorIfConversationAllows(
  svc: ReturnType<typeof getServices>,
  conversation: Conversation,
  message: Message,
): Promise<Message | null> {
  return svc.txRunner.run(async (tx) => {
    const guardedConversationRepo = svc.conversationRepo as typeof svc.conversationRepo & {
      findById(id: string, transaction?: unknown): Promise<Conversation | null>;
      findByIdForUpdate?(id: string, transaction?: unknown): Promise<Conversation | null>;
    };
    const lockedConversation = (guardedConversationRepo.findByIdForUpdate
      ? await guardedConversationRepo.findByIdForUpdate(conversation.id, tx)
      : await guardedConversationRepo.findById(conversation.id, tx))
      ?? conversation;

    if (lockedConversation.category === 'ADMIN_PATIENT' && lockedConversation.assistantMode === 'HUMAN_TAKEOVER') {
      return null;
    }

    return mirrorMessageIntoConversation(svc, lockedConversation, message, tx);
  });
}

async function invalidateAssistantDraftAfterMirrorFailure(
  svc: ReturnType<typeof getServices>,
  assistantMessageId: string,
): Promise<void> {
  try {
    const invalidated = await svc.aiChatMessageRepo.updateMessage(assistantMessageId, {
      content: '',
      intent: null,
      resolvedIntent: null,
      canAnswer: false,
      nextAction: null,
      secondaryAction: null,
      responseMode: null,
      citations: [],
      reasonCodes: [],
      shortlist: [],
      metadata: {
        draftState: 'delivery_error',
        failureStage: 'formal_conversation_mirror',
        failureRecordedAt: new Date().toISOString(),
      },
      writebackStatus: 'failed',
    });

    if (invalidated) {
      return;
    }
  } catch {
    // Fall through to best-effort deletion.
  }

  await svc.aiChatMessageRepo.deleteById(assistantMessageId).catch(() => undefined);
}

async function transitionConversationToHumanTakeover(
  svc: ReturnType<typeof getServices>,
  conversation: Conversation,
): Promise<ReturnType<typeof toMessageDTO> | null> {
  if (conversation.category !== 'ADMIN_PATIENT') {
    return null;
  }
  if (conversation.assistantMode === 'HUMAN_TAKEOVER') {
    return null;
  }

  return svc.txRunner.run(async (tx) => {
    const guardedConversationRepo = svc.conversationRepo as typeof svc.conversationRepo & {
      findById(id: string, transaction?: unknown): Promise<Conversation | null>;
      save(entity: Conversation, transaction?: unknown): Promise<Conversation>;
      compareAndSetAssistantMode?(
        id: string,
        fromMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
        toMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
        transaction?: unknown,
      ): Promise<Conversation | null>;
    };
    const latestConversation = (await guardedConversationRepo.findById(conversation.id, tx)) ?? conversation;

    if (latestConversation.assistantMode === 'HUMAN_TAKEOVER') {
      return null;
    }

    const transitionedConversation = guardedConversationRepo.compareAndSetAssistantMode
      ? await guardedConversationRepo.compareAndSetAssistantMode(
          latestConversation.id,
          'AI_ACTIVE',
          'HUMAN_TAKEOVER',
          tx,
        )
      : (() => {
          latestConversation.assistantMode = 'HUMAN_TAKEOVER';
          return latestConversation;
        })();

    if (!transitionedConversation) {
      return null;
    }

    const message = await (svc.messageRepo as typeof svc.messageRepo & {
      save(entity: Message, transaction?: unknown): Promise<Message>;
    }).save(new Message({
      id: generateId(),
      conversationId: transitionedConversation.id,
      senderId: null,
      senderRoleOverride: 'SYSTEM',
      senderNameOverride: SYSTEM_SENDER_NAME,
      senderRole: 'SYSTEM',
      senderName: SYSTEM_SENDER_NAME,
      content: HUMAN_TAKEOVER_NOTICE,
      originalLanguage: 'zh',
      translatedContent: null,
      messageType: 'SYSTEM',
      moderationStatus: 'ALLOWED',
      attachments: [],
      aiSummary: null,
      createdAt: new Date(),
    }), tx);

    transitionedConversation.updateLastMessage({
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      createdAt: message.createdAt,
    });
    await guardedConversationRepo.save(transitionedConversation, tx);
    return toMessageDTO(message);
  });
}

function buildSuppressedAssistantResponse(
  c: Context,
  sessionId: string,
  userMessageId: string,
  assistantMessageId: string,
): Response {
  return c.json({
    sessionId,
    messageId: assistantMessageId,
    answer: '',
    intent: null,
    nextAction: 'HUMAN_HANDOFF',
    topic: null,
    riskLevel: null,
    canAnswer: false,
    secondaryAction: null,
    responseMode: null,
    citations: [],
    collectedFields: null,
    missingItems: [],
    recommendedProviders: [],
    reasonCodes: [],
    shortlist: [],
    journeySnapshot: {
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'active',
    },
    resources: [],
    blocks: [],
    metadata: {},
    history: {
      userMessageId,
      assistantMessageId,
    },
  }, 200);
}

function hashSessionSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createSessionSecret(): string {
  return randomBytes(24).toString('hex');
}

function setChatbotSessionSecretCookie(c: Context, value: string): void {
  setCookie(c, CHATBOT_SESSION_SECRET_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

function setPatientSessionCookies(c: Context, sessionToken: string, restoreCookie: string): void {
  setCookie(c, PATIENT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
  setCookie(c, PATIENT_RESTORE_COOKIE, restoreCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
}

async function ensurePatientSessionCookies(
  c: Context,
  svc: ReturnType<typeof getServices>,
  patientId: string | null | undefined,
): Promise<{ restoreToken: string | null }> {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return { restoreToken: null };
    }
    throw error;
  }
  if (!patientId) {
    return { restoreToken: null };
  }

  const currentSessionCookie = getCookie(c, PATIENT_SESSION_COOKIE);
  let hasMatchingSession = false;

  if (currentSessionCookie) {
    try {
      const session = await svc.patientAuthService.verifySessionToken(currentSessionCookie, site);
      hasMatchingSession = session.userId === patientId;
    } catch {
      hasMatchingSession = false;
    }
  }

  const restoreArtifacts = await svc.patientAuthService.createGuestRestoreArtifacts(patientId, site);

  if (hasMatchingSession) {
    setCookie(c, PATIENT_RESTORE_COOKIE, restoreArtifacts.restoreCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
    return { restoreToken: restoreArtifacts.restoreToken };
  }

  const sessionToken = await svc.patientAuthService.createSessionToken(patientId, site);
  setPatientSessionCookies(c, sessionToken, restoreArtifacts.restoreCookie);
  return { restoreToken: restoreArtifacts.restoreToken };
}

async function ensureCaseForSession(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
  input: {
    email: string;
    name: string;
    country: string;
    conditionSummary: string;
    budget: string;
  },
): Promise<{
  session: AiChatSession;
  patientId: string;
  caseId: string;
  isExistingPatient: boolean;
  restoreToken: string;
}> {
  const site = resolvePatientSiteContext(c);
  const onboarding = await svc.initOnboarding.execute({
    email: input.email,
    site,
    name: input.name,
    preferredLanguage: 'en',
    destination: input.country,
    authenticatedPatientId: session.patientId ?? undefined,
  });

  setPatientSessionCookies(c, onboarding.token, onboarding.restoreCookie);
  session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, session.site, onboarding.patientId)) ?? session;

  const caseEntity = await svc.caseRepo.findById(onboarding.caseId);
  if (!caseEntity) {
    throw new Error('Newly created case was not found');
  }

  hydrateCaseFromChatbot(caseEntity, session, input);
  await svc.caseRepo.save(caseEntity);
  try {
    await svc.notifyAdminsOfNewCase.execute({
      caseId: onboarding.caseId,
      patientId: onboarding.patientId,
      patientName: input.name,
      patientEmail: input.email,
      site,
    });
  } catch (error) {
    console.warn('Failed to notify admins about chatbot-created case:', error);
  }

  return {
    session,
    patientId: onboarding.patientId,
    caseId: onboarding.caseId,
    isExistingPatient: onboarding.isExistingPatient,
    restoreToken: onboarding.restoreToken,
  };
}

async function ensureExistingCaseForSession(
  c: Context,
  svc: ReturnType<typeof getServices>,
  session: AiChatSession,
  caseId: string,
  input: {
    email: string;
    name: string;
    country: string;
    conditionSummary: string;
    budget: string;
  },
  preferredPatientId?: string | null,
): Promise<{
  session: AiChatSession;
  patientId: string;
  caseId: string;
  isExistingPatient: boolean;
  restoreToken: string | null;
}> {
  const caseEntity = await svc.caseRepo.findById(caseId);
  if (!caseEntity) {
    throw new Error('Existing chatbot case was not found');
  }

  const patientId = preferredPatientId ?? caseEntity.patientId;
  const { restoreToken } = await ensurePatientSessionCookies(c, svc, patientId);

  if (!session.patientId) {
    session = (await svc.aiChatSessionRepo.attachPatient(session.sessionId, session.site, patientId)) ?? session;
  }

  hydrateCaseFromChatbot(caseEntity, session, input);
  await svc.caseRepo.save(caseEntity);

  return {
    session,
    patientId,
    caseId,
    isExistingPatient: true,
    restoreToken,
  };
}

function hydrateCaseFromChatbot(
  caseEntity: Awaited<ReturnType<ReturnType<typeof getServices>['caseRepo']['findById']>> extends infer T
    ? T extends null
      ? never
      : T
    : never,
  session: AiChatSession,
  input: {
    name: string;
    country: string;
    conditionSummary: string;
    budget: string;
  },
): void {
  caseEntity.patientName = input.name;
  caseEntity.patientCountry = input.country;
  caseEntity.conditionSummary = input.conditionSummary;
  caseEntity.structuredData = {
    ...(caseEntity.structuredData ?? {}),
    chatbot: {
      ...(asRecord(caseEntity.structuredData?.chatbot)),
      source: 'chatbot',
      sessionId: session.sessionId,
      budget: input.budget,
      lastSubmittedAt: new Date().toISOString(),
    },
  };
}

async function recordWorkflowMessage(
  svc: ReturnType<typeof getServices>,
  sessionDbId: string,
  workflow: Record<string, unknown> & { kind: 'CONVERT' | 'ESCALATE' },
): Promise<void> {
  await svc.aiChatMessageRepo.create(new AiChatMessage({
    id: generateId(),
    sessionId: sessionDbId,
    role: 'SYSTEM',
    content: workflow.kind === 'CONVERT'
      ? 'Chatbot consultation details submitted.'
      : 'Chatbot conversation escalated to support.',
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: workflow.kind === 'CONVERT'
      ? normalizeNextAction(asString(workflow.requestedAction))
      : 'HUMAN_HANDOFF',
    citations: [],
    metadata: { workflow },
    createdAt: new Date(),
  }));
}

function extractWorkflowState(messages: AiChatMessage[]): {
  caseId: string | null;
  patientId: string | null;
  ticketId: string | null;
  lastConvertAction: 'INVITE_ONLINE_CONSULT' | 'CREATE_CASE' | null;
} {
  let caseId: string | null = null;
  let patientId: string | null = null;
  let ticketId: string | null = null;
  let lastConvertAction: 'INVITE_ONLINE_CONSULT' | 'CREATE_CASE' | null = null;

  for (const message of messages) {
    const workflow = asRecord(message.metadata.workflow);
    const kind = asString(workflow.kind);

    if (!caseId) {
      caseId = asString(workflow.caseId) ?? caseId;
    }
    if (!patientId) {
      patientId = asString(workflow.patientId) ?? patientId;
    }
    if (kind === 'ESCALATE' && !ticketId) {
      ticketId = asString(workflow.ticketId) ?? ticketId;
    }
    if (kind === 'CONVERT' && !lastConvertAction) {
      const requestedAction = asString(workflow.requestedAction);
      if (requestedAction === 'INVITE_ONLINE_CONSULT') {
        lastConvertAction = 'INVITE_ONLINE_CONSULT';
      } else if (requestedAction === 'CREATE_CASE') {
        lastConvertAction = 'CREATE_CASE';
      }
    }
  }

  return { caseId, patientId, ticketId, lastConvertAction };
}

function buildLeadFormMetadata(input: {
  name: string;
  email: string;
  country: string;
  conditionSummary: string;
  budget: string;
}): Record<string, unknown> {
  return {
    name: input.name,
    email: input.email,
    country: input.country,
    conditionSummary: input.conditionSummary,
    budget: input.budget,
  };
}

function buildConsultConversionDraft(
  sessionId: string,
  collectedFields: Record<string, unknown> | null,
): {
  sessionId: string;
  name?: string;
  email?: string;
  country?: string;
  conditionSummary?: string;
  budget?: string;
} | null {
  if (!collectedFields) {
    return null;
  }

  const draft = {
    sessionId,
    name: asString(collectedFields['name']),
    email: asString(collectedFields['email']),
    country: asString(collectedFields['country']),
    conditionSummary: asString(collectedFields['conditionSummary']),
    budget: asString(collectedFields['budget']),
  };

  if (
    !draft.name
    || !draft.email
    || !draft.country
    || !draft.conditionSummary
    || !draft.budget
  ) {
    return null;
  }

  return draft;
}

function enrichChatbotV2Resources(input: {
  resources: Awaited<ReturnType<typeof buildChatbotV2PostTurnContext>>['resources'];
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
}): Awaited<ReturnType<typeof buildChatbotV2PostTurnContext>>['resources'] {
  return input.resources.map((resource) => {
    if (resource.resourceType === 'PROCESS_GUIDE') {
      return {
        ...resource,
        payload: {
          ...resource.payload,
          title: 'How the process works',
          description: 'See the overall medical travel journey.',
          ctaLabel: 'Open process guide',
          modalKey: 'MEDICAL_TRAVEL_PROCESS',
        },
      };
    }

    if (resource.resourceType === 'QUESTIONNAIRE') {
      if (!input.templateId) {
        return resource;
      }

      return {
        ...resource,
        payload: {
          ...resource.payload,
          title: 'Complete your medical questionnaire',
          description: 'This helps us guide the next step more accurately.',
          ctaLabel: 'Open questionnaire',
          templateId: input.templateId,
        },
      };
    }

    if (resource.resourceType === 'HOSPITAL_RECOMMENDATION') {
      if (!input.sessionCaseId) {
        return resource;
      }

      const hospitals = input.shortlist
        .slice(0, 3)
        .reduce<Array<{
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
        }>>((acc, item) => {
          const hospitalId = asString(item['hospitalId']);
          if (!hospitalId) {
            return acc;
          }

          acc.push({
            hospitalId,
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
          });

          return acc;
        }, []);

      if (hospitals.length === 0) {
        return resource;
      }

      return {
        ...resource,
        payload: {
          ...resource.payload,
          title: 'Recommended hospitals',
          description: 'Based on your current information, these look like the closest matches.',
          caseId: input.sessionCaseId,
          selectPath: '/select-hospitals',
          hospitals,
        },
      };
    }

    if (resource.resourceType === 'ONLINE_CONSULT_BOOKING') {
      if (!input.conversionDraft) {
        return resource;
      }

      return {
        ...resource,
        payload: {
          ...resource.payload,
          title: 'Request online consultation',
          description: 'Submit your consultation request and we will confirm the next step.',
          requestedAction: 'INVITE_ONLINE_CONSULT',
          convertPath: '/api/v2/chatbot/convert',
          consultationStatus: input.sessionConsultationStatus ?? 'not_started',
          conversionDraft: input.conversionDraft,
        },
      };
    }

    return resource;
  });
}

function mergeConsultCollectedFields(
  sessionMessages: Array<{ metadata?: Record<string, unknown> | null }>,
  currentCollectedFields: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {};

  for (const message of [...sessionMessages].reverse()) {
    const metadata = asRecord(message.metadata ?? {});
    const structuredOutput = asRecord(metadata.structuredOutput ?? metadata.structured_output);
    const historicalFields = asRecord(
      metadata.collectedFields
      ?? metadata.collected_fields
      ?? structuredOutput.collectedFields
      ?? structuredOutput.collected_fields,
    );

    if (!historicalFields) {
      continue;
    }

    Object.assign(merged, historicalFields);
  }

  if (currentCollectedFields) {
    Object.assign(merged, currentCollectedFields);
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function extractWidgetSessionCaseId(sessionId: string): string | null {
  if (!sessionId.startsWith('widget-chat:')) {
    return null;
  }

  const [, , caseId] = sessionId.split(':');
  return typeof caseId === 'string' && caseId.length > 0 && caseId !== 'pending'
    ? caseId
    : null;
}

function buildEscalationSubject(conditionSummary: string): string {
  const normalized = conditionSummary.trim().replace(/\s+/g, ' ');
  const snippet = normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
  return `AI chatbot escalation: ${snippet}`;
}

function buildEscalationDescription(
  input: {
    name: string;
    email: string;
    country: string;
    conditionSummary: string;
    budget: string;
    reason?: string;
  },
  messages: AiChatMessage[],
): string {
  const transcript = messages
    .reverse()
    .filter((message) => message.role !== 'SYSTEM')
    .slice(-12)
    .map((message) => `[${message.role}] ${message.content}`)
    .join('\n');

  const sections = [
    'Escalated from AI chatbot conversation.',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Country: ${input.country}`,
    `Condition Summary: ${input.conditionSummary}`,
    `Budget: ${input.budget}`,
  ];

  if (input.reason) {
    sections.push(`Escalation Reason: ${input.reason}`);
  }

  if (transcript) {
    sections.push('', 'Recent Chat Transcript:', transcript);
  }

  return sections.join('\n');
}

async function resolveQuestionnaireTemplateId(
  svc: ReturnType<typeof getServices>,
  richAction: string | null | undefined,
  caseId: string | null,
): Promise<string | null> {
  if (richAction !== 'REQUEST_DOC_UPLOAD' || !caseId) {
    return null;
  }

  const caseEntity = typeof svc.caseRepo?.findById === 'function'
    ? await Promise.resolve(svc.caseRepo.findById(caseId)).catch(() => null)
    : null;
  if (readMedicalFormStatus(caseEntity?.structuredData as Record<string, unknown> | null) === 'SUBMITTED') {
    return null;
  }
  const caseTemplateId = asString(caseEntity?.questionCollectorTemplateId);
  if (caseTemplateId) {
    return caseTemplateId;
  }

  try {
    const result = await svc.getTemplateByDisease.execute('DEFAULT');
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

function extractChatbotAttachments(message: AiChatMessage): Array<{
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}> {
  const attachments = message.role === 'USER'
    ? asArray(message.metadata.attachments)
    : [];

  return attachments
    .map((attachment) => asRecord(attachment))
    .map((attachment) => ({
      fileName: asString(attachment.fileName) ?? '',
      fileSize: asNumber(attachment.fileSize) ?? 0,
      mimeType: asString(attachment.mimeType) ?? '',
      storageKey: asString(attachment.storageKey) ?? '',
    }))
    .filter((attachment) =>
      attachment.fileName.length > 0
      && attachment.mimeType.length > 0
      && attachment.storageKey.length > 0
      && attachment.fileSize > 0,
    );
}

function toPublicChatbotAttachments(
  attachments: Array<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    storageKey: string;
  }>,
  signedUrls: Record<string, string>,
) {
  return attachments.map((attachment) => ({
    ...attachment,
    name: attachment.fileName,
    type: attachment.mimeType,
    size: attachment.fileSize,
    url: resolveAttachmentUrl(attachment.storageKey, signedUrls),
  }));
}

function resolveAttachmentUrl(storageKey: string, signedUrls: Record<string, string>): string {
  if (storageKey.startsWith('http://') || storageKey.startsWith('https://') || storageKey.startsWith('data:')) {
    return storageKey;
  }

  return signedUrls[storageKey] ?? '';
}

function normalizeDifyChatResponse(response: Record<string, unknown>) {
  const metadata = asRecord(response.metadata);
  const parsedAnswer = parseStructuredAnswer(response.answer);
  const citations = parsedAnswer?.citations ?? deriveCitations(metadata);
  const topic = parsedAnswer?.topic ?? null;
  const structuredMetadata = asRecord(parsedAnswer?.metadata ?? {});
  const engagementMode = parsedAnswer?.engagementMode
    ?? asString(structuredMetadata.engagementMode)
    ?? asString(structuredMetadata.engagement_mode)
    ?? null;
  const canonicalResolvedIntent = selectFirstNormalizedValue(
    [
      parsedAnswer?.resolvedIntent,
      parsedAnswer?.canonicalResolvedIntent,
      asString(structuredMetadata.resolvedIntent),
      asString(structuredMetadata.resolved_intent),
      asString(metadata.resolvedIntent),
      asString(metadata.resolved_intent),
    ],
    normalizeCanonicalResolvedIntent,
  );
  const canonicalEngagementSignal = selectFirstNormalizedValue(
    [
      parsedAnswer?.engagementSignal,
      asString(structuredMetadata.engagementSignal),
      asString(structuredMetadata.engagement_signal),
      asString(metadata.engagementSignal),
      asString(metadata.engagement_signal),
    ],
    normalizeCanonicalEngagementSignal,
  );
  const canonicalProgressionSignal = selectFirstNormalizedValue(
    [
      parsedAnswer?.progressionSignal,
      asString(structuredMetadata.progressionSignal),
      asString(structuredMetadata.progression_signal),
      asString(metadata.progressionSignal),
      asString(metadata.progression_signal),
    ],
    normalizeCanonicalProgressionSignal,
  );
  const canonicalRecommendationSignal = selectFirstNormalizedValue(
    [
      parsedAnswer?.recommendationSignal,
      asString(structuredMetadata.recommendationSignal),
      asString(structuredMetadata.recommendation_signal),
      asString(metadata.recommendationSignal),
      asString(metadata.recommendation_signal),
    ],
    normalizeCanonicalRecommendationSignal,
  );
  const mentionsCondition = selectFirstPresentBoolean([
    parsedAnswer?.mentionsCondition,
    asBoolean(structuredMetadata.mentionsCondition),
    asBoolean(structuredMetadata.mentions_condition),
    asBoolean(metadata.mentionsCondition),
    asBoolean(metadata.mentions_condition),
  ]);
  const mentionsDoctorOrHospitalNeed = selectFirstPresentBoolean([
    parsedAnswer?.mentionsDoctorOrHospitalNeed,
    asBoolean(structuredMetadata.mentionsDoctorOrHospitalNeed),
    asBoolean(structuredMetadata.mentions_doctor_or_hospital_need),
    asBoolean(metadata.mentionsDoctorOrHospitalNeed),
    asBoolean(metadata.mentions_doctor_or_hospital_need),
  ]);
  const storedCanonicalSemanticMetadata = buildCanonicalSemanticMetadata({
    resolvedIntent: canonicalResolvedIntent,
    engagementSignal: canonicalEngagementSignal,
    progressionSignal: canonicalProgressionSignal,
    recommendationSignal: canonicalRecommendationSignal,
    mentionsCondition,
    mentionsDoctorOrHospitalNeed,
  }, { strictFallback: false });
  const normalizedInternalNextAction = selectFirstNormalizedValue(
    [
      parsedAnswer?.internalNextAction,
      asString(structuredMetadata.internalNextAction),
      asString(structuredMetadata.internal_next_action),
      asString(metadata.internalNextAction),
      asString(metadata.internal_next_action),
    ],
    normalizeNextAction,
  );
  const publicNextAction = selectFirstNormalizedValue(
    [
      asString(structuredMetadata.publicNextAction),
      asString(structuredMetadata.public_next_action),
      parsedAnswer?.nextAction,
      asString(metadata.publicNextAction),
      asString(metadata.public_next_action),
      asString(metadata.nextAction),
      asString(metadata.next_action),
    ],
    normalizePublicNextAction,
  );
  const canonicalActionMetadata = buildCanonicalActionMetadata({
    nextAction: publicNextAction,
    internalNextAction: normalizedInternalNextAction,
  });
  const normalizedStructuredMetadata = composeCanonicalMetadataEnvelope(
    structuredMetadata,
    storedCanonicalSemanticMetadata,
    canonicalActionMetadata,
  );
  const normalizedMetadata = composeCanonicalMetadataEnvelope(
    {
      ...metadata,
      ...structuredMetadata,
    },
    storedCanonicalSemanticMetadata,
    canonicalActionMetadata,
  );
  const publicRiskLevel = normalizeRiskLevel(parsedAnswer?.riskLevel);
  const publicIntent = derivePublicIntent({
    intent: parsedAnswer?.intent,
    resolvedIntent: canonicalResolvedIntent,
    nextAction: publicNextAction,
    riskLevel: publicRiskLevel,
  });
  const collectedFields = sanitizeNullableRecord(parsedAnswer?.collectedFields);
  const recommendedProviders = sanitizeRecordArray(parsedAnswer?.recommendedProviders);
  const shortlist = sanitizeRecordArray(parsedAnswer?.shortlist);
  const citationsSafe = sanitizeCitationArray(citations);
  const storedStructuredOutput = parsedAnswer
    ? {
        answer: parsedAnswer.answer ?? asString(response.answer) ?? '',
        intent: publicIntent,
        ...(canonicalResolvedIntent ? { resolvedIntent: canonicalResolvedIntent } : {}),
        topic,
        riskLevel: publicRiskLevel,
        canAnswer: parsedAnswer.canAnswer ?? null,
        nextAction: publicNextAction,
        secondaryAction: parsedAnswer.secondaryAction ?? null,
        responseMode: parsedAnswer.responseMode ?? null,
        collectedFields,
        missingItems: parsedAnswer.missingItems ?? [],
        recommendedProviders,
        reasonCodes: parsedAnswer.reasonCodes ?? [],
        shortlist,
        citations: citationsSafe,
        metadata: {
          ...normalizedStructuredMetadata,
          engagementMode,
          internalRiskLevel: parsedAnswer.riskLevel ?? null,
          topic,
        },
      }
    : null;

  return {
    answer: parsedAnswer?.answer ?? asString(response.answer) ?? '',
    intent: publicIntent,
    resolvedIntent: canonicalResolvedIntent,
    topic,
    riskLevel: publicRiskLevel,
    canAnswer: parsedAnswer?.canAnswer ?? null,
    nextAction: publicNextAction,
    secondaryAction: parsedAnswer?.secondaryAction ?? null,
    responseMode: parsedAnswer?.responseMode ?? null,
    collectedFields,
    missingItems: parsedAnswer?.missingItems ?? [],
    recommendedProviders,
    reasonCodes: parsedAnswer?.reasonCodes ?? [],
    shortlist,
    citations: citationsSafe,
    conversationId: asString(response.conversation_id),
    messageId: asString(response.message_id),
    taskId: asString(response.task_id),
    metadata: {
      ...normalizedMetadata,
      engagementMode,
      internalRiskLevel: parsedAnswer?.riskLevel ?? null,
      topic,
      structuredOutput: storedStructuredOutput,
    },
    storedNextAction: publicNextAction,
  };
}

function parseStructuredAnswer(value: unknown): {
  answer?: string;
  intent?: string;
  canonicalResolvedIntent?: string;
  resolvedIntent?: string;
  topic?: string;
  riskLevel?: string;
  canAnswer?: boolean;
  nextAction?: string;
  secondaryAction?: string;
  responseMode?: string;
  reasonCodes?: string[];
  shortlist?: Array<Record<string, unknown>>;
  citations?: AiChatCitation[];
  engagementMode?: string;
  engagementSignal?: string;
  progressionSignal?: string;
  recommendationSignal?: string;
  mentionsCondition?: boolean;
  mentionsDoctorOrHospitalNeed?: boolean;
  internalNextAction?: string;
  metadata?: Record<string, unknown>;
  collectedFields?: Record<string, unknown>;
  missingItems?: string[];
  recommendedProviders?: Record<string, unknown>[];
} | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      answer: asString(parsed.answer),
      intent: asString(parsed.intent) ?? asString(parsed['intent']),
      canonicalResolvedIntent: asString(parsed.canonicalResolvedIntent) ?? asString(parsed.canonical_resolved_intent),
      resolvedIntent: asString(parsed.resolvedIntent) ?? asString(parsed.resolved_intent),
      topic: asString(parsed.topic),
      riskLevel: asString(parsed.riskLevel) ?? asString(parsed.risk_level),
      canAnswer: typeof parsed.canAnswer === 'boolean'
        ? parsed.canAnswer
        : typeof parsed.can_answer === 'boolean'
          ? parsed.can_answer
          : undefined,
      nextAction: asString(parsed.nextAction) ?? asString(parsed.next_action),
      secondaryAction: asString(parsed.secondaryAction) ?? asString(parsed.secondary_action),
      responseMode: asString(parsed.responseMode) ?? asString(parsed.response_mode),
      reasonCodes: Array.isArray(parsed.reasonCodes)
        ? parsed.reasonCodes.filter((item): item is string => typeof item === 'string')
        : Array.isArray(parsed.reason_codes)
          ? parsed.reason_codes.filter((item): item is string => typeof item === 'string')
          : undefined,
      engagementMode: asString(parsed.engagementMode) ?? asString(parsed.engagement_mode),
      engagementSignal: asString(parsed.engagementSignal) ?? asString(parsed.engagement_signal),
      progressionSignal: asString(parsed.progressionSignal) ?? asString(parsed.progression_signal),
      recommendationSignal: asString(parsed.recommendationSignal) ?? asString(parsed.recommendation_signal),
      mentionsCondition: asBoolean(parsed.mentionsCondition) ?? asBoolean(parsed.mentions_condition),
      mentionsDoctorOrHospitalNeed: asBoolean(parsed.mentionsDoctorOrHospitalNeed) ?? asBoolean(parsed.mentions_doctor_or_hospital_need),
      internalNextAction: asString(parsed.internalNextAction) ?? asString(parsed.internal_next_action),
      metadata: asRecord(parsed.metadata),
      shortlist: Array.isArray(parsed.shortlist)
        ? parsed.shortlist.map((item) => asRecord(item))
        : undefined,
      citations: Array.isArray(parsed.citations) ? parsed.citations as AiChatCitation[] : undefined,
      collectedFields: asRecord(parsed.collectedFields ?? parsed.collected_fields),
      missingItems: Array.isArray(parsed.missingItems) ? parsed.missingItems.filter((item): item is string => typeof item === 'string') : undefined,
      recommendedProviders: Array.isArray(parsed.recommendedProviders)
        ? parsed.recommendedProviders.map((item) => asRecord(item))
        : Array.isArray(parsed.recommended_providers)
          ? parsed.recommended_providers.map((item) => asRecord(item))
        : undefined,
    };
  } catch {
    return null;
  }
}

function deriveCitations(metadata: Record<string, unknown>): AiChatCitation[] {
  const resources = Array.isArray(metadata.retriever_resources)
    ? metadata.retriever_resources
    : [];

  return resources.map((resource) => {
    const record = asRecord(resource);
    return {
      sourceTitle: asString(record.document_name) ?? asString(record.dataset_name) ?? asString(record.title),
      snippet: asString(record.segment_content) ?? asString(record.content),
      sourceType: asString(record.data_source_type) ?? 'KNOWLEDGE',
      documentId: asString(record.document_id),
    };
  }).filter((item) => item.sourceTitle || item.snippet);
}

function normalizeIntent(value: string | undefined): import('@medical-crm/domain').AiChatIntent | null {
  if (value === 'FAQ' || value === 'CONSULT' || value === 'UNKNOWN' || value === 'SAFETY') return value;
  return null;
}

function derivePublicIntent(input: {
  intent?: string | null;
  resolvedIntent?: string | null;
  nextAction?: import('@medical-crm/domain').AiChatNextAction | null;
  riskLevel?: import('@medical-crm/domain').AiChatRiskLevel | null;
}): import('@medical-crm/domain').AiChatIntent | null {
  const fallbackIntent = normalizeIntent(input.intent ?? undefined);
  const resolvedIntent = normalizeCanonicalResolvedIntent(input.resolvedIntent ?? undefined);

  if (
    fallbackIntent === 'SAFETY'
    || input.nextAction === 'SAFETY_HANDOFF'
    || input.riskLevel === 'CRISIS'
  ) {
    return 'SAFETY';
  }

  if (!resolvedIntent) {
    return fallbackIntent;
  }

  if (resolvedIntent === 'UNKNOWN') {
    return fallbackIntent ?? 'UNKNOWN';
  }

  if (
    resolvedIntent === 'GENERAL_INFO'
    || resolvedIntent === 'ASK_MEDICAL_TRAVEL_PROCESS'
    || resolvedIntent === 'SMALL_TALK_OR_GREETING'
  ) {
    return 'FAQ';
  }

  return 'CONSULT';
}

function normalizeRiskLevel(value: string | undefined): import('@medical-crm/domain').AiChatRiskLevel | null {
  if (value === 'HIGH_RISK' || value === 'HIGH') return 'CRISIS';
  if (value === 'NORMAL' || value === 'SENSITIVE' || value === 'CRISIS') return value;
  return null;
}

function normalizeNextAction(value: string | undefined): import('@medical-crm/domain').AiChatNextAction | null {
  if (value === 'EXPLORE_HOSPITAL_RECOMMENDATIONS') {
    return 'SHOW_HOSPITAL_RECOMMENDATIONS';
  }
  if (value === 'ESCALATE') {
    return 'HUMAN_HANDOFF';
  }
  if (
    value === 'CREATE_CASE'
    || value === 'ANSWER_FAQ'
    || value === 'EXPLAIN_DOC_UPLOAD'
    || value === 'EXPLAIN_MEDICAL_TRAVEL_PROCESS'
    || value === 'EXPLAIN_CONSULT_PROCESS'
    || value === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    || value === 'REQUEST_DOC_UPLOAD'
    || value === 'INVITE_ONLINE_CONSULT'
    || value === 'SHOW_PACKAGE'
    || value === 'HUMAN_HANDOFF'
    || value === 'SAFETY_HANDOFF'
  ) return value;
  return null;
}

function normalizePublicNextAction(value: string | undefined): import('@medical-crm/domain').AiChatNextAction | null {
  if (value === 'EXPLORE_HOSPITAL_RECOMMENDATIONS') return 'SHOW_HOSPITAL_RECOMMENDATIONS';
  if (value === 'ESCALATE') return 'HUMAN_HANDOFF';
  if (value === 'ANSWER_FAQ') return 'ANSWER_FAQ';
  if (value === 'REQUEST_DOC_UPLOAD') return 'REQUEST_DOC_UPLOAD';
  if (value === 'HUMAN_HANDOFF') return 'HUMAN_HANDOFF';
  if (value === 'SAFETY_HANDOFF') return 'SAFETY_HANDOFF';
  if (value === 'INVITE_ONLINE_CONSULT') return 'INVITE_ONLINE_CONSULT';
  if (
    value === 'EXPLAIN_DOC_UPLOAD'
    || value === 'EXPLAIN_MEDICAL_TRAVEL_PROCESS'
    || value === 'EXPLAIN_CONSULT_PROCESS'
    || value === 'SHOW_HOSPITAL_RECOMMENDATIONS'
    || value === 'SHOW_PACKAGE'
  ) return value;
  return null;
}

function normalizeCanonicalResolvedIntent(value: string | undefined): import('@medical-crm/utils').AiPolicyResolvedIntent | null {
  return isAllowedEnumValue(value, AI_POLICY_RESOLVED_INTENTS) ? value : null;
}

function normalizeCanonicalEngagementSignal(value: string | undefined): import('@medical-crm/utils').AiPolicyEngagementSignal | null {
  return isAllowedEnumValue(value, AI_POLICY_ENGAGEMENT_SIGNALS) ? value : null;
}

function normalizeCanonicalProgressionSignal(value: string | undefined): import('@medical-crm/utils').AiPolicyProgressionSignal | null {
  return isAllowedEnumValue(value, AI_POLICY_PROGRESSION_SIGNALS) ? value : null;
}

function normalizeCanonicalRecommendationSignal(value: string | undefined): import('@medical-crm/utils').AiPolicyRecommendationSignal | null {
  return isAllowedEnumValue(value, AI_POLICY_RECOMMENDATION_SIGNALS) ? value : null;
}

function selectFirstNormalizedValue<T>(
  candidates: Array<string | null | undefined>,
  normalize: (value: string | undefined) => T | null,
): T | null {
  for (const candidate of candidates) {
    const normalized = normalize(candidate ?? undefined);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function selectFirstPresentBoolean(candidates: Array<boolean | null | undefined>): boolean | undefined {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined) {
      return candidate;
    }
  }
  return undefined;
}

function buildCanonicalSemanticMetadata(input: {
  resolvedIntent?: string | null;
  engagementSignal?: string | null;
  progressionSignal?: string | null;
  recommendationSignal?: string | null;
  mentionsCondition?: boolean;
  mentionsDoctorOrHospitalNeed?: boolean;
}, options?: {
  strictFallback?: boolean;
}): Record<string, unknown> {
  const strictFallback = options?.strictFallback ?? true;
  const resolvedIntent = normalizeCanonicalResolvedIntent(input.resolvedIntent ?? undefined);
  const engagementSignal = normalizeCanonicalEngagementSignal(input.engagementSignal ?? undefined);
  const progressionSignal = normalizeCanonicalProgressionSignal(input.progressionSignal ?? undefined);
  const recommendationSignal = normalizeCanonicalRecommendationSignal(input.recommendationSignal ?? undefined);

  if (strictFallback) {
    const strictResolvedIntent = resolvedIntent ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.resolvedIntent;
    const strictEngagementSignal = engagementSignal ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.engagementSignal;
    const strictProgressionSignal = progressionSignal ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.progressionSignal;
    const strictRecommendationSignal = recommendationSignal ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.recommendationSignal;
    const strictMentionsCondition = input.mentionsCondition
      ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.mentionsCondition;
    const strictMentionsDoctorOrHospitalNeed = input.mentionsDoctorOrHospitalNeed
      ?? DETERMINISTIC_CANONICAL_SEMANTIC_FALLBACK.mentionsDoctorOrHospitalNeed;

    return {
      resolvedIntent: strictResolvedIntent,
      resolved_intent: strictResolvedIntent,
      engagementSignal: strictEngagementSignal,
      engagement_signal: strictEngagementSignal,
      progressionSignal: strictProgressionSignal,
      progression_signal: strictProgressionSignal,
      recommendationSignal: strictRecommendationSignal,
      recommendation_signal: strictRecommendationSignal,
      mentionsCondition: strictMentionsCondition,
      mentions_condition: strictMentionsCondition,
      mentionsDoctorOrHospitalNeed: strictMentionsDoctorOrHospitalNeed,
      mentions_doctor_or_hospital_need: strictMentionsDoctorOrHospitalNeed,
      semanticSignals: {
        resolvedIntent: strictResolvedIntent,
        engagementSignal: strictEngagementSignal,
        progressionSignal: strictProgressionSignal,
        recommendationSignal: strictRecommendationSignal,
        mentionsCondition: strictMentionsCondition,
        mentionsDoctorOrHospitalNeed: strictMentionsDoctorOrHospitalNeed,
      },
    };
  }

  const normalized: Record<string, unknown> = {};
  const semanticSignals: Record<string, unknown> = {};

  if (resolvedIntent) {
    normalized['resolvedIntent'] = resolvedIntent;
    normalized['resolved_intent'] = resolvedIntent;
    semanticSignals['resolvedIntent'] = resolvedIntent;
  }
  if (engagementSignal) {
    normalized['engagementSignal'] = engagementSignal;
    normalized['engagement_signal'] = engagementSignal;
    semanticSignals['engagementSignal'] = engagementSignal;
  }
  if (progressionSignal) {
    normalized['progressionSignal'] = progressionSignal;
    normalized['progression_signal'] = progressionSignal;
    semanticSignals['progressionSignal'] = progressionSignal;
  }
  if (recommendationSignal) {
    normalized['recommendationSignal'] = recommendationSignal;
    normalized['recommendation_signal'] = recommendationSignal;
    semanticSignals['recommendationSignal'] = recommendationSignal;
  }
  if (input.mentionsCondition !== undefined) {
    normalized['mentionsCondition'] = input.mentionsCondition;
    normalized['mentions_condition'] = input.mentionsCondition;
    semanticSignals['mentionsCondition'] = input.mentionsCondition;
  }
  if (input.mentionsDoctorOrHospitalNeed !== undefined) {
    normalized['mentionsDoctorOrHospitalNeed'] = input.mentionsDoctorOrHospitalNeed;
    normalized['mentions_doctor_or_hospital_need'] = input.mentionsDoctorOrHospitalNeed;
    semanticSignals['mentionsDoctorOrHospitalNeed'] = input.mentionsDoctorOrHospitalNeed;
  }
  if (Object.keys(semanticSignals).length > 0) {
    normalized['semanticSignals'] = semanticSignals;
  }

  return normalized;
}

function buildCanonicalActionMetadata(input: {
  nextAction: import('@medical-crm/domain').AiChatNextAction | null;
  internalNextAction: import('@medical-crm/domain').AiChatNextAction | null;
}): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  if (input.nextAction) {
    normalized['nextAction'] = input.nextAction;
    normalized['next_action'] = input.nextAction;
    normalized['publicNextAction'] = input.nextAction;
    normalized['public_next_action'] = input.nextAction;
  }
  if (input.internalNextAction) {
    normalized['internalNextAction'] = input.internalNextAction;
    normalized['internal_next_action'] = input.internalNextAction;
  }
  return normalized;
}

function composeCanonicalMetadataEnvelope(
  source: Record<string, unknown>,
  canonicalSemanticMetadata: Record<string, unknown>,
  canonicalActionMetadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...stripCanonicalOverlayKeys(source),
    ...canonicalSemanticMetadata,
    ...canonicalActionMetadata,
  };
}

function stripCanonicalOverlayKeys(source: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (isCanonicalOverlayKey(key)) {
      continue;
    }
    stripped[key] = stripCanonicalOverlayValue(value);
  }
  return stripped;
}

function stripCanonicalOverlayValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripCanonicalOverlayValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return stripCanonicalOverlayKeys(value as Record<string, unknown>);
}

function isCanonicalOverlayKey(key: string): boolean {
  return key === 'resolvedIntent'
    || key === 'resolved_intent'
    || key === 'engagementSignal'
    || key === 'engagement_signal'
    || key === 'progressionSignal'
    || key === 'progression_signal'
    || key === 'recommendationSignal'
    || key === 'recommendation_signal'
    || key === 'mentionsCondition'
    || key === 'mentions_condition'
    || key === 'mentionsDoctorOrHospitalNeed'
    || key === 'mentions_doctor_or_hospital_need'
    || key === 'semanticSignals'
    || key === 'nextAction'
    || key === 'next_action'
    || key === 'publicNextAction'
    || key === 'public_next_action'
    || key === 'internalNextAction'
    || key === 'internal_next_action';
}

function normalizePublicMetadataForHistory(value: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeHistoryMetadataValue(sanitizeUnknownValue(value));
  const normalizedRecord = asRecord(normalized);
  const hasSemanticEnvelope = carriesChatbotSemanticHistoryEnvelope(normalizedRecord);
  const structuredOutputSource = asRecord(
    normalizedRecord.structuredOutput
    ?? normalizedRecord.structured_output,
  );
  const root = hasSemanticEnvelope
    ? applyStrictHistoryCanonicalEnvelope(normalizedRecord)
    : { ...normalizedRecord };
  if (Object.keys(structuredOutputSource).length > 0) {
    delete root.structured_output;
    root.structuredOutput = applyStrictHistoryStructuredOutput(structuredOutputSource);
  }
  return asRecord(stripLegacyHistoryUiFields(root));
}

function carriesChatbotSemanticHistoryEnvelope(source: Record<string, unknown>): boolean {
  return Object.keys(source).some((key) => (
    key === 'structuredOutput'
    || key === 'structured_output'
    || isCanonicalOverlayKey(key)
  ));
}


function normalizeHistoryMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHistoryMetadataValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(source)) {
    sanitized[key] = normalizeHistoryMetadataValue(nestedValue);
  }

  return sanitized;
}

function stripLegacyHistoryUiFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripLegacyHistoryUiFields(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const sanitized = { ...source };

  delete sanitized.blocks;
  delete sanitized.chatbotV2Floor;
  delete sanitized.chatbot_v2_floor;

  const structuredOutput = asRecord(sanitized.structuredOutput);
  if (Object.keys(structuredOutput).length > 0) {
    const nextStructuredOutput = { ...structuredOutput };
    delete nextStructuredOutput.blocks;

    const structuredMetadata = asRecord(nextStructuredOutput.metadata);
    if (Object.keys(structuredMetadata).length > 0) {
      const nextStructuredMetadata = { ...structuredMetadata };
      delete nextStructuredMetadata.blocks;
      nextStructuredOutput.metadata = nextStructuredMetadata;
    }

    sanitized.structuredOutput = nextStructuredOutput;
  }

  return sanitized;
}

function applyStrictHistoryCanonicalEnvelope(source: Record<string, unknown>): Record<string, unknown> {
  return composeCanonicalMetadataEnvelope(
    source,
    buildCanonicalSemanticMetadata({
      resolvedIntent: asString(source.resolvedIntent) ?? asString(source.resolved_intent),
      engagementSignal: asString(source.engagementSignal) ?? asString(source.engagement_signal),
      progressionSignal: asString(source.progressionSignal) ?? asString(source.progression_signal),
      recommendationSignal: asString(source.recommendationSignal) ?? asString(source.recommendation_signal),
      mentionsCondition: asBoolean(source.mentionsCondition) ?? asBoolean(source.mentions_condition),
      mentionsDoctorOrHospitalNeed: asBoolean(source.mentionsDoctorOrHospitalNeed) ?? asBoolean(source.mentions_doctor_or_hospital_need),
    }),
    {},
  );
}

function applyStrictHistoryStructuredOutput(source: Record<string, unknown>): Record<string, unknown> {
  const metadataSource = asRecord(source.metadata);
  const nextAction = normalizePublicNextAction(
    asString(source.publicNextAction)
    ?? asString(source.public_next_action)
    ?? asString(source.nextAction)
    ?? asString(source.next_action),
  );
  const strictStructuredOutput = composeCanonicalMetadataEnvelope(
    source,
    buildCanonicalSemanticMetadata({
      resolvedIntent: asString(source.resolvedIntent) ?? asString(source.resolved_intent),
    }),
    {},
  );
  const publicIntent = derivePublicIntent({
    intent: asString(source.intent),
    resolvedIntent: asString(source.resolvedIntent) ?? asString(source.resolved_intent),
    nextAction,
    riskLevel: normalizeRiskLevel(asString(source.riskLevel) ?? asString(source.risk_level)),
  });
  if (publicIntent) {
    strictStructuredOutput.intent = publicIntent;
  }
  if (Object.keys(metadataSource).length > 0) {
    strictStructuredOutput.metadata = applyStrictHistoryCanonicalEnvelope(metadataSource);
  }
  return strictStructuredOutput;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
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

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isAllowedEnumValue<const TValues extends readonly string[]>(
  value: string | undefined,
  allowedValues: TValues,
): value is TValues[number] {
  return typeof value === 'string' && (allowedValues as readonly string[]).includes(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeNullableRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  return sanitizeUnknownValue(value) as Record<string, unknown>;
}

function sanitizeRecordArray(value: Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> {
  if (!value) return [];
  return sanitizeUnknownValue(value) as Array<Record<string, unknown>>;
}

function sanitizeCitationArray(value: AiChatCitation[]): AiChatCitation[] {
  return sanitizeUnknownValue(value) as AiChatCitation[];
}

function isProviderFailedDraft(message: { role?: string | null; content?: string | null; metadata?: Record<string, unknown> | null }): boolean {
  const draftState = asString(message.metadata?.draftState);
  return (message.role ?? '').toUpperCase() === 'ASSISTANT'
    && (message.content ?? '') === ''
    && (draftState === 'provider_error' || draftState === 'delivery_error');
}

function sanitizeUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknownValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === 'rawResponse'
      || key === 'raw_response'
      || key === 'conversation_id'
      || key === 'message_id'
      || key === 'task_id'
    ) {
      continue;
    }

    sanitized[key] = sanitizeUnknownValue(nestedValue);
  }

  return sanitized;
}

export default app;

app.route('/', chatbotPublicRoutes);
app.route('/', chatbotProtectedRoutes);
