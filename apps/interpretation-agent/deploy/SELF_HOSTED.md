# Optional self-hosted interpretation runtime

This profile is deployment-ready scaffolding, not authorization to buy or use a Lightsail instance for patient data. Keep the hosted profile selected until the measured trigger, provider/privacy contracts, and the soak gates in the design document pass.

## Immutable rebuild procedure

1. Build from a pinned reviewed commit on a clean Linux host. Do not clone runtime secrets into the image.
2. Create the non-login `medora-interpretation` user and install the pinned Node/pnpm/runtime dependencies.
3. Register the host through the admin-only API. Capture the returned bearer once; the API stores only its SHA-256 digest.
4. Put the host bearer and provider key in separate root-owned files under `/etc/medora/video-interpretation/` with mode `0600`. Never pass either secret in process arguments or commit them into the unit.
5. On the existing API Lightsail, install and enable `medora-video-interpretation-reconcile.service`. It runs independent Hosted, Self-hosted database-fence, and Self-hosted remote-cleanup loopback calls every two seconds using a systemd credential. Each API endpoint pass is protected across replicas by a recoverable PostgreSQL runner lease, has a 45-second budget, and never holds a business transaction across LiveKit calls; it does not require another instance.
6. Copy the agent example unit, replace only the non-secret API URL and host UUID, run `systemd-analyze security` on both units, then enable the agent service.
7. Run the 90-minute CPU/memory/Turn Detector soak with de-identified media before selecting this runtime profile.

The V1 supervisor handles exactly one AI-enabled room at a time, and host
registration rejects a larger advertised capacity. Meeting the application
limit of two simultaneous AI rooms with this optional profile therefore needs
two separately registered hosts. Do not run duplicate units with the same host
credential. Raise the per-host limit only after a reviewed concurrent task
registry, per-job cancellation/heartbeat isolation, graceful all-job shutdown,
and multi-room soak tests exist.

The agent receives an exact-room LiveKit participant token whose initial join lifetime is no longer than the remaining 30-second lease. It never receives the LiveKit API secret or PostgreSQL credentials. Claims use the per-host bearer; job operations use a separate capability bound to the execution and lease. Heartbeats run every 10 seconds.

This profile deliberately keeps **LiveKit Cloud** as the media plane. Before setting `VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED=true`, run the de-identified revocation probe and record evidence that `RemoveParticipant` with `revokeTokenTs` rejects both the original and LiveKit-refreshed tokens for an offline identity. The API also requires a `wss://*.livekit.cloud` URL. A private/self-hosted LiveKit server is not supported by this profile because short token TTLs do not revoke an already connected or refreshed client.

The independent API-host reconciler scans every two seconds, fences an expired execution in PostgreSQL, and then revokes/removes only its exact agent identity. An unclaimed job has a server-owned 60-second claim deadline; a late claim is rejected and a provably never-claimed row releases its slot without a pointless LiveKit removal. Any inconsistent remote-authority evidence instead enters conservative `STOPPING`. The reconciler retries from `STOPPING` after crashes or LiveKit errors. A replacement stays blocked until Cloud revocation/removal succeeds and provider sessions are closed or conservatively expired. Claim and STOP requests persist the fence but do not issue LiveKit cleanup themselves, so all remote side effects remain under the durable single-flight lease.

Rotate through the admin API, replace the credential file atomically, and restart the service. Rotation and revocation invalidate current leases and AI jobs while leaving the human call running. Never create a whole-instance snapshot after secrets have been installed; rebuild from the pinned secret-free source and inject fresh credentials.
