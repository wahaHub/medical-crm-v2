import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateOrderUseCase } from '../src/use-cases/orders/create-order.use-case.js';
import { ListOrdersUseCase } from '../src/use-cases/orders/list-orders.use-case.js';
import { GetOrderUseCase } from '../src/use-cases/orders/get-order.use-case.js';
import { UpdateOrderStatusUseCase } from '../src/use-cases/orders/update-order-status.use-case.js';
import { CreatePaymentIntentUseCase } from '../src/use-cases/orders/create-payment-intent.use-case.js';
import { RequestRefundUseCase } from '../src/use-cases/orders/request-refund.use-case.js';
import type { IOrderRepository } from '@medical-crm/domain';
import { Order, OrderNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ——— Actors ———
const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const beautyAdminActor: Actor = {
  userId: 'beauty-admin-1',
  email: 'contact@medorabeauty.com',
  role: 'ADMIN',
  hospitalId: null,
};

const patientActor: Actor = {
  userId: 'patient-1',
  email: 'patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

const otherPatientActor: Actor = {
  userId: 'patient-2',
  email: 'other@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

// ——— Factories ———
function makeMockOrder(overrides: Partial<ConstructorParameters<typeof Order>[0]> = {}): Order {
  return new Order({
    id: 'order-1',
    orderNumber: new OrderNumber('ORD-20260316-0001'),
    patientId: 'patient-1',
    caseId: null,
    packageId: 'pkg-1',
    type: 'CONSULTATION',
    amount: '1000.00',
    currency: 'USD',
    status: 'PENDING_PAYMENT',
    paymentMethod: null,
    paidAt: null,
    completedAt: null,
    refundedAmount: null,
    refundReason: null,
    metadata: null,
    version: 1,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function createMockOrderRepo(): IOrderRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    nextOrderNumber: vi.fn().mockResolvedValue('ORD-20260316-0001'),
  };
}

// ============================================================================
// CreateOrderUseCase
// ============================================================================
describe('CreateOrderUseCase', () => {
  let repo: IOrderRepository;

  beforeEach(() => {
    repo = createMockOrderRepo();
  });

  it('creates an order successfully', async () => {
    const uc = new CreateOrderUseCase(repo);
    const result = await uc.execute({
      type: 'CONSULTATION',
      amount: '1000.00',
      packageId: 'pkg-1',
    }, patientActor);

    expect(result.orderNumber).toBe('ORD-20260316-0001');
    expect(result.patientId).toBe('patient-1');
    expect(result.status).toBe('PENDING_PAYMENT');
    expect(result.type).toBe('CONSULTATION');
    expect(result.amount).toBe('1000.00');
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('admin can create orders with explicit patientId', async () => {
    const uc = new CreateOrderUseCase(repo);
    const result = await uc.execute({
      type: 'TRANSLATION',
      amount: '500.00',
      patientId: 'patient-1',
    }, adminActor);

    expect(result.patientId).toBe('patient-1');
    expect(result.status).toBe('PENDING_PAYMENT');
  });

  it('throws ValidationError when admin omits patientId', async () => {
    const uc = new CreateOrderUseCase(repo);
    await expect(uc.execute({
      type: 'TRANSLATION',
      amount: '500.00',
    }, adminActor)).rejects.toThrow('Admin must specify patientId');
  });

  it('throws ForbiddenError for hospital role', async () => {
    const uc = new CreateOrderUseCase(repo);
    await expect(uc.execute({
      type: 'CONSULTATION',
      amount: '1000.00',
    }, hospitalActor)).rejects.toThrow('Only patients and admins can create orders');
  });

  it('uses idempotency guard when key provided', async () => {
    const mockGuard = {
      execute: vi.fn().mockImplementation((_key: string, _op: string, fn: () => Promise<unknown>) => fn()),
    };
    const uc = new CreateOrderUseCase(repo, mockGuard);
    await uc.execute({
      type: 'CONSULTATION',
      amount: '1000.00',
      idempotencyKey: 'idem-key-1',
    }, patientActor);

    expect(mockGuard.execute).toHaveBeenCalledWith('idem-key-1', 'CREATE_ORDER', expect.any(Function));
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('skips idempotency guard when no key provided', async () => {
    const mockGuard = {
      execute: vi.fn(),
    };
    const uc = new CreateOrderUseCase(repo, mockGuard);
    await uc.execute({
      type: 'CONSULTATION',
      amount: '1000.00',
    }, patientActor);

    expect(mockGuard.execute).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// ListOrdersUseCase
// ============================================================================
describe('ListOrdersUseCase', () => {
  let repo: IOrderRepository;

  beforeEach(() => {
    repo = createMockOrderRepo();
  });

  it('admin scopes out beauty orders', async () => {
    const orders = [makeMockOrder()];
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: orders, total: 1 });

    const uc = new ListOrdersUseCase(repo);
    const result = await uc.execute({ page: 1, limit: 20 }, adminActor);

    expect(repo.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      patientSiteScope: { mode: 'EXCLUDE', site: 'beauty' },
    });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('medora beauty admin sees only beauty orders', async () => {
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });

    const uc = new ListOrdersUseCase(repo);
    await uc.execute({ page: 1, limit: 20 }, beautyAdminActor);

    expect(repo.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      patientSiteScope: { mode: 'ONLY', site: 'beauty' },
    });
  });

  it('patient sees only own orders', async () => {
    const orders = [makeMockOrder()];
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: orders, total: 1 });

    const uc = new ListOrdersUseCase(repo);
    await uc.execute({ page: 1, limit: 20 }, patientActor);

    expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, patientId: 'patient-1' });
  });
});

// ============================================================================
// GetOrderUseCase
// ============================================================================
describe('GetOrderUseCase', () => {
  let repo: IOrderRepository;

  beforeEach(() => {
    repo = createMockOrderRepo();
  });

  it('returns order for owner', async () => {
    const order = makeMockOrder({ patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new GetOrderUseCase(repo);
    const result = await uc.execute('order-1', patientActor);

    expect(result.id).toBe('order-1');
  });

  it('returns order for admin', async () => {
    const order = makeMockOrder({ patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new GetOrderUseCase(repo);
    const result = await uc.execute('order-1', adminActor);

    expect(result.id).toBe('order-1');
  });

  it('throws ForbiddenError for other patient', async () => {
    const order = makeMockOrder({ patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new GetOrderUseCase(repo);
    await expect(uc.execute('order-1', otherPatientActor)).rejects.toThrow('Not authorized');
  });

  it('throws NotFoundError for missing order', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new GetOrderUseCase(repo);
    await expect(uc.execute('nope', adminActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// UpdateOrderStatusUseCase
// ============================================================================
describe('UpdateOrderStatusUseCase', () => {
  let repo: IOrderRepository;

  beforeEach(() => {
    repo = createMockOrderRepo();
  });

  it('admin transitions order status', async () => {
    const order = makeMockOrder({ status: 'PENDING_PAYMENT' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new UpdateOrderStatusUseCase(repo);
    const result = await uc.execute('order-1', 'PAID', adminActor);

    expect(result.status).toBe('PAID');
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for patient', async () => {
    const uc = new UpdateOrderStatusUseCase(repo);
    await expect(uc.execute('order-1', 'PAID', patientActor)).rejects.toThrow('Admin only');
  });

  it('throws on invalid transition', async () => {
    const order = makeMockOrder({ status: 'PENDING_PAYMENT' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new UpdateOrderStatusUseCase(repo);
    await expect(uc.execute('order-1', 'COMPLETED', adminActor)).rejects.toThrow('Cannot transition');
  });

  it('throws NotFoundError for missing order', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new UpdateOrderStatusUseCase(repo);
    await expect(uc.execute('nope', 'PAID', adminActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// CreatePaymentIntentUseCase
// ============================================================================
describe('CreatePaymentIntentUseCase', () => {
  let repo: IOrderRepository;

  beforeEach(() => {
    repo = createMockOrderRepo();
  });

  it('returns mock payment intent for patient', async () => {
    const order = makeMockOrder({ status: 'PENDING_PAYMENT', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new CreatePaymentIntentUseCase(repo);
    const result = await uc.execute('order-1', patientActor);

    expect(result.clientSecret).toBe('pi_mock_order-1');
    expect(result.orderId).toBe('order-1');
  });

  it('throws ForbiddenError for non-patient', async () => {
    const uc = new CreatePaymentIntentUseCase(repo);
    await expect(uc.execute('order-1', adminActor)).rejects.toThrow('Patient only');
  });

  it('throws ForbiddenError for other patient', async () => {
    const order = makeMockOrder({ status: 'PENDING_PAYMENT', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new CreatePaymentIntentUseCase(repo);
    await expect(uc.execute('order-1', otherPatientActor)).rejects.toThrow('Not authorized');
  });

  it('throws when order not PENDING_PAYMENT', async () => {
    const order = makeMockOrder({ status: 'PAID', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new CreatePaymentIntentUseCase(repo);
    await expect(uc.execute('order-1', patientActor)).rejects.toThrow('not awaiting payment');
  });

  it('throws NotFoundError for missing order', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new CreatePaymentIntentUseCase(repo);
    await expect(uc.execute('nope', patientActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// RequestRefundUseCase
// ============================================================================
describe('RequestRefundUseCase', () => {
  let repo: IOrderRepository;

  beforeEach(() => {
    repo = createMockOrderRepo();
  });

  it('refunds a PAID order', async () => {
    const order = makeMockOrder({ status: 'PAID', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new RequestRefundUseCase(repo);
    const result = await uc.execute('order-1', { amount: '500.00', reason: 'Customer request' }, patientActor);

    expect(result.status).toBe('REFUNDED');
    expect(result.refundedAmount).toBe('500.00');
    expect(result.refundReason).toBe('Customer request');
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('refunds an IN_PROGRESS order', async () => {
    const order = makeMockOrder({ status: 'IN_PROGRESS', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new RequestRefundUseCase(repo);
    const result = await uc.execute('order-1', { amount: '1000.00', reason: 'Service issue' }, patientActor);

    expect(result.status).toBe('REFUNDED');
  });

  it('refunds a COMPLETED order', async () => {
    const order = makeMockOrder({ status: 'COMPLETED', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new RequestRefundUseCase(repo);
    const result = await uc.execute('order-1', { amount: '800.00', reason: 'Quality issue' }, patientActor);

    expect(result.status).toBe('REFUNDED');
  });

  it('throws ForbiddenError for non-patient', async () => {
    const uc = new RequestRefundUseCase(repo);
    await expect(uc.execute('order-1', { amount: '100.00', reason: 'test' }, adminActor)).rejects.toThrow('Patient only');
  });

  it('throws ForbiddenError for other patient', async () => {
    const order = makeMockOrder({ status: 'PAID', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new RequestRefundUseCase(repo);
    await expect(uc.execute('order-1', { amount: '100.00', reason: 'test' }, otherPatientActor)).rejects.toThrow('Not authorized');
  });

  it('throws when order is PENDING_PAYMENT', async () => {
    const order = makeMockOrder({ status: 'PENDING_PAYMENT', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new RequestRefundUseCase(repo);
    await expect(uc.execute('order-1', { amount: '100.00', reason: 'test' }, patientActor)).rejects.toThrow(
      'Cannot request refund',
    );
  });

  it('throws when order is CANCELLED', async () => {
    const order = makeMockOrder({ status: 'CANCELLED', patientId: 'patient-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(order);

    const uc = new RequestRefundUseCase(repo);
    await expect(uc.execute('order-1', { amount: '100.00', reason: 'test' }, patientActor)).rejects.toThrow(
      'Cannot request refund',
    );
  });

  it('throws NotFoundError for missing order', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new RequestRefundUseCase(repo);
    await expect(uc.execute('nope', { amount: '100.00', reason: 'test' }, patientActor)).rejects.toThrow('not found');
  });
});
