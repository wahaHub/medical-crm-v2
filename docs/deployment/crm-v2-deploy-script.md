# CRM v2 Deploy Script

`/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/scripts/deploy_v2.py` wraps the production deployment flow for:

- `apps/admin` -> Vercel
- `apps/hospital` -> Vercel
- `apps/api` -> Lightsail + `systemd`

The script defaults to deploying `feature/phase-2bc`, but the branch can be overridden with `--branch`.

## Why this script exists

It bakes in the deployment pitfalls we already hit:

- Vercel deploys must use `--archive=tgz` to avoid file-count upload failures.
- `admin` and `hospital` must be deployed as separate Vercel projects.
- Vercel production env vars should be checked before deploy.
- API restart needs a readiness loop, not just `systemctl is-active`.
- API deploy needs an explicit SSH key path.

## Requirements

- `git`
- `pnpm`
- `python3`
- `vercel`
- `ssh`
- `rsync`
- `curl`

You must already be logged into Vercel locally.

## Common commands

Validate all targets without deploying:

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
python3 scripts/deploy_v2.py \
  --validate \
  --targets admin,hospital,api \
  --branch feature/phase-2bc \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

Deploy both frontends:

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
python3 scripts/deploy_v2.py \
  --targets admin,hospital \
  --branch feature/phase-2bc
```

Deploy only the API:

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
python3 scripts/deploy_v2.py \
  --targets api \
  --branch feature/phase-2bc \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

Deploy everything from a different branch:

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
python3 scripts/deploy_v2.py \
  --targets all \
  --branch your-branch-name \
  --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem
```

## Notes

- If the requested branch is not the currently checked-out branch, the script creates a temporary git worktree and deploys from there.
- If you deploy from the current branch, the script requires a clean working tree unless you pass `--allow-dirty`.
- API deploy syncs the local checkout to `/opt/medora/medical-crm-v2`, runs `pnpm install --frozen-lockfile`, restarts `medora-crm-v2-api`, then waits for `http://127.0.0.1:3001/health` and `https://crmapi.medicaltourismchina.health/health`.

## Latest verification

Verified on `2026-04-06` against branch `feature/phase-2bc`:

- `python3 -u scripts/deploy_v2.py --validate --targets admin,hospital,api --branch feature/phase-2bc --allow-dirty --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem`
  - Passed Vercel env checks for `admin` and `hospital`
  - Passed remote API `.env` checks on `44.253.141.97`
- `python3 -u scripts/deploy_v2.py --targets admin,hospital --branch feature/phase-2bc --allow-dirty --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem`
  - Produced ready deployments:
    - `https://admin-eyfgdb602-medora-beautys-projects.vercel.app`
    - `https://hospital-pjr06kapa-medora-beautys-projects.vercel.app`
- `python3 -u scripts/deploy_v2.py --targets api --branch feature/phase-2bc --allow-dirty --ssh-key /Users/haowang/Downloads/LightsailDefaultKey-us-west-2.pem`
  - Restarted `medora-crm-v2-api`
  - Confirmed local and public health endpoint success:
    - `http://127.0.0.1:3001/health`
    - `https://crmapi.medicaltourismchina.health/health`
