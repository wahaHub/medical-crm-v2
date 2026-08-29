import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RECONCILE_HTTP_TIMEOUT_MS,
  type ReconcileProfile,
} from './reconcile-run-lease.js';

export const LIFECYCLE_RECONCILE_INTERVAL_MS = 2_000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function internalSecret(): string {
  const direct = process.env.INTERNAL_API_SECRET?.trim();
  if (direct) return direct;
  const path = process.env.INTERNAL_API_SECRET_FILE;
  if (!path) throw new Error('INTERNAL_API_SECRET or INTERNAL_API_SECRET_FILE is required');
  const value = readFileSync(path, 'utf8').trim();
  if (!value) throw new Error('INTERNAL_API_SECRET_FILE is empty');
  return value;
}

async function reconcileOnce(
  apiUrl: string,
  secret: string,
  profile: ReconcileProfile,
): Promise<void> {
  const response = await fetch(
    `${apiUrl}/api/v2/internal/video-interpretation/reconcile-lifecycle?profile=${profile}`,
    {
      method: 'POST',
      headers: { 'X-Internal-Secret': secret },
      signal: AbortSignal.timeout(RECONCILE_HTTP_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`video_interpretation_reconcile_failed:${response.status}`);
}

async function waitForNextPass(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, LIFECYCLE_RECONCILE_INTERVAL_MS);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function runProfileLoop(
  signal: AbortSignal,
  apiUrl: string,
  secret: string,
  profile: ReconcileProfile,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await reconcileOnce(apiUrl, secret, profile);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':', 1)[0] : 'unknown_error';
      console.error(`video interpretation ${profile.toLowerCase()} reconciliation failed: ${code}`);
    }
    await waitForNextPass(signal);
  }
}

export async function runLifecycleReconcileWorker(signal: AbortSignal): Promise<void> {
  const apiUrl = required('CRM_API_URL').replace(/\/$/, '');
  const secret = internalSecret();
  // Hosted dispatch recovery must never delay the two-second self-host lease
  // fence, and remote self-host cleanup cannot delay that database-only loop.
  // The lease behind each endpoint prevents overlap across workers and API
  // replicas even when an HTTP result is lost.
  await Promise.all([
    runProfileLoop(signal, apiUrl, secret, 'SELF_HOSTED_FENCE'),
    runProfileLoop(signal, apiUrl, secret, 'SELF_HOSTED_CLEANUP'),
    runProfileLoop(signal, apiUrl, secret, 'HOSTED'),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  await runLifecycleReconcileWorker(abort.signal);
}
