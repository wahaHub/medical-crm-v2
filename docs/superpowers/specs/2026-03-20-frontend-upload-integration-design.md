# Frontend Upload Integration — Design Spec

## Overview

Integrate the unified `MediaUploadService` backend (already complete — 14 policies, 8 endpoints) into 5 frontend integration points across Admin and Hospital portals. All upload endpoints return a consistent presigned-URL response; the frontend needs a shared hook and per-integration-point wiring.

## Problem Statement

The backend upload infrastructure is complete but only one frontend integration exists (Admin Package Images). The remaining 4 integration points either have no upload UI or use data URLs instead of the presigned upload flow:

1. **Admin Messages** — no file upload button in conversation input
2. **Hospital Materials** — uses `readFileAsDataUrl()` / inline data URLs instead of presigned uploads
3. **Admin Ticket Reply** — pure text reply, no attachment support
4. **Admin & Hospital FAQ** — no attachment upload in create/edit modals

## Architecture

### Shared Hook

```
packages/shared/ui/src/hooks/use-media-upload.ts   ← shared hook
  ├── Manages file → upload-init → PUT → storageKey flow
  ├── Upload state (isUploading, error)
  ├── Multi-file sequential upload
  └── Optional frontend MIME/size pre-validation

apps/admin/src/actions/upload-actions.ts            ← admin BFF server actions
apps/hospital/src/actions/upload-actions.ts          ← hospital BFF server actions
  └── Each calls backend upload-init endpoints, returns presigned URL + asset
```

### Upload Flow

```
Component
  └─ useMediaUpload hook
       ├─ 1. Frontend pre-validation (MIME, size) — optional
       ├─ 2. Call initFn (server action) → presigned URL + storageKey
       ├─ 3. PUT file binary to presigned URL
       └─ 4. Return UploadedAsset { storageKey, fileName, mimeType, fileSize }
```

## Type Definitions

### useMediaUpload Hook

```typescript
// packages/shared/ui/src/hooks/use-media-upload.ts

interface UploadInitFn {
  (params: { fileName: string; fileSize: number; mimeType: string }):
    Promise<{
      upload: { uploadUrl: string; storageKey: string; expiresIn: number };
      asset: UploadedAsset;
    }>;
}
// Note: `expiresIn` is included for completeness (matches backend response shape)
// but the hook does not use it — the PUT upload happens immediately.

interface UploadedAsset {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

interface UseMediaUploadOptions {
  maxFiles?: number;           // default 10
  allowedMimeTypes?: string[]; // frontend pre-check, optional
  maxFileSize?: number;        // frontend pre-check in bytes, optional
}

interface UseMediaUploadReturn {
  upload: (files: File[], initFn: UploadInitFn) => Promise<UploadedAsset[]>;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
}
```

**Design decisions:**
- Hook does NOT bind to any specific endpoint — `initFn` is passed by the caller (server action or fetch call)
- Files upload sequentially to avoid excessive concurrent presigned URLs
- Frontend pre-validates MIME/size before making server requests to reduce unnecessary calls
- Returns `UploadedAsset[]` — caller decides how to store (form state, message payload, etc.)

## Integration Points

### 1. Admin Messages — Add File Upload to Conversation Input

**Current state:** `messages-center.tsx` renders `ChatLayout` without `onUploadFiles` prop. The shared `ChatLayout` component already has full upload UI support (paperclip button, file preview, selected file management) gated by the `onUploadFiles` prop.

**Files to modify:**
- Modify: `apps/admin/src/actions/message-actions.ts` — add `uploadMessageFile` server action (file already exists with `sendMessage`, `approveMessage`, etc.)
- Modify: `apps/admin/src/components/messages-center.tsx` — add `handleUploadFiles` callback + `isUploading` state

**Server action pattern:**
```typescript
// apps/admin/src/actions/message-actions.ts
export async function uploadMessageFile(
  conversationId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
) {
  const res = await apiFetch(`/api/v2/conversations/${conversationId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to init message attachment upload');
  }

  return res.json() as Promise<{
    upload: { uploadUrl: string; storageKey: string; expiresIn: number };
    asset: UploadedAsset;
  }>;
}
```

**Component wiring:**
```typescript
// messages-center.tsx
const { upload, isUploading, error: uploadError } = useMediaUpload();

