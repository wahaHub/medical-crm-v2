# Medora interpretation agent

This package contains the default fail-closed LiveKit Hosted Agent runtime and the optional self-hosted supervisor for the low-cost video interpretation profile.

Implemented now:

- explicit-dispatch validation and a generation-bound agent identity;
- single-use deployment-bootstrap exchange for a job-scoped capability;
- 500 ms authorization watchdog with a 400 ms response ceiling and request-start-based 1.5 s TTL;
- `autoSubscribe=SUBSCRIBE_NONE` until exact server-authorized tracks exist;
- Silero VAD and the LiveKit audio turn detector prewarmed with explicit Chinese/English thresholds;
- tested turn-gated audio buffering, two-provider-slot admission, and target-language playout serialization.
- a required `privateAgentSessionStartOptions(agent)` helper that sets `record: false` for every future clinical `AgentSession.start` call.
- a dedicated OpenAI `gpt-realtime-translate` WebSocket adapter using 24 kHz mono PCM16, separate source/translated transcript deltas, translated PCM deltas, and graceful `session.close` draining;
- server-authoritative LiveKit room listing reconciliation, exact microphone-SID subscriptions, per-speaker VAD/Turn Detector streams, and target-language audio/data publication;
- one provider translation session per admitted local turn so `session.closed` is the documented final barrier and the entire provider stream maps to exactly one local turn.
- release-approval/allowlist-bound provider targets and server-timestamp budget enforcement without content telemetry;
- an optional self-hosted claim path with per-host digest credentials, one concurrent job per V1 supervisor, short-lived exact-room LiveKit tokens, 30-second leases, 10-second heartbeats, and fenced takeover;
- reliable translated-playout boundary events for original/translated/ducking controls without publishing transcript content.

The production provider/media path is implemented but not release-qualified. `apps/api` therefore still has a code-level, non-environment-overridable gate that rejects START with `VIDEO_INTERPRETATION_SCAFFOLD_ONLY`. The existing environment flags cannot bypass it. Remove the hard gate only after the synthetic/de-identified OpenAI probe and an end-to-end LiveKit room pass from an approved network/project, the iterative review is clean, and the privacy/contract launch gates in the design document pass.

## Local commands

```bash
pnpm --filter @medical-crm/interpretation-agent download
pnpm --filter @medical-crm/interpretation-agent test
pnpm --filter @medical-crm/interpretation-agent typecheck
pnpm --filter @medical-crm/interpretation-agent dev
pnpm --filter @medical-crm/interpretation-agent start:self-hosted
pnpm --filter @medical-crm/interpretation-agent probe:translation -- \
  --input /path/to/24khz-mono-s16le.pcm \
  --output /path/to/translated-24khz-mono-s16le.pcm \
  --target zh
```

The hosted agent needs `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_INTERPRETATION_AGENT_NAME`, `LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET`, and `CRM_API_URL`. The optional self-hosted runner needs only `CRM_API_URL`, `MEDORA_SELF_HOST_ID`, its per-host bearer, and the provider key; it receives a lease-bounded LiveKit participant token from the API and must never hold LiveKit server or PostgreSQL credentials. Both central-agent profiles require the verified LiveKit Cloud token-revocation boundary and the independent lifecycle reconciler on the existing API host. Hosted setup is documented in [deploy/HOSTED.md](deploy/HOSTED.md); optional Lightsail runner setup is in [deploy/SELF_HOSTED.md](deploy/SELF_HOSTED.md).

Keep Agent Observability disabled in the LiveKit project as the first privacy layer. When the media adapter creates an `AgentSession`, it must also call `session.start(privateAgentSessionStartOptions(agent))`; omitting the explicit `record: false` is a release blocker.
