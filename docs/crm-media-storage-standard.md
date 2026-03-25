# CRM Media Storage Standard

## Purpose

This document defines the storage standard for CRM-owned uploads in `medical-crm-v2`.

Covered features:

- Package images
- Support ticket reply attachments
- Chatbot FAQ attachments
- Message attachments
- Case-related documents, with stricter private handling rules

Important distinction:

- package / FAQ / message / support assets are CRM media
- case-related documents are more sensitive and must stay private at all times

This document covers both, but case-related documents have stricter rules than general CRM media.

## Current Problem

The current v2 package upload path goes through [`packages/infrastructure/storage/supabase-storage.adapter.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/storage/supabase-storage.adapter.ts) and signs uploads against the Supabase bucket `documents`.

Your observed failure:

```text
Failed to create presigned upload: The related resource does not exist
```

This means the target storage bucket does not exist in the Supabase project currently used by the API storage adapter, or the adapter is pointing at the wrong storage backend for this use case.

For package images, support ticket attachments, FAQ assets, message attachments, and case documents, R2 is a better fit than the current Supabase `documents` bucket.

## Current v2 Case Document State

Case-related documents in v2 are currently not on a separate secure document storage design.

Today they also flow through the same storage abstraction:

- upload route: [`documents.routes.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/documents.routes.ts)
- use case: [`upload-document.use-case.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/documents/upload-document.use-case.ts)
- storage adapter: [`supabase-storage.adapter.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/infrastructure/storage/supabase-storage.adapter.ts)

The current storage key pattern is:

```text
documents/{caseId}/{docId}/{fileName}
```

So the current v2 reality is:

- case documents are stored through the same adapter family as other uploads
- they are not yet separated into a stricter private R2 model
- they should be moved to private R2 as part of the storage cleanup

## What CRM v1 Used

CRM v1 had multiple storage paths:

- R2 public image upload route default bucket: `medora-images`
  - Source: [`medical-crm/app/api/r2/upload/route.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm/app/api/r2/upload/route.ts)
- General R2 helper default bucket: `medical-crm-documents`
  - Source: [`medical-crm/server/lib/r2.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm/server/lib/r2.ts)
