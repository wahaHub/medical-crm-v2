import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateListQuerySchema,
  submitResponseSchema,
  saveResponseDraftSchema,
  responseListQuerySchema,
  customizeQuestionsSchema,
} from '@medical-crm/validation';
import type {
  CreateTemplateInput as CreateTemplateUseCaseInput,
} from '@medical-crm/application';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const templateIdParamSchema = z.object({
  id: z.string().uuid(),
});

const templateIdParamSchemaAlt = z.object({
  templateId: z.string().uuid(),
});

const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/question-templates — CreateTemplate
// ---------------------------------------------------------------------------
const createTemplateRoute = createRoute({
  method: 'post',
  path: '/api/v2/question-templates',
  request: {
    body: {
      content: { 'application/json': { schema: createTemplateSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Template created' } },
});

app.openapi(createTemplateRoute, async (c) => {
  const body = c.req.valid('json') as CreateTemplateUseCaseInput;
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createTemplate.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/question-templates — ListTemplates
// ---------------------------------------------------------------------------
const listTemplatesRoute = createRoute({
  method: 'get',
  path: '/api/v2/question-templates',
  request: {
    query: templateListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of templates' } },
});

app.openapi(listTemplatesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listTemplates.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/question-templates/{id} — GetTemplate
// ---------------------------------------------------------------------------
const getTemplateRoute = createRoute({
  method: 'get',
  path: '/api/v2/question-templates/{id}',
  request: {
    params: templateIdParamSchema,
    query: z.object({ caseId: z.string().uuid().optional() }),
  },
  responses: { 200: { description: 'Template details' } },
});

app.openapi(getTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { caseId } = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getTemplate.execute(id, actor, caseId);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PUT /api/v2/question-templates/{id} — UpdateTemplate
// ---------------------------------------------------------------------------
const updateTemplateRoute = createRoute({
  method: 'put',
  path: '/api/v2/question-templates/{id}',
  request: {
    params: templateIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateTemplateSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Template updated' } },
});

app.openapi(updateTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateTemplate.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. POST /api/v2/cases/{caseId}/questionnaire — SubmitResponse
// ---------------------------------------------------------------------------
const submitResponseRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/questionnaire',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: submitResponseSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Response submitted' } },
});

app.openapi(submitResponseRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json') as import('@medical-crm/application').SubmitResponseInput;
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.submitQCResponse.execute(caseId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/v2/cases/{caseId}/questionnaire — SaveResponseDraft
// ---------------------------------------------------------------------------
const saveResponseDraftRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{caseId}/questionnaire',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: saveResponseDraftSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Draft saved' } },
});

app.openapi(saveResponseDraftRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json') as import('@medical-crm/application').SaveResponseDraftInput;
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.saveQCResponseDraft.execute(caseId, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. GET /api/v2/cases/{caseId}/questionnaire — GetResponse
// ---------------------------------------------------------------------------
const getResponseRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/questionnaire',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Response details' } },
});

app.openapi(getResponseRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getQCResponse.execute(caseId, actor);
  return c.json(result ?? { data: null }, 200);
});

// ---------------------------------------------------------------------------
// 8. GET /api/v2/questionnaire-responses — ListResponses (Admin)
// ---------------------------------------------------------------------------
const listResponsesRoute = createRoute({
  method: 'get',
  path: '/api/v2/questionnaire-responses',
  request: {
    query: responseListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of responses' } },
});

app.openapi(listResponsesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listQCResponses.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 9. POST /api/v2/question-templates/{templateId}/customizations — CustomizeQuestions
// ---------------------------------------------------------------------------
const customizeQuestionsRoute = createRoute({
  method: 'post',
  path: '/api/v2/question-templates/{templateId}/customizations',
  request: {
    params: templateIdParamSchemaAlt,
    body: {
      content: { 'application/json': { schema: customizeQuestionsSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Customization saved' } },
});

app.openapi(customizeQuestionsRoute, async (c) => {
  const { templateId } = c.req.valid('param');
  const body = c.req.valid('json') as import('@medical-crm/application').CustomizeQuestionsInput;
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.customizeQuestions.execute(templateId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 10. GET /api/v2/question-templates/{templateId}/customizations — GetCustomization
// ---------------------------------------------------------------------------
const getCustomizationRoute = createRoute({
  method: 'get',
  path: '/api/v2/question-templates/{templateId}/customizations',
  request: {
    params: templateIdParamSchemaAlt,
  },
  responses: { 200: { description: 'Customization details' } },
});

app.openapi(getCustomizationRoute, async (c) => {
  const { templateId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getCustomization.execute(templateId, actor);
  return c.json(result ?? { data: null }, 200);
});

export default app;
