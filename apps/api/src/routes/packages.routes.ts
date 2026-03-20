import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { randomUUID } from 'node:crypto';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createPackageSchema,
  updatePackageSchema,
  packageListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const packageIdParamSchema = z.object({
  id: z.string().uuid(),
});

const packageImageUploadInitSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/packages — CreatePackage
// ---------------------------------------------------------------------------
const createPackageRoute = createRoute({
  method: 'post',
  path: '/api/v2/packages',
  request: {
    body: {
      content: { 'application/json': { schema: createPackageSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Package created' } },
});

app.openapi(createPackageRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createPackage.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 1b. POST /api/v2/packages/images/upload-init — Init package image upload
// ---------------------------------------------------------------------------
const initPackageImageUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/packages/images/upload-init',
  request: {
    body: {
      content: { 'application/json': { schema: packageImageUploadInitSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Package image upload initialized' } },
});

app.openapi(initPackageImageUploadRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  // Ensure auth and role checks run consistently with other package endpoints.
  if (actor.role !== 'ADMIN') {
    return c.json({ message: 'Forbidden' }, 403);
  }

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'package_image',
    ownerType: 'package',
    ownerId: `draft_${randomUUID()}`,
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
// 2. GET /api/v2/packages — ListPackages
// ---------------------------------------------------------------------------
const listPackagesRoute = createRoute({
  method: 'get',
  path: '/api/v2/packages',
  request: {
    query: packageListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of packages' } },
});

app.openapi(listPackagesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listPackages.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/packages/{id} — GetPackage
// ---------------------------------------------------------------------------
const getPackageRoute = createRoute({
  method: 'get',
  path: '/api/v2/packages/{id}',
  request: {
    params: packageIdParamSchema,
  },
  responses: { 200: { description: 'Package details' } },
});

app.openapi(getPackageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getPackage.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PUT /api/v2/packages/{id} — UpdatePackage
// ---------------------------------------------------------------------------
const updatePackageRoute = createRoute({
  method: 'put',
  path: '/api/v2/packages/{id}',
  request: {
    params: packageIdParamSchema,
    body: {
      content: { 'application/json': { schema: updatePackageSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Package updated' } },
});

app.openapi(updatePackageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updatePackage.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. DELETE /api/v2/packages/{id} — DeletePackage
// ---------------------------------------------------------------------------
const deletePackageRoute = createRoute({
  method: 'delete',
  path: '/api/v2/packages/{id}',
  request: {
    params: packageIdParamSchema,
  },
  responses: { 204: { description: 'Package deleted' } },
});

app.openapi(deletePackageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deletePackage.execute(id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v2/packages/{id}/publish — PublishPackage
// ---------------------------------------------------------------------------
const publishPackageRoute = createRoute({
  method: 'post',
  path: '/api/v2/packages/{id}/publish',
  request: {
    params: packageIdParamSchema,
  },
  responses: { 200: { description: 'Package published' } },
});

app.openapi(publishPackageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.publishPackage.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 7. POST /api/v2/packages/{id}/unpublish — UnpublishPackage
// ---------------------------------------------------------------------------
const unpublishPackageRoute = createRoute({
  method: 'post',
  path: '/api/v2/packages/{id}/unpublish',
  request: {
    params: packageIdParamSchema,
  },
  responses: { 200: { description: 'Package unpublished' } },
});

app.openapi(unpublishPackageRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.unpublishPackage.execute(id, actor);
  return c.json(result, 200);
});

export default app;
