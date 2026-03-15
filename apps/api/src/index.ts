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
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
