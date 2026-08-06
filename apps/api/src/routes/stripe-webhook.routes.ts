import { Hono } from 'hono';
import Stripe from 'stripe';
import { getStripe, reconcileStripeCheckoutOrder } from './patient-payments.routes.js';

const app = new Hono();

function getWebhookSecret(): string {
  const secret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

// POST /
// Stripe Checkout webhook endpoint. Receives raw body (not JSON-parsed)
// so signature verification works.
app.post('/', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing stripe-signature' }, 400);
  }

  const rawBody = await c.req.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, getWebhookSecret());
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return c.json({ error: message }, 400);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await reconcileStripeCheckoutOrder(session);
    } catch (error) {
      console.error('Stripe webhook order reconciliation failed:', error);
      return c.json({ error: 'Failed to record payment' }, 500);
    }
  }

  return c.json({ received: true });
});

export default app;
