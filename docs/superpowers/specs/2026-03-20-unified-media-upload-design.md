# Unified Media Upload Service — Design Spec

## Overview

Replace the current fragmented upload logic (scattered across individual route handlers with direct Supabase adapter calls) with a unified `MediaUploadService` backed by a policy registry and multi-backend storage adapter architecture.

**Phase 1 scope**: Build the unified core and have all existing routes call it. Existing upload endpoints keep their current URLs; new upload-init endpoints are added only for features that currently have none (tickets, FAQ, consultations, materials).

**Phase 2 (future)**: Optionally consolidate into a single `POST /api/v2/media/upload-init` endpoint.

## Problem Statement

1. The current Supabase `documents` bucket is broken — package uploads fail with "The related resource does not exist".
2. Upload logic (sanitize, key generation, MIME validation) is duplicated across `messages.routes.ts`, `packages.routes.ts`, and `upload-document.use-case.ts`.
3. No upload endpoints exist for ticket reply attachments, FAQ attachments, consultation recordings, or materials (materials currently use inline data URLs / external URLs).
4. All CRM media should move to Cloudflare R2 (private bucket). Regular hospital materials should stay on AWS S3 (existing `medchina-cloudfront` bucket with CloudFront CDN).

## Architecture

### Layer Diagram

```
Route Handlers (write path)
  └─ MediaUploadService             ← application layer, unified upload orchestration
       ├─ UploadPolicyRegistry      ← policy lookup by policyId
       └─ StorageAdapterRegistry    ← backend → IStorageService mapping

Existing Mappers / Use Cases (read path)
  └─ RoutedStorageService           ← implements IStorageService, routes by key prefix
       └─ StorageAdapterRegistry    ← same registry, shared

StorageAdapterRegistry
  ├─ R2StorageAdapter               ← IStorageService impl (Cloudflare R2)
  ├─ S3StorageAdapter               ← IStorageService impl (AWS S3 + CloudFront)
  └─ SupabaseStorageAdapter         ← IStorageService impl (legacy read-only)
```

### Separation of Concerns

| Layer | Responsibility | Called By |
|-------|---------------|-----------|
| **MediaUploadService** | Validate → policy lookup → build key → select adapter → presigned upload | Route handlers (write path) |
| **RoutedStorageService** | Route download URL resolution by storageKey prefix | Existing mappers / use cases (read path) |
| **StorageAdapterRegistry** | Adapter registration + transitional routing logic | Both services above |
| **R2 / S3 / Supabase Adapters** | Raw SDK operations against storage backends | Registry |

## Type Definitions

### Feature, PolicyId, Backend, OwnerType

```typescript
type UploadFeature =
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  | 'materials_media';

type UploadPolicyId =
  // CRM media (1:1 with feature)
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  // Beauty hospital materials
  | 'materials_beauty_hospital_image'
  | 'materials_beauty_hospital_video'
  | 'materials_beauty_testimonial_video'
  | 'materials_beauty_surgeon_image'
  | 'materials_beauty_case_media'
  // Regular hospital materials
  | 'materials_regular_hospital_image'
  | 'materials_regular_surgeon_image'
  | 'materials_regular_case_media';

type StorageBackend =
  | 'r2-private'            // medical-crm-media-private — CRM internal media (signed URLs)
  | 'r2-materials-beauty'   // medora-images — beauty hospital materials (public URL via r2.dev)
  | 's3-materials'          // medchina-cloudfront — regular hospital materials (CloudFront URL)
  | 'supabase-legacy';      // legacy read fallback

type UploadOwnerType =
  | 'conversation'
  | 'package'
  | 'case'
  | 'ticket_reply'
  | 'faq'
  | 'hospital_material'
  | 'consultation';
```

### CreateUploadIntentInput

`feature` is NOT an input parameter — it lives only in policy metadata for logging/grouping. `policyId` is the sole selector, always determined server-side.

```typescript
interface CreateUploadIntentInput {
  policyId: UploadPolicyId;
  ownerType: UploadOwnerType;
  ownerId: string;              // may be a draft id (e.g. `draft_{uuid}`) when entity does not exist yet
  fileName: string;
  fileSize: number;
  mimeType: string;
}
```

