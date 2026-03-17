# Codex Review Fixes Summary

This document records only the files touched in the Codex review/fix pass after reviewing Claude's handoff. It does not attempt to enumerate every other pre-existing dirty file in the worktree.

## Scope

- Goal 1: restore case detail parity for legacy medical intake, diagnosis visibility, and case-page message rendering.
- Goal 2: restore message attachment upload flow, attachment rendering, and sender/recipient clarity.
- Goal 3: repair materials data loading and persistence regressions that caused blank read-only sections, stale before/after data, and missing saved fields.
- Goal 4: finish the follow-up review fixes for surgeon modal parity, materials cases compatibility, and message-detail loading/error behavior.

## Files Changed

### Message validation, DTOs, and API

- `packages/shared/validation/src/message.schema.ts`
  Reason: allow attachment-only messages instead of rejecting any message with empty `content`.

- `packages/shared/validation/src/__tests__/message.schema.test.ts`
  Reason: add regression coverage for attachment-only messages.

- `apps/api/src/routes/messages.routes.ts`
  Reason: add attachment upload initialization endpoint for message files and keep message POST validation aligned with the frontend payload.

- `apps/api/src/composition-root.ts`
  Reason: inject storage service into message read use cases so attachments can be returned with signed URLs.

- `apps/api/src/__tests__/messages.routes.test.ts`
  Reason: cover attachment-only message payloads at the route layer.

- `packages/application/src/dtos/conversation.dto.ts`
  Reason: extend message attachment DTO shape with UI-friendly aliases like `name`, `type`, `size`, and `url`.

- `packages/application/src/mappers/conversation.mapper.ts`
  Reason: map domain attachments to signed, UI-renderable attachment DTOs.

- `packages/application/src/use-cases/messages/list-messages.use-case.ts`
  Reason: batch-sign attachment storage keys before returning paginated messages.

- `packages/application/src/use-cases/messages/get-message.use-case.ts`
  Reason: sign attachment storage keys for single-message reads as well.

- `packages/application/__tests__/message-crud.use-case.test.ts`
  Reason: update message CRUD tests for the new storage dependency.

- `packages/application/__tests__/message-attachments.use-case.test.ts`
  Reason: add new regression tests that verify signed attachment URLs and UI-friendly attachment fields are present.

### Hospital messages UI

- `apps/hospital/src/actions/message-actions.ts`
  Reason: replace the broken `/api/v2/upload` call with the new upload-init flow and send backend-compatible attachment payloads.

- `apps/hospital/src/components/messages-view.tsx`
  Reason: fix sender-role inference, sender naming, attachment mapping, and file-upload send flow on `/messages`.

- `apps/hospital/src/lib/api-types.ts`
  Reason: align hospital frontend message types with the real backend DTO fields.

- `packages/shared/ui/src/components/chat-layout.tsx`
  Reason: render attachment-only / AI-summary messages correctly even when textual `content` is empty.

### Follow-up message detail fixes

- `packages/domain/src/entities/message.entity.ts`
  Reason: preserve sender metadata on message entities so the application layer can return explicit sender role/name instead of forcing the UI to guess from mismatched IDs.

- `packages/infrastructure/database/repositories/drizzle-message.repository.ts`
  Reason: join CRM `users` when reading messages so sender role/name are populated from the real database author rather than inferred in the browser.

- `packages/application/src/dtos/conversation.dto.ts`
  Reason: include `senderRole` and `senderName` in message DTOs returned to the frontend.

- `packages/application/src/mappers/conversation.mapper.ts`
  Reason: carry sender metadata from message entities into API DTOs alongside signed attachment URLs.

- `packages/application/__tests__/message-crud.use-case.test.ts`
  Reason: add regression coverage that message list/detail responses preserve sender metadata and signed attachment URLs.

- `apps/hospital/src/components/messages-view.tsx`
  Reason: show an explicit loading state while a conversation detail request is in flight, surface fetch errors for failed admin threads, and trust backend sender metadata before any local fallback logic.

- `packages/shared/ui/src/components/chat-layout.tsx`
  Reason: classify own-vs-other messages from explicit sender roles before comparing user IDs, which fixes the sender/recipient alignment bug caused by Keycloak `sub` mismatching CRM `users.id`.

### Case detail parity

- `packages/application/src/dtos/progress.dto.ts`
  Reason: reintroduce compatibility fields needed for legacy diagnosis records.

- `packages/application/src/mappers/progress.mapper.ts`
  Reason: treat legacy `STATUS_CHANGE` diagnosis progress rows as diagnoses even when `metadata.kind` is missing.

- `packages/application/src/mappers/case.mapper.ts`
  Reason: support legacy questionnaire-style `structuredData` payloads and preserve richer intake data instead of dropping back to shallow flat-field synthesis.

- `packages/application/__tests__/get-hospital-case-detail.use-case.test.ts`
  Reason: add regression tests for legacy intake payloads and legacy diagnosis progress metadata.

