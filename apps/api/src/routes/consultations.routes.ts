import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import type { ConsultationStatus } from '@medical-crm/domain';
import {
  createConsultationSchema,
  updateConsultationSchema,
  updateConsultationStatusSchema,
  consultationListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const consultationIdParamSchema = z.object({
  id: z.string().uuid(),
});

const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Action → ConsultationStatus mapping
// ---------------------------------------------------------------------------
const ACTION_TO_STATUS: Record<string, ConsultationStatus> = {
  start: 'IN_PROGRESS',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
  noShow: 'NO_SHOW',
};

// ---------------------------------------------------------------------------
// 1. POST /api/v2/consultations — CreateConsultation
// ---------------------------------------------------------------------------
const createConsultationRoute = createRoute({
  method: 'post',
  path: '/api/v2/consultations',
  request: {
    body: {
      content: { 'application/json': { schema: createConsultationSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Consultation created' } },
});

app.openapi(createConsultationRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createConsultation.execute({
    caseId: body.caseId,
    scheduledAt: new Date(body.scheduledAt),
    durationMinutes: body.durationMinutes,
    consultationLink: body.consultationLink,
    aiTranslation: body.aiTranslation,
    patientLanguage: body.patientLanguage,
    notes: body.notes,
  }, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/consultations — ListConsultations (cursor pagination)
// ---------------------------------------------------------------------------
const listConsultationsRoute = createRoute({
  method: 'get',
  path: '/api/v2/consultations',
  request: {
    query: consultationListQuerySchema,
  },
  responses: { 200: { description: 'Cursor-paginated list of consultations' } },
});

app.openapi(listConsultationsRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listConsultations.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/consultations/stats — GetConsultationStats
//    NOTE: must be registered before /:id to avoid matching "stats" as id
// ---------------------------------------------------------------------------
const getConsultationStatsRoute = createRoute({
  method: 'get',
  path: '/api/v2/consultations/stats',
  responses: { 200: { description: 'Consultation statistics' } },
});

app.openapi(getConsultationStatsRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getConsultationStats.execute(actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. GET /api/v2/consultations/:id — GetConsultation
// ---------------------------------------------------------------------------
const getConsultationRoute = createRoute({
  method: 'get',
  path: '/api/v2/consultations/{id}',
  request: {
    params: consultationIdParamSchema,
  },
  responses: { 200: { description: 'Consultation details' } },
});

app.openapi(getConsultationRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getConsultation.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. PUT /api/v2/consultations/:id — UpdateConsultation
// ---------------------------------------------------------------------------
const updateConsultationRoute = createRoute({
  method: 'put',
  path: '/api/v2/consultations/{id}',
  request: {
    params: consultationIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateConsultationSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Consultation updated' } },
});

app.openapi(updateConsultationRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateConsultation.execute(id, {
    ...body,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
  }, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/v2/consultations/:id/status — UpdateConsultationStatus
// ---------------------------------------------------------------------------
const updateConsultationStatusRoute = createRoute({
  method: 'patch',
  path: '/api/v2/consultations/{id}/status',
  request: {
    params: consultationIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateConsultationStatusSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Consultation status updated' } },
});

app.openapi(updateConsultationStatusRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { action } = c.req.valid('json');
  const status = ACTION_TO_STATUS[action]!;
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateConsultationStatus.execute(id, status, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. GET /api/v2/consultations/:id/transcript — GetConsultationTranscript
// ---------------------------------------------------------------------------
const getTranscriptRoute = createRoute({
  method: 'get',
  path: '/api/v2/consultations/{id}/transcript',
  request: {
    params: consultationIdParamSchema,
  },
  responses: { 200: { description: 'Consultation transcript' } },
});

app.openapi(getTranscriptRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getConsultationTranscript.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v2/consultations/:id/recording/upload — InitConsultationRecordingUpload
// ---------------------------------------------------------------------------
const uploadInitSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});

const initConsultationRecordingUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/consultations/{id}/recording/upload',
  request: {
    params: consultationIdParamSchema,
    body: {
      content: { 'application/json': { schema: uploadInitSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Consultation recording upload initialized' } },
});

app.openapi(initConsultationRecordingUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  await svc.getConsultation.execute(id, actor);

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'consultation_recording',
    ownerType: 'consultation',
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
// 9. GET /api/v2/cases/:caseId/consultations — ListCaseConsultations
// ---------------------------------------------------------------------------
const listCaseConsultationsRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/consultations',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Consultations for a case' } },
});

app.openapi(listCaseConsultationsRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listCaseConsultations.execute(caseId, actor);
  return c.json(result, 200);
});

export default app;