### Draft Owner Pattern

Some uploads happen before the owning entity exists:

- **package_image**: Upload happens in the package creation form before the package is saved. The route handler generates a `draft_{uuid}` as `ownerId`. After the package is created, the storage key is stored as-is (no move/rename). The draft prefix remains in the key permanently.
- **ticket_reply_attachment**: Upload is scoped to the ticket (the reply does not exist yet at upload time). The route handler uses the **ticket ID** as `ownerId` with `ownerType: 'ticket_reply'`. The resulting storageKey is attached to the reply when it is created.

This means `ownerId` is always the best available scope at upload time, not necessarily the final owning entity's ID.

### UploadIntentResult

```typescript
interface UploadIntentResult {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
  asset: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
  };
}
```

### UploadPolicy

```typescript
interface UploadPolicy {
  policyId: UploadPolicyId;
  feature: UploadFeature;          // metadata only, for logging/grouping
  backend: StorageBackend;
  keyNamespace: string;            // for logging/routing metadata; the actual key structure
                                   // is determined solely by buildStorageKey()
  allowedMimeTypes: string[];
  maxFileSize: number;             // bytes
  buildStorageKey: (input: CreateUploadIntentInput, assetId: string) => string;
}
```

## Policy Registry — All 14 Policies

### CRM Media (6 policies)

| # | policyId | Feature | Backend | Namespace | Max Size | Allowed MIME |
|---|----------|---------|---------|-----------|----------|-------------|
| 1 | `message_attachment` | message_attachment | r2-private | `communications/messages` | 20 MB | image/jpeg, image/png, image/webp, image/gif, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain |
| 2 | `package_image` | package_image | r2-private | `admin/packages` | 10 MB | image/jpeg, image/png, image/webp |
| 3 | `case_document` | case_document | r2-private | `cases/documents` | 25 MB | image/jpeg, image/png, image/webp, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/dicom |
| 4 | `ticket_reply_attachment` | ticket_reply_attachment | r2-private | `admin/tickets` | 20 MB | image/jpeg, image/png, image/webp, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain |
| 5 | `faq_attachment` | faq_attachment | r2-private | `admin/chatbot-faqs` | 10 MB | image/jpeg, image/png, image/webp, application/pdf |
| 6 | `consultation_recording` | consultation_recording | r2-private | `cases/consultations` | 500 MB | video/mp4, video/webm, audio/mp4, audio/webm |

### Beauty Hospital Materials (5 policies)

| # | policyId | Backend | Namespace | Max Size | Allowed MIME |
|---|----------|---------|-----------|----------|-------------|
| 7 | `materials_beauty_hospital_image` | r2-materials-beauty | `materials-beauty/hospital-image` | 10 MB | image/jpeg, image/png, image/webp |
| 8 | `materials_beauty_hospital_video` | r2-materials-beauty | `materials-beauty/hospital-video` | 200 MB | video/mp4, video/webm |
| 9 | `materials_beauty_testimonial_video` | r2-materials-beauty | `materials-beauty/testimonial-video` | 200 MB | video/mp4, video/webm |
| 10 | `materials_beauty_surgeon_image` | r2-materials-beauty | `materials-beauty/surgeon-image` | 10 MB | image/jpeg, image/png, image/webp |
| 11 | `materials_beauty_case_media` | r2-materials-beauty | `materials-beauty/case-media` | 50 MB | image/jpeg, image/png, image/webp, video/mp4 |

### Regular Hospital Materials (3 policies)

| # | policyId | Backend | Namespace | Max Size | Allowed MIME |
|---|----------|---------|-----------|----------|-------------|
| 12 | `materials_regular_hospital_image` | s3-materials | `materials-regular/hospital-image` | 10 MB | image/jpeg, image/png, image/webp |
| 13 | `materials_regular_surgeon_image` | s3-materials | `materials-regular/surgeon-image` | 10 MB | image/jpeg, image/png, image/webp |
| 14 | `materials_regular_case_media` | s3-materials | `materials-regular/case-media` | 50 MB | image/jpeg, image/png, image/webp, video/mp4 |

