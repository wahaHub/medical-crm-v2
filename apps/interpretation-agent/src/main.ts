import { fileURLToPath } from 'node:url';
import {
  AutoSubscribe,
  cli,
  defineAgent,
  inference,
  ServerOptions,
  type JobContext,
  type JobProcess,
  type JobRequest,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import { AuthorizationWatchdog } from './authorization-watchdog.js';
import { ControlPlaneClient } from './control-plane-client.js';
import type { DispatchMetadata } from './runtime-types.js';

interface ProcessData {
  vad?: unknown;
  turnDetector?: inference.TurnDetector;
}

function parseDispatchMetadata(raw: string): DispatchMetadata {
  const value = JSON.parse(raw) as Partial<DispatchMetadata>;
  if (value.schema !== 'medora.interpretation.dispatch.v1'
    || typeof value.jobId !== 'string'
    || typeof value.roomName !== 'string'
    || !Number.isInteger(value.roomGeneration)
    || !Number.isInteger(value.interpretationGeneration)
    || !Number.isInteger(value.executionVersion)
    || typeof value.agentIdentity !== 'string') {
    throw new Error('invalid interpretation dispatch metadata');
  }
  return value as DispatchMetadata;
}

const agent = defineAgent<ProcessData>({
  prewarm: async (proc: JobProcess<ProcessData>) => {
    proc.userData.vad = await silero.VAD.load({
      minSilenceDuration: 550,
      maxBufferedSpeech: 30_000,
    });
    proc.userData.turnDetector = new inference.TurnDetector({
      unlikelyThreshold: { zh: 0.5, en: 0.5 },
    });
  },
  entry: async (ctx: JobContext<ProcessData>) => {
    const execution = parseDispatchMetadata(ctx.job.metadata);
    if (ctx.job.dispatchId.length === 0) throw new Error('explicit dispatch id is required');
    const client = new ControlPlaneClient();
    const bootstrap = await client.bootstrap(execution, ctx.job.dispatchId);
    const watchdog = new AuthorizationWatchdog(
      execution,
      bootstrap.watchdog.maxRttMs,
      bootstrap.watchdog.authorizationTtlMs,
    );

    // Never subscribe broadly. Track subscriptions are added only after a fresh,
    // exact watchdog snapshot; the provider adapter remains separately gated.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_NONE);

    let stopped = false;
    let resolveStopped: (() => void) | null = null;
    const stoppedPromise = new Promise<void>((resolve) => { resolveStopped = resolve; });
    const interval = setInterval(async () => {
      if (stopped) return;
      const request = watchdog.begin(performance.now());
      if (!request) return;
      try {
        const response = await client.authorization(
          execution.jobId,
          request,
          bootstrap.watchdog.maxRttMs,
        );
        watchdog.accept(request, response, performance.now());
      } catch {
        watchdog.reject(request);
      }
      if (performance.now() > watchdog.authorizationDeadlineMonotonicMs) {
        watchdog.expire();
        ctx.shutdown('interpretation authorization expired');
      }
    }, bootstrap.watchdog.intervalMs);

    ctx.addShutdownCallback(async () => {
      stopped = true;
      clearInterval(interval);
      watchdog.expire();
      resolveStopped?.();
    });
    await stoppedPromise;
  },
});

export default agent;

async function acceptExplicitInterpretationJob(job: JobRequest): Promise<void> {
  try {
    const metadata = parseDispatchMetadata(job.job.metadata);
    if (!job.job.dispatchId || metadata.roomName !== job.room?.name) {
      await job.reject();
      return;
    }
    await job.accept('Medora interpretation', metadata.agentIdentity, '', {
      'medora.service': 'interpretation',
      'medora.execution': String(metadata.executionVersion),
    });
  } catch {
    await job.reject();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_INTERPRETATION_AGENT_NAME ?? 'medora-interpretation-v1',
    requestFunc: acceptExplicitInterpretationJob,
  }));
}
