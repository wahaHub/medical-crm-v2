import { Hono } from 'hono';
import Stripe from 'stripe';
import { getCrmDb } from '@medical-crm/infrastructure/database';

const app = new Hono();

function getStripe(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

function getDbSql() {
  return getCrmDb().$client;
}

interface UpsertPaymentInput {
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  stripeSessionId?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
}

export async function upsertCasePayment(caseId: string, input: UpsertPaymentInput) {
  const sql = getDbSql();

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM public.case_payments
    WHERE case_id = ${caseId} AND status = 'paid'
    LIMIT 1
  `;

  if (existing.length > 0) {
    return;
  }

  await sql`
    INSERT INTO public.case_payments (
      case_id,
      stripe_session_id,
      status,
      amount,
      currency,
      metadata,
      paid_at
    ) VALUES (
      ${caseId},
      ${input.stripeSessionId ?? null},
      ${input.status},
      ${input.amount ?? null},
      ${input.currency ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      ${input.status === 'paid' ? new Date().toISOString() : null}
    )
  `;
}

export { getStripe };

function isValidChannel(value: unknown): value is 'free' | 'doctor-li' | 'custom-doctor' {
  return typeof value === 'string' && ['free', 'doctor-li', 'custom-doctor'].includes(value);
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// POST /api/patient/payments/checkout-session
app.post('/payments/checkout-session', async (c) => {
  try {
    const raw = await c.req.json();
    const caseId = typeof raw.caseId === 'string' ? raw.caseId.trim() : '';
    const channel = isValidChannel(raw.channel) ? raw.channel : null;
    const amount = typeof raw.amount === 'number' ? Math.round(raw.amount) : NaN;
    const currency = typeof raw.currency === 'string' ? raw.currency.toLowerCase() : 'usd';
    const successUrl = isValidUrl(raw.successUrl) ? raw.successUrl : '';
    const cancelUrl = isValidUrl(raw.cancelUrl) ? raw.cancelUrl : '';

    if (!caseId || !channel || !Number.isFinite(amount) || amount < 0 || !successUrl || !cancelUrl) {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    if (channel === 'free' || amount === 0) {
      await upsertCasePayment(caseId, {
        status: 'paid',
        amount: 0,
        currency,
        metadata: { channel, source: 'free_checkout' },
      });

      return c.json({
        sessionId: null,
        url: null,
        free: true,
      });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: channel === 'doctor-li'
                ? 'Doctor Li Online Consultation'
                : 'Custom Doctor Consultation',
              description: `Consultation case ${caseId}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        caseId,
        channel,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return c.json({
      sessionId: session.id,
      url: session.url,
      free: false,
    });
  } catch (error) {
    console.error('Create checkout session failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    return c.json({ error: message }, 500);
  }
});

// GET /api/patient/payments/checkout-session/:id
app.get('/payments/checkout-session/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(id);

    const caseId = session.metadata?.caseId;
    if (caseId && session.payment_status === 'paid') {
      await upsertCasePayment(caseId, {
        status: 'paid',
        stripeSessionId: session.id,
        amount: session.amount_total,
        currency: session.currency,
        metadata: { ...session.metadata, checkout_session_id: session.id },
      });
    }

    return c.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
    });
  } catch (error) {
    console.error('Retrieve checkout session failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to retrieve checkout session';
    return c.json({ error: message }, 500);
  }
});

// GET /api/patient/payments/status?caseId=...
app.get('/payments/status', async (c) => {
  try {
    const caseId = c.req.query('caseId')?.trim() ?? '';
    if (!caseId) {
      return c.json({ error: 'caseId is required' }, 400);
    }

    const sql = getDbSql();
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM public.case_payments
      WHERE case_id = ${caseId} AND status = 'paid'
      LIMIT 1
    `;

    const record = rows[0];

    return c.json({
      caseId,
      paid: Boolean(record),
      status: record?.status ?? 'pending',
    });
  } catch (error) {
    console.error('Payment status check failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to check payment status';
    return c.json({ error: message }, 500);
  }
});

export default app;
