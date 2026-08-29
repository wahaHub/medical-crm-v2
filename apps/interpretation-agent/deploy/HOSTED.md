# Hosted Agent lifecycle deployment

The Hosted Agent profile requires the lifecycle reconciler. Without it,
unknown dispatch creation, agent bootstrap timeouts, application deadlines,
identity cleanup, and budget/capacity release cannot converge.

This does **not** require another Lightsail. Install the existing
`medora-video-interpretation-reconcile.service` on the same host as
`medora-crm-v2-api`:

1. Install the unit from this directory under `/etc/systemd/system/`.
2. Store the API's internal secret at `/etc/medora/internal-api-secret`, owned
   by root and readable only through the unit's `LoadCredential=` mapping.
3. Run `systemctl daemon-reload` and
   `systemctl enable --now medora-video-interpretation-reconcile.service`.
4. Verify the unit remains active and `last_succeeded_at` advances for all
   three profiles (`HOSTED`, `SELF_HOSTED_FENCE`, and `SELF_HOSTED_CLEANUP`)
   in `video_interpretation_reconcile_leases`. `consecutive_failures` must be
   zero, and `last_failed_at` must not be newer than `last_succeeded_at`.
   Lease `updated_at` proves ownership activity only; it is not health. The
   latter two profiles remain idle until Self-hosted is selected.
5. Alert if the Hosted pass stops advancing, reports repeated LiveKit errors,
   or leaves jobs in `STOPPING`/creation-pending beyond their reviewed bounds.

Do not start even de-identified Hosted evaluation until this unit is healthy.
It needs `CRM_API_URL` and the internal API credential, but no new server.
