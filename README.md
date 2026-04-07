# Medical CRM v2

Medora CRM v2 monorepo.

## Apps

- `apps/admin`: Admin portal on Vercel
- `apps/hospital`: Hospital portal on Vercel
- `apps/api`: Node API on Lightsail
- `dify`: Self-hosted Dify stack

## Deployment

The verified deployment entrypoint is:

- [scripts/deploy_v2.py](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/deploy_v2.py)

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
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
python3 scripts/deploy_v2.py \
  --targets all \
  --branch feature/phase-2bc \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

This command was verified against the current production setup:

- Vercel scope: `medora-beautys-projects`
- API host: `44.253.141.97`
- API service: `medora-crm-v2-api`
- Public API health check: `https://crmapi.medicaltourismchina.health/health`

### Validate only

Use this before a release if you want a fast preflight without deploying:

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
python3 scripts/deploy_v2.py \
  --targets all \
  --branch feature/phase-2bc \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem \
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
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

Deploy a different branch:

```bash
python3 scripts/deploy_v2.py \
  --targets all \
  --branch your-branch-name \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

### Prerequisites

- `vercel` CLI is installed and already logged in
- `pnpm`, `git`, `python3`, `ssh`, `rsync`, and `curl` are installed locally
- Vercel production env vars already exist for both frontend projects
- `/opt/medora/medical-crm-v2/.env` already exists on the API server
- The SSH key passed to `--ssh-key` can access the API server

### Notes

- The script deploys from the branch passed through `--branch`
- If that branch is not the current checked-out branch, the script creates a temporary git worktree
- The script expects a clean worktree unless `--allow-dirty` is passed
- During Next.js builds you may still see `Dynamic server usage` warnings in Vercel logs for authenticated pages; these did not block production deployment in the verified run
