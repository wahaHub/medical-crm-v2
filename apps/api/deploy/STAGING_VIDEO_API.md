# De-identified video staging API

The low-cost staging API shares the existing API Lightsail but remains a
separate process on loopback port 3002, a separate Supabase project, and a
separate internal API credential. It must not receive production database,
storage, email, payment, Dify, or Keycloak secrets.

Generate the minimal database bootstrap with:

```bash
pnpm db:export:video-staging
```

Import `packages/infrastructure/database/video-staging-bootstrap.sql` into the
isolated Supabase staging database. The database may retain the normal CRM
schema, but every patient, case, message, document, transcript, and other
business table must be empty; the bootstrap never copies business data. It
creates the video consultation and interpretation authority/lifecycle tables
plus the minimum identity-compatible `users` record. The bootstrap seeds exactly one
synthetic operator (`video-staging-admin@invalid.example`) whose first valid
login binds its staging Keycloak subject through the existing email fallback.
The final bootstrap section enables RLS on every staging authority table and
revokes all table/sequence access from Supabase Data API roles (`anon`,
`authenticated`, and `service_role`). It also revokes public execution of the
two lifecycle trigger functions and makes future objects closed by default.
Import with the same direct PostgreSQL owner used by the API, and verify the
generated denial assertions complete successfully. Disable the Supabase Data
API for this project as an additional project-level gate because staging does
not use REST or GraphQL database access.

Create a separate staging Keycloak realm and public client. The idempotent
`provision-video-staging-keycloak.mjs` script creates realm
`medora-video-staging`, client `medora-video-staging-api`, and exactly one
enabled user with the synthetic email above and the realm `admin` role expected
by the API. It also installs a subject protocol mapper with the lightweight
token claim enabled because CRM identity mapping requires the standard `sub`
claim. Run it as root with the existing Keycloak control-plane environment:

```bash
node --env-file=/opt/medora/medora-crm-v2-api/.env \
  apps/api/deploy/provision-video-staging-keycloak.mjs
```

The control-plane credentials are used only to provision the isolated realm;
the script never copies them into staging. It writes the generated operator
password to `/etc/medora/staging/video-staging-operator.env` with root-only
permissions and puts only the staging issuer/client settings in the staging API
environment. Do not reuse a production realm, client, account, token, or user
record. Remove the staging realm and its root-only credential file when the
evaluation ends. Wrong issuer/client (`azp`) must remain a 401, an unseeded
subject/email must remain a 401, and a valid non-admin principal must remain a
403.

After restarting the staging API, run the repeatable authenticated smoke test:

```bash
node --env-file=/etc/medora/staging/video-staging-operator.env \
  apps/api/deploy/smoke-video-staging-auth.mjs
```

It validates `sub`, email, `azp`, and the `admin` role without printing the
token or password, then requires an authenticated video route to return the
normal `200`/`job: null` contract.

For the supervised personal E2E, set all of the following only in the isolated
staging API environment:

```text
VIDEO_INTERPRETATION_DEPLOYMENT_TIER=STAGING
VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED=true
VIDEO_STAGING_SUPABASE_PROJECT_REF=your_20_character_staging_project_ref
VIDEO_INTERPRETATION_ENABLED=true
VIDEO_CONSULTATION_PATIENT_JOIN_ENABLED=false
VIDEO_INTERPRETATION_PROVIDER_APPROVED=true
VIDEO_INTERPRETATION_PROVIDER_PROFILE=INTEGRATED_REALTIME
VIDEO_INTERPRETATION_RUNTIME_PROFILE=HOSTED_AGENT_V1
```

Do not set either `VIDEO_INTERPRETATION_LIVEKIT_CLOUD_REVOCATION_VERIFIED=true`
or a Hosted dispatch-absence code gate merely to run this evaluation. The E2E
mode preserves those unverified production gates, admits only
`DEIDENTIFIED_EVALUATION`, caps AI time at 300 seconds, and permits one active
AI room. `REAL_PATIENT` remains rejected by a non-environment code gate.
The project ref must match both `DATABASE_URL` and `DIRECT_URL`. Before any DDL
or `REVOKE`, `apply-video-staging-bootstrap.mjs` rejects unknown public tables,
any row in a CRM business table, any user other than the reserved synthetic
operator, and any existing consultation that does not satisfy the synthetic
room/metadata/business-field contract. This prevents a staging environment
label from authorizing lockdown against a mispointed production database while
allowing an empty staging CRM schema.

The harness creates an approval with scope `SYNTHETIC_E2E`, binds it uniquely
to the generated consultation, and records privacy, Agent Observability, and
retention attestations as `false`. The control plane accepts that approval only
for the same short-lived server-verified synthetic consultation. Normal
`RELEASE` approvals continue to require all three attestations to be true.

After applying the generated bootstrap and restarting the two staging units,
start the loopback-only harness as a root-owned transient unit so it can read
the isolated operator credential without exposing it to the browser:

```bash
sudo systemd-run \
  --unit=medora-video-staging-e2e \
  --collect \
  --property=RuntimeMaxSec=1500 \
  --property=WorkingDirectory=/opt/medora/medora-crm-v2-api-staging/release/apps/api \
  /usr/bin/node \
  --env-file=/opt/medora/medora-crm-v2-api-staging/.env \
  --env-file=/etc/medora/staging/video-staging-operator.env \
  --import tsx \
  deploy/video-staging-e2e-harness.mjs
```

Read the random doctor/patient paths from the unit's first JSON log line, then
forward only the loopback harness to the tester's machine:

```bash
ssh -N -L 3003:127.0.0.1:3003 ubuntu@API_LIGHTSAIL
```

Open the two random paths in separate browser windows, join both microphones,
confirm the on-screen de-identification warning and participant consent, then
start AI from the doctor window. Use headphones and only the displayed
synthetic phrases. Verify both source/translated captions and translated audio,
then press Stop and confirm the job converges through cleanup. The transient
unit stops after 25 minutes; the AI job itself cannot exceed five minutes.

Install `medora-crm-v2-api-staging.service` and provide its root-owned or
service-user-owned environment file at
`/opt/medora/medora-crm-v2-api-staging/.env`. Required real values are limited
to the staging PostgreSQL/Supabase connection, isolated staging Keycloak
configuration, LiveKit project credentials, OpenAI evaluation key, and
independently generated staging internal/bootstrap secrets. Other variables
required by the shared process schema must use non-working staging placeholders.
Do not put `PORT` or `API_BIND_HOST` in this file. The systemd command
deliberately overrides both values and binds staging to `127.0.0.1:3002`, but
keeping listener settings out of the environment file avoids misleading
operators.

Run the staging service from its own
`/opt/medora/medora-crm-v2-api-staging/release` tree. Do not point it at the
production `current` symlink. The staging lifecycle reconciler must use this
same independent release. When seeding a release from the production code tree,
exclude every `.env` and `.env.*` file so production credentials are not copied
into staging.

Import `Caddyfile.staging` from the host Caddyfile. The matcher deliberately
exposes only health and video interpretation paths; every unrelated CRM route
returns 404 because the staging database is not a full CRM clone.

After each service update, verify `ss` reports `127.0.0.1:3002` (not
`0.0.0.0:3002`, `*:3002`, or `[::]:3002`) before testing the public Caddy URL.

Keep `VIDEO_INTERPRETATION_ENABLED=false` until the de-identified provider
probe, hosted agent deployment, LiveKit room test, observability-off check, and
reviewed code gates are complete. Never use real patient media in this
environment.
