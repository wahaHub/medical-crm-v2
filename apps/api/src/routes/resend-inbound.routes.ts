import { Hono } from 'hono';
import type { Context } from 'hono';
import { getResendInboundVerifier, getServices } from '../composition-root.js';

const resendInboundRoutes = new Hono();
const invalidSignatureMessage = 'Invalid Resend webhook signature';
const missingEmailIdMessage = 'Resend email.received webhook missing data.email_id';
const missingResendApiKeyMessage = 'RESEND_API_KEY is required for Resend inbound email API access';
const missingResendWebhookSecretMessage = 'RESEND_WEBHOOK_SECRET is required to verify Resend inbound webhooks';

resendInboundRoutes.post('/inbound', async (c) => {
  if (process.env['INBOUND_EMAIL_ENABLED'] !== 'true') {
    return c.body(null, 204);
  }

  const rawBody = await c.req.text();
  const verifier = getResendInboundVerifier();
  let normalized: Awaited<ReturnType<typeof verifier.verifyAndNormalizeWebhook>>;

  try {
    normalized = await verifier.verifyAndNormalizeWebhook({
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

  const svc = getServices();
  await svc.processInboundEmail.execute(normalized);
  return c.body(null, 204);
});

function mapResendWebhookError(c: Context, error: unknown): Response | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === invalidSignatureMessage) {
    return c.json({ error: 'Invalid webhook signature' }, 401);
  }

  if (error.message === missingEmailIdMessage) {
    return c.json({ error: 'Invalid webhook payload' }, 400);
  }

  if (
    error.message === missingResendApiKeyMessage
    || error.message === missingResendWebhookSecretMessage
    || error.message.startsWith('Resend retrieve received email failed:')
    || error.message.startsWith('Resend retrieve attachment metadata failed:')
  ) {
    return c.json({ error: 'Inbound email service unavailable' }, 503);
  }

  return null;
}

export default resendInboundRoutes;
