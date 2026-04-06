# Dify FAQ Sync

This project already enqueues AI sync jobs whenever CRM v2 FAQ or package content changes. The missing production piece is a worker that continuously drains `ai_sync_outbox` and sends those updates into Dify datasets.

## Required Dify datasets

Use the same dataset names as local development:

- `FAQ_COSMETIC`
- `FAQ_REGULAR`
- `PACKAGES`

The production API server must have these env vars:

- `DIFY_API_BASE_URL`
- `DIFY_DATASET_API_KEY`
- `DIFY_DATASET_FAQ_COSMETIC_ID`
- `DIFY_DATASET_FAQ_REGULAR_ID`
- `DIFY_DATASET_PACKAGES_ID`
- `INTERNAL_API_SECRET`

## One-time bootstrap for a new Dify environment

If you switch to a brand new Dify workspace, make sure the Dify datasets exist first, then:

1. Back up any existing `dify_document_mappings` rows from the CRM database.
2. Delete stale `dify_document_mappings` rows that still point at the previous Dify workspace.
3. Ensure `ai_sync_outbox` contains one `UPSERT` row per active FAQ and published package.
4. Drain the outbox until it reaches zero pending rows.

In the current production environment, the pending queue already represents the full seed set:

- `396` active FAQ documents
- `1` published package document

## Continuous sync worker

Install these units on the API server:

- [medora-ai-sync-outbox.service](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/ops/systemd/medora-ai-sync-outbox.service)
- [medora-ai-sync-outbox.timer](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/ops/systemd/medora-ai-sync-outbox.timer)

They call:

```bash
POST http://127.0.0.1:3001/api/v2/internal/process-ai-sync-outbox
X-Internal-Secret: $INTERNAL_API_SECRET
```

That endpoint is safe to run repeatedly. It claims a batch, syncs each item into Dify, then marks the outbox rows `DONE` or retries them.

## Server install

```bash
sudo cp ops/systemd/medora-ai-sync-outbox.service /etc/systemd/system/
sudo cp ops/systemd/medora-ai-sync-outbox.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now medora-ai-sync-outbox.timer
systemctl list-timers --all | grep medora-ai-sync-outbox
```

## Verification

Check API health:

```bash
curl -fsS http://127.0.0.1:3001/health
```

Check the timer:

```bash
systemctl status medora-ai-sync-outbox.timer
journalctl -u medora-ai-sync-outbox.service -n 50 --no-pager
```

Check CRM sync state:

```sql
select status, count(*) from ai_sync_outbox group by status order by status;
select dify_dataset_id, count(*) from dify_document_mappings group by dify_dataset_id order by count(*) desc;
```

Check Dify:

```sql
select name from datasets order by name;
select count(*) from documents;
```
