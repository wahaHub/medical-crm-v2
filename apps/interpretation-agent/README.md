# Medora hosted interpretation agent

This package is the fail-closed LiveKit Hosted Agent runtime for the low-cost video interpretation profile.

Implemented now:

- explicit-dispatch validation and a generation-bound agent identity;
- single-use deployment-bootstrap exchange for a job-scoped capability;
- 500 ms authorization watchdog with a 400 ms response ceiling and request-start-based 1.5 s TTL;
- `autoSubscribe=SUBSCRIBE_NONE` until exact server-authorized tracks exist;
- Silero VAD and the LiveKit audio turn detector prewarmed with explicit Chinese/English thresholds;
- tested turn-gated audio buffering, two-provider-slot admission, and target-language playout serialization.

The production provider/media adapter does not exist yet. `apps/api` therefore has a code-level, non-environment-overridable gate that always rejects START with `VIDEO_INTERPRETATION_SCAFFOLD_ONLY`. The existing environment flags are necessary future gates, but cannot enable this scaffold. A reviewed code change may remove the hard gate only after source-track reconciliation and revocation, provider capability/finality, PHI contract, and server-authoritative budget/deadline gates all pass.

## Local commands

```bash
pnpm --filter @medical-crm/interpretation-agent download
pnpm --filter @medical-crm/interpretation-agent test
pnpm --filter @medical-crm/interpretation-agent typecheck
pnpm --filter @medical-crm/interpretation-agent dev
```

The agent needs `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_INTERPRETATION_AGENT_NAME`, `LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET`, and `CRM_API_URL`. Keep content recording and transcript observability disabled in the LiveKit project.