- Supabase Storage helper bucket: `medical-documents`
  - Source: [`medical-crm/server/lib/supabase-storage.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm/server/lib/supabase-storage.ts)

We should not copy v1's unsafe upload flow directly, but the v1 review is still useful for:

- understanding historical bucket names
- understanding file path conventions
- avoiding accidental bucket sprawl

## Decision

For v2 CRM media uploads, use Cloudflare R2, not the current Supabase `documents` bucket.

Recommended storage layout:

- One private bucket for CRM media:
  - `medical-crm-media-private`
- Optional later:
  - one public CDN-backed bucket for curated published assets only
- Optional later:
  - one separate sensitive-doc bucket for high-sensitivity medical files

For the first implementation, private-only is the correct default.

Reasoning:

- support ticket attachments must not be public by default
- message attachments must not be public by default
- case documents must never be public
- FAQ assets should stay controlled until rendering rules are mature
- package images can still be served through signed URLs or a later controlled publish step
- one private bucket with strict path prefixes is simpler and safer than mixing public/private uploads now

For case documents, the recommended rule is:

- private bucket only
- signed upload only
- signed download only
- no public URL
- no public custom domain

## Unified Uploader Architecture

We should not build a separate uploader implementation for every feature.

That would create repeated bugs, repeated security mistakes, and inconsistent behavior across:

- messages
- packages
- chatbot FAQ
- support tickets
- hospital materials
- consultations recordings
- case images
- case documents

The correct direction is:

- one shared uploader core
- multiple feature-specific policies

In other words:

- do not build one uploader per feature
- do build one upload framework with pluggable routing and validation

## Recommended Design

Use a shared upload service with three layers.

Recommended naming:

- high-level application service: `MediaUploadService`
- low-level backend adapter contract: `IStorageService`

### 1. Shared uploader core

This layer is common to all upload flows.

Responsibilities:

- validate requested upload intent
- validate MIME type and file size
- generate canonical storage key
- choose storage backend
- generate signed upload URL
- return normalized upload metadata
- support retry-safe behavior for upload init
- centralize logging and audit hooks

This is where common logic should live:

- file name sanitization
- allowed MIME checks
- size limit checks
- short-lived signed URL generation
- object key generation
- retry policy for transient storage errors
- error normalization

This layer should live above the raw storage adapter.

It should orchestrate policy selection and call the storage adapter internally.

### 2. Storage backend adapters

This layer hides backend differences.

Examples:

- R2 private adapter
- R2 public-publish adapter, later
- S3 adapter for regular hospital materials

This lets application code avoid caring about raw SDK details.

This is where the current `IStorageService` belongs.

### 3. Feature policies

Each feature should define only its own policy, not its own uploader implementation.

A feature policy should answer:

- what entity owns the file
- whether storage is private or publishable later
- which backend to use
- allowed MIME types
- max file size
- key prefix format
- whether draft uploads are allowed

## Feature Coverage

The same uploader framework should cover all of these:

- message attachments
- package images
- chatbot FAQ attachments
- support ticket reply attachments
- hospital materials uploads
- consultations recordings
- case images
- case documents

But they should not all share the same policy.

Examples:

- hospital materials:
  - beauty hospitals route to R2-backed materials flows
  - regular hospitals route to S3-backed materials flows
- messages:
  - private-only
- support tickets:
  - private-only
- case documents:
  - private-only and stricter validation
- package and FAQ:
  - private upload now, optional publish flow later

## Materials Routing Is Special

Materials must be documented separately from the other upload families.

Unlike messages, tickets, packages, or FAQ attachments, materials routing depends on hospital type.

Recommended v2 rule:

- beauty hospital materials -> R2 policy
- regular hospital materials -> S3 policy

This should still use the shared uploader core.

So materials are special because they require routing, not because they deserve their own uploader implementation.

## What We Should Borrow From CRM v1 Materials

CRM v1 had one important idea worth keeping:

- the browser should upload directly to object storage using a controlled upload flow
- the application should then store the resulting object reference back into materials tables
- the storage backend should be chosen by hospital type

That is the part worth preserving.

What we should not preserve:

- ad hoc special-case direct upload logic
- inconsistent upload behaviors inside the same materials family
- public-by-default assumptions

Relevant source context from v1:

- [`upload.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm/app/hospital/materials/utils/upload.ts)
- [`presigned-url/route.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm/app/api/hospital/materials-page/presigned-url/route.ts)
- [`s3-presigned-url/route.ts`](/Users/haowang/Desktop/medora-health-beauty/medical-crm/app/api/hospital/materials-page/s3-presigned-url/route.ts)

## Recommended Unified Uploader Design

The shared uploader should not be hard-coded to a single storage backend.

Instead, it should work like this:

1. Feature asks the uploader core to create an upload intent.
2. The uploader core looks up a policy.
3. The policy chooses a storage backend adapter.
4. The adapter generates the signed upload contract.
5. The feature stores only normalized metadata and object references.

For materials, the policy lookup should include hospital type.

Example conceptual policy selection:

```text
message_attachment            -> R2 private adapter
package_image                 -> R2 private adapter
faq_attachment                -> R2 private adapter
case_document                 -> R2 private adapter
materials_beauty_media        -> R2 materials adapter
materials_regular_media       -> S3 materials adapter
consultation_recording        -> R2 private large-media adapter
```

This means the uploader core stays unified, while materials still route correctly.

## Multi-Storage Does Not Mean Multi-Write

The uploader should support multiple storage backends.

That does not mean a single upload request should write the same file to multiple backends at once.

The correct default is:

- one upload
- one chosen backend
- one canonical stored object

If we later need replication or publish-copy behavior, that should be a separate async workflow, not part of the normal synchronous uploader path.

Examples:

- package image uploaded to private R2, later published to public storage by a publish step
- materials asset uploaded to the backend selected by hospital type, without writing to both R2 and S3

This keeps the uploader simple, deterministic, and safe.

## Required v2 Materials Policies

In v2, materials should still use the shared uploader core.

But materials must register multiple explicit policies, not a single flat `materials_upload` policy.

Recommended minimum policies:

- `materials_beauty_media`
- `materials_regular_media_presigned`

These policies should differ by:

- storage backend
- path naming
- allowed MIME types
- max file size
- delivery mode
- publishability

But they should still call into the same uploader core.

## Why This Must Be Explicit In The Docs

If materials routing is not documented clearly, a future refactor will almost certainly make one of these mistakes:

- route all materials into the same backend
- break regular hospital S3 behavior
- break beauty hospital R2 behavior
- treat materials like message attachments, which they are not

That would be architecturally wrong.

So the documentation rule for materials is:

- materials routing must be documented separately
- materials policies must reflect hospital type and asset family
- materials must use the shared uploader core, but not a generic one-policy upload rule

## Why One Core Is Better

One shared uploader core is better than one uploader per feature because it gives:

- one security model
- one retry model
- one error model
- one audit/logging model
- one place to patch bugs
- one place to add malware scanning hooks later

If every feature builds its own uploader:

- validation rules drift
- retries drift
- storage key conventions drift
- one feature will eventually bypass safety checks

That is exactly what we should avoid in v2.

## What Should Still Stay Separate

Unified does not mean identical.

These parts should remain feature-specific:

- storage backend selection
- bucket/prefix routing
- MIME allowlist
- size limits
- owner metadata
- publish versus private rules
- finalize behavior after entity creation

So the right model is:

- shared core
- separate policies

not:

- fully duplicated uploaders

and not:

- one flat uploader with no feature distinctions

## Recommended v2 Interface Shape

Conceptually, the uploader API should look like:

```text
createUploadIntent({
  feature,
  ownerType,
  ownerId,
  fileName,
  fileSize,
  mimeType,
  context
})
```

Where `feature` decides a policy such as:

- `message_attachment`
- `package_image`
- `faq_attachment`
- `support_reply_attachment`
- `materials_beauty_media`
- `materials_regular_media`
- `consultation_recording`
- `case_image`
- `case_document`

The output should always be normalized:

```json
{
  "uploadUrl": "...",
  "storageKey": "...",
  "assetMetadata": {
    "fileName": "cover.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 245123
  }
}
```

## Documentation Rule

Yes, this should be written into the docs clearly.

The rule should be:

- no new feature is allowed to invent its own uploader flow
- new features must register a policy into the shared uploader framework
- backend routing differences such as R2 versus S3 belong in policy/adapters, not in ad hoc page logic

## Security Rules

These are mandatory.

1. No browser-side bucket credentials.
2. No direct client-chosen storage paths.
3. No public bucket for support ticket attachments.
4. No public bucket for message attachments.
5. No public bucket for case documents.
6. All uploads must go through a server-controlled upload intent/init route.
7. The server must generate the storage key; the client may only send file metadata.
8. Signed upload URLs must be short-lived.
9. Signed download URLs must be short-lived for private content.
10. File MIME type and size must be validated server-side before upload intent is granted.
11. Object keys must be immutable; replacing an asset should create a new object key.
12. Original filenames must never be trusted as the path.

Recommended limits:

- Package images: image only, max 10 MB each
- Support ticket attachments: image, PDF, DOCX, TXT, max 20 MB each
- FAQ attachments: image, PDF, max 10 MB each
- Message attachments: image, PDF, DOCX, TXT, max 20 MB each
- Case documents: document/image only, stricter type allowlist, max 25 MB each unless a medical imaging workflow explicitly requires more

Recommended extra controls:

- sanitize file names before storing as metadata
- store canonical MIME type and size alongside storage key in DB JSON
- add upload audit logs later if admin uploads become operationally important

## Path Naming Standard

All object keys should be server-generated and follow this format:

```text
crm/{env}/{domain}/{resourceType}/{resourceId}/{assetId}/{sanitizedFileName}
```

Where:

- `env`: `dev`, `staging`, `prod`
- `domain`: one of the approved top-level routing domains
- `resourceType`: feature-owned resource family
- `resourceId`: package id, ticket id, faq id, conversation id, case id, or a temporary draft id
- `assetId`: generated UUID
- `sanitizedFileName`: optional readable suffix only

Approved `domain` values:

- `admin` for admin-managed business content
- `communications` for messages and conversation attachments
- `cases` for case documents and case-owned medical files
- `materials-beauty` for beauty hospital materials routed to R2
- `materials-regular` for regular hospital materials routed to S3

Naming rule:

- do not invent new top-level domains casually
- choose the domain first
- then choose the feature-specific `resourceType`

Examples:

```text
crm/dev/admin/packages/pkg_123/ast_456/cover.jpg
crm/dev/admin/tickets/tkt_123/replies/ast_456/screenshot.png
crm/dev/admin/chatbot-faqs/faq_123/ast_456/visa-guide.pdf
crm/dev/communications/messages/conv_123/ast_456/report.pdf
crm/dev/cases/documents/case_123/doc_456/xray.jpg
crm/dev/materials-beauty/surgeons/srg_123/ast_456/profile.jpg
crm/dev/materials-regular/gallery/hosp_123/ast_456/lobby.jpg
```

If the entity does not exist yet, use a temporary draft id:

```text
crm/dev/admin/packages/draft_{uuid}/ast_{uuid}/cover.jpg
```

Once the entity is saved, the object may either:

- remain under the draft prefix and be referenced as-is
- or be moved by a later finalize step

For the initial rollout, keeping the draft key is acceptable and simpler.

## Metadata Shape

Each stored attachment or image should keep structured metadata, not just a raw URL.

Recommended JSON shape:

```json
{
  "storageKey": "crm/dev/admin/packages/pkg_123/ast_456/cover.jpg",
  "fileName": "cover.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 245123,
  "uploadedAt": "2026-03-19T20:00:00.000Z"
}
```

For package images:

- store an array under `config.imageGallery`
- store the primary image key separately if needed for sorting/display

For support ticket replies:

- store attachments JSON on each reply record

For FAQ items:

- add a new attachments JSON field if attachments are needed

For message attachments:

- store attachments JSON on each message record

For case documents:

- keep canonical metadata in the `documents` table
- store `storageKey` only, not public URLs
- always resolve download URLs server-side

## Reference Model

Cross-resource reference rules have been split into a separate document:

- [`crm-reference-model.md`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/crm-reference-model.md)

This storage document only defines:

- where CRM media should be stored
- how uploads should be secured
- how media metadata should be represented

The separate reference document defines:

- what entities can be referenced
- how typed references should be stored
- ownership versus reuse
- deletion and retention behavior
- how messages and AI replies should resolve references

## Delivery Rules

Use signed URLs for all private bucket content.

Do not store permanent public object URLs in CRM records for these features.

Recommended TTL:

- upload URL: 5 to 10 minutes
- download URL in admin UI: 15 to 60 minutes

The UI should always render from a signed URL generated by the backend from `storageKey`.

For case documents, signed URLs are mandatory, not optional.

## Why Not Reuse v1 Exactly

We should not reuse v1 upload behavior as-is because:

- some v1 routes directly accepted file uploads into a public R2 path
- v1 mixed public-image and document semantics
- v1 bucket naming was not cleanly split by data sensitivity

What we should reuse from v1:

- the fact that CRM-owned media can live in R2
- the idea of stable path prefixes
- the historical bucket names as migration context only

## Recommended v2 Implementation Plan

Phase 1:

- Create one private R2 bucket for CRM media
- Add R2 env vars to v2
- Add a dedicated v2 R2 storage adapter
- Add upload intent/init routes for:
  - packages
  - tickets
  - chatbot FAQ
  - messages
  - case documents
- Add signed download URL resolution for ticket replies and FAQ/package media
- Add signed download URL resolution for messages and case documents

Phase 2:

- Add stricter attachment schemas
- Add cleanup for abandoned draft uploads
- Add optional malware scanning workflow if needed
- Re-evaluate whether case documents should move from shared private bucket to a dedicated sensitive-doc bucket

Phase 3:

- If package images must become publicly cacheable, introduce a separate controlled publish path

## What The User Needs To Do

These steps must be done outside the codebase. I cannot create Cloudflare buckets from this environment unless you give me real Cloudflare credentials and permission to use them.

Minimum required from you:

1. Create a Cloudflare R2 bucket:
   - recommended name: `medical-crm-media-private`
2. Provide or configure these env vars for v2:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME=medical-crm-media-private`
3. Confirm whether you want:
   - private-only bucket now
   - or private bucket now plus a later public bucket

Optional but useful:

4. Create a custom domain or decide to keep raw R2 endpoint usage for signed URLs only
5. Decide environment isolation:
   - separate bucket per env
   - or single bucket with `dev/staging/prod` prefixes

## Cloudflare R2 Configuration Notes

For your current bucket:

- bucket name: `medical-crm-media-private`
- account id: `82cdbf36c265c0d9e4b4e1c6100c26d7`

Recommended private settings:

1. Keep `Public Development URL` disabled.
2. Do not attach a public custom domain to this bucket.
3. Do not use this bucket for direct anonymous reads.
4. Use server-generated signed upload and signed download URLs only.

Recommended env mapping:

```env
CLOUDFLARE_ACCOUNT_ID=82cdbf36c265c0d9e4b4e1c6100c26d7
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=medical-crm-media-private
```

This gives v2 one bucket-scoped private credential pair, which is the correct starting point.

## What I Can Do Next

I can do all of the code and documentation work after the bucket exists:

- add the v2 R2 storage adapter
- replace package image upload from Supabase bucket flow to R2
- add support ticket reply attachment upload + display
- add chatbot FAQ attachment upload + display
- make all three features follow this document exactly

I can also prepare:

- `.env` variable names
- upload route contracts
- path builder helpers
- attachment JSON types
- a migration checklist

## Recommended Final Choice

Use one private R2 bucket now:

```text
medical-crm-media-private
```

and these logical prefixes:

```text
crm/{env}/admin/packages/...
crm/{env}/admin/tickets/...
crm/{env}/admin/chatbot-faqs/...
crm/{env}/communications/messages/...
crm/{env}/cases/documents/...
```

This is the cleanest secure baseline for v2.