### Storage Key Format

All keys follow: `crm/{env}/{domain}/{ownerId}/{assetId}/{sanitizedFileName}`

Examples:
```
crm/dev/communications/messages/conv_abc/ast_123/report.pdf
crm/dev/admin/packages/pkg_abc/ast_123/cover.jpg
crm/dev/cases/documents/case_abc/ast_123/xray.jpg
crm/dev/admin/tickets/tkt_abc/ast_123/screenshot.png
crm/dev/admin/chatbot-faqs/faq_abc/ast_123/visa-guide.pdf
crm/dev/cases/consultations/consult_abc/ast_123/recording.mp4
crm/dev/materials-beauty/surgeon-image/hosp_abc/ast_123/dr-wang.jpg
crm/dev/materials-regular/case-media/hosp_abc/ast_123/before.jpg
```

## Storage Adapters

### R2StorageAdapter (CRM private media)

- **SDK**: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2 is S3-compatible)
- **Endpoint**: `https://{accountId}.r2.cloudflarestorage.com`
- **Region**: `auto`
- **Bucket**: `medical-crm-media-private` (from `R2_BUCKET_NAME`)
- **Upload URL TTL**: 600 seconds (10 minutes)
- **Download URL TTL**: 3600 seconds (1 hour, signed URLs)
- **Used by**: `r2-private` backend — all CRM media (messages, packages, tickets, FAQ, case documents, consultations)

### R2StorageAdapter (beauty materials — separate instance, same class)

- **Same SDK and adapter class** as above, but pointing to a different bucket
- **Bucket**: `medora-images` (from `R2_MATERIALS_BEAUTY_BUCKET_NAME`)
- **Same R2 account + credentials** as CRM private bucket
- **Upload URL TTL**: 600 seconds (presigned PUT)
- **Download URL behavior**: Returns public R2.dev URL (`https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev/{key}`), NOT a signed URL. The `medora-images` bucket has public access enabled because these assets are consumed by the Medora Beauty public website.
- **Used by**: `r2-materials-beauty` backend — all 5 beauty hospital materials policies

**Important distinction**: CRM's own media (`medical-crm-media-private`) is private with signed URLs. Beauty hospital materials (`medora-images`) are public because they serve the consumer-facing Medora Beauty website. These are two different R2 buckets under the same Cloudflare account.

### S3StorageAdapter

- **SDK**: Same as R2 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
- **Bucket**: `medchina-cloudfront` (from `AWS_S3_BUCKET`, v1 legacy)
- **Region**: `eu-west-1` (from `AWS_REGION`)
- **CloudFront**: `https://d1wwcixye6at8o.cloudfront.net` (from `AWS_CLOUDFRONT_URL`)
- **Upload URL TTL**: 3600 seconds
- **CacheControl**: `public, max-age=31536000` (1 year, matching v1)
- **Download URL behavior**: If CloudFront URL is configured, `getSignedUrl()` returns a public CloudFront URL (`${cloudfrontUrl}/${key}`) instead of a presigned S3 URL. Callers should treat `getSignedUrl()` as a "download URL resolver", not assume the result is a temporary signed URL.

### SupabaseStorageAdapter

Existing implementation, unchanged. Used only for legacy key reads (`documents/*`, `messages/*`, `packages/*`).

### IStorageService — Interface Unchanged, PresignedUploadResult Updated

The `IStorageService` method signatures stay the same. However, `PresignedUploadResult` must be updated to make Supabase-specific fields optional, since R2 and S3 adapters have no meaningful values for them:

```typescript
export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  path?: string;      // Supabase-specific, optional for R2/S3
  token?: string;     // Supabase-specific, optional for R2/S3
  expiresIn: number;
}

export interface IStorageService {
  createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult>;

  /**
   * Returns a download URL for the given storage key.
   * May return a signed temporary URL (R2, Supabase) or
   * a controlled public URL (CloudFront-backed S3).
   * Callers should treat the result as an opaque download URL
   * with no assumption about expiry semantics.
   */
  getSignedUrl(key: string): Promise<string>;
  getSignedUrls(keys: string[]): Promise<Record<string, string>>;
}
```

