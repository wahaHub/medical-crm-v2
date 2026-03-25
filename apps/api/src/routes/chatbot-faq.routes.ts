import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createChatbotFaqSchema,
  updateChatbotFaqSchema,
  chatbotFaqListQuerySchema,
  createFaqCategorySchema,
  faqCategoryListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const faqIdParamSchema = z.object({
  id: z.string().uuid(),
});

const faqCategoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/chatbot/faqs — CreateFaqItem
// ---------------------------------------------------------------------------
const createFaqRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/faqs',
  request: {
    body: {
      content: { 'application/json': { schema: createChatbotFaqSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'FAQ item created' } },
});

app.openapi(createFaqRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createFaqItem.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/chatbot/faqs — ListFaqItems
// ---------------------------------------------------------------------------
const listFaqRoute = createRoute({
  method: 'get',
  path: '/api/v2/chatbot/faqs',
  request: {
    query: chatbotFaqListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of FAQ items' } },
});

app.openapi(listFaqRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listFaqItems.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2b. GET /api/v2/chatbot/faqs/categories — ListFaqCategories
// ---------------------------------------------------------------------------
const listFaqCategoriesRoute = createRoute({
  method: 'get',
  path: '/api/v2/chatbot/faqs/categories',
  request: {
    query: faqCategoryListQuerySchema,
  },
  responses: { 200: { description: 'FAQ categories' } },
});

app.openapi(listFaqCategoriesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listFaqCategories.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 2c. POST /api/v2/chatbot/faqs/categories — CreateFaqCategory
// ---------------------------------------------------------------------------
const createFaqCategoryRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/faqs/categories',
  request: {
    body: {
      content: { 'application/json': { schema: createFaqCategorySchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'FAQ category created' } },
});

app.openapi(createFaqCategoryRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createFaqCategory.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2d. DELETE /api/v2/chatbot/faqs/categories/{id} — DeleteFaqCategory
// ---------------------------------------------------------------------------
const deleteFaqCategoryRoute = createRoute({
  method: 'delete',
  path: '/api/v2/chatbot/faqs/categories/{id}',
  request: {
    params: faqCategoryIdParamSchema,
  },
  responses: { 204: { description: 'FAQ category deleted' } },
});

app.openapi(deleteFaqCategoryRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteFaqCategory.execute(id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/chatbot/faqs/{id} — GetFaqItem
// ---------------------------------------------------------------------------
const getFaqRoute = createRoute({
  method: 'get',
  path: '/api/v2/chatbot/faqs/{id}',
  request: {
    params: faqIdParamSchema,
  },
  responses: { 200: { description: 'FAQ item details' } },
});

app.openapi(getFaqRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getFaqItem.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PATCH /api/v2/chatbot/faqs/{id} — UpdateFaqItem
// ---------------------------------------------------------------------------
const updateFaqRoute = createRoute({
  method: 'patch',
  path: '/api/v2/chatbot/faqs/{id}',
  request: {
    params: faqIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateChatbotFaqSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'FAQ item updated' } },
});

app.openapi(updateFaqRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateFaqItem.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. DELETE /api/v2/chatbot/faqs/{id} — DeleteFaqItem
// ---------------------------------------------------------------------------
const deleteFaqRoute = createRoute({
  method: 'delete',
  path: '/api/v2/chatbot/faqs/{id}',
  request: {
    params: faqIdParamSchema,
  },
  responses: { 204: { description: 'FAQ item deleted' } },
});

app.openapi(deleteFaqRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteFaqItem.execute(id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v2/chatbot/faqs/{id}/attachments/upload — InitFaqAttachmentUpload
// ---------------------------------------------------------------------------
const faqUploadInitSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});

const initFaqAttachmentUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/chatbot/faqs/{id}/attachments/upload',
  request: {
    params: faqIdParamSchema,
    body: {
      content: { 'application/json': { schema: faqUploadInitSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'FAQ attachment upload initialized' } },
});

app.openapi(initFaqAttachmentUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.getFaqItem.execute(id, actor);

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'faq_attachment',
    ownerType: 'faq',
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
  }, 201);
});

// ---------------------------------------------------------------------------
// 7. GET /api/v2/chatbot/analytics — stub analytics
// ---------------------------------------------------------------------------
const analyticsRoute = createRoute({
  method: 'get',
  path: '/api/v2/chatbot/analytics',
  responses: { 200: { description: 'Chatbot analytics summary' } },
});

app.openapi(analyticsRoute, async (c) => {
  return c.json({
    totalItems: 0,
    activeItems: 0,
    totalCategories: 0,
    topCategories: [],
  }, 200);
});

export default app;
