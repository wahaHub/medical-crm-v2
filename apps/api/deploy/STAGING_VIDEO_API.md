# De-identified video staging API

The low-cost staging API shares the existing API Lightsail but remains a
separate process on loopback port 3002, a separate Supabase project, and a
separate internal API credential. It must not receive production database,
storage, email, payment, Dify, or Keycloak secrets.

Generate the minimal database bootstrap with:

```bash
pnpm db:export:video-staging
```

Import `packages/infrastructure/database/video-staging-bootstrap.sql` into an
empty Supabase staging database. This creates only the video consultation and
interpretation authority/lifecycle tables plus the minimum identity-compatible
`users` table; it never copies business data. The bootstrap seeds exactly one
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
