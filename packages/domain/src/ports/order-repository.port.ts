import type { Order } from '../entities/order.entity.js';

export interface OrderListQuery {
  patientId?: string;
  caseId?: string;
  status?: string;
  type?: string;
  page: number;
  limit: number;
}

export interface IOrderRepository {
  findById(id: string, tx?: unknown): Promise<Order | null>;
  findAll(query: OrderListQuery): Promise<{ data: Order[]; total: number }>;
  save(entity: Order, tx?: unknown): Promise<Order>;
  nextOrderNumber(): Promise<string>;
}
