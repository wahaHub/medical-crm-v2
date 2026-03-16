import type { TransactionRunner, Transaction } from '@medical-crm/domain';
import type { CrmDb } from './crm-client.js';

export class DrizzleTransactionRunner implements TransactionRunner {
  constructor(private readonly db: CrmDb) {}

  async run<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(tx as Transaction));
  }
}