const handleUploadFiles = useCallback(async (files: File[]) => {
  const initFn = (params) => uploadMessageFile(selectedConversationId, params);
  const assets = await upload(files, initFn);
  // Determine messageType based on uploaded assets' MIME types
  const messageType = assets.every(a => a.mimeType.startsWith('image/')) ? 'IMAGE' : 'FILE';
  const attachments = assets.map(a => ({
    storageKey: a.storageKey, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize,
  }));
  await sendMessage(selectedConversationId, '', messageType, attachments);
}, [selectedConversationId, upload]);

// Pass to ChatLayout:
<ChatLayout
  // ...existing props
  onUploadFiles={handleUploadFiles}
  isUploading={isUploading}
/>
```

**No structural changes needed to `ChatLayout` for Phase 1** — the shared component already renders the paperclip button, file preview area, and handles file selection when `onUploadFiles` is provided.

**Note:** The existing admin `sendMessage` action currently only sends text. It must be updated to accept optional `messageType` and `attachments` parameters (the backend `POST /conversations/{id}/messages` already supports these fields). Alternatively, add a separate `sendMessageWithAttachments` action. The hospital portal already has this pattern in `message-actions.ts`.

**Note:** `ChatLayout.onUploadFiles` has return type `void`. The async `handleUploadFiles` callback works because TypeScript allows async functions where void is expected — the Promise is simply ignored. Upload errors are surfaced via the hook's `error` state, not via the callback return.

**Note:** Phase 1 preserves the current `ChatLayout` send semantics: if the user has both typed text and selected files, attachments are sent via `onUploadFiles(...)` and any non-empty text still goes through `onSend(...)` as a separate text message. Supporting one combined "text + attachments" message would require a dedicated `ChatLayout` API change and is out of scope for this spec.

**Backend endpoint:** `POST /api/v2/conversations/{id}/attachments/upload` — already exists, uses `message_attachment` policy (20MB, images + pdf + docx + txt).

### 2. Hospital Materials — Replace Image/Video Data URLs with Presigned Upload

**Current state:** `materials-tabs.tsx` still uses local file conversions in multiple places:
- `ImageUploadWidget` converts images to data URLs or blob URLs
- `VideoUploadWidget` and testimonial upload flows keep video blob/data URLs in local state
- Department/equipment image pickers also use `readFileAsDataUrl()`

These raw strings are stored in form state and submitted to the existing materials CRUD endpoints. This breaks for large files and bypasses the unified upload service.

**Files to modify:**
- Modify: `apps/hospital/src/actions/materials-actions.ts` — add `uploadMaterialFile(materialKind, params)` server action
- Modify: `apps/hospital/src/components/materials-tabs.tsx` — update image/video upload flows to use presigned upload
- Backend dependency: current materials read/write contracts are URL-shaped (`heroImage`, `imageUrl`, `images[].url`, `videoUrl`). Persisting raw `storageKey` values requires a companion backend change to accept asset-backed references and resolve signed/public read URLs. This integration point is therefore not frontend-only.
- Backend dependency: the current materials policy resolver only accepts existing `materialKind` values (`hero`, `gallery`, `equipment`, `surgeon`, `case`, plus `hospital_video` / `testimonial_video` for cosmetic hospitals). Department images can reuse the existing hospital-image policy via `gallery`; regular-hospital video flows still need an explicit backend policy decision before migration.

**Server action:**
```typescript
// apps/hospital/src/actions/materials-actions.ts
export async function uploadMaterialFile(
  materialKind: string,
  params: { fileName: string; fileSize: number; mimeType: string },
) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  return apiClient(`/api/v2/hospitals/${hospitalId}/materials/upload`, {
    method: 'POST',
    body: JSON.stringify({ ...params, materialKind }),
  });
}
```

**Upload widget changes:**
- `ImageUploadWidget` replaces `onFileSelect?: (file: File) => void` with `onUpload?: (file: File) => Promise<UploadedAsset>`
- `VideoUploadWidget` adds `onUpload?: (file: File) => Promise<UploadedAsset>` for promotional videos and testimonials
- Equipment image pickers reuse the same shared `useMediaUpload` hook instead of `readFileAsDataUrl()`
- Department image pickers also reuse the shared hook and upload with `materialKind: 'gallery'` because they are hospital images, not a new media class
- Widgets show `URL.createObjectURL(file)` as immediate preview while the upload runs in the background
- Local edit state stores `{ previewUrl, asset }` so the UI can render immediately without treating `storageKey` as an image/video URL
- The legacy data-URL fallback may remain temporarily only for untouched callers during migration; all hospital materials callers should move off it in this phase

**Material form integration:**
Each materials editor passes an `onUpload` function that calls `uploadMaterialFile` with the appropriate `materialKind`:
- Hospital hero/gallery/equipment images → `materialKind: 'hero'` / `'gallery'` / `'equipment'`
- Department images → reuse `materialKind: 'gallery'`
- Surgeon photos → `materialKind: 'surgeon'`
- Before/after case images/video → `materialKind: 'case'`
- Cosmetic-hospital promotional videos → `materialKind: 'hospital_video'`
- Cosmetic-hospital testimonial videos → `materialKind: 'testimonial_video'`

**Persistence strategy:**
- Immediate preview uses `previewUrl` from `URL.createObjectURL(file)`
- Uploaded metadata is kept in transient edit state as `UploadedAsset`
- Do NOT write raw `storageKey` values into existing URL-only fields until the materials CRUD/read model is upgraded to understand asset references
- This spec therefore depends on a companion backend patch for materials DTOs/routes/repositories; once that lands, the save payload should send storage-backed references and the read path should resolve browser-consumable URLs

**Backend endpoint:** `POST /api/v2/hospitals/{hospitalId}/materials/upload` — already exists, resolves `policyId` from `hospitalType + materialKind`.

### 3. Admin Package Images — No Changes

Already fully implemented in `package-form-modal.tsx`. Uses `/api/packages/images/upload-init` BFF proxy → presigned PUT → stores `storageKey` in `config.imageGallery[]`. No changes needed.

### 4. Admin Ticket Reply — Add Attachment Upload

**Current state:** `case-support-tab.tsx` has a `textarea` + Send button for ticket replies. `replyToTicket` action sends only `content` (text). The backend `POST /api/v2/tickets/{id}/reply` and `POST /api/v2/tickets/{id}/attachments/upload` endpoints already exist.

**Files to modify:**
- Modify: `apps/admin/src/actions/ticket-actions.ts` — add `uploadTicketAttachment(ticketId, params)` server action, update `replyToTicket` to accept optional `attachments`
- Modify: `apps/admin/src/components/tabs/case-support-tab.tsx` — add file selection UI and upload handling in the reply area

**Server action additions:**
```typescript
// ticket-actions.ts
export async function uploadTicketAttachment(
  ticketId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
) {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to init ticket attachment upload');
  return res.json();
}

