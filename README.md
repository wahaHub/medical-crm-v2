# Medical CRM v2

Medora CRM v2 monorepo.

## Local Setup

Use these three files together when you need to bring `medical-crm-v2` up on a new machine:

- [docs/setup/local-development.md](docs/setup/local-development.md)
- [.env.example](.env.example)
- [packages/infrastructure/database/full-bootstrap.sql](packages/infrastructure/database/full-bootstrap.sql)

Fast path:

```bash
cd /path/to/medical-crm-v2
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
cp .env.example .env
ln -sf ../../.env apps/api/.env
pnpm db:export:full
set -a
source .env
set +a
psql "$DATABASE_URL" -f packages/infrastructure/database/full-bootstrap.sql
pnpm dev
```

Default local URLs after boot:

- Admin portal: `http://localhost:3002`
- Hospital portal: `http://localhost:3003`
- API: `http://localhost:3001/health`

## Apps

- `apps/admin`: Admin portal on Vercel
- `apps/hospital`: Hospital portal on Vercel
- `apps/api`: Node API on Lightsail
- `dify`: Self-hosted Dify stack

## Deployment

The verified deployment entrypoint is:

- [scripts/deploy_v2.py](scripts/deploy_v2.py)
- [scripts/tail_journalctl.py](scripts/tail_journalctl.py)

### What it does

- Checks required Vercel production env vars for `admin` and `hospital`
- Checks required remote `.env` values for the API server
- Deploys `apps/admin` to Vercel
- Deploys `apps/hospital` to Vercel
- Rsyncs the repo to the API server
- Runs `pnpm install --frozen-lockfile` on the API server
- Restarts `medora-crm-v2-api`
- Verifies both local and public API health

### Verified production command

```bash
cd "$(git rev-parse --show-toplevel)"
python3 scripts/deploy_v2.py \
  --targets all \
  --branch feature/phase-2bc \
  --ssh-key "$SSH_KEY_PATH"
```

This command was verified against the current production setup:

- Vercel scope: `medora-beautys-projects`
- API host: `44.253.141.97`
- API service: `medora-crm-v2-api`
- Public API health check: `https://crmapi.medicaltourismchina.health/health`

### Validate only

Use this before a release if you want a fast preflight without deploying:

```bash
cd "$(git rev-parse --show-toplevel)"
python3 scripts/deploy_v2.py \
  --targets all \
  --branch feature/phase-2bc \
  --ssh-key "$SSH_KEY_PATH" \
  --validate
```

### Common variants

Deploy only the frontend apps:

```bash
python3 scripts/deploy_v2.py \
  --targets admin,hospital \
  --branch feature/phase-2bc
```

Deploy only the API:

```bash
python3 scripts/deploy_v2.py \
  --targets api \
  --branch feature/phase-2bc \
  --ssh-key "$SSH_KEY_PATH"
```

Deploy a different branch:

```bash
python3 scripts/deploy_v2.py \
  --targets all \
  --branch your-branch-name \
  --ssh-key "$SSH_KEY_PATH"
```

### Production log tail

When you need to debug the API on Lightsail, use:

```bash
cd "$(git rev-parse --show-toplevel)"
python3 scripts/tail_journalctl.py \
  --ssh-key "$SSH_KEY_PATH" \
  --follow
```

Common variants:

```bash
python3 scripts/tail_journalctl.py \
  --ssh-key "$SSH_KEY_PATH" \
  --since 15

python3 scripts/tail_journalctl.py \
  --ssh-key "$SSH_KEY_PATH" \
  --since 30 \
  --grep chatbot-v3

python3 scripts/tail_journalctl.py \
  --ssh-key "$SSH_KEY_PATH" \
  --service medora-ai-sync-outbox.service \
  --priority err
```

### Prerequisites

- `vercel` CLI is installed and already logged in
- `pnpm`, `git`, `python3`, `ssh`, `rsync`, and `curl` are installed locally
- Vercel production env vars already exist for both frontend projects
- `/opt/medora/medical-crm-v2/.env` already exists on the API server
- The SSH key passed to `--ssh-key` can access the API server

### Resend Inbound Email

- Configure Resend Inbound DNS for `medicaltourismchina.health` or `reply.medicaltourismchina.health`.
- Subscribe the Resend webhook event `email.received` to the CRM API endpoint `/api/webhooks/resend/inbound`.
- Store the webhook signing secret as `RESEND_WEBHOOK_SECRET`.
- Keep `INBOUND_EMAIL_ENABLED=false` until staging E2E passes, then set it to `true`.
- Patient-facing emails use the unified sender `customer@medicaltourismchina.health`; tokenized Reply-To addresses route replies back into CRM messages.