Existing code that reads `path` and `token` from PresignedUploadResult must be checked and updated to handle `undefined`. The SupabaseStorageAdapter continues to return these fields.

## RoutedStorageService

Implements `IStorageService`. Injected as `storageService` in composition root, replacing the direct `supabaseLegacyAdapter` injection. Existing read code (message mapper, document mapper, etc.) requires zero changes.

### Write: Blocked

```typescript
async createPresignedUpload(): Promise<never> {
  throw new Error(
    'RoutedStorageService does not support direct uploads. Use MediaUploadService.createUploadIntent() instead.'
  );
}
```

### Read: Routed by Key Prefix

```typescript
resolveForDownload(storageKey: string): IStorageService {
  if (storageKey.startsWith('crm/')) {
    if (storageKey.includes('/materials-beauty/')) return this.get('r2-materials-beauty');
    if (storageKey.includes('/materials-regular/')) return this.get('s3-materials');
    return this.get('r2-private');
  }
  if (storageKey.startsWith('hospital_photos/')) {
    return this.get('s3-materials');  // v1 regular materials legacy (S3/CloudFront)
  }
  // documents/*, messages/*, packages/* → supabase legacy
  return this.legacyAdapter;
}
```

**Note**: This is a transitional rule, not the final design. Long-term, asset metadata should explicitly store the backend/provider. But for migration period, prefix-based routing is acceptable.

### Batch Download: Grouped by Backend

`getSignedUrls()` groups keys by resolved adapter and batches calls per backend to avoid N+1 issues.

## MediaUploadService

### createUploadIntent Flow

1. Look up policy by `policyId` from `UploadPolicyRegistry`
2. Validate `mimeType` against `policy.allowedMimeTypes` → throw `ValidationError` if rejected
3. Validate `fileSize` against `policy.maxFileSize` → throw `ValidationError` if exceeds
4. Sanitize `fileName` (remove special chars, normalize)
5. Generate `assetId` via `crypto.randomUUID()`
6. Build `storageKey` via `policy.buildStorageKey(input, assetId)`
7. Resolve adapter via `storageAdapterRegistry.get(policy.backend)`
8. Call `adapter.createPresignedUpload(storageKey, mimeType)`
9. Return `UploadIntentResult`

### getSignedDownloadUrl / getSignedDownloadUrls

Delegate to `storageAdapterRegistry.resolveForDownload()`.

## Route Changes (Phase 1: Existing URLs Unchanged, New Endpoints Added)

### Existing Routes — Refactored Internals

| Route | Change | Detail |
|-------|--------|--------|
| `POST /conversations/{id}/attachments/upload` | Rewrite internals | Delete manual sanitize/key logic, call `mediaUploadService.createUploadIntent({ policyId: 'message_attachment', ... })` |
| `POST /packages/images/upload-init` | Rewrite internals | `policyId: 'package_image'`, `ownerId: draft_{uuid}` generated by route (no package ID exists yet at upload time) |
| `POST /cases/{caseId}/documents` | Rewrite upload part of use case | See UploadDocumentUseCase refactor note below |

**Atomic swap requirement**: The `RoutedStorageService` blocks `createPresignedUpload()`. Therefore, all three route refactors above MUST be completed in the same task as the composition root swap from `supabaseLegacyAdapter` → `routedStorageService`. If any route still calls `storageService.createPresignedUpload()` after the swap, it will throw at runtime.

**UploadDocumentUseCase refactor**: This use case currently takes `IStorageService` as a constructor dependency and calls `createPresignedUpload()` internally, returning `{ upload: PresignedUploadResult; documentId: string }`. The refactor approach: the route handler calls `mediaUploadService.createUploadIntent()` to get the presigned URL, then calls the use case with the resulting `storageKey` for entity save + case progress. The use case's constructor dependency on `IStorageService` is removed, `storageKey` becomes an input field, and the return type changes to `{ documentId: string }`. The route handler composes the final response:

