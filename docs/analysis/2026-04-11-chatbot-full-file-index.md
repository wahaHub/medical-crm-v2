# Chatbot Full File Index

## Purpose

This file is a broader file index for the current chatbot codebase footprint.

Unlike the two inventory documents:

- `2026-04-11-chatbot-v1-reuse-inventory.md`
- `2026-04-11-chatbot-v2-implemented-inventory.md`

this document aims to answer a narrower question:

"Which files currently belong to chatbot v1, chatbot v2, bridge layers, FAQ knowledge, Dify config, and frontend rendering?"

It is still implementation-focused. It intentionally excludes most planning/spec docs.

## Reading Guide

- `v1`: legacy chatbot runtime, contracts, or UI still actively used
- `v2`: new journey/resource/classifier architecture
- `bridge`: files that currently connect v1 response behavior with v2 context
- `faq`: FAQ corpus / admin / retrieval stack reused by both eras
- `tests`: tests that lock current behavior

## CRM Backend

### Runtime Routes

#### v1 + bridge

- `apps/api/src/routes/chatbot.routes.ts`
- `apps/api/src/routes/chatbot-block-builder.ts`
- `apps/api/src/routes/patient-widget-starter.ts`
- `apps/api/src/routes/internal.routes.ts`

#### v1

- `apps/api/src/routes/chatbot-faq.routes.ts`
- `apps/api/src/routes/internal-faq-eval.routes.ts`

#### v2

- `apps/api/src/routes/chatbot-v2-context.ts`
- `apps/api/src/routes/chatbot-v2-faq-grounding.ts`

### Composition And Infrastructure Wiring

#### v2 + bridge

- `apps/api/src/composition-root.ts`
- `packages/infrastructure/services/dify-api-client.service.ts`

### Dify Workflow Config

#### v1

- `dify-config/medora-ai-chatbot-v1.dsl.yml`

#### v2

- `dify-config/medora-ai-chatbot-v2.dsl.yml`
- `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`
- `dify-config/medora-ai-chatbot-v2-faq-grounding.dsl.yml`

### Shared Validation

#### v1

- `packages/shared/validation/src/chatbot.schema.ts`
- `packages/shared/validation/src/chatbot-faq.schema.ts`

#### v2

- `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`

### Shared Utils

#### v1 / semantics bridge

- `packages/shared/utils/src/chatbot-semantics.ts`

### V2 Application Services

#### v2

- `packages/application/src/services/chatbot-v2/types.ts`
- `packages/application/src/services/chatbot-v2/journey-truth.service.ts`
- `packages/application/src/services/chatbot-v2/journey-engine.service.ts`
- `packages/application/src/services/chatbot-v2/resource-registry.service.ts`
- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
- `packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts`

#### transitional compatibility

- `packages/application/src/services/chatbot-v2/request-classifier.service.ts`

#### supporting FAQ / workflow helpers

- `packages/application/src/upload-policies/faq-attachment.policy.ts`

### FAQ Domain / DTO / Mapper / Upload / Repository

#### faq

- `packages/domain/src/entities/chatbot-faq-item.entity.ts`
- `packages/domain/src/ports/chatbot-faq-repository.port.ts`
- `packages/application/src/dtos/chatbot-faq.dto.ts`
- `packages/application/src/mappers/chatbot-faq.mapper.ts`
- `packages/application/src/upload-policies/chatbot-request-docs.policy.ts`
- `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts`

### FAQ Use Cases

#### faq

- `packages/application/src/use-cases/chatbot-faq/create-faq-item.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/update-faq-item.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/get-faq-item.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/delete-faq-item.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/list-faq-items.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/create-faq-category.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/delete-faq-category.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/list-faq-categories.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.ts`
- `packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.ts`

### Admin / Hospital FAQ Surfaces

#### faq

