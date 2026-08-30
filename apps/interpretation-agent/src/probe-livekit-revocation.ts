import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Room } from '@livekit/rtc-node';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

interface ProbeOptions {
  settleMs: number;
}

function parseOptions(args: string[]): ProbeOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('usage: probe-livekit-revocation [--settle-ms 3000]');
    values.set(key, value);
  }
  const settleMs = Number(values.get('--settle-ms') ?? '3000');
  if (!Number.isFinite(settleMs) || settleMs < 0) {
    throw new Error('usage: probe-livekit-revocation [--settle-ms 3000]');
  }
  return { settleMs };
}

function liveKitApiHost(url: string): string {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

function evidence(message: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

interface JwtClaims {
  nbf?: number;
  iat?: number;
  exp?: number;
}

function decodeClaims(token: string): JwtClaims {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('token is not a JWT');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims;
}

async function mintJoinToken(apiKey: string, apiSecret: string, roomName: string, identity: string): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, { identity, ttl: 600 });
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return await token.toJwt();
}

async function tryJoin(url: string, token: string): Promise<{ ok: true; elapsedMs: number } | { ok: false; elapsedMs: number; error: string }> {
  const room = new Room();
  const startedAt = performance.now();
  try {
    await room.connect(url, token, { autoSubscribe: false, dynacast: true });
    return { ok: true, elapsedMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return { ok: false, elapsedMs: Math.round(performance.now() - startedAt), error: error instanceof Error ? error.message : String(error) };
  } finally {
    await room.disconnect().catch(() => {});
  }
}

function fail(reason: string): void {
  process.stdout.write(`REVOCATION PROBE: FAIL ${reason}\n`);
  process.exitCode = 1;
}

export async function runProbe(options: ProbeOptions): Promise<void> {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');

  const roomName = `probe-revoke-${randomUUID()}`;
  const identity = `probe-offline-${randomUUID()}`;
  const roomService = new RoomServiceClient(liveKitApiHost(url), apiKey, apiSecret, { requestTimeout: 30 });
  evidence(`STEP setup: room=${roomName} identity=${identity}`);

  try {
    const tokenA = await mintJoinToken(apiKey, apiSecret, roomName, identity);
    const claimsA = decodeClaims(tokenA);
    evidence(`STEP token_A_issued: nbf=${claimsA.nbf ?? 'unset'} iat=${claimsA.iat ?? 'unset'} exp=${claimsA.exp ?? 'unset'} (livekit-server-sdk always sets nbf=signing time; no API to override)`);

    const baseline = await tryJoin(url, tokenA);
    if (!baseline.ok) {
      fail(`baseline join_with_token_A failed: ${baseline.error}`);
      return;
    }
    evidence(`STEP join_with_token_A: OK (${baseline.elapsedMs}ms)`);

    const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000) + 2);
    const revokeStartedAt = performance.now();
    try {
      await roomService.removeParticipant(roomName, identity, { revokeTokenTs });
      evidence(`STEP remove_participant_revoke: OK (${Math.round(performance.now() - revokeStartedAt)}ms) revokeTokenTs=${revokeTokenTs}, participant was offline and API accepted the cutoff`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('not found') && !message.includes('NotFound') && !message.includes('404')) {
        fail(`removeParticipant failed: ${message}`);
        return;
      }
      evidence(`STEP remove_participant_revoke: participant-absent call rejected (${message}); rejoining to revoke while connected`);
      const rejoin = await tryJoin(url, tokenA);
      if (!rejoin.ok) {
        fail(`rejoin before revoke failed: ${rejoin.error}`);
        return;
      }
      const retryStartedAt = performance.now();
      await roomService.removeParticipant(roomName, identity, { revokeTokenTs });
      evidence(`STEP remove_participant_revoke: OK while connected (${Math.round(performance.now() - retryStartedAt)}ms) revokeTokenTs=${revokeTokenTs}`);
    }

    await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    evidence(`STEP settle: waited ${options.settleMs}ms`);

    const revoked = await tryJoin(url, tokenA);
    if (revoked.ok) {
      fail(`rejoin_with_revoked_token_A unexpectedly succeeded (${revoked.elapsedMs}ms) — revokeTokenTs did not invalidate the cached token`);
      return;
    }
    evidence(`STEP rejoin_with_revoked_token_A: REJECTED as required (${revoked.elapsedMs}ms) error=${revoked.error}`);

    const tokenB = await mintJoinToken(apiKey, apiSecret, roomName, identity);
    const claimsB = decodeClaims(tokenB);
    const reissued = await tryJoin(url, tokenB);
    if (!reissued.ok) {
      fail(`join_with_token_B failed: ${reissued.error} — identity appears permanently banned instead of timestamp-scoped`);
      return;
    }
    evidence(`STEP join_with_token_B: OK (${reissued.elapsedMs}ms) nbf=${claimsB.nbf ?? 'unset'} > revokeTokenTs=${revokeTokenTs}`);
    evidence(`STEP nbf_conclusion: revokeTokenTs invalidates tokens with nbf before the cutoff; tokens signed after it (new nbf) for the same identity still join`);
    process.stdout.write('REVOCATION PROBE: PASS\n');
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    await roomService.deleteRoom(roomName).catch(() => {});
    evidence(`STEP cleanup: deleteRoom(${roomName}) attempted`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runProbe(parseOptions(process.argv.slice(2)));
  // The rtc-node FFI worker keeps the event loop alive after disconnect; this
  // is a one-shot probe, so exit explicitly with the recorded verdict.
  process.exit(process.exitCode ?? 0);
}
