// De-identified e2e room harness: a synthetic patient publishes a 48kHz PCM
// clip as its microphone, an operator joins through the real token endpoint
// and records the agent's translated audio track. Run on the API host:
//   pnpm --filter @medical-crm/interpretation-agent probe:e2e-room
// Optional env: E2E_API_ENV_FILE / E2E_REPO_ENV_FILE / E2E_FIXTURES_FILE /
// E2E_PASSWORD_FILE / E2E_API_BASE / E2E_OPERATOR_USERNAME / E2E_INPUT /
// E2E_OUTPUT / E2E_DURATION_MS / E2E_SINGLE_PASS=1
import { readFileSync, writeFileSync } from 'node:fs';
import {
  AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind,
  TrackPublishOptions, TrackSource,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
  }
  return env;
}

function need(env: Record<string, string>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const apiEnv = loadEnv(process.env.E2E_API_ENV_FILE ?? '/opt/medora/medora-crm-v2-api/.env');
const repoEnv = loadEnv(process.env.E2E_REPO_ENV_FILE ?? '/opt/medora/medical-crm-v2/.env');
const fixtures = JSON.parse(readFileSync(process.env.E2E_FIXTURES_FILE ?? '/tmp/eval-fixtures.json', 'utf8'));
const evalPassword = readFileSync(process.env.E2E_PASSWORD_FILE ?? '/tmp/eval-operator-password', 'utf8').trim();

const LIVEKIT_URL = need(repoEnv, 'LIVEKIT_URL');
const ROOM: string = fixtures.roomName;
const DURATION_MS = Number(process.env.E2E_DURATION_MS ?? 90_000);
const INPUT_PCM = process.env.E2E_INPUT ?? '/tmp/probe_en_48k.pcm';
const OUTPUT_PCM = process.env.E2E_OUTPUT ?? '/tmp/e2e_translated.pcm';

function log(step: string, extra = '') {
  console.log(`[${new Date().toISOString()}] ${step}${extra ? ' ' + extra : ''}`);
}

async function patientToken(): Promise<string> {
  const t = new AccessToken(need(repoEnv, 'LIVEKIT_API_KEY'), need(repoEnv, 'LIVEKIT_API_SECRET'), {
    identity: fixtures.patientIdentity, ttl: 600,
  });
  t.addGrant({ room: ROOM, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return t.toJwt();
}

async function operatorToken(): Promise<string> {
  const kc = await fetch(`${need(apiEnv, 'KEYCLOAK_ISSUER')}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: need(apiEnv, 'KEYCLOAK_CLIENT_ID'),
      client_secret: need(apiEnv, 'KEYCLOAK_CLIENT_SECRET'),
      username: process.env.E2E_OPERATOR_USERNAME ?? 'eval-operator@medora.local',
      password: evalPassword,
      grant_type: 'password',
      scope: 'openid profile email',
    }),
  });
  if (!kc.ok) throw new Error(`keycloak token ${kc.status}: ${await kc.text()}`);
  const jwt = (await kc.json() as { access_token: string }).access_token;
  const resp = await fetch(`${process.env.E2E_API_BASE ?? 'http://127.0.0.1:3001'}/api/v2/video-consultations/${fixtures.consultationId}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) throw new Error(`operator room token ${resp.status}: ${await resp.text()}`);
  return (await resp.json() as { token: string }).token;
}

async function runPatient(token: string): Promise<void> {
  const room = new Room();
  await room.connect(LIVEKIT_URL, token);
  log('patient connected', room.localParticipant?.identity ?? 'unknown');
  const source = new AudioSource(48000, 1);
  const track = LocalAudioTrack.createAudioTrack('mic', source);
  await room.localParticipant!.publishTrack(
    track,
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
  );
  log('patient mic published');
  const pcm = readFileSync(INPUT_PCM);
  const frameBytes = 1920; // 960 samples * 2 bytes = 20ms at 48kHz mono s16le
  const silence = new Int16Array(960); // zeros
  const deadline = Date.now() + DURATION_MS;
  let offset = 0;
  let silenceFramesLeft = 0;
  while (Date.now() < deadline) {
    // AudioFrame.protoInfo() reads data.buffer directly and ignores the view
    // offset, so hand it a freshly allocated, exactly-sized copy.
    if (silenceFramesLeft > 0) {
      silenceFramesLeft -= 1;
      await source.captureFrame(new AudioFrame(new Int16Array(silence), 48000, 1, 960));
      continue;
    }
    if (offset + frameBytes > pcm.length) {
      offset = 0;
      if (process.env.E2E_SINGLE_PASS === '1') {
        silenceFramesLeft = Number.MAX_SAFE_INTEGER; // play once, then silence only
      } else {
        silenceFramesLeft = 400; // 8s of silence so the provider close drain finishes before the next turn
      }
      continue;
    }
    const chunk = pcm.subarray(offset, offset + frameBytes);
    offset += frameBytes;
    const samples = new Int16Array(960);
    for (let i = 0; i < 960; i += 1) samples[i] = chunk.readInt16LE(i * 2);
    await source.captureFrame(new AudioFrame(samples, 48000, 1, 960));
  }
  log('patient audio loop finished');
  await room.disconnect();
}

async function runOperator(token: string): Promise<void> {
  const room = new Room();
  const chunks: Buffer[] = [];
  const stats = new Map<string, { frames: number; peak: number }>();
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    log('operator subscribed track', `kind=${track.kind} from=${participant.identity} sid=${publication.sid}`);
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    stats.set(participant.identity, { frames: 0, peak: 0 });
    const stream = new AudioStream(track);
    void (async () => {
      for await (const frame of stream) {
        const buf = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
        const st = stats.get(participant.identity)!;
        st.frames += 1;
        for (const s of frame.data) {
          const v = Math.abs(s);
          if (v > st.peak) st.peak = v;
        }
        if (participant.identity.startsWith('translator-')) chunks.push(buf);
      }
    })();
  });
  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    let preview = '';
    if (topic === 'subtitle') {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(payload));
        preview = ` ${JSON.stringify(parsed).slice(0, 220)}`;
      } catch { /* keep byte count only */ }
    }
    log('data received', `from=${participant?.identity} topic=${topic} bytes=${payload.length}${preview}`);
  });
  room.on(RoomEvent.ParticipantConnected, (p) => log('participant connected', p.identity));
  await room.connect(LIVEKIT_URL, token);
  log('operator connected', room.localParticipant?.identity ?? 'unknown');
  await new Promise((resolve) => setTimeout(resolve, DURATION_MS + 5_000));
  writeFileSync(OUTPUT_PCM, Buffer.concat(chunks));
  log('operator recorded bytes', String(chunks.reduce((n, b) => n + b.length, 0)));
  for (const [identity, st] of stats) {
    log('track stats', `${identity}: frames=${st.frames} peak=${st.peak}`);
  }
  await room.disconnect();
}

const [patientJwt, operatorJwt] = await Promise.all([patientToken(), operatorToken()]);
log('tokens ready');
const operator = runOperator(operatorJwt);
await new Promise((resolve) => setTimeout(resolve, 3_000));
const patient = runPatient(patientJwt);
await Promise.all([patient, operator]);

// quick non-silence check on the recording
const out = readFileSync(OUTPUT_PCM);
let sum = 0;
for (let i = 0; i + 1 < out.length; i += 2) sum += Math.abs(out.readInt16LE(i));
const avg = out.length > 1 ? sum / (out.length / 2) : 0;
log('RESULT', `recorded=${out.length} bytes avgAbs=${avg.toFixed(1)} ${out.length > 10000 && avg > 50 ? 'NON_SILENT_AUDIO_RECEIVED' : 'NO/LOW_AUDIO'}`);
process.exit(0);