### Notes

- The script deploys from the branch passed through `--branch`
- If that branch is not the current checked-out branch, the script creates a temporary git worktree
- The script expects a clean worktree unless `--allow-dirty` is passed
- During Next.js builds you may still see `Dynamic server usage` warnings in Vercel logs for authenticated pages; these did not block production deployment in the verified run
- `tail_journalctl.py` defaults to `44.253.141.97`, `ubuntu`, and `medora-crm-v2-api`, but all three can be overridden per run

## Dify API Key Rotation

The CRM API server uses Dify keys from the remote file:

- `/opt/medora/medical-crm-v2/.env`

### Current key layout

- `DIFY_APP_API_KEY`: Dify app API key used for chatbot requests
- `DIFY_API_KEY`: kept in sync with `DIFY_APP_API_KEY` for compatibility
- `DIFY_DATASET_API_KEY`: Dify dataset key used for FAQ and package knowledge sync

### Current production values

- Stored only on the API server in `/opt/medora/medical-crm-v2/.env`
- Do not commit live key values into this repository

### How to rotate the Dify app key later

1. Generate a new app key in Dify for the published chatbot app.
2. SSH into the API server.
3. Update both `DIFY_APP_API_KEY` and `DIFY_API_KEY` in `/opt/medora/medical-crm-v2/.env`.
4. Restart the API service.
5. Verify API health.

Example:

```bash
ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST"
cd /opt/medora/medical-crm-v2
cp .env .env.bak.$(date +%Y%m%d%H%M%S)
sed -i.bak 's/^DIFY_APP_API_KEY=.*/DIFY_APP_API_KEY=app-REPLACE_ME/' .env
sed -i.bak 's/^DIFY_API_KEY=.*/DIFY_API_KEY=app-REPLACE_ME/' .env
sudo systemctl restart medora-crm-v2-api
curl -fsS http://127.0.0.1:3001/health
```

### How to check or rotate the dataset key

The dataset key is separate from the app key. It is used by the CRM FAQ sync worker to write documents into Dify knowledge bases.

Current production dataset key:

- Stored only on the API server in `/opt/medora/medical-crm-v2/.env`

If you create a new dataset key in Dify, update only:

```bash
DIFY_DATASET_API_KEY=ds-REPLACE_ME
```

Then restart:

```bash
sudo systemctl restart medora-crm-v2-api
```

## Dify Operations and Troubleshooting

When China chatbot behavior diverges between local and production, use the diagnostic script first:

- [scripts/dify_ops.py](scripts/dify_ops.py)

This script is intentionally diagnostic-first:

- it checks state
- it runs smoke tests
- it points at likely failure signatures
- it does **not** mutate remote infrastructure automatically
- the combined `doctor` command is **read-only by default** unless you explicitly opt into CRM smoke

### Verified production locations

- CRM API env:
  - `/opt/medora/medical-crm-v2/.env`
- Dify docker stack:
  - `/opt/medora/dify/docker`
- CRM health:
  - `https://crmapi.medicaltourismchina.health/health`
- Public Dify base:
  - `https://ai.medicaltourismchina.health/v1`

### Quick commands

Set these once in your shell:

```bash
export REPO_ROOT="$(git rev-parse --show-toplevel)"
export CRM_BASE_URL="https://crmapi.medicaltourismchina.health"
export DIFY_BASE_URL="https://ai.medicaltourismchina.health/v1"
export REMOTE_HOST="44.253.141.97"
export REMOTE_USER="ubuntu"
export SSH_KEY_PATH="/path/to/LightsailDefaultKey-us-west-2.pem"
```

Probe the public Dify app endpoint directly:

```bash
cd "$REPO_ROOT"
python3 scripts/dify_ops.py dify-chat \
  --base-url "$DIFY_BASE_URL" \
  --app-key "app-REPLACE_ME" \
  --message "Hello, I want to learn about your services"
```

The direct Dify probe defaults to:

```json
{"hospitalType":"REGULAR"}
```

If the workflow input contract changes, override it with `--inputs-json`.

Run the full CRM onboarding -> history -> chatbot smoke flow:

```bash
cd "$REPO_ROOT"
python3 scripts/dify_ops.py crm-smoke \
  --crm-base-url "$CRM_BASE_URL" \
  --email dify-ops+$(date +%s)@example.com \
  --message "Hello, I want to learn about your services"
```

Important:

