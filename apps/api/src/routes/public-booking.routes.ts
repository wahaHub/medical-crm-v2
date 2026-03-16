import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import {
  createBookingRequestSchema,
  saveHospitalSelectionsSchema,
  completeSignupSchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const bookingIdParamSchema = z.object({
  id: z.string().uuid(),
});

const bookingIdPathParamSchema = z.object({
  bookingId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// 1. POST /api/v2/public/booking-requests — CreateBookingRequest
// ---------------------------------------------------------------------------
const createBookingRequestRoute = createRoute({
  method: 'post',
  path: '/api/v2/public/booking-requests',
  request: {
    body: {
      content: { 'application/json': { schema: createBookingRequestSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Booking request created' } },
});

app.openapi(createBookingRequestRoute, async (c) => {
  const body = c.req.valid('json');
  const svc = getServices();
  const result = await svc.createBookingRequest.execute(body);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/public/hospital-recommendations/{bookingId} — GetHospitalRecommendations
// ---------------------------------------------------------------------------
const getRecommendationsRoute = createRoute({
  method: 'get',
  path: '/api/v2/public/hospital-recommendations/{bookingId}',
  request: {
    params: bookingIdPathParamSchema,
  },
  responses: { 200: { description: 'Hospital recommendations' } },
});

app.openapi(getRecommendationsRoute, async (c) => {
  const { bookingId } = c.req.valid('param');
  const svc = getServices();
  const result = await svc.getHospitalRecommendations.execute(bookingId);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. POST /api/v2/public/booking-requests/{id}/selections — SaveHospitalSelections
// ---------------------------------------------------------------------------
const saveSelectionsRoute = createRoute({
  method: 'post',
  path: '/api/v2/public/booking-requests/{id}/selections',
  request: {
    params: bookingIdParamSchema,
    body: {
      content: { 'application/json': { schema: saveHospitalSelectionsSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Hospital selections saved' } },
});

app.openapi(saveSelectionsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const svc = getServices();
  const result = await svc.saveHospitalSelections.execute(id, body);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 4. POST /api/v2/public/booking-requests/{id}/complete-signup — CompleteSignup (stubbed)
// ---------------------------------------------------------------------------
const completeSignupRoute = createRoute({
  method: 'post',
  path: '/api/v2/public/booking-requests/{id}/complete-signup',
  request: {
    params: bookingIdParamSchema,
    body: {
      content: { 'application/json': { schema: completeSignupSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Signup completed (stubbed)' } },
});

app.openapi(completeSignupRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const svc = getServices();
  const result = await svc.completeSignup.execute(id, body);
  return c.json(result, 200);
});

export default app;
