import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';

const AGENT_NAME = 'medora-interpretation-v1';
/** Pass bound: every dispatch must be list-visible within this window. */
const VISIBILITY_TIMEOUT_MS = 10_000;
/** Hard per-round polling cap; latencies beyond the pass bound are still recorded. */
const HARD_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;

interface ProbeOptions {
  iterations: number;
}

function parseOptions(args: string[]): ProbeOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('usage: probe-dispatch-absence [--iterations 20]');
    values.set(key, value);
  }
  const iterations = Number(values.get('--iterations') ?? '20');
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('usage: probe-dispatch-absence [--iterations 20]');
  }
  return { iterations };
}

function liveKitApiHost(url: string): string {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

function evidence(message: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

function percentile(sorted: number[], ratio: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  const value = sorted[index];
  if (value === undefined) throw new Error('percentile of empty sample');
  return value;
}

export async function runProbe(options: ProbeOptions): Promise<void> {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');

  const host = liveKitApiHost(url);
  // Generous request timeout: this probe runs from networks where a single
  // Twirp RPC can take seconds; the SDK default aborts too early.
  const dispatches = new AgentDispatchClient(host, apiKey, apiSecret, { requestTimeout: 30 });
  const roomService = new RoomServiceClient(host, apiKey, apiSecret, { requestTimeout: 30 });
  const latencies: number[] = [];
  let failures = 0;

  for (let round = 0; round < options.iterations; round += 1) {
    const roomName = `probe-dispatch-${randomUUID()}`;
    try {
      const t0 = performance.now();
      // No agent worker named medora-interpretation-v1 is registered during the
      // probe; the dispatch may stay pending. We only measure list visibility.
      const dispatch = await dispatches.createDispatch(roomName, AGENT_NAME, {
        metadata: JSON.stringify({ probe: true, round }),
      });
      // The probe measures post-create list visibility ("创建后多久可见"), so
      // the clock starts when createDispatch resolves; createMs is logged for
      // context because RPC latency dominates on this network path.
      const tCreated = performance.now();
      const createMs = Math.round(tCreated - t0);
      let visibleAt: number | null = null;
      while (performance.now() - tCreated < HARD_TIMEOUT_MS) {
        const listed = await dispatches.listDispatch(roomName);
        if (listed.some((entry) => entry.id === dispatch.id)) {
          visibleAt = performance.now();
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      if (visibleAt === null) {
        failures += 1;
        evidence(`ROUND ${round}: NOT VISIBLE within ${HARD_TIMEOUT_MS}ms (create took ${createMs}ms) (room=${roomName} dispatch=${dispatch.id})`);
      } else {
        const latency = Math.round(visibleAt - tCreated);
        latencies.push(latency);
        if (latency > VISIBILITY_TIMEOUT_MS) {
          failures += 1;
          evidence(`ROUND ${round}: LATE, visible in ${latency}ms (> ${VISIBILITY_TIMEOUT_MS}ms bound, create took ${createMs}ms) (room=${roomName} dispatch=${dispatch.id})`);
        } else {
          evidence(`ROUND ${round}: visible in ${latency}ms (create took ${createMs}ms) (room=${roomName} dispatch=${dispatch.id})`);
        }
      }
    } catch (error) {
      failures += 1;
      evidence(`ROUND ${round}: ERROR ${error instanceof Error ? error.message : String(error)} (room=${roomName})`);
    } finally {
      await roomService.deleteRoom(roomName).catch(() => {});
    }
  }

  if (latencies.length === 0) {
    process.stdout.write(`DISPATCH ABSENCE PROBE: FAIL no dispatch became visible within ${HARD_TIMEOUT_MS}ms\n`);
    process.exitCode = 1;
    return;
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const median = sorted.length % 2 === 1
    ? (sorted[(sorted.length - 1) / 2] ?? 0)
    : Math.round(((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2);
  const p95 = percentile(sorted, 0.95);
  const settleWindow = max + 3 * p95;
  evidence(`SUMMARY: n=${latencies.length}/${options.iterations} min=${min}ms median=${median}ms p95=${p95}ms max=${max}ms`);
  evidence(`SUMMARY: suggested settle window = max + 3*p95 = ${settleWindow}ms`);
  if (failures > 0) {
    process.stdout.write(`DISPATCH ABSENCE PROBE: FAIL ${failures} round(s) exceeded the ${VISIBILITY_TIMEOUT_MS}ms visibility bound\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('DISPATCH ABSENCE PROBE: PASS\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runProbe(parseOptions(process.argv.slice(2)));
  // One-shot probe: exit explicitly so lingering HTTP keep-alive sockets do
  // not hold the process open after the verdict is printed.
  process.exit(process.exitCode ?? 0);
}