```typescript
// documents.routes.ts after refactor
const uploadResult = await mediaUploadService.createUploadIntent({
  policyId: 'case_document', ownerType: 'case', ownerId: caseId, ...body,
});
const { documentId } = await uploadDocumentUseCase.execute({
  ...input, storageKey: uploadResult.storageKey,
});
return c.json({
  upload: { uploadUrl: uploadResult.uploadUrl, storageKey: uploadResult.storageKey, expiresIn: uploadResult.expiresIn },
  asset: uploadResult.asset,
  documentId,
});
```

### New Endpoints

| Route | Purpose | policyId Selection |
|-------|---------|-------------------|
| `POST /tickets/{id}/attachments/upload` | Ticket attachment upload (scoped to ticket, attached to reply later) | `policyId: 'ticket_reply_attachment'`, `ownerType: 'ticket_reply'`, `ownerId: ticketId` (reply does not exist yet at upload time; storageKey is passed to reply-to-ticket use case when creating the reply) |
| `POST /chatbot/faqs/{id}/attachments/upload` | FAQ attachment upload | `policyId: 'faq_attachment'` (hardcoded) |
| `POST /consultations/{id}/recording/upload` | Consultation recording upload | `policyId: 'consultation_recording'` (hardcoded) |
| `POST /hospitals/{hospitalId}/materials/upload` | Materials media upload | `policyId` resolved server-side from hospitalType + materialKind |

### policyId Is Always Server-Selected

For non-materials routes, `policyId` is hardcoded by the endpoint — the client has no say.

For materials, the client sends only `materialKind` (e.g., `'surgeon'`, `'case'`, `'hero'`, `'gallery'`, `'testimonial_video'`). The route handler resolves `hospitalType` from the server, then maps `(hospitalType, materialKind)` → `policyId`:

```typescript
function resolveMaterialsPolicyId(
  hospitalType: 'COSMETIC' | 'REGULAR',
  materialKind: string,
): UploadPolicyId {
  const map: Record<string, Record<string, UploadPolicyId>> = {
    COSMETIC: {
      hero: 'materials_beauty_hospital_image',
      gallery: 'materials_beauty_hospital_image',
      equipment: 'materials_beauty_hospital_image',
      hospital_video: 'materials_beauty_hospital_video',
      testimonial_video: 'materials_beauty_testimonial_video',
      surgeon: 'materials_beauty_surgeon_image',
      case: 'materials_beauty_case_media',
    },
    REGULAR: {
      hero: 'materials_regular_hospital_image',
      gallery: 'materials_regular_hospital_image',
      equipment: 'materials_regular_hospital_image',
      surgeon: 'materials_regular_surgeon_image',
      case: 'materials_regular_case_media',
      // Note: regular hospitals do not currently have hospital_video or
      // testimonial_video material kinds. If requested, these policies
      // must be added to the registry with s3-materials backend.
    },
  };
  const policyId = map[hospitalType]?.[materialKind];
  if (!policyId) throw new ValidationError(`Unknown materialKind: ${materialKind}`);
  return policyId;
}
```

### Unified Response Shape

All upload-init endpoints return:

```json
{
  "upload": {
    "uploadUrl": "https://...",
    "storageKey": "crm/dev/...",
    "expiresIn": 600
  },
  "asset": {
    "fileName": "cover.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 245123,
    "storageKey": "crm/dev/..."
  }
}
```

## Schema / Migration Changes

### FAQ: Add attachments field

Migration file: `packages/infrastructure/database/migrations/0XX_faq_attachments.sql`

```sql
ALTER TABLE chatbot_faq_items ADD COLUMN attachments JSONB DEFAULT '[]';
```

Required code changes for FAQ attachments:
1. **Drizzle schema** (`schema.ts`): Add `attachments: jsonb('attachments').default([])` to `chatbotFaqItems` table
2. **Domain entity** (`chatbot-faq-item.entity.ts`): Add `attachments` property (type: `Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }>`)
3. **Repository** (`drizzle-chatbot-faq.repository.ts`): Map `attachments` JSONB column to/from entity
4. **DTO** (`chatbot-faq.dto.ts`): Add `attachments` field with resolved download URLs
5. **Mapper** (`chatbot-faq.mapper.ts`): Resolve storageKeys to download URLs via `storageService`

