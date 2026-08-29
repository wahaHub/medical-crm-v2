import { fileURLToPath } from 'node:url';
import {
  AutoSubscribe,
  cli,
  defineAgent,
  ServerOptions,
  type JobContext,
  type JobProcess,
  type JobRequest,
  type VAD,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import { AuthorizationWatchdog } from './authorization-watchdog.js';
import { ControlPlaneClient } from './control-plane-client.js';
import { LiveKitMediaAdapter } from './livekit-media-adapter.js';
import type { DispatchMetadata } from './runtime-types.js';

interface ProcessData {
  vad?: VAD;
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
  },
  entry: async (ctx: JobContext<ProcessData>) => {
    const execution = parseDispatchMetadata(ctx.job.metadata);
    if (ctx.job.dispatchId.length === 0) throw new Error('explicit dispatch id is required');
    const client = new ControlPlaneClient();
    const bootstrap = await client.bootstrap(execution, ctx.job.dispatchId);
    if (bootstrap.job.providerProfile !== 'INTEGRATED_REALTIME') {
      throw new Error('approved integrated provider profile is required');
    }
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
    if (!ctx.proc.userData.vad) throw new Error('Silero VAD was not prewarmed');
    const watchdog = new AuthorizationWatchdog(
      execution,
      bootstrap.watchdog.maxRttMs,
      bootstrap.watchdog.authorizationTtlMs,
    );

    // Never subscribe broadly. Track subscriptions are added only after a fresh,
    // exact watchdog snapshot; the provider adapter remains separately gated.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_NONE);
    const media = new LiveKitMediaAdapter({
      room: ctx.room,
      execution,
      vad: ctx.proc.userData.vad,
      watchdog,
      client,
      applicationDeadlineAt: bootstrap.job.applicationDeadlineAt,
      providerModel: bootstrap.job.providerModel,
      providerEndpoint: bootstrap.job.providerEndpoint,
    });

    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let inFlightRefresh: Promise<void> | null = null;
    ctx.addShutdownCallback(async () => {
      stopped = true;
      if (interval) clearInterval(interval);
      watchdog.expire();
      media.reconcile([]);
      await inFlightRefresh?.catch(() => undefined);
      await media.close();
    });
    const refreshAuthorization = async () => {
      if (stopped) return;
      const request = watchdog.begin(performance.now());
      if (!request) return;
      try {
        const response = await client.authorization(
          execution.jobId,
          request,
          bootstrap.watchdog.maxRttMs,
        );
        if (stopped) {
          watchdog.reject(request);
          return;
        }
        if (watchdog.accept(request, response, performance.now())) {
          media.reconcile(watchdog.authorizedTracks);
        }
      } catch {
        watchdog.reject(request);
      }
      if (performance.now() > watchdog.authorizationDeadlineMonotonicMs) {
        watchdog.expire();
        media.reconcile([]);
        ctx.shutdown('interpretation authorization expired');
      }
    };
    const scheduleRefresh = (): Promise<void> => {
      if (inFlightRefresh) return inFlightRefresh;
      const refresh = refreshAuthorization().finally(() => {
        if (inFlightRefresh === refresh) inFlightRefresh = null;
      });
      inFlightRefresh = refresh;
      return refresh;
    };
    interval = setInterval(() => { void scheduleRefresh(); }, bootstrap.watchdog.intervalMs);
    await scheduleRefresh();
    // The SDK runner owns the job lifetime after entry returns. It waits for
    // room/job closure and only then invokes the registered shutdown callback.
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
