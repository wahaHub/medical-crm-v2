import {
  BootstrapNotReadyError,
  type BootstrapResponse,
  type ControlPlaneClient,
} from './control-plane-client.js';
import type { DispatchMetadata } from './runtime-types.js';

export interface BootstrapRetryOptions {
  deadlineMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  jitter?: () => number;
}

/**
 * Retry only the API's authenticated, metadata-matched transient response.
 * A three-second floor keeps the retry rate at or below 20/minute per job.
 */
export async function bootstrapWithBoundedRetry(
  client: Pick<ControlPlaneClient, 'bootstrap'>,
  execution: DispatchMetadata,
  dispatchId: string,
  options: BootstrapRetryOptions = {},
): Promise<BootstrapResponse> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const jitter = options.jitter ?? Math.random;
  const deadlineMs = options.deadlineMs ?? now() + 60_000;
  while (true) {
    const requestBudgetMs = deadlineMs - now();
    if (requestBudgetMs <= 0) throw new Error('hosted_bootstrap_timeout');
    try {
      return await client.bootstrap(execution, dispatchId, requestBudgetMs);
    } catch (error) {
      if (!(error instanceof BootstrapNotReadyError)) throw error;
      const remainingMs = deadlineMs - now();
      if (remainingMs <= 0) throw new Error('hosted_bootstrap_timeout');
      const delayMs = Math.min(3_000 + Math.floor(jitter() * 500), remainingMs);
      await sleep(delayMs);
    }
  }
}
