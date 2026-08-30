# Video interpretation de-identified evaluation harness

One-off operational scripts used to qualify the low-cost video
interpretation path on the production LiveKit project with synthetic,
de-identified audio. **Never point these at real patient rooms.**

Order of operations (all run on the API host):

1. `create-eval-operator.py` — creates/reuses the Keycloak user
   `eval-operator@medora.local` with realm role `admin`, stores its password
   at `/etc/medora/eval-operator-password` (root-only), inserts the matching
   CRM `users` row, and stores a fresh operator JWT at
   `/etc/medora/eval-operator-token`.
2. `create-fixtures.py` — registers the hosted deployment row (bootstrap
   secret digest), creates a clearly-marked DEIDENTIFIED evaluation
   `video_consultations` row plus a synthetic patient participant, and writes
   `/etc/medora/eval-fixtures.json`.
3. `restart-eval-job.py` — idempotently stops any active interpretation job
   on the eval consultation and STARTs a fresh `DEIDENTIFIED_EVALUATION` job.
4. `pnpm --filter @medical-crm/interpretation-agent probe:e2e-room` — joins a
   synthetic patient (publishes a 48kHz PCM clip as its mic, with silence gaps
   between turns) and an operator (via the real `/token` endpoint), records
   the agent's translated audio, and prints per-track frame/peak stats.

Prerequisites on the host: `LIVEKIT_*` credentials in both
`/opt/medora/medical-crm-v2/.env` (agent) and `/opt/medora/medora-crm-v2-api/.env`
(API), the release approval + allowlist + consents chain (applied by
`restart-eval-job.py` through the operator token), and a running
`medora-interpretation-v1` agent worker.

Evidence captured 2026-08-30: English synthetic speech -> authorized agent
subscription -> OpenAI `gpt-realtime-translate` -> Chinese audio playout +
`medora.subtitle.v1` data messages; Whisper verification of the recorded
translation returned the expected Chinese sentence.
