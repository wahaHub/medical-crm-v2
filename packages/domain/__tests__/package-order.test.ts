import { describe, it, expect } from 'vitest';
import { Package } from '../src/entities/package.entity.js';
import { Order } from '../src/entities/order.entity.js';
import { OrderNumber } from '../src/value-objects/order-number.js';
import type { PackageStatus } from '../src/enums/index.js';
import type { OrderStatus } from '../src/enums/index.js';

// ============================================================================
// OrderNumber Value Object
// ============================================================================
describe('OrderNumber', () => {
  it('accepts a valid order number', () => {
    const on = new OrderNumber('ORD-20260316-0001');
    expect(on.value).toBe('ORD-20260316-0001');
  });

  it('throws on invalid format (wrong prefix)', () => {
    expect(() => new OrderNumber('QT-20260316-0001')).toThrow('Invalid order number format');
  });

  it('throws on invalid format (wrong date length)', () => {
    expect(() => new OrderNumber('ORD-2026031-0001')).toThrow('Invalid order number format');
  });

  it('throws on invalid format (wrong seq length)', () => {
    expect(() => new OrderNumber('ORD-20260316-01')).toThrow('Invalid order number format');
  });

  it('throws on empty string', () => {
    expect(() => new OrderNumber('')).toThrow('Invalid order number format');
  });

  it('generates a valid order number from sequence', () => {
    const on = OrderNumber.generate(42);
    expect(on.value).toMatch(/^ORD-\d{8}-0042$/);
  });

  it('generates with zero-padded sequence', () => {
    const on = OrderNumber.generate(1);
    expect(on.value).toMatch(/^ORD-\d{8}-0001$/);
  });
});