// Update replyToTicket to accept attachments
export async function replyToTicket(
  ticketId: string,
  content: string,
  attachments?: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }>,
) {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content, ...(attachments?.length ? { attachments } : {}) }),
  });
  // ...existing error handling
}
```

**UI changes in `TicketDetail`:**
- Add paperclip button next to the reply textarea
- Hidden `<input type="file" multiple>` triggered by paperclip
- Selected files preview strip (similar to ChatLayout pattern)
- On send: upload files via `useMediaUpload` hook → get `storageKey[]` → call `replyToTicket` with content + attachments

**Backend endpoint:** `POST /api/v2/tickets/{id}/attachments/upload` — already exists, uses `ticket_reply_attachment` policy (20MB, images + pdf + docx + txt).

**Note:** The backend `POST /api/v2/tickets/{id}/reply` already accepts `attachments` in the request body (typed as `unknown`). No backend changes are needed — only the frontend action signature is updated to include typed attachments.

### 5. Admin & Hospital FAQ — Add Attachment Upload

**Current state:**
- Admin: `chatbot-faq-form-modal.tsx` — text-only form (category, question, answer, keywords, hospitalType)
- Hospital: `faq-list.tsx` `FaqModal` — text-only form (same fields)
- Neither has file upload UI or `attachments` field
- Backend `POST /api/v2/chatbot/faqs/{id}/attachments/upload` endpoint exists, uses `faq_attachment` policy (10MB, images + pdf)
- DB schema already has `attachments JSONB` on `chatbot_faq_items` table

**Files to modify:**
- Create: `apps/admin/src/actions/faq-upload-actions.ts` — server action for FAQ attachment upload
- Create: `apps/hospital/src/actions/faq-upload-actions.ts` — same for hospital
- Modify: `apps/admin/src/components/chatbot-faq-form-modal.tsx` — add Attachments section
- Modify: `apps/hospital/src/components/faq-list.tsx` — add Attachments section in `FaqModal`
- Modify: `apps/hospital/src/lib/api-types.ts` — add `attachments` to `FaqItem` so edit mode can render existing files

**Server action (same for both portals):**
```typescript
export async function uploadFaqAttachment(
  faqId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
) {
  return apiClient(`/api/v2/chatbot/faqs/${faqId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
```

**New FAQ flow (two-phase create):**
The current backend FAQ attachment endpoint requires a real FAQ UUID and verifies that the FAQ already exists before creating an upload intent. New FAQ creation must therefore use a two-phase flow:

1. Create the FAQ first without attachments
2. Use the returned `faqId` to upload selected files
3. Patch the FAQ with the uploaded `attachments[]`

For edit mode, uploads can happen immediately because `faqId` already exists.

**UI changes (both portals):**
- Add "Attachments" section below the Answer field
- File input (accept images + PDF) + upload button
- Attachment preview list showing fileName, fileSize, remove button
- On create submit: create FAQ first, then upload pending files, then patch with `attachments[]`
- On edit submit: include `attachments` array in the update payload
- On edit: show existing attachments from `faq.attachments[]` with resolved download URLs

**Attachment data shape in form state:**
```typescript
interface FaqAttachment {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  previewUrl?: string;  // URL.createObjectURL for new uploads, resolved URL for existing
}
```

## Scope Exclusions

- **Admin Package Images**: No changes — already working
- **Consultation recording upload**: Not in scope (no UI for this yet)
- **Case document upload**: Not in scope (existing flow works)
- **Upload progress percentage**: Not in scope for Phase 1 — `isUploading` boolean is sufficient
- **Drag-and-drop upload**: Not in scope — standard file input only

## File Structure (New/Modified)

```
packages/shared/ui/src/
  └── hooks/
      └── use-media-upload.ts                        ← NEW: shared hook

apps/admin/src/
  ├── actions/
  │   ├── message-actions.ts                         ← MODIFY: add uploadMessageFile + sendMessageWithAttachments
  │   ├── ticket-actions.ts                          ← MODIFY: uploadTicketAttachment + replyToTicket
  │   └── faq-upload-actions.ts                      ← NEW: uploadFaqAttachment
  └── components/
      ├── messages-center.tsx                        ← MODIFY: add onUploadFiles
      ├── tabs/case-support-tab.tsx                  ← MODIFY: add attachment UI in reply
      └── chatbot-faq-form-modal.tsx                 ← MODIFY: add attachments section

apps/hospital/src/
  ├── actions/
  │   ├── materials-actions.ts                       ← MODIFY: add uploadMaterialFile
  │   └── faq-upload-actions.ts                      ← NEW: uploadFaqAttachment
  └── components/
      ├── materials-tabs.tsx                         ← MODIFY: ImageUploadWidget + form callers
      └── faq-list.tsx                               ← MODIFY: add attachments in FaqModal
```

## Backend Dependencies

All backend endpoints already exist and are tested:

| Endpoint | Policy | Max Size | Allowed MIME |
|----------|--------|----------|-------------|
| `POST /conversations/{id}/attachments/upload` | `message_attachment` | 20 MB | jpeg, png, webp, gif, pdf, docx, txt |
| `POST /hospitals/{hospitalId}/materials/upload` | varies by materialKind | 10-200 MB | images, video |
| `POST /tickets/{id}/attachments/upload` | `ticket_reply_attachment` | 20 MB | jpeg, png, webp, pdf, docx, txt |
| `POST /chatbot/faqs/{id}/attachments/upload` | `faq_attachment` | 10 MB | jpeg, png, webp, pdf |

Additional dependency for the hospital materials integration:

- Materials CRUD/read contracts are still URL-based and do not currently resolve signed/public URLs from `storageKey`
- A companion backend change is required before hospital materials can persist uploaded assets end-to-end using storage-backed references

## Test Strategy

- **Hook unit test**: Mock `initFn`, verify upload flow (init → PUT → return asset), error handling, multi-file sequential upload
- **Component tests**: Verify file input renders, upload button triggers handler, preview shows after upload
- **Server action tests**: Verify correct API endpoint is called with correct params
- **FAQ create-flow test**: Verify create → upload attachments → patch sequence for a brand-new FAQ
- **Materials editor tests**: Verify previews use `previewUrl` during edit state and no raw `storageKey` is rendered directly as `img/video src`
- **No E2E upload tests**: Live storage tested manually (presigned URLs require real R2/S3 credentials)
