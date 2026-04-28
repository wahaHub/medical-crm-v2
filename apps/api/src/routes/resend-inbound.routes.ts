import { Hono } from 'hono';
import type { Context } from 'hono';
import { getServices } from '../composition-root.js';

const resendInboundRoutes = new Hono();

resendInboundRoutes.post('/inbound', async (c) => {
  if (process.env['INBOUND_EMAIL_ENABLED'] !== 'true') {
    return c.body(null, 204);
  }

  const svc = getServices();
  const rawBody = await c.req.text();
  let normalized;

  try {
    normalized = await svc.resendInbound.verifyAndNormalizeWebhook({
      rawBody,
      headers: c.req.raw.headers,
    });
  } catch (error) {
    const response = mapResendWebhookError(c, error);
    if (response) return response;
    throw error;
  }

  if (!normalized) {
    return c.body(null, 204);
  }

  await svc.processInboundEmail.execute(normalized);
  return c.body(null, 204);
});

function mapResendWebhookError(c: Context, error: unknown): Response | null {
  const message = error instanceof Error ? error.message : 'Invalid Resend inbound webhook';

  if (/signature/i.test(message)) {
    return c.json({ error: message }, 401);
  }

  if (message.startsWith('RESEND_') || /missing data\.email_id/i.test(message)) {
    return c.json({ error: message }, 400);
  }

  return null;
}

export default resendInboundRoutes;
