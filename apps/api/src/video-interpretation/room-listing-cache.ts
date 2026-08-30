import type { ParticipantInfo } from 'livekit-server-sdk';
import { LiveKitAPI } from 'livekit-server-sdk';
import { readLiveKitConfig, LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS } from './security.js';

function liveKitApiHost(url: string): string {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

/**
 * Short-TTL server-side cache for LiveKit room participant listings.
 *
 * The authorization watchdog endpoint must answer within the 400 ms response
 * ceiling, but a synchronous listParticipants call costs 500-900 ms on a cold
 * or regional path. Caching the server-authoritative listing for one second
 * keeps the endpoint fast while bounding authority staleness to the cache TTL
 * plus the agent's own 1.5 s authorization TTL. Fetch failures never serve
 * stale data: callers must fail closed.
 */
const ROOM_LISTING_TTL_MS = 1_000;

interface RoomListingEntry {
  participants: ParticipantInfo[];
  expiresAtMs: number;
}

const listingCache = new Map<string, RoomListingEntry>();
const inflightListings = new Map<string, Promise<ParticipantInfo[]>>();

export async function listRoomParticipantsForAuthority(roomName: string): Promise<ParticipantInfo[]> {
  const now = Date.now();
  const hit = listingCache.get(roomName);
  if (hit && hit.expiresAtMs > now) return hit.participants;
  const pending = inflightListings.get(roomName);
  if (pending) return pending;

  const fetchPromise = (async () => {
    const config = readLiveKitConfig();
    const livekit = new LiveKitAPI({
      host: liveKitApiHost(config.livekitUrl),
      apiKey: config.apiKey,
      secret: config.apiSecret,
      requestTimeout: LIVEKIT_CONTROL_REQUEST_TIMEOUT_SECONDS,
      failover: false,
    });
    const participants = await livekit.room.listParticipants(roomName);
    listingCache.set(roomName, {
      participants,
      expiresAtMs: Date.now() + ROOM_LISTING_TTL_MS,
    });
    return participants;
  })();

  inflightListings.set(roomName, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inflightListings.delete(roomName);
    const cutoff = Date.now();
    for (const [key, entry] of listingCache) {
      if (entry.expiresAtMs <= cutoff) listingCache.delete(key);
    }
  }
}

/** Test-only hook. */
export function clearRoomListingCache(): void {
  listingCache.clear();
}
