import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const { mockGetCrmDb, mockSql } = vi.hoisted(() => ({
  mockGetCrmDb: vi.fn(),
  mockSql: vi.fn(),
}));

vi.mock('@medical-crm/infrastructure/database', () => ({
  getCrmDb: mockGetCrmDb,
}));

import { reconcileStripeCheckoutOrder } from '../routes/patient-payments.routes.js';

function paidSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_paid',
    object: 'checkout.session',
    amount_total: 9900,
    currency: 'usd',
    payment_status: 'paid',
    metadata: {
      orderId: '22222222-2222-4222-8222-222222222222',
      caseId: '11111111-1111-4111-8111-111111111111',
      patientId: 'patient-1',
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe('reconcileStripeCheckoutOrder', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockGetCrmDb.mockReturnValue({ $client: mockSql });
  });

  it('marks the matching pending order paid and records the case payment', async () => {
    mockSql
      .mockResolvedValueOnce([{
        id: '22222222-2222-4222-8222-222222222222',
        status: 'PENDING_PAYMENT',
        amount: '99.00',
        currency: 'USD',
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await reconcileStripeCheckoutOrder(paidSession());

    expect(result).toBe('22222222-2222-4222-8222-222222222222');
    expect(mockSql).toHaveBeenCalledTimes(4);
    const updateSql = (mockSql.mock.calls[1]?.[0] as TemplateStringsArray).join(' ');
    expect(updateSql).toContain("UPDATE public.orders");
    expect(updateSql).toContain("status = 'PAID'");
    const insertSql = (mockSql.mock.calls[3]?.[0] as TemplateStringsArray).join(' ');
    expect(insertSql).toContain('INSERT INTO public.case_payments');
  });

  it('rejects a paid Stripe session whose amount does not match the order', async () => {
    mockSql.mockResolvedValueOnce([{
      id: '22222222-2222-4222-8222-222222222222',
      status: 'PENDING_PAYMENT',
      amount: '99.00',
      currency: 'USD',
    }]);

    await expect(reconcileStripeCheckoutOrder(paidSession({ amount_total: 9800 })))
      .rejects.toThrow('Stripe checkout amount does not match the order');
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('ignores incomplete checkout sessions', async () => {
    await expect(reconcileStripeCheckoutOrder(paidSession({ payment_status: 'unpaid' })))
      .resolves.toBeNull();
    expect(mockSql).not.toHaveBeenCalled();
  });
});
