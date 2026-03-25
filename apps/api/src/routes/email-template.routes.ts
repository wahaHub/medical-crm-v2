import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  emailTemplateListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const hospitalIdParamSchema = z.object({
  hospitalId: z.string().uuid(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/hospitals/{hospitalId}/email-templates — Create
// ---------------------------------------------------------------------------
const createEmailTemplateRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/email-templates',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: { 'application/json': { schema: createEmailTemplateSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Email template created' } },
});

app.openapi(createEmailTemplateRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createEmailTemplate.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/hospitals/{hospitalId}/email-templates — List by hospital
// ---------------------------------------------------------------------------
const listEmailTemplatesRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/email-templates',
  request: {
    params: hospitalIdParamSchema,
    query: emailTemplateListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of email templates' } },
});

app.openapi(listEmailTemplatesRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listEmailTemplates.execute(hospitalId, query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/email-templates/{id} — Get template
// ---------------------------------------------------------------------------
const getEmailTemplateRoute = createRoute({
  method: 'get',
  path: '/api/v2/email-templates/{id}',
  request: {
    params: idParamSchema,
  },
  responses: { 200: { description: 'Email template details' } },
});

app.openapi(getEmailTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getEmailTemplate.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PUT /api/v2/email-templates/{id} — Update template
// ---------------------------------------------------------------------------
const updateEmailTemplateRoute = createRoute({
  method: 'put',
  path: '/api/v2/email-templates/{id}',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateEmailTemplateSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Email template updated' } },
});

app.openapi(updateEmailTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateEmailTemplate.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. DELETE /api/v2/email-templates/{id} — Delete template (soft)
// ---------------------------------------------------------------------------
const deleteEmailTemplateRoute = createRoute({
  method: 'delete',
  path: '/api/v2/email-templates/{id}',
  request: {
    params: idParamSchema,
  },
  responses: { 204: { description: 'Email template deleted' } },
});

app.openapi(deleteEmailTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteEmailTemplate.execute(id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v2/email-templates/{id}/upload — Get presigned upload URL
// ---------------------------------------------------------------------------
const uploadAttachmentRoute = createRoute({
  method: 'post',
  path: '/api/v2/email-templates/{id}/upload',
  request: {
    params: idParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            fileName: z.string().min(1),
            fileSize: z.number().int().positive(),
            mimeType: z.string().min(1),
          }),
        },
      },
      required: true,
    },
  },
  responses: { 200: { description: 'Presigned upload URL' } },
});

app.openapi(uploadAttachmentRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const template = await svc.getEmailTemplate.execute(id, actor);
  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'email_template_attachment',
    ownerType: 'email_template',
    ownerId: id,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  return c.json({
    uploadUrl: result.uploadUrl,
    storageKey: result.storageKey,
    expiresIn: result.expiresIn,
    asset: result.asset,
  }, 200);
});

export default app;