- `apps/hospital/src/components/case-detail-panel.tsx`
  Reason: prefer the patient conversation for case messages and infer sender role / translation fields correctly on the case detail page.

### Materials data loading and persistence

- `apps/hospital/src/components/materials-tabs.tsx`
  Reason: sync read-only UI from fetched API data, fix regular-hospital field mapping, invalidate materials queries after mutation, and stop losing newly selected media by converting file picks to persistable data URLs instead of ephemeral `blob:` URLs.

- `packages/infrastructure/supabase-main/supabase-materials.repository.ts`
  Reason: read/write `promotionalVideos` and persist beauty-hospital `name` edits.

- `packages/infrastructure/supabase-china/china-medical-materials.repository.ts`
  Reason: persist regular-hospital department image URLs in `departments_info`.

### Follow-up surgeon parity and materials cases fixes

- `packages/domain/src/ports/materials-repository.port.ts`
  Reason: widen the surgeon contract to include v1 profile fields such as education, certifications, intro, expertise, philosophy, and achievements.

- `packages/application/src/use-cases/materials/create-surgeon.use-case.ts`
  Reason: accept and persist the expanded surgeon payload on create.

- `packages/application/src/use-cases/materials/update-surgeon.use-case.ts`
  Reason: accept and persist the expanded surgeon payload on update.

- `apps/api/src/routes/materials.routes.ts`
  Reason: expand the surgeons create/update schemas so the richer v1-style modal fields are accepted by the API.

- `apps/hospital/src/lib/api-types.ts`
  Reason: expose the wider surgeon DTO fields to the hospital frontend.

- `apps/hospital/src/components/materials-tabs.tsx`
  Reason: bring the surgeon edit modal much closer to v1 by restoring repeatable education/certification/achievement sections plus intro/expertise/philosophy editing, and surface explicit query errors for the cases tab.

- `packages/infrastructure/services/materials-compat.ts`
  Reason: centralize compatibility mapping for widened surgeon rows and legacy before/after media shapes, including `mediaItems` and `before_after_image`.

- `packages/infrastructure/__tests__/unit/materials-compat.test.ts`
  Reason: add regression coverage for widened surgeon mapping and legacy before/after media fallback logic.

- `packages/infrastructure/supabase-main/supabase-materials.repository.ts`
  Reason: stop depending on fragile Supabase relation joins for before/after reads, support legacy case media fallback, and keep beauty-hospital cases loading even when only old media shapes exist.

- `packages/infrastructure/supabase-china/china-medical-materials.repository.ts`
  Reason: stop depending on fragile Supabase relation joins for before/after reads, support legacy case media fallback, and keep regular-hospital cases loading even when only old media shapes exist.

- `packages/application/__tests__/materials-surgeon.use-case.test.ts`
  Reason: add regression coverage that the widened surgeon fields actually flow through the application layer.

### Follow-up messages detail fixes

- `packages/domain/src/entities/message.entity.ts`
  Reason: preserve sender role and sender name on message entities so the UI does not have to guess who spoke.

- `packages/application/src/dtos/conversation.dto.ts`
  Reason: expose sender role and sender name on message DTOs.

- `packages/application/src/mappers/conversation.mapper.ts`
  Reason: carry sender role and sender name through DTO mapping while preserving signed attachment URLs.

- `packages/infrastructure/database/repositories/drizzle-message.repository.ts`
  Reason: join the `users` table when reading messages so conversation detail gets the real sender role and sender name for admin, hospital, and patient messages.

- `packages/application/src/use-cases/messages/list-pending-review.use-case.ts`
  Reason: fix a mapper call-site type issue introduced once `toMessageDTO` started accepting signed URL maps.

- `packages/application/__tests__/message-crud.use-case.test.ts`
  Reason: assert that sender role and sender name survive the application layer.

- `apps/hospital/src/components/messages-view.tsx`
  Reason: stop classifying own messages by Keycloak `sub`, show explicit loading/error states for conversation detail, and render sender/recipient alignment from backend sender metadata instead of guessed IDs.

## Verification Run

- `pnpm --filter @medical-crm/application test -- message-crud.use-case.test.ts message-attachments.use-case.test.ts get-hospital-case-detail.use-case.test.ts send-message.use-case.test.ts`
- `pnpm --filter @medical-crm/application test -- materials-surgeon.use-case.test.ts message-crud.use-case.test.ts`
- `pnpm --filter @medical-crm/infrastructure test -- materials-compat.test.ts`
- `pnpm --filter @medical-crm/api test -- messages.routes.test.ts materials.routes.test.ts`
- `pnpm --filter @medical-crm/api typecheck`
- `pnpm --filter @medical-crm/hospital typecheck`
- `pnpm --filter @medical-crm/infrastructure typecheck`

## Notes

- The materials media handling currently persists selected files as `data:` URLs. This is an intentional stopgap so the broken v2 save flow stops dropping media. It should be replaced with a real object-storage / presigned-upload pipeline later.
- This pass focused on the concrete regressions reported in review. It did not attempt a general cleanup of unrelated dirty files already present in the branch.