// ============================================================================
// Package Entity
// ============================================================================
describe('Package entity', () => {
  function createTestPackage(overrides: Partial<ConstructorParameters<typeof Package>[0]> = {}) {
    return new Package({
      id: 'pkg-1',
      nameEn: 'Test Package',
      nameZh: null,
      type: 'HEALTH_CHECKUP',
      price: '1000.00',
      currency: 'USD',
      descriptionEn: 'Test description',
      descriptionZh: null,
      inclusions: null,
      coverImageUrl: null,
      sortWeight: 0,
      status: 'DRAFT',
      publishAt: null,
      takedownAt: null,
      config: null,
      createdBy: 'admin-1',
      createdAt: new Date('2026-03-16'),
      updatedAt: new Date('2026-03-16'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a package with all fields', () => {
      const p = createTestPackage();
      expect(p.id).toBe('pkg-1');
      expect(p.nameEn).toBe('Test Package');
      expect(p.type).toBe('HEALTH_CHECKUP');
      expect(p.price).toBe('1000.00');
      expect(p.status).toBe('DRAFT');
      expect(p.createdBy).toBe('admin-1');
    });
  });

  describe('transitionStatus', () => {
    it('allows DRAFT -> PUBLISHED', () => {
      const p = createTestPackage({ status: 'DRAFT' });
      p.transitionStatus('PUBLISHED');
      expect(p.status).toBe('PUBLISHED');
    });

    it('allows PUBLISHED -> DRAFT (unpublish)', () => {
      const p = createTestPackage({ status: 'PUBLISHED' });
      p.transitionStatus('DRAFT');
      expect(p.status).toBe('DRAFT');
    });

    it('throws on DRAFT -> DRAFT', () => {
      const p = createTestPackage({ status: 'DRAFT' });
      expect(() => p.transitionStatus('DRAFT')).toThrow(
        'Cannot transition package status from DRAFT to DRAFT',
      );
    });

    it('throws on PUBLISHED -> PUBLISHED', () => {
      const p = createTestPackage({ status: 'PUBLISHED' });
      expect(() => p.transitionStatus('PUBLISHED')).toThrow(
        'Cannot transition package status from PUBLISHED to PUBLISHED',
      );
    });

    it('updates updatedAt on transition', () => {
      const p = createTestPackage({ status: 'DRAFT' });
      const before = p.updatedAt;
      p.transitionStatus('PUBLISHED');
      expect(p.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('publish', () => {
    it('transitions DRAFT -> PUBLISHED', () => {
      const p = createTestPackage({ status: 'DRAFT' });
      p.publish();
      expect(p.status).toBe('PUBLISHED');
    });

    it('throws when already PUBLISHED', () => {
      const p = createTestPackage({ status: 'PUBLISHED' });
      expect(() => p.publish()).toThrow();
    });
  });

  describe('unpublish', () => {
    it('transitions PUBLISHED -> DRAFT', () => {
      const p = createTestPackage({ status: 'PUBLISHED' });
      p.unpublish();
      expect(p.status).toBe('DRAFT');
    });

    it('throws when already DRAFT', () => {
      const p = createTestPackage({ status: 'DRAFT' });
      expect(() => p.unpublish()).toThrow();
    });
  });
});

// ============================================================================
// Order Entity
// ============================================================================
describe('Order entity', () => {
  function createTestOrder(overrides: Partial<ConstructorParameters<typeof Order>[0]> = {}) {
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

  describe('constructor', () => {
    it('creates an order with all fields', () => {
      const o = createTestOrder();
      expect(o.id).toBe('order-1');
      expect(o.orderNumber.value).toBe('ORD-20260316-0001');
      expect(o.patientId).toBe('patient-1');
      expect(o.type).toBe('CONSULTATION');
      expect(o.amount).toBe('1000.00');
      expect(o.status).toBe('PENDING_PAYMENT');
      expect(o.version).toBe(1);
    });
  });

  describe('transitionStatus', () => {
    it('allows PENDING_PAYMENT -> PAID', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      o.transitionStatus('PAID');
      expect(o.status).toBe('PAID');
    });

    it('allows PENDING_PAYMENT -> CANCELLED', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      o.transitionStatus('CANCELLED');
      expect(o.status).toBe('CANCELLED');
    });

    it('allows PAID -> IN_PROGRESS', () => {
      const o = createTestOrder({ status: 'PAID' });
      o.transitionStatus('IN_PROGRESS');
      expect(o.status).toBe('IN_PROGRESS');
    });

    it('allows PAID -> REFUNDED', () => {
      const o = createTestOrder({ status: 'PAID' });
      o.transitionStatus('REFUNDED');
      expect(o.status).toBe('REFUNDED');
    });

    it('allows IN_PROGRESS -> COMPLETED', () => {
      const o = createTestOrder({ status: 'IN_PROGRESS' });
      o.transitionStatus('COMPLETED');
      expect(o.status).toBe('COMPLETED');
    });

    it('allows IN_PROGRESS -> REFUNDED', () => {
      const o = createTestOrder({ status: 'IN_PROGRESS' });
      o.transitionStatus('REFUNDED');
      expect(o.status).toBe('REFUNDED');
    });

    it('allows COMPLETED -> REFUNDED', () => {
      const o = createTestOrder({ status: 'COMPLETED' });
      o.transitionStatus('REFUNDED');
      expect(o.status).toBe('REFUNDED');
    });

    it('throws on CANCELLED -> any (terminal state)', () => {
      const o = createTestOrder({ status: 'CANCELLED' });
      const allStatuses: OrderStatus[] = ['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'];
      for (const status of allStatuses) {
        expect(() => o.transitionStatus(status)).toThrow(
          `Cannot transition order status from CANCELLED to ${status}`,
        );
      }
    });

    it('throws on REFUNDED -> any (terminal state)', () => {
      const o = createTestOrder({ status: 'REFUNDED' });
      const allStatuses: OrderStatus[] = ['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'];
      for (const status of allStatuses) {
        expect(() => o.transitionStatus(status)).toThrow(
          `Cannot transition order status from REFUNDED to ${status}`,
        );
      }
    });

    it('throws on PENDING_PAYMENT -> COMPLETED (skip states)', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      expect(() => o.transitionStatus('COMPLETED')).toThrow(
        'Cannot transition order status from PENDING_PAYMENT to COMPLETED',
      );
    });

    it('throws on PENDING_PAYMENT -> IN_PROGRESS (skip states)', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      expect(() => o.transitionStatus('IN_PROGRESS')).toThrow(
        'Cannot transition order status from PENDING_PAYMENT to IN_PROGRESS',
      );
    });

    it('updates updatedAt on transition', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      const before = o.updatedAt;
      o.transitionStatus('PAID');
      expect(o.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('markPaid', () => {
    it('transitions to PAID and sets paymentMethod and paidAt', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      o.markPaid('stripe');
      expect(o.status).toBe('PAID');
      expect(o.paymentMethod).toBe('stripe');
      expect(o.paidAt).toBeInstanceOf(Date);
    });

    it('throws when not PENDING_PAYMENT', () => {
      const o = createTestOrder({ status: 'PAID' });
      expect(() => o.markPaid('stripe')).toThrow();
    });
  });

  describe('startProgress', () => {
    it('transitions PAID -> IN_PROGRESS', () => {
      const o = createTestOrder({ status: 'PAID' });
      o.startProgress();
      expect(o.status).toBe('IN_PROGRESS');
    });

    it('throws when not PAID', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      expect(() => o.startProgress()).toThrow();
    });
  });

  describe('complete', () => {
    it('transitions IN_PROGRESS -> COMPLETED and sets completedAt', () => {
      const o = createTestOrder({ status: 'IN_PROGRESS' });
      o.complete();
      expect(o.status).toBe('COMPLETED');
      expect(o.completedAt).toBeInstanceOf(Date);
    });

    it('throws when not IN_PROGRESS', () => {
      const o = createTestOrder({ status: 'PAID' });
      expect(() => o.complete()).toThrow();
    });
  });

  describe('cancel', () => {
    it('transitions PENDING_PAYMENT -> CANCELLED', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      o.cancel();
      expect(o.status).toBe('CANCELLED');
    });

    it('throws when PAID', () => {
      const o = createTestOrder({ status: 'PAID' });
      expect(() => o.cancel()).toThrow();
    });
  });

  describe('refund', () => {
    it('transitions PAID -> REFUNDED and sets refund details', () => {
      const o = createTestOrder({ status: 'PAID' });
      o.refund('500.00', 'Customer request');
      expect(o.status).toBe('REFUNDED');
      expect(o.refundedAmount).toBe('500.00');
      expect(o.refundReason).toBe('Customer request');
    });

    it('transitions IN_PROGRESS -> REFUNDED', () => {
      const o = createTestOrder({ status: 'IN_PROGRESS' });
      o.refund('1000.00', 'Service issue');
      expect(o.status).toBe('REFUNDED');
      expect(o.refundedAmount).toBe('1000.00');
    });

    it('transitions COMPLETED -> REFUNDED', () => {
      const o = createTestOrder({ status: 'COMPLETED' });
      o.refund('800.00', 'Quality issue');
      expect(o.status).toBe('REFUNDED');
    });

    it('throws when PENDING_PAYMENT', () => {
      const o = createTestOrder({ status: 'PENDING_PAYMENT' });
      expect(() => o.refund('100.00', 'reason')).toThrow();
    });

    it('throws when CANCELLED', () => {
      const o = createTestOrder({ status: 'CANCELLED' });
      expect(() => o.refund('100.00', 'reason')).toThrow();
    });
  });
});
