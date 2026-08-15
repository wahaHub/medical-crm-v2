import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { extname } from 'node:path';
import { DomainError, mapErrorToStatus } from '@medical-crm/utils';
import { applySecurityMiddleware, perUserRateLimiter } from './middleware/security.js';
import { authMiddleware } from '@medical-crm/infrastructure/auth';
import { isTransientDatabaseError } from '@medical-crm/infrastructure/database/retry';
import routes from './routes/index.js';
import internalRoutes from './routes/internal.routes.js';
import resendInboundRoutes from './routes/resend-inbound.routes.js';
import stripeWebhookRoutes from './routes/stripe-webhook.routes.js';
import {
  forgotHospitalPasswordSchema,
  registerHospitalUserSchema,
  resetHospitalPasswordSchema,
} from '@medical-crm/validation';
import { getServices } from './composition-root.js';
import { LocalFileStorageAdapter } from '@medical-crm/infrastructure/storage/local-file';

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.rtf': 'application/rtf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
};

function mimeTypeFromKey(key: string): string {
  const ext = extname(key).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

const app = new Hono();

// Outermost wrapper: relax Cross-Origin-Resource-Policy for local-uploads
// AFTER the global secureHeaders middleware has run. The admin dashboard runs
// on a different origin in development (localhost:3002 vs API localhost:3001)
// and embeds uploaded images/PDFs via <img> / <iframe>.
app.use('*', async (c, next) => {
  await next();
  if (c.req.path === '/api/local-uploads') {
    c.header('Cross-Origin-Resource-Policy', 'cross-origin');
  }
});

// Apply security middleware stack (runs before auth)
applySecurityMiddleware(app);

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', version: '2.0.0' }));

// Local filesystem upload/download handler used by LocalFileStorageAdapter in dev.
// The signed URL itself acts as the authorization token, so no session auth is required.
app.put('/api/local-uploads', async (c) => {
  const keyParam = c.req.query('key');
  if (!keyParam) return c.json({ error: 'key is required' }, 400);

  const storage = getServices().localFileStorage;
  if (!storage || !(storage instanceof LocalFileStorageAdapter)) {
    return c.json({ error: 'Local file storage is not enabled' }, 503);
  }

  const key = Buffer.from(keyParam, 'base64url').toString('utf-8');
  const data = Buffer.from(await c.req.arrayBuffer());
  await storage.saveFile(key, data);
  return c.body(null, 204);
});

app.get('/api/local-uploads', async (c) => {
  const keyParam = c.req.query('key');
  if (!keyParam) return c.json({ error: 'key is required' }, 400);

  const storage = getServices().localFileStorage;
  if (!storage || !(storage instanceof LocalFileStorageAdapter)) {
    return c.json({ error: 'Local file storage is not enabled' }, 503);
  }

  const key = Buffer.from(keyParam, 'base64url').toString('utf-8');
  try {
    const data = await storage.readFile(key);
    const contentType = mimeTypeFromKey(key);
    c.header('Content-Type', contentType);
    // Only force download for non-browser-renderable types. Images, videos and PDFs
    // should render inline when used as <img> / <iframe> sources in the admin UI.
    const isInlineRenderable = contentType.startsWith('image/')
      || contentType.startsWith('video/')
      || contentType === 'application/pdf';
    if (c.req.query('download') === '1' && !isInlineRenderable) {
      const fileName = key.split('/').pop() ?? 'download';
      c.header('Content-Disposition', `attachment; filename="${fileName}"`);
    }
    return c.body(data as any);
  } catch {
    return c.json({ error: 'File not found' }, 404);
  }
});

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

// Public: request hospital password reset email (no auth required)
app.post('/api/v2/auth/hospital/forgot-password', async (c) => {
  const raw = await c.req.json();
  const body = forgotHospitalPasswordSchema.parse(raw);
  const svc = getServices();
  const result = await svc.requestHospitalPasswordReset.execute(body);
  return c.json(result, 202);
});

// Public: validate hospital password reset token (no auth required)
app.get('/api/v2/auth/hospital/reset-password', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Token is required' }, 400);
  const svc = getServices();
  const result = await svc.validateHospitalPasswordResetToken.execute(token);
  return c.json(result);
});

// Public: complete hospital password reset (no auth required)
app.post('/api/v2/auth/hospital/reset-password', async (c) => {
  const raw = await c.req.json();
  const body = resetHospitalPasswordSchema.parse(raw);
  const svc = getServices();
  await svc.resetHospitalPassword.execute(body);
  return c.body(null, 204);
});

// Public: patient onboarding + auth routes (no Keycloak auth)
import patientPublicRoutes from './routes/patient-public.routes.js';
import patientAuthRoutes from './routes/patient-auth.routes.js';
import patientProtectedRoutes from './routes/patient-protected.routes.js';
import patientPaymentRoutes from './routes/patient-payments.routes.js';
import { chatbotPublicRoutes } from './routes/chatbot.routes.js';
import { chatbotV3PublicRoutes } from './routes/chatbot-v3.routes.js';
app.route('/api/patient', patientPublicRoutes);
app.route('/api/patient', patientPaymentRoutes);
app.route('/api/patient', patientAuthRoutes);

// Patient protected routes (patient JWT auth, not Keycloak)
app.route('/api/patient', patientProtectedRoutes);

// Public: booking request routes (no auth required)
import publicBookingRoutes from './routes/public-booking.routes.js';
app.route('/', publicBookingRoutes);

// Public: site-scoped hospital directory (no auth required)
import publicHospitalRoutes from './routes/public-hospitals.routes.js';
app.route('/', publicHospitalRoutes);

// Public: published Guides return a pre-rendered, safe HTML contract for the website.
import { publicGuidesRoutes } from './routes/guides.routes.js';
app.route('/', publicGuidesRoutes);

// Public: chatbot routes use session-secret / patient-session auth, not Keycloak
app.route('/', chatbotPublicRoutes);
app.route('/', chatbotV3PublicRoutes);

// Internal: worker endpoint (X-Internal-Secret header auth, not Keycloak)
app.route('/', internalRoutes);

// Public: Resend inbound email webhook (Svix signature auth, not Keycloak)
app.route('/api/webhooks/resend', resendInboundRoutes);

// Public: Stripe webhook (signature verification, not Keycloak)
app.route('/api/webhooks/stripe', stripeWebhookRoutes);

// --- Auth middleware for everything else under /api/v2/* ---
app.use('/api/v2/*', authMiddleware, perUserRateLimiter);

// Mount authenticated API routes
app.route('/', routes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

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
  if (isTransientDatabaseError(err)) {
    console.error('Transient database error:', err);
    return c.json({ error: 'Service temporarily unavailable' }, 503);
  }
  const requestId = c.get('requestId');
  const pathname = new URL(c.req.url).pathname;
  console.error('Unhandled error:', {
    requestId,
    method: c.req.method,
    path: pathname,
    error: err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack,
        }
      : err,
  });
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
