export type Transaction = unknown; // Opaque type — concrete implementation defines shape

export interface TransactionRunner {
  run<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}