- `apps/admin/src/actions/chatbot-faq-actions.ts`
- `apps/admin/src/actions/faq-upload-actions.ts`
- `apps/admin/src/queries/use-chatbot-faq.ts`
- `apps/admin/src/components/chatbot-faq-form-modal.tsx`
- `apps/admin/src/components/chatbot-faq-list.tsx`
- `apps/admin/src/app/(portal)/chatbot/page.tsx`
- `apps/admin/src/app/api/chatbot/analytics/route.ts`
- `apps/admin/src/app/api/chatbot/faqs/route.ts`
- `apps/admin/src/app/api/chatbot/faqs/[id]/route.ts`
- `apps/admin/src/app/api/chatbot/faqs/categories/route.ts`
- `apps/hospital/src/actions/faq-actions.ts`
- `apps/hospital/src/actions/faq-upload-actions.ts`
- `apps/hospital/src/queries/use-faqs.ts`
- `apps/hospital/src/components/faq-list.tsx`
- `apps/hospital/src/app/(portal)/faq/page.tsx`
- `apps/hospital/src/app/api/chatbot-faq/route.ts`
- `apps/hospital/src/app/api/chatbot-faq/categories/route.ts`

### Dify Seed Knowledge

#### faq / reference content

- `dify-config/seed-knowledge/README.md`
- `dify-config/seed-knowledge/faq-cosmetic/consultation-process.md`
- `dify-config/seed-knowledge/faq-cosmetic/documents.md`
- `dify-config/seed-knowledge/faq-cosmetic/recovery.md`
- `dify-config/seed-knowledge/faq-regular/consultation-process.md`
- `dify-config/seed-knowledge/faq-regular/documents.md`
- `dify-config/seed-knowledge/packages/package-basics.md`

### Database Migrations

#### faq

- `packages/infrastructure/database/migrations/014_chatbot_faq_items.sql`
- `packages/infrastructure/database/migrations/018_hospital_portal_email_templates_and_faq_scope.sql`
- `packages/infrastructure/database/migrations/017_chatbot_faq_single_language_and_hospital_type.sql`
- `packages/infrastructure/database/migrations/019_chatbot_faq_categories.sql`
- `packages/infrastructure/database/migrations/020_faq_attachments.sql`
- `packages/infrastructure/database/migrations/023_faq_categories_hospital_id.sql`

#### chatbot state cleanup / v2-adjacent

- `packages/infrastructure/database/migrations/029_chatbot_state_truth_consolidation.sql`

## CRM Tests

### Route / Workflow Tests

#### v1 + bridge

- `apps/api/src/__tests__/chatbot.routes.test.ts`
- `apps/api/src/__tests__/chatbot.routes.integration.test.ts`
- `apps/api/src/__tests__/chatbot.mounting.test.ts`
- `apps/api/src/__tests__/chatbot-faq.routes.test.ts`
- `apps/api/src/__tests__/internal.routes.test.ts`
- `apps/api/src/__tests__/internal.faq-categories.test.ts`
- `apps/api/src/__tests__/internal.faq-eval.routes.test.ts`
- `apps/api/src/__tests__/internal-faq-eval.routes.test.ts`

#### v2

- `apps/api/src/__tests__/chatbot-v2-context.test.ts`
- `apps/api/src/__tests__/chatbot-v2-faq-grounding.test.ts`
- `apps/api/src/__tests__/dify-workflow-v2.contract.test.ts`
- `apps/api/src/__tests__/dify-classifier-v2.contract.test.ts`
- `apps/api/src/__tests__/dify-faq-grounding-v2.contract.test.ts`

#### bridge

- `apps/api/src/__tests__/patient-public.routes.test.ts`
- `apps/api/src/__tests__/patient-auth.routes.test.ts`
- `apps/api/src/__tests__/composition-root.test.ts`

### Shared Validation Tests

#### v1

- `packages/shared/validation/src/__tests__/chatbot.schema.test.ts`

#### v2

- `packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts`

### Application Service Tests

#### v2

- `packages/application/src/services/__tests__/chatbot-v2/journey-engine.service.test.ts`
- `packages/application/src/services/__tests__/chatbot-v2/resource-registry.service.test.ts`
- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
- `packages/application/src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts`

#### transitional compatibility

- `packages/application/src/services/__tests__/chatbot-v2/request-classifier.service.test.ts`

