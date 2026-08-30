# Hosted Agent lifecycle deployment

The Hosted Agent profile requires the lifecycle reconciler. Without it,
unknown dispatch creation, agent bootstrap timeouts, application deadlines,
identity cleanup, and budget/capacity release cannot converge.

This does **not** require another Lightsail. Both environments use separate
processes on the existing API host.

## Staging evaluation now

Install and enable
`medora-video-interpretation-reconcile-staging.service`. It targets the staging
API on loopback port 3002, runs from the independent staging release, and reads
its credential from `/etc/medora/staging/internal-api-secret`.

Do not start de-identified Hosted evaluation until
`medora-video-interpretation-reconcile-staging.service` remains active and the
staging `video_interpretation_reconcile_leases` rows show advancing
`last_succeeded_at` for `HOSTED`, `SELF_HOSTED_FENCE`, and
`SELF_HOSTED_CLEANUP`. `consecutive_failures` must be zero and
`last_failed_at` must not be newer than `last_succeeded_at`. Lease `updated_at`
proves ownership activity only; it is not health.

## Production later

1. Install `medora-video-interpretation-reconcile.service` from this directory
   under `/etc/systemd/system/`, but do not enable it yet.
2. Store the production API internal secret at
   `/etc/medora/internal-api-secret`, owned by root and readable only through
   the unit's `LoadCredential=` mapping. The unit uses the explicit
   `/run/credentials/medora-video-interpretation-reconcile.service/` path
   because the existing Ubuntu 22.04 API host runs systemd 249, which supports
   `LoadCredential=` but not the newer `%d` specifier.
3. Run `systemctl daemon-reload`, then keep production off with
   `systemctl disable --now medora-video-interpretation-reconcile.service`.
   Verify `systemctl is-enabled` reports `disabled` and `systemctl is-active`
   reports `inactive`.
4. Enable `medora-video-interpretation-reconcile.service` only after a separate
   production LiveKit project and credentials are installed, the production
   internal API secret is present, observability/recording gates are checked,
   and reviewed production probes pass. At that later gate, run
   `systemctl enable --now medora-video-interpretation-reconcile.service`.
5. Before production Hosted use, apply the same three-profile lease-health
   checks to the production database. Alert if the Hosted pass stops advancing,
   reports repeated LiveKit errors, or leaves jobs in `STOPPING` or
   creation-pending beyond their reviewed bounds.

Never point the production unit at the staging database, share internal API
secrets between environments, or use staging reconciler health as evidence that
production is ready.
