# Translation Worker

CRM v2 already enqueues multilingual hospital, surgeon, case, FAQ, consultation, and ticket translation jobs into `translation_tasks`. The missing production piece is a worker that continuously drains that queue.

## What runs

Install these units on the API server:

- [medora-translation-tasks.service](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/ops/systemd/medora-translation-tasks.service)
- [medora-translation-tasks.timer](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/ops/systemd/medora-translation-tasks.timer)

They call:

```bash
POST http://127.0.0.1:3001/api/v2/internal/process-translation-tasks
X-Internal-Secret: $INTERNAL_API_SECRET
```

That endpoint is safe to run repeatedly. Each run claims a small batch of pending rows, translates them, writes results back to the correct datastore, and retries failures up to the configured limit.

## Required env vars

- `OPENAI_API_KEY`
- `INTERNAL_API_SECRET`

Depending on which hospital types you use in production, the API server also needs the normal Supabase credentials for:

- beauty materials writeback
- china medical writeback

## Server install

```bash
sudo cp ops/systemd/medora-translation-tasks.service /etc/systemd/system/
sudo cp ops/systemd/medora-translation-tasks.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now medora-translation-tasks.timer
systemctl list-timers --all | grep medora-translation-tasks
```

## Verification

Check API health:

```bash
curl -fsS http://127.0.0.1:3001/health
```

Check the timer:

```bash
systemctl status medora-translation-tasks.timer
journalctl -u medora-translation-tasks.service -n 50 --no-pager
```

Check queue state in CRM DB:

```sql
select status, count(*) from translation_tasks group by status order by status;
select entity_type, status, count(*)
from translation_tasks
group by entity_type, status
order by entity_type, status;
```

Dry-run the worker manually:

```bash
curl --fail --silent --show-error -X POST \
  -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  http://127.0.0.1:3001/api/v2/internal/process-translation-tasks
```