### Infrastructure Tests

#### v2 + bridge

- `packages/infrastructure/__tests__/unit/dify-api-client.service.test.ts`

### FAQ Use Case Tests

#### faq

- `packages/application/src/use-cases/chatbot-faq/import-faq-seed.use-case.test.ts`
- `packages/application/src/use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.test.ts`
- `packages/application/src/use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.test.ts`

## China Frontend

### API And State

#### bridge

- `src/services/api/patient-chatbot.ts`
- `src/services/api/patient-entry.ts`
- `src/types/patient-entry.ts`
- `src/services/storage/patient-entry-storage.ts`
- `src/contexts/PatientEntryContext.tsx`
- `src/hooks/usePatientEntry.ts`

#### legacy/v1 block contract

- `src/types/chatbot-blocks.ts`

### Chat Widget / Mixed-Mode UI

#### bridge

- `src/components/chat/ChatWidget.tsx`
- `src/components/chat/PatientEntryWindow.tsx`
- `src/components/chat/PatientChatMessageList.tsx`
- `src/components/chat/PatientChatComposer.tsx`
- `src/components/chat/PatientProfileForm.tsx`
- `src/components/chat/PatientQuestionnaireModal.tsx`
- `src/components/chat/PatientMedicalFormModal.tsx`
- `src/components/chat/ChatMessageBlocks.tsx`

#### v1 rich blocks

- `src/components/chat/blocks/ProcessModalTrigger.tsx`
- `src/components/chat/blocks/QuestionnaireModalTrigger.tsx`
- `src/components/chat/blocks/HospitalRecommendationCards.tsx`
- `src/components/chat/blocks/OnlineConsultBookingCard.tsx`

### V2 Frontend Resource Scaffolding

#### v2

- `src/components/chat-v2/ChatV2MessageResources.tsx`
- `src/components/chat-v2/resources/types.ts`
- `src/components/chat-v2/resources/registry.tsx`

## China Frontend Tests

### API / Storage Tests

#### bridge

- `src/services/api/__tests__/patient-chatbot.test.ts`
- `src/services/api/__tests__/patient-entry.test.ts`
- `src/services/storage/__tests__/patient-entry-storage.test.ts`
- `src/contexts/__tests__/PatientEntryContext.actions.test.tsx`
- `src/contexts/__tests__/PatientEntryContext.bootstrap.test.tsx`

### Mixed-Mode Chat UI Tests

#### v1 + bridge

- `src/components/chat/__tests__/PatientChatComposer.attachments.test.tsx`
- `src/components/chat/__tests__/HospitalRecommendationCards.test.tsx`
- `src/components/chat/__tests__/PatientEntryWindow.rich-blocks.test.tsx`
- `src/components/chat/__tests__/PatientProfileForm.test.tsx`
- `src/components/chat/__tests__/PatientQuestionnaireModal.test.tsx`
- `src/components/chat/__tests__/PatientChatMessageList.rich-blocks.test.tsx`
- `src/components/chat/__tests__/PatientMedicalFormModal.test.tsx`
- `src/components/chat/__tests__/ChatMessageBlockActions.test.tsx`
- `src/components/chat/__tests__/ChatMessageTriggers.test.tsx`
- `src/components/chat/__tests__/OnlineConsultBookingCard.test.tsx`
- `src/components/chat/__tests__/OnlineConsultBookingCard.contract.test.tsx`

### V2 Frontend Tests

#### v2

- `src/components/chat-v2/resources/__tests__/registry.test.tsx`

## Notes

- The two earlier inventory documents were intentionally selective. They do not enumerate every file above.
- This file is closer to a full implementation footprint for the current chatbot stack.
- Some files above are not purely v1 or purely v2. Those are marked as `bridge`.
- commit `6c16641` (`Add chatbot v2 FAQ grounding workflow`) is the main milestone that added the dedicated v2 FAQ grounding files listed above.
- If you want, the next useful follow-up is a fourth document that labels each file as:
  - keep as-is
  - migrate in place
  - delete after rollout
  - replace fully