### No other schema changes required

- Messages: `attachments` JSONB already exists
- Tickets: `support_ticket_replies.attachments` JSONB already exists
- Documents: `documents.storageKey` already exists
- Consultations: `consultations.videoStorageKey` already exists
- Materials: store storageKey in existing image/URL fields (no schema change, just data format change)

## Environment Variables

### R2 — Required

```env
R2_ACCOUNT_ID=82cdbf36c265c0d9e4b4e1c6100c26d7
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=medical-crm-media-private
R2_MATERIALS_BEAUTY_BUCKET_NAME=medora-images
R2_MATERIALS_BEAUTY_PUBLIC_URL=https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev
```

### AWS S3 — Required (legacy regular hospital materials reads depend on s3-materials adapter)

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-west-1
AWS_S3_BUCKET=medchina-cloudfront
AWS_CLOUDFRONT_URL=https://d1wwcixye6at8o.cloudfront.net
```

### env.ts Changes

Note: `R2_ACCOUNT_ID` already exists in `env.ts` (currently optional). The `.env` file has `CLOUDFLARE_ACCOUNT_ID` which must be renamed to `R2_ACCOUNT_ID` to match. This is a `.env` file change only — the code already uses `R2_ACCOUNT_ID`.

For test environments that do not have R2 credentials, tests should mock `IStorageService` / `MediaUploadService` (as they already do for the existing `storageService`). The API server will fail to start without R2 credentials, which is intentional — uploads are a core feature.

```typescript
// R2 — required (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY exist as optional; R2_BUCKET_NAME is new)
R2_ACCOUNT_ID: z.string().min(1),
R2_ACCESS_KEY_ID: z.string().min(1),
R2_SECRET_ACCESS_KEY: z.string().min(1),
R2_BUCKET_NAME: z.string().min(1),
R2_MATERIALS_BEAUTY_BUCKET_NAME: z.string().min(1),
R2_MATERIALS_BEAUTY_PUBLIC_URL: z.string().url(),

// S3 — required (legacy regular hospital materials reads depend on it)
AWS_ACCESS_KEY_ID: z.string().min(1),
AWS_SECRET_ACCESS_KEY: z.string().min(1),
AWS_REGION: z.string().default('eu-west-1'),
AWS_S3_BUCKET: z.string().default('medchina-cloudfront'),
AWS_CLOUDFRONT_URL: z.string().url().optional(),
```

### .env Change

Rename `CLOUDFLARE_ACCOUNT_ID` → `R2_ACCOUNT_ID`. All references in env.ts, composition root, and documentation must use `R2_ACCOUNT_ID`.

## Composition Root

```typescript
// 1. Storage Adapters

// CRM private media (signed URLs)
const r2Adapter = new R2StorageAdapter({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  bucketName: env.R2_BUCKET_NAME,
});

// Beauty hospital materials — same R2 account, different bucket, public URL
const r2MaterialsBeautyAdapter = new R2StorageAdapter({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  bucketName: env.R2_MATERIALS_BEAUTY_BUCKET_NAME,
  publicUrl: env.R2_MATERIALS_BEAUTY_PUBLIC_URL,  // https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev
});

// Regular hospital materials (S3 + CloudFront)
const s3Adapter = new S3StorageAdapter({
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  bucketName: env.AWS_S3_BUCKET,
  cloudfrontUrl: env.AWS_CLOUDFRONT_URL,
});

const supabaseLegacyAdapter = new SupabaseStorageAdapter(mainSupabase);

// 2. Adapter Registry
const storageAdapterRegistry = new StorageAdapterRegistry(
  {
    'r2-private': r2Adapter,
    'r2-materials-beauty': r2MaterialsBeautyAdapter,
    's3-materials': s3Adapter,
    'supabase-legacy': supabaseLegacyAdapter,
  },
  supabaseLegacyAdapter,
);

// 3. Routed Storage Service (replaces direct supabase injection)
const routedStorageService = new RoutedStorageService(storageAdapterRegistry);

