import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError, mapErrorToStatus } from '@medical-crm/utils';
import { applySecurityMiddleware, perUserRateLimiter } from './middleware/security.js';
import { authMiddleware } from '@medical-crm/infrastructure/auth';
import routes from './routes/index.js';
import internalRoutes from './routes/internal.routes.js';
import { registerHospitalUserSchema } from '@medical-crm/validation';
import { getServices } from './composition-root.js';

const app = new Hono();

// Apply security middleware stack (runs before auth)
applySecurityMiddleware(app);

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', version: '2.0.0' }));

// --- Routes that skip Keycloak auth (mounted BEFORE auth middleware) ---

// Public: hospital user self-registration (no auth required)
app.post('/api/v2/auth/hospital/register', async (c) => {
  const raw = await c.req.json();
  const body = registerHospitalUserSchema.parse(raw);
  const svc = getServices();
  const result = await svc.registerHospitalUser.execute(body);
  return c.json(result, 201);
});

// Public: validate hospital registration token (no auth required)
app.get('/api/v2/auth/hospital/register', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Token is required' }, 400);
  const svc = getServices();
  const result = await svc.validateRegistrationToken.execute(token);
  return c.json(result);
});

// Public: patient onboarding + auth routes (no Keycloak auth)
import patientPublicRoutes from './routes/patient-public.routes.js';
import patientAuthRoutes from './routes/patient-auth.routes.js';
app.route('/api/patient', patientPublicRoutes);
app.route('/api/patient', patientAuthRoutes);

// Public: booking request routes (no auth required)
import publicBookingRoutes from './routes/public-booking.routes.js';
app.route('/', publicBookingRoutes);

// Internal: worker endpoint (X-Internal-Secret header auth, not Keycloak)
app.route('/', internalRoutes);

// --- Auth middleware for everything else under /api/v2/* ---
app.use('/api/v2/*', authMiddleware, perUserRateLimiter);

// Mount authenticated API routes
app.route('/', routes);

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof DomainError) {
    const status = mapErrorToStatus(err.code);
    return c.json({ error: err.message, code: err.code }, status as 200 | 400 | 401 | 403 | 404 | 500);
  }
  // Catch Zod validation errors (e.g. from @hono/zod-openapi) and return 400 instead of 500.
  // Use name check to avoid importing zod directly (it's a transitive dependency).
  if (err.name === 'ZodError' && 'errors' in err) {
    return c.json({
      error: 'Validation failed',
      code: 'VALIDATION_FAILED',
      details: (err as Error & { errors: unknown[] }).errors,
    }, 400);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
