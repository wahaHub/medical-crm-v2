import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { uploadDocumentSchema } from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

const docIdParamSchema = z.object({
  caseId: z.string().uuid(),
  docId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/cases/:caseId/documents — UploadDocument
// ---------------------------------------------------------------------------
const uploadDocumentRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/documents',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: uploadDocumentSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Document upload initiated' } },
});

app.openapi(uploadDocumentRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.uploadDocument.execute(
    { caseId, ...body },
    actor,
  );
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/cases/:caseId/documents — ListDocuments
// ---------------------------------------------------------------------------
const listDocumentsRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/documents',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'List of documents for the case' } },
});

app.openapi(listDocumentsRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listDocuments.execute(caseId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. DELETE /api/v2/cases/:caseId/documents/:docId — DeleteDocument
// ---------------------------------------------------------------------------
const deleteDocumentRoute = createRoute({
  method: 'delete',
  path: '/api/v2/cases/{caseId}/documents/{docId}',
  request: {
    params: docIdParamSchema,
  },
  responses: { 204: { description: 'Document deleted' } },
});

app.openapi(deleteDocumentRoute, async (c) => {
  const { caseId, docId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteDocument.execute(caseId, docId, actor);
  return c.body(null, 204);
});

export default app;
