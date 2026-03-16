import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createServiceCatalogItemSchema,
  updateServiceCatalogItemSchema,
  serviceCatalogItemListQuerySchema,
  createQuoteTemplateSchema,
  updateQuoteTemplateSchema,
  quoteTemplateListQuerySchema,
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
// 1. POST /api/v2/hospitals/{hospitalId}/service-catalog — Create
// ---------------------------------------------------------------------------
const createItemRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/service-catalog',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: { 'application/json': { schema: createServiceCatalogItemSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Service catalog item created' } },
});

app.openapi(createItemRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createServiceCatalogItem.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/hospitals/{hospitalId}/service-catalog — List by hospital
// ---------------------------------------------------------------------------
const listItemsByHospitalRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/service-catalog',
  request: {
    params: hospitalIdParamSchema,
    query: serviceCatalogItemListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of service catalog items' } },
});

app.openapi(listItemsByHospitalRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listServiceCatalogItems.execute(hospitalId, query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/service-catalog — List all (Admin)
// ---------------------------------------------------------------------------
const listAllItemsRoute = createRoute({
  method: 'get',
  path: '/api/v2/service-catalog',
  request: {
    query: serviceCatalogItemListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of all service catalog items' } },
});

app.openapi(listAllItemsRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listAllServiceCatalogItems.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. GET /api/v2/service-catalog/{id} — Get item
// ---------------------------------------------------------------------------
const getItemRoute = createRoute({
  method: 'get',
  path: '/api/v2/service-catalog/{id}',
  request: {
    params: idParamSchema,
  },
  responses: { 200: { description: 'Service catalog item details' } },
});

app.openapi(getItemRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getServiceCatalogItem.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. PUT /api/v2/service-catalog/{id} — Update item
// ---------------------------------------------------------------------------
const updateItemRoute = createRoute({
  method: 'put',
  path: '/api/v2/service-catalog/{id}',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateServiceCatalogItemSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Service catalog item updated' } },
});

app.openapi(updateItemRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateServiceCatalogItem.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. DELETE /api/v2/service-catalog/{id} — Delete item (soft)
// ---------------------------------------------------------------------------
const deleteItemRoute = createRoute({
  method: 'delete',
  path: '/api/v2/service-catalog/{id}',
  request: {
    params: idParamSchema,
  },
  responses: { 204: { description: 'Service catalog item deleted' } },
});

app.openapi(deleteItemRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteServiceCatalogItem.execute(id, actor);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 7. POST /api/v2/hospitals/{hospitalId}/quote-templates — Create
// ---------------------------------------------------------------------------
const createTemplateRoute = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/quote-templates',
  request: {
    params: hospitalIdParamSchema,
    body: {
      content: { 'application/json': { schema: createQuoteTemplateSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Quote template created' } },
});

app.openapi(createTemplateRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createQuoteTemplate.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 8. GET /api/v2/hospitals/{hospitalId}/quote-templates — List by hospital
// ---------------------------------------------------------------------------
const listTemplatesByHospitalRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/quote-templates',
  request: {
    params: hospitalIdParamSchema,
    query: quoteTemplateListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of quote templates' } },
});

app.openapi(listTemplatesByHospitalRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listQuoteTemplates.execute(hospitalId, query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 9. GET /api/v2/quote-templates/{id} — Get template
// ---------------------------------------------------------------------------
const getTemplateRoute = createRoute({
  method: 'get',
  path: '/api/v2/quote-templates/{id}',
  request: {
    params: idParamSchema,
  },
  responses: { 200: { description: 'Quote template details' } },
});

app.openapi(getTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getQuoteTemplate.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 10. PUT /api/v2/quote-templates/{id} — Update template
// ---------------------------------------------------------------------------
const updateTemplateRoute = createRoute({
  method: 'put',
  path: '/api/v2/quote-templates/{id}',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateQuoteTemplateSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Quote template updated' } },
});

app.openapi(updateTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateQuoteTemplate.execute(id, body, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 11. DELETE /api/v2/quote-templates/{id} — Delete template (soft)
// ---------------------------------------------------------------------------
const deleteTemplateRoute = createRoute({
  method: 'delete',
  path: '/api/v2/quote-templates/{id}',
  request: {
    params: idParamSchema,
  },
  responses: { 204: { description: 'Quote template deleted' } },
});

app.openapi(deleteTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteQuoteTemplate.execute(id, actor);
  return c.body(null, 204);
});

export default app;
