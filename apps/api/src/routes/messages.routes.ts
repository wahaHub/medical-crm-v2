import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';

import {
  sendMessageSchema,
  updateMessageSchema,
  messageListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';
import { wsManager } from '../ws/ws-manager.js';

const app = new OpenAPIHono();

function buildMessagePreview(content: string | null | undefined): string {
  const normalized = (content ?? '').trim();
  if (!normalized) return 'Open Medora to read the latest message.';
  return normalized.length > 180 ? `${normalized.slice(0, 179).trimEnd()}...` : normalized;
}

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

const messageParamSchema = z.object({
  id: z.string().uuid(),
  msgId: z.string().uuid(),
});

const standaloneMessageParamSchema = z.object({
  msgId: z.string().uuid(),
});

const messageUploadInitSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});

// ---------------------------------------------------------------------------
// 5. GET /api/v2/conversations/:id/messages — ListMessages
// ---------------------------------------------------------------------------
const listMessagesRoute = createRoute({
  method: 'get',
  path: '/api/v2/conversations/{id}/messages',
  request: {
    params: conversationIdParamSchema,
    query: messageListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of messages' } },
});

app.openapi(listMessagesRoute, async (c) => {
  const { id } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listMessages.execute(id, query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v2/conversations/:id/messages — SendMessage
// ---------------------------------------------------------------------------
const initMessageUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/conversations/{id}/attachments/upload',
  request: {
    params: conversationIdParamSchema,
    body: {
      content: { 'application/json': { schema: messageUploadInitSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Attachment upload initialized' } },
});

app.openapi(initMessageUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  await svc.getConversation.execute(id, actor);

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'message_attachment',
    ownerType: 'conversation',
    ownerId: id,
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
    attachment: result.asset, // backward compat: hospital app reads init.attachment
  }, 201);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v2/conversations/:id/messages — SendMessage
// ---------------------------------------------------------------------------
const sendMessageRoute = createRoute({
  method: 'post',
  path: '/api/v2/conversations/{id}/messages',
  request: {
    params: conversationIdParamSchema,
    body: {
      content: { 'application/json': { schema: sendMessageSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Message sent' } },
});

app.openapi(sendMessageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const conversation = await svc.getConversation.execute(id, actor);
  const executionResult = await svc.sendMessage.execute(id, body, actor);
  const result = 'message' in executionResult ? executionResult.message : executionResult;
  const sideEffectMessages = 'sideEffectMessages' in executionResult ? executionResult.sideEffectMessages : [];
  wsManager.broadcast(`conv:${id}`, {
    type: 'new_message',
    data: result,
  });
  for (const sideEffectMessage of sideEffectMessages) {
    wsManager.broadcast(`conv:${id}`, {
      type: 'new_message',
      data: sideEffectMessage,
    });
  }

  if (conversation.caseId) {
    const caseEntity = await svc.caseRepo.findById(conversation.caseId);
    if (caseEntity && actor.userId !== caseEntity.patientId) {
      wsManager.broadcast(`patient:${caseEntity.patientId}`, {
        type: 'unread_update',
        data: { conversationId: id, unreadDelta: 1 },
      });
    }

    if (caseEntity && (conversation.category === 'ADMIN_PATIENT' || conversation.category === 'HOSPITAL_PATIENT')) {
      const messagePreview = buildMessagePreview(result.content);
      if (actor.userId === caseEntity.patientId) {
        if (conversation.category === 'ADMIN_PATIENT') {
          try {
            await svc.notifyAdminsOfPatientMessage.execute({
              conversationId: id,
              caseId: conversation.caseId,
              patientId: caseEntity.patientId,
              patientName: null,
              messagePreview,
            });
          } catch (error) {
            console.warn('Failed to notify admins about a patient message:', error);
          }
        }
      } else {
        try {
          const patient = await svc.patientRepo.findById(caseEntity.patientId);
          await svc.notifyPatientOfAdminMessage.execute({
            conversationId: id,
            caseId: conversation.caseId,
            patientId: caseEntity.patientId,
            messagePreview,
            site: patient?.site ?? 'china',
            isPatientOnline:
              wsManager.hasSubscribers(`patient:${caseEntity.patientId}`)
              || wsManager.hasSubscribers(`conv:${id}`),
          });
        } catch (error) {
          console.warn('Failed to notify patient about an admin reply:', error);
        }
      }
    }
  }

  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 7. GET /api/v2/conversations/:id/messages/:msgId — GetMessage
// ---------------------------------------------------------------------------
const getMessageRoute = createRoute({
  method: 'get',
  path: '/api/v2/conversations/{id}/messages/{msgId}',
  request: {
    params: messageParamSchema,
  },
  responses: { 200: { description: 'Message details' } },
});

app.openapi(getMessageRoute, async (c) => {
  const { id, msgId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getMessage.execute(id, msgId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 8. PUT /api/v2/conversations/:id/messages/:msgId — UpdateMessage
// ---------------------------------------------------------------------------
const updateMessageRoute = createRoute({
  method: 'put',
  path: '/api/v2/conversations/{id}/messages/{msgId}',
  request: {
    params: messageParamSchema,
    body: {
      content: { 'application/json': { schema: updateMessageSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Message updated' } },
});

app.openapi(updateMessageRoute, async (c) => {
  const { id, msgId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateMessage.execute(id, msgId, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 9. DELETE /api/v2/conversations/:id/messages/:msgId — DeleteMessage
// ---------------------------------------------------------------------------
const deleteMessageRoute = createRoute({
  method: 'delete',
  path: '/api/v2/conversations/{id}/messages/{msgId}',
  request: {
    params: messageParamSchema,
  },
  responses: { 204: { description: 'Message deleted' } },
});

app.openapi(deleteMessageRoute, async (c) => {
  const { id, msgId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteMessage.execute(id, msgId, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 10. POST /api/v2/conversations/:id/messages/:msgId/regenerate-summary
// ---------------------------------------------------------------------------
const regenerateSummaryRoute = createRoute({
  method: 'post',
  path: '/api/v2/conversations/{id}/messages/{msgId}/regenerate-summary',
  request: {
    params: messageParamSchema,
  },
  responses: { 200: { description: 'Summary regenerated' } },
});

app.openapi(regenerateSummaryRoute, async (c) => {
  const { msgId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.regenerateSummary.execute(msgId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 11. POST /api/v2/conversations/:id/messages/:msgId/retranslate
// ---------------------------------------------------------------------------
const retranslateBodySchema = z.object({ targetLang: z.string().min(1) });

const retranslateMessageRoute = createRoute({
  method: 'post',
  path: '/api/v2/conversations/{id}/messages/{msgId}/retranslate',
  request: {
    params: messageParamSchema,
    body: {
      content: { 'application/json': { schema: retranslateBodySchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Message retranslated' } },
});

app.openapi(retranslateMessageRoute, async (c) => {
  const { msgId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.retranslateMessage.execute(msgId, body.targetLang, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 12. GET /api/v2/messages/pending-review — ListPendingReview
// ---------------------------------------------------------------------------
const listPendingReviewRoute = createRoute({
  method: 'get',
  path: '/api/v2/messages/pending-review',
  responses: { 200: { description: 'Messages pending review' } },
});

app.openapi(listPendingReviewRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listPendingReview.execute(actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 13. POST /api/v2/messages/:msgId/approve — ApproveMessage
// ---------------------------------------------------------------------------
const approveMessageRoute = createRoute({
  method: 'post',
  path: '/api/v2/messages/{msgId}/approve',
  request: {
    params: standaloneMessageParamSchema,
  },
  responses: { 200: { description: 'Message approved' } },
});

app.openapi(approveMessageRoute, async (c) => {
  const { msgId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.approveMessage.execute(msgId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 14. POST /api/v2/messages/:msgId/reject — RejectMessage
// ---------------------------------------------------------------------------
const rejectMessageRoute = createRoute({
  method: 'post',
  path: '/api/v2/messages/{msgId}/reject',
  request: {
    params: standaloneMessageParamSchema,
  },
  responses: { 200: { description: 'Message rejected' } },
});

app.openapi(rejectMessageRoute, async (c) => {
  const { msgId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.rejectMessage.execute(msgId, actor);
  return c.json(result, 200);
});

export default app;