// 4. Upload Policy Registry
const uploadPolicyRegistry = new UploadPolicyRegistry([
  messageAttachmentPolicy,
  packageImagePolicy,
  caseDocumentPolicy,
  ticketReplyAttachmentPolicy,
  faqAttachmentPolicy,
  consultationRecordingPolicy,
  ...materialsBeautyPolicies,
  ...(s3Adapter ? materialsRegularPolicies : []),
]);

// 5. MediaUploadService
const mediaUploadService = new MediaUploadService(
  uploadPolicyRegistry,
  storageAdapterRegistry,
);

// 6. Inject
const services = {
  // existing use cases ...
  mediaUpload: mediaUploadService,
  storageService: routedStorageService,  // replaces supabaseLegacyAdapter
};
```

## New Dependencies

`packages/infrastructure/package.json`:
```json
{
  "@aws-sdk/client-s3": "^3.985.0",
  "@aws-sdk/s3-request-presigner": "^3.985.0"
}
```

## File Structure

```
packages/infrastructure/storage/
  ├── supabase-storage.adapter.ts          ← existing, legacy read only
  ├── r2-storage.adapter.ts                ← new
  ├── s3-storage.adapter.ts                ← new
  ├── storage-adapter-registry.ts          ← new
  └── routed-storage.service.ts            ← new

packages/application/src/
  ├── services/
  │   └── media-upload.service.ts          ← new
  └── upload-policies/
      ├── types.ts                         ← all type definitions
      ├── registry.ts                      ← UploadPolicyRegistry
      ├── policy-resolver.ts               ← resolveMaterialsPolicyId() helper
      ├── message-attachment.policy.ts
      ├── package-image.policy.ts
      ├── case-document.policy.ts
      ├── ticket-reply-attachment.policy.ts
      ├── faq-attachment.policy.ts
      ├── consultation-recording.policy.ts
      ├── materials-beauty.policies.ts     ← 5 policies
      └── materials-regular.policies.ts    ← 3 policies

packages/shared/config/src/
  └── env.ts                               ← R2 required + AWS optional
```

## Security Rules

1. No browser-side bucket credentials.
2. No client-chosen storage paths — server generates all keys.
3. No client-chosen policyId — server resolves policy from endpoint context.
4. No public bucket for messages, tickets, case documents, or FAQ attachments.
5. All uploads go through server-controlled upload-init routes.
6. File MIME type and size validated server-side before upload intent is granted.
7. Signed upload URLs are short-lived (10 min for R2, 60 min for S3).
8. Signed download URLs are short-lived (60 min) for private content.
9. Object keys are immutable — replacing an asset creates a new key.
10. Original filenames are never used as the path (only as a readable suffix after UUID).
11. File names are sanitized before inclusion in storage key.
12. Canonical MIME type, size, and storageKey are stored alongside every asset reference in the database.

## Post-Upload Association Notes

### Consultation Recordings

The `consultations` table has `videoStorageKey`, `videoSize`, `videoDuration`, `videoThumbnail`, `videoUploadedAt` fields. After the client uploads via the new endpoint, a separate `PATCH /consultations/{id}` or dedicated finalize endpoint must associate the storageKey with the consultation entity. This post-upload logic is out of scope for the upload service itself but must be implemented in the consultation use case layer.

### Materials

After the client uploads to R2/S3 via the materials upload endpoint, the existing materials CRUD routes (`POST/PUT /hospitals/{hospitalId}/materials/surgeons`, etc.) must be updated to accept `storageKey` references instead of raw URL strings. The read path (mapper) must resolve storageKeys to download URLs via `storageService.getSignedUrl()`.

## Test Strategy

- **Unit tests**: Mock `IStorageService` adapters in `MediaUploadService` and `RoutedStorageService` tests. Test policy validation (MIME, size), key generation, adapter routing.
- **Policy tests**: Each policy's `buildStorageKey` function tested independently.
- **Route tests**: Existing pattern — mock services container, test request/response shapes.
- **No integration tests against live R2/S3** in CI. Live storage tested manually or via separate e2e suite.