- `crm-smoke` creates a real patient/case flow
- always use a disposable email alias

Inspect the live CRM + Dify remote state over SSH:

```bash
cd "$REPO_ROOT"
python3 scripts/dify_ops.py remote-check \
  --ssh-key "$SSH_KEY_PATH" \
  --host "$REMOTE_HOST" \
  --user "$REMOTE_USER"
```

Run the combined doctor pass:

```bash
cd "$REPO_ROOT"
python3 scripts/dify_ops.py doctor \
  --ssh-key "$SSH_KEY_PATH" \
  --host "$REMOTE_HOST" \
  --user "$REMOTE_USER" \
  --app-key "app-REPLACE_ME"
```

Opt in to a real CRM smoke only when you want to create a live patient/case:

```bash
cd "$REPO_ROOT"
python3 scripts/dify_ops.py doctor \
  --ssh-key "$SSH_KEY_PATH" \
  --host "$REMOTE_HOST" \
  --user "$REMOTE_USER" \
  --app-key "app-REPLACE_ME" \
  --include-crm-smoke \
  --crm-base-url "$CRM_BASE_URL" \
  --email "dify-ops+$(date +%s)@example.com"
```

### What the script checks

`dify-chat`

- tests the public Dify `/chat-messages` endpoint directly
- helps separate “Dify is broken” from “CRM integration is broken”
- a `400 required in input form` result is still useful: it usually means the key/network path is valid, but the workflow expects CRM-supplied inputs such as `sessionId`

`crm-smoke`

- opens a fresh patient onboarding
- captures the returned patient cookies
- verifies widget history seeding
- sends a real chatbot turn through CRM

`remote-check`

- reads the live CRM Dify env values from `/opt/medora/medical-crm-v2/.env`
- reads Dify sandbox keys from `/opt/medora/dify/docker/.env`
- checks whether `CODE_EXECUTION_API_KEY` and `SANDBOX_API_KEY` match
- inspects `docker compose ps`
- probes public Dify using the live CRM app key
- probes Dify api container internal health

### Failure signatures we have already hit

If direct Dify `/chat-messages` returns `401 unauthorized`:

- the CRM is using an app key that does not exist on **this** Dify instance
- or the key was generated on a different Dify environment

If chatbot replies fail with:

- `Failed to execute code`
- `sandbox service`
- `status code 401`

then compare:

- `CODE_EXECUTION_API_KEY`
- `SANDBOX_API_KEY`

These must match in:

- `/opt/medora/dify/docker/.env`

If public Dify returns HTML `502 Bad Gateway` but the Dify api container is internally healthy:

- Dify nginx likely has a stale upstream IP after container recreation
- the fix is usually:

```bash
ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST"
cd /opt/medora/dify/docker
sudo docker compose restart nginx
```

If China local works but cloud submit shows no AI starter reply:

- run `crm-smoke`
- verify widget history contains at least one assistant message
- verify that first message contains the expected block such as `QUESTIONNAIRE_MODAL_TRIGGER`
- if history is empty, check:
  - CRM Dify key
  - Dify publish status
  - CRM API restart after env changes

If a newly published Dify key still does not work:

- confirm the key exists in the **same** production Dify instance
- a key from another Dify instance will still return `401`, even if the app name looks identical

### Safe recovery steps

Restart only the CRM API:

```bash
ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST"
sudo systemctl restart medora-crm-v2-api
curl -fsS https://crmapi.medicaltourismchina.health/health
```

Restart the Dify stack components most relevant to chatbot execution:

```bash
ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST"
cd /opt/medora/dify/docker
sudo docker compose restart api worker worker_beat sandbox nginx
```

Reset the production Dify console account password:

- Production Dify host: `44.253.141.97`
- Dify docker dir: `/opt/medora/dify/docker`
- Current console account: `contact@medicaltourismchina.health`
- Do not store the reset password in git or docs. Generate a fresh temporary password when needed.

```bash
export SSH_KEY_PATH="/Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem"
export REMOTE_USER="ubuntu"
export REMOTE_HOST="44.253.141.97"
export DIFY_ADMIN_EMAIL="contact@medicaltourismchina.health"
export NEW_DIFY_PASSWORD="<generate-a-new-strong-password>"

ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST"
sudo docker exec docker-api-1 /bin/bash -lc \
  "cd /app/api && uv run flask reset-password \
    --email '$DIFY_ADMIN_EMAIL' \
    --new-password '$NEW_DIFY_PASSWORD' \
    --password-confirm '$NEW_DIFY_PASSWORD'"
```
