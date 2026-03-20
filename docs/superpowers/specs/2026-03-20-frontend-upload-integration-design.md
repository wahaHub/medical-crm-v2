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
  return apiFetch(`/api/v2/conversations/${conversationId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
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

**No changes needed to `ChatLayout`** — the shared component already renders the paperclip button, file preview area, and handles file selection when `onUploadFiles` is provided.

**Note:** The existing admin `sendMessage` action currently only sends text. It must be updated to accept optional `messageType` and `attachments` parameters (the backend `POST /conversations/{id}/messages` already supports these fields). Alternatively, add a separate `sendMessageWithAttachments` action. The hospital portal already has this pattern in `message-actions.ts`.

**Note:** `ChatLayout.onUploadFiles` has return type `void`. The async `handleUploadFiles` callback works because TypeScript allows async functions where void is expected — the Promise is simply ignored. Upload errors are surfaced via the hook's `error` state, not via the callback return.

**Backend endpoint:** `POST /api/v2/conversations/{id}/attachments/upload` — already exists, uses `message_attachment` policy (20MB, images + pdf + docx + txt).

### 2. Hospital Materials — Replace Data URLs with Presigned Upload

**Current state:** `ImageUploadWidget` in `materials-tabs.tsx` converts selected files to data URLs via `readFileAsDataUrl()` or creates blob URLs. These raw strings are stored in form state and submitted to the backend CRUD endpoints. This breaks for large files and doesn't use the upload service.

**Files to modify:**
- Modify: `apps/hospital/src/actions/materials-actions.ts` — add `uploadMaterialFile(materialKind, params)` server action
- Modify: `apps/hospital/src/components/materials-tabs.tsx` — update `ImageUploadWidget` callers to use presigned upload

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

**ImageUploadWidget change:**
- The widget already has an `onFileSelect?: (file: File) => void` prop (used for preview via `URL.createObjectURL`). Replace this with `onUpload?: (file: File) => Promise<string>` which returns `storageKey`.
- When `onUpload` is provided: show `URL.createObjectURL(file)` as immediate preview, call `onUpload` in the background, set the returned `storageKey` as the value via `onChange`
- When `onUpload` is NOT provided: fall back to existing `readFileAsDataUrl` behavior (backward compatible, though no callers should use this path after migration)
- The old `onFileSelect` prop is removed — `onUpload` subsumes its functionality

**Material form integration:**
Each material form (surgeon, case, hospital info) passes an `onUpload` function that calls `uploadMaterialFile` with the appropriate `materialKind`:
- Hospital hero/gallery images → `materialKind: 'hero'` / `'gallery'`
- Surgeon photos → `materialKind: 'surgeon'`
- Before/after case media → `materialKind: 'case'`

After upload, the `storageKey` is stored in form state. On save, the storageKey is submitted to the existing CRUD endpoints.

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

**Draft ID pattern for new FAQs:**
When creating a new FAQ, no `faqId` exists yet. The component generates a `draft_{uuid}` as the faqId for uploads. The storageKey contains this draft ID permanently (same pattern as package images).

**UI changes (both portals):**
- Add "Attachments" section below the Answer field
- File input (accept images + PDF) + upload button
- Attachment preview list showing fileName, fileSize, remove button
- On form submit: include `attachments` array in the create/update payload
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

## Test Strategy

- **Hook unit test**: Mock `initFn`, verify upload flow (init → PUT → return asset), error handling, multi-file sequential upload
- **Component tests**: Verify file input renders, upload button triggers handler, preview shows after upload
- **Server action tests**: Verify correct API endpoint is called with correct params
- **No E2E upload tests**: Live storage tested manually (presigned URLs require real R2/S3 credentials)
