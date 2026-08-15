import { createHash } from 'node:crypto';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { assertHospitalCaseAccess, toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createCaseSchema,
  createManualCaseSchema,
  addCaseNoteSchema,
  updateCaseSchema,
  saveCaseDiagnosisSchema,
  assignCaseSchema,
  updateCaseStatusSchema,
  advanceCaseStageSchema,
  caseListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  id: z.string().uuid(),
});

const sendMarketingEmailSchema = z.object({
  subject: z.string().trim().min(1),
  messagePreview: z.string().trim().min(1),
});

function buildMarketingEmailDedupeKey(caseId: string, subject: string, messagePreview: string): string {
  const digest = createHash('sha256')
    .update(`${subject.trim()}\n${messagePreview.trim()}`)
    .digest('hex')
    .slice(0, 16);
  return `marketing-email:${caseId}:${digest}`;
}

// ---------------------------------------------------------------------------
// 1. POST /api/v2/cases — CreateCase (ADMIN only)
// ---------------------------------------------------------------------------
const createCaseRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases',
  request: {
    body: {
      content: { 'application/json': { schema: createCaseSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Case created' } },
});

app.openapi(createCaseRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createCase.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 1a. POST /api/v2/cases/manual — CreateManualCase (ADMIN only)
//     NOTE: must be registered before /{id} routes to avoid matching "manual" as id
// ---------------------------------------------------------------------------
const createManualCaseRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/manual',
  request: {
    body: {
      content: { 'application/json': { schema: createManualCaseSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Manually created case' } },
});

app.openapi(createManualCaseRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createManualCase.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/cases — ListCases (ADMIN, HOSPITAL)
// ---------------------------------------------------------------------------
const listCasesRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases',
  request: {
    query: caseListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of cases' } },
});

app.openapi(listCasesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listCases.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/cases/stats — GetCaseStats
//    NOTE: must be registered before /:id to avoid matching "stats" as id
// ---------------------------------------------------------------------------
const getCaseStatsRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/stats',
  responses: { 200: { description: 'Case statistics' } },
});

app.openapi(getCaseStatsRoute, async (c) => {
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getCaseStats.execute(actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. GET /api/v2/cases/:id — GetCase or GetHospitalCaseDetail (role-based)
// ---------------------------------------------------------------------------
const getCaseRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{id}',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'Case details' } },
});

app.openapi(getCaseRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  if (actor.role === 'HOSPITAL') {
    const result = await svc.getHospitalCaseDetail.execute(id, actor);
    return c.json(result, 200);
  }
  const result = await svc.getCase.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. PATCH /api/v2/cases/:id — UpdateCase
// ---------------------------------------------------------------------------
const updateCaseRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{id}',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateCaseSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case updated' } },
});

app.openapi(updateCaseRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateCase.execute(id, body, actor);
  return c.json(result, 200);
});

const saveCaseDiagnosisRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{id}/diagnosis',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: saveCaseDiagnosisSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case diagnosis saved' } },
});

app.openapi(saveCaseDiagnosisRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.saveCaseDiagnosis.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/v2/cases/:id/status — UpdateCaseStatus
// ---------------------------------------------------------------------------
const updateCaseStatusRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{id}/status',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateCaseStatusSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case status updated' } },
});

app.openapi(updateCaseStatusRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { assignmentStatus } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateCaseStatus.execute(id, assignmentStatus, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. PATCH /api/v2/cases/:id/stage — AdvanceCaseStage
// ---------------------------------------------------------------------------
const advanceCaseStageRoute = createRoute({
  method: 'patch',
  path: '/api/v2/cases/{id}/stage',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: advanceCaseStageSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case stage advanced' } },
});

app.openapi(advanceCaseStageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { treatmentStage } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.advanceCaseStage.execute(id, treatmentStage, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7a. POST /api/v2/cases/:id/notes — AddCaseNote (ADMIN only, ADMIN_NOTE event)
// ---------------------------------------------------------------------------
const addCaseNoteRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{id}/notes',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: addCaseNoteSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Case note recorded on the timeline' } },
});

app.openapi(addCaseNoteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { note } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.addCaseNoteEvent.execute(id, note, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v2/cases/:id/assign — AssignCase (ADMIN only)
// ---------------------------------------------------------------------------
const assignCaseRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{id}/assign',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: assignCaseSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Case assigned' } },
});

app.openapi(assignCaseRoute, async (c) => {
  console.warn('[DEPRECATED] POST /assign — will be replaced by AcceptQuote in Module 1');
  const { id } = c.req.valid('param');
  const { hospitalId } = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.assignCase.execute(id, hospitalId, actor);
  return c.json(result, 200);
});

const sendMarketingEmailRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{id}/marketing-email',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: sendMarketingEmailSchema } },
      required: true,
    },
  },
  responses: { 204: { description: 'Marketing email dispatched (best effort)' } },
});

app.openapi(sendMarketingEmailRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  if (actor.role !== 'HOSPITAL') {
    return c.json({ error: 'Only hospital users can send patient marketing emails' }, 403);
  }

  const caseEntity = await svc.caseRepo.findById(id);
  if (!caseEntity) {
    return c.json({ error: 'Case not found' }, 404);
  }

  await svc.adminPatientSiteAccess.assertCaseNotExcludedByPatientEmail(caseEntity);
  await assertHospitalCaseAccess(caseEntity, actor.hospitalId, svc.chcRepo);

  const patient = await svc.patientRepo.findById(caseEntity.patientId);
  const dedupeKey = buildMarketingEmailDedupeKey(id, body.subject, body.messagePreview);
  const hospitalId = actor.hospitalId ?? undefined;
  try {
    await svc.notifyPatientOfCaseUpdate.execute({
      caseId: id,
      patientId: caseEntity.patientId,
      site: patient?.site ?? 'china',
      subject: body.subject,
      messagePreview: body.messagePreview,
      dedupeKey,
      channel: 'HOSPITAL_PATIENT',
      hospitalId,
      sourceKind: 'marketing-email',
      sourceId: dedupeKey,
      resolveConversationId: async () => {
        const conversation = await svc.createConversation.execute({
          category: 'HOSPITAL_PATIENT',
          caseId: id,
          hospitalId,
        }, actor);
        return conversation.id;
      },
    });
  } catch (error) {
    console.warn('Failed to send patient marketing email:', error);
  }

  return c.body(null, 204);
});

export default app;
