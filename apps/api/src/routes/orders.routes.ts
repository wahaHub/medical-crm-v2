import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createOrderSchema,
  orderListQuerySchema,
  updateOrderStatusSchema,
  requestRefundSchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/orders — CreateOrder
// ---------------------------------------------------------------------------
const createOrderRoute = createRoute({
  method: 'post',
  path: '/api/v2/orders',
  request: {
    body: {
      content: { 'application/json': { schema: createOrderSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Order created' } },
});

app.openapi(createOrderRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createOrder.execute(body, actor);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/orders — ListOrders
// ---------------------------------------------------------------------------
const listOrdersRoute = createRoute({
  method: 'get',
  path: '/api/v2/orders',
  request: {
    query: orderListQuerySchema,
  },
  responses: { 200: { description: 'Paginated list of orders' } },
});

app.openapi(listOrdersRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listOrders.execute(query, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. GET /api/v2/orders/{id} — GetOrder
// ---------------------------------------------------------------------------
const getOrderRoute = createRoute({
  method: 'get',
  path: '/api/v2/orders/{id}',
  request: {
    params: orderIdParamSchema,
  },
  responses: { 200: { description: 'Order details' } },
});

app.openapi(getOrderRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getOrder.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. PATCH /api/v2/orders/{id}/status — UpdateOrderStatus
// ---------------------------------------------------------------------------
const updateOrderStatusRoute = createRoute({
  method: 'patch',
  path: '/api/v2/orders/{id}/status',
  request: {
    params: orderIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateOrderStatusSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Order status updated' } },
});

app.openapi(updateOrderStatusRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateOrderStatus.execute(id, body.status, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 5. POST /api/v2/orders/{id}/payment-intents — CreatePaymentIntent
// ---------------------------------------------------------------------------
const createPaymentIntentRoute = createRoute({
  method: 'post',
  path: '/api/v2/orders/{id}/payment-intents',
  request: {
    params: orderIdParamSchema,
  },
  responses: { 200: { description: 'Payment intent created' } },
});

app.openapi(createPaymentIntentRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createPaymentIntent.execute(id, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v2/orders/{id}/refunds — RequestRefund
// ---------------------------------------------------------------------------
const requestRefundRoute = createRoute({
  method: 'post',
  path: '/api/v2/orders/{id}/refunds',
  request: {
    params: orderIdParamSchema,
    body: {
      content: { 'application/json': { schema: requestRefundSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Refund requested' } },
});

app.openapi(requestRefundRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.requestRefund.execute(id, body, actor);
  return c.json(result, 200);
});

export default app;
