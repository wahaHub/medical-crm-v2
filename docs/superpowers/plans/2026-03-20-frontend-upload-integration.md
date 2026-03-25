# Frontend Upload Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing backend `MediaUploadService` (14 policies, 8 endpoints) into the planned frontend integration points using a shared `useMediaUpload` hook.

**Architecture:** Shared `useMediaUpload` hook in `@medical-crm/ui` manages the upload-init → PUT → storageKey flow. Each portal (admin/hospital) has server actions that call the backend upload-init endpoints. Components call the hook with the appropriate server action as `initFn`. Exception: Hospital Materials cannot persist raw `storageKey` values into today's URL-shaped CRUD model; that chunk must stop at frontend upload-state integration unless the companion backend contract patch is already merged.

**Tech Stack:** React 18, Next.js 15 (App Router), TanStack Query, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-frontend-upload-integration-design.md`

---

## Chunk 1: Shared useMediaUpload Hook

### Task 1: Create `useMediaUpload` hook

**Files:**
- Create: `packages/shared/ui/src/hooks/use-media-upload.ts`
- Create: `packages/shared/ui/src/hooks/__tests__/use-media-upload.test.ts`
- Modify: `packages/shared/ui/src/index.ts:5`

- [ ] **Step 1: Write failing test for useMediaUpload**

```typescript
// packages/shared/ui/src/hooks/__tests__/use-media-upload.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaUpload } from '../use-media-upload';

describe('useMediaUpload', () => {
  const mockInitFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for the PUT to presigned URL
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useMediaUpload());
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.upload).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  it('uploads a single file successfully', async () => {
    const asset = {
      storageKey: 'crm/dev/test/ast_123/photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
    };
    mockInitFn.mockResolvedValue({
      upload: { uploadUrl: 'https://presigned.example.com/put', storageKey: asset.storageKey, expiresIn: 600 },
      asset,
    });

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload());

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file], mockInitFn);
    });

    expect(mockInitFn).toHaveBeenCalledWith({
      fileName: 'photo.jpg',
      fileSize: 4,
      mimeType: 'image/jpeg',
    });
    expect(global.fetch).toHaveBeenCalledWith('https://presigned.example.com/put', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: file,
    });
    expect(assets!).toEqual([asset]);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('uploads multiple files sequentially', async () => {
    const asset1 = { storageKey: 'key1', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 100 };
    const asset2 = { storageKey: 'key2', fileName: 'b.png', mimeType: 'image/png', fileSize: 200 };
    mockInitFn
      .mockResolvedValueOnce({ upload: { uploadUrl: 'https://url1', storageKey: 'key1', expiresIn: 600 }, asset: asset1 })
      .mockResolvedValueOnce({ upload: { uploadUrl: 'https://url2', storageKey: 'key2', expiresIn: 600 }, asset: asset2 });

    const file1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['bb'], 'b.png', { type: 'image/png' });
    const { result } = renderHook(() => useMediaUpload());

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file1, file2], mockInitFn);
    });

    expect(assets!).toEqual([asset1, asset2]);
    expect(mockInitFn).toHaveBeenCalledTimes(2);
  });

  it('rejects files exceeding maxFileSize', async () => {
    const file = new File(['x'.repeat(100)], 'big.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload({ maxFileSize: 50 }));

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file], mockInitFn);
    });

    expect(assets!).toEqual([]);
    expect(result.current.error).toMatch(/exceeds.*limit/i);
    expect(mockInitFn).not.toHaveBeenCalled();
  });

  it('rejects files with disallowed MIME types', async () => {
    const file = new File(['data'], 'script.exe', { type: 'application/x-msdownload' });
    const { result } = renderHook(() =>
      useMediaUpload({ allowedMimeTypes: ['image/jpeg', 'image/png'] }),
    );

    let assets: unknown[];
    await act(async () => {
      assets = await result.current.upload([file], mockInitFn);
    });

    expect(assets!).toEqual([]);
    expect(result.current.error).toMatch(/file type.*not allowed/i);
    expect(mockInitFn).not.toHaveBeenCalled();
  });

  it('sets error when PUT to presigned URL fails', async () => {
    mockInitFn.mockResolvedValue({
      upload: { uploadUrl: 'https://fail.example.com', storageKey: 'k', expiresIn: 600 },
      asset: { storageKey: 'k', fileName: 'f.jpg', mimeType: 'image/jpeg', fileSize: 1 },
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 });

    const file = new File(['d'], 'f.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload());

    await act(async () => {
      await result.current.upload([file], mockInitFn);
    });

    expect(result.current.error).toMatch(/upload failed/i);
  });

  it('clearError resets error state', async () => {
    mockInitFn.mockRejectedValue(new Error('boom'));
    const file = new File(['d'], 'f.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useMediaUpload());

    await act(async () => {
      await result.current.upload([file], mockInitFn);
    });
    expect(result.current.error).toBeTruthy();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/ui exec vitest run hooks/__tests__/use-media-upload.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useMediaUpload hook**

```typescript
// packages/shared/ui/src/hooks/use-media-upload.ts
'use client';

import { useState, useCallback } from 'react';

export interface UploadedAsset {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface UploadInitResult {
  upload: { uploadUrl: string; storageKey: string; expiresIn: number };
  asset: UploadedAsset;
}

export type UploadInitFn = (params: {
  fileName: string;
  fileSize: number;
  mimeType: string;
}) => Promise<UploadInitResult>;

export interface UseMediaUploadOptions {
  maxFiles?: number;
  allowedMimeTypes?: string[];
  maxFileSize?: number;
}

export interface UseMediaUploadReturn {
  upload: (files: File[], initFn: UploadInitFn) => Promise<UploadedAsset[]>;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useMediaUpload(options?: UseMediaUploadOptions): UseMediaUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const upload = useCallback(
    async (files: File[], initFn: UploadInitFn): Promise<UploadedAsset[]> => {
      setError(null);
      const maxFiles = options?.maxFiles ?? 10;

      if (files.length > maxFiles) {
        setError(`Too many files. Maximum is ${maxFiles}.`);
        return [];
      }

      // Frontend pre-validation
      for (const file of files) {
        if (options?.maxFileSize && file.size > options.maxFileSize) {
          const limitMB = Math.round(options.maxFileSize / 1024 / 1024);
          setError(`"${file.name}" exceeds the ${limitMB}MB size limit.`);
          return [];
        }
        if (options?.allowedMimeTypes && !options.allowedMimeTypes.includes(file.type)) {
          setError(`"${file.name}": file type "${file.type}" is not allowed.`);
          return [];
        }
      }

      setIsUploading(true);
      const assets: UploadedAsset[] = [];

      try {
        for (const file of files) {
          const result = await initFn({
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
          });

          const putRes = await fetch(result.upload.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });

          if (!putRes.ok) {
            throw new Error(`Upload failed for "${file.name}" (status ${putRes.status})`);
          }

          assets.push(result.asset);
        }

        return assets;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        return assets; // return any successfully uploaded assets
      } finally {
        setIsUploading(false);
      }
    },
    [options?.maxFiles, options?.maxFileSize, options?.allowedMimeTypes],
  );

  return { upload, isUploading, error, clearError };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/ui exec vitest run hooks/__tests__/use-media-upload.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Export hook from package index**

Add to `packages/shared/ui/src/index.ts` after line 5 (`export { useDebounce }...`):

```typescript
export { useMediaUpload, type UploadedAsset, type UploadInitFn, type UploadInitResult, type UseMediaUploadOptions, type UseMediaUploadReturn } from './hooks/use-media-upload';
```

- [ ] **Step 6: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: All packages pass

- [ ] **Step 7: Commit**

```bash
cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2
git add packages/shared/ui/src/hooks/use-media-upload.ts packages/shared/ui/src/hooks/__tests__/use-media-upload.test.ts packages/shared/ui/src/index.ts
git commit -m "feat: add shared useMediaUpload hook for presigned upload flow"
```

---

## Chunk 2: Admin Messages — File Upload

### Task 2: Add upload server actions to admin message-actions

**Files:**
- Modify: `apps/admin/src/actions/message-actions.ts:26-39`

- [ ] **Step 1: Add `uploadMessageFile` and `sendMessageWithAttachments` to message-actions.ts**

Append after line 65 (after the `rejectMessage` function):

```typescript
// apps/admin/src/actions/message-actions.ts — append

interface AttachmentInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}

export async function uploadMessageFile(
  conversationId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: AttachmentInput }> {
  const res = await apiFetch(`/api/v2/conversations/${conversationId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to initialize upload');
  }

  return res.json();
}

export async function sendMessageWithAttachments(
  conversationId: string,
  content: string,
  messageType: string,
  attachments: AttachmentInput[],
) {
  const res = await apiFetch(`/api/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, messageType, attachments }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to send message with attachments');
  }

  revalidatePath('/messages');
  revalidatePath('/cases');
  return res.json();
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter admin run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/actions/message-actions.ts
git commit -m "feat(admin): add uploadMessageFile and sendMessageWithAttachments actions"
```

### Task 3: Wire file upload into admin messages-center

**Files:**
- Modify: `apps/admin/src/components/messages-center.tsx:1-22,260-314`

- [ ] **Step 1: Add imports**

Add to the import block at the top of `messages-center.tsx`:

```typescript
import { useMediaUpload } from '@medical-crm/ui';
import {
  sendMessage,
  approveMessage,
  rejectMessage,
  createConversation,
  uploadMessageFile,
  sendMessageWithAttachments,
} from '@/actions/message-actions';
```

(Replace the existing `import { sendMessage, approveMessage, rejectMessage, createConversation }` import.)

- [ ] **Step 2: Add upload state and handler in ChatPanel**

Inside the `ChatPanel` component (the inner component that renders `ChatLayout`), add after the existing `handleSend` function (around line 269):

```typescript
  const { upload, isUploading, error: uploadError } = useMediaUpload();

  async function handleUploadFiles(files: File[]) {
    if (!conversationId) return;
    try {
      const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
        uploadMessageFile(conversationId, params);
      const assets = await upload(files, initFn);
      if (assets.length === 0) return;

      const messageType = assets.every((a) => a.mimeType.startsWith('image/')) ? 'IMAGE' : 'FILE';
      await sendMessageWithAttachments(conversationId, '', messageType, assets);
      await refetch();
    } catch (e) {
      console.error('Failed to upload files', e);
    }
  }
```

- [ ] **Step 3: Pass onUploadFiles and isUploading to ChatLayout**

Update the `<ChatLayout>` JSX (around line 305-314) to add the two new props:

```tsx
    <ChatLayout
      messages={chatMessages}
      onSend={handleSend}
      canSend={canReply}
      isSending={isSending}
      currentUserRole={perspectiveRole}
      showTranslation={true}
      className="h-full"
      inputNotice={moderationNotice}
      readOnlyNotice="Hospital conversation is view-only for admin. Reply is disabled."
      onUploadFiles={handleUploadFiles}
      isUploading={isUploading}
```

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter admin run typecheck`
Expected: PASS

- [ ] **Step 5: Manual test**

Open http://localhost:3002/messages, select a conversation, verify:
1. Paperclip button appears next to the text input
2. Clicking it opens file picker
3. Selected files show in preview strip
4. Clicking send uploads files and sends message with attachments

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/messages-center.tsx
git commit -m "feat(admin): enable file upload in messages conversation view"
```

---

## Chunk 3: Hospital Materials — Presigned Upload Preparation

> **Important:** This chunk is only partially frontend-owned. The current materials CRUD/read model is still URL-shaped (`heroImage`, `imageUrl`, `images[].url`, `videoUrl`). Do not persist raw `storageKey` values into those fields. If the companion backend contract patch is not merged yet, stop after wiring upload init + transient preview state and record the blocker.

### Task 4: Add uploadMaterialFile server action

**Files:**
- Modify: `apps/hospital/src/actions/materials-actions.ts:1-10`

- [ ] **Step 1: Add uploadMaterialFile to materials-actions.ts**

Append after the last function (`deleteBeforeAfterCase`):

```typescript
// apps/hospital/src/actions/materials-actions.ts — append

export async function uploadMaterialFile(
  materialKind: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number } }> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/upload`, {
    method: 'POST',
    body: JSON.stringify({ ...params, materialKind }),
  });
  return result as { upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number } };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter hospital run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/actions/materials-actions.ts
git commit -m "feat(hospital): add uploadMaterialFile server action for materials"
```

### Task 5: Update ImageUploadWidget to support presigned upload

**Files:**
- Modify: `apps/hospital/src/components/materials-tabs.tsx:82-180`

- [ ] **Step 1: Change `ImageUploadWidget` to return transient uploaded state, not a URL string**

Refactor `ImageUploadWidget` so `onUpload` returns uploaded metadata, not a raw `storageKey` string:

```typescript
interface UploadedMaterial {
  asset: {
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  };
  previewUrl: string;
}
```

Use an API like:

```typescript
onUpload?: (file: File) => Promise<UploadedMaterial>;
onChange: (value: string) => void; // existing URL/manual input support
```

Rules:
- keep showing `URL.createObjectURL(file)` as the immediate preview
- do not call `onChange(storageKey)`
- do not replace the displayed preview with a raw `storageKey`
- keep the existing manual URL input path for non-upload callers

- [ ] **Step 2: Add local loading/error UI**

Keep local `uploading` UI in the widget, but surface failures via the parent `useMediaUpload` error state rather than silently clearing the field.

- [ ] **Step 3: Run typecheck after all widget callers are migrated**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter hospital run typecheck`
Expected: PASS after Task 6 is complete

- [ ] **Step 4: Commit**

```bash
git add apps/hospital/src/components/materials-tabs.tsx
git commit -m "refactor(hospital): update materials upload widgets for transient uploaded state"
```

### Task 6: Wire material forms to use presigned upload

**Files:**
- Modify: `apps/hospital/src/components/materials-tabs.tsx` — multiple form sections

- [ ] **Step 1: Import `uploadMaterialFile` and `useMediaUpload`**

At the top of `materials-tabs.tsx`, add `uploadMaterialFile` to the actions import and `useMediaUpload` to the shared UI imports.

- [ ] **Step 2: Replace the bespoke uploader with the shared hook**

Do **not** add a `makeMaterialUploader` helper that performs its own `fetch PUT`. Instead, use the shared hook in `materials-tabs.tsx`:

```typescript
const { upload, isUploading, error: uploadError } = useMediaUpload();

async function uploadOne(
  file: File,
  materialKind: string,
): Promise<UploadedMaterial> {
  const assets = await upload([file], (params) => uploadMaterialFile(materialKind, params));
  const asset = assets[0];
  if (!asset) throw new Error(`Upload failed for "${file.name}"`);
  return {
    asset,
    previewUrl: URL.createObjectURL(file),
  };
}
```

- [ ] **Step 3: Update supported callers to keep `{ previewUrl, asset }` in local edit state**

Apply this pattern to:
- hero image: `materialKind: 'hero'`
- gallery images: `materialKind: 'gallery'`
- department images: reuse `materialKind: 'gallery'`
- equipment images: `materialKind: 'equipment'`
- surgeon photo: `materialKind: 'surgeon'`
- before/after case media: `materialKind: 'case'`
- cosmetic-hospital promotional videos: `materialKind: 'hospital_video'`
- cosmetic-hospital testimonial videos: `materialKind: 'testimonial_video'`

Rules:
- show `previewUrl` immediately in the editor
- keep uploaded metadata in local component state
- do **not** replace preview state with `storageKey`
- do **not** set `img/video src` to a raw `storageKey`

- [ ] **Step 4: Remove old `readFileAsDataUrl()` usage only for migrated callers**

After the supported callers above are migrated, remove obsolete `readFileAsDataUrl()` branches for those flows. Keep any fallback code that still has a live caller.

- [ ] **Step 5: Render upload errors in the materials UI**

Add a visible error area near the upload controls that renders `uploadError`, rather than only logging failures.

- [ ] **Step 6: Verify backend persistence support exists before changing submit payloads**

Required backend capabilities:
- save payload no longer treats uploaded assets as plain URL strings
- read payload resolves usable image/video URLs after reload

If that backend patch is **not** present:
- stop after upload-state integration
- record the blocker
- do **not** write raw `storageKey` values into `heroImage`, `imageUrl`, `images[].url`, `videoUrl`, `departmentImages[...]`, or similar URL fields

If that backend patch **is** present:
- map local uploaded assets into the new materials payload shape
- update save handlers for hero/gallery/surgeon/case/video/testimonial/department/equipment
- verify reloaded pages render server-resolved URLs rather than stale object URLs

- [ ] **Step 7: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter hospital run typecheck`
Expected: PASS

- [ ] **Step 8: Manual test**

Open http://localhost:3003/materials, verify:
1. Hero / gallery / surgeon / case uploads show immediate preview
2. Cosmetic video uploads use presigned upload rather than data URLs
3. No UI attempts to render a raw `storageKey` as `img` or `video` source
4. If backend contract patch is merged: saved materials still render after reload

- [ ] **Step 9: Commit**

```bash
git add apps/hospital/src/components/materials-tabs.tsx
git commit -m "feat(hospital): prepare materials UI for presigned uploads"
```

---

## Chunk 4: Admin Ticket Reply — Attachment Upload

### Task 7: Add ticket upload server actions

**Files:**
- Modify: `apps/admin/src/actions/ticket-actions.ts:1-19`

- [ ] **Step 1: Add `uploadTicketAttachment` and update `replyToTicket`**

Replace the `replyToTicket` function and add `uploadTicketAttachment` after it:

```typescript
// Replace existing replyToTicket (lines 6-19)
export async function replyToTicket(
  ticketId: string,
  content: string,
  attachments?: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }>,
) {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/reply`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      ...(attachments?.length ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to reply to ticket');
  }

  revalidatePath('/cases');
  return res.json();
}

export async function uploadTicketAttachment(
  ticketId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number } }> {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to initialize ticket attachment upload');
  }

  return res.json();
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter admin run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/actions/ticket-actions.ts
git commit -m "feat(admin): add uploadTicketAttachment action and update replyToTicket for attachments"
```

### Task 8: Add attachment UI to ticket reply

**Files:**
- Modify: `apps/admin/src/components/tabs/case-support-tab.tsx:1-7,48-219`

- [ ] **Step 1: Add imports**

Update imports at the top of `case-support-tab.tsx`:

```typescript
import { useState, useTransition, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, StatusBadge, EmptyState, useMediaUpload } from '@medical-crm/ui';
import { LifeBuoy, ChevronDown, ChevronUp, Send, X, Check, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { useTickets, useTicket } from '@/queries/use-tickets';
import { replyToTicket, updateTicketStatus, closeTicket, uploadTicketAttachment } from '@/actions/ticket-actions';
```

- [ ] **Step 2: Add upload state and file selection in CaseSupportDetailPanel**

Inside `CaseSupportDetailPanel` (after line 63, the `error` state), add:

```typescript
  const { upload, isUploading, error: uploadError } = useMediaUpload({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    maxFileSize: 20 * 1024 * 1024,
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = '';
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }
```

- [ ] **Step 3: Update handleReply to include attachments**

Replace the existing `handleReply` function:

```typescript
  function handleReply() {
    if (!replyContent.trim() && selectedFiles.length === 0) return;
    setError(null);
    startSend(async () => {
      try {
        let attachments: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }> | undefined;

        if (selectedFiles.length > 0) {
          const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
            uploadTicketAttachment(ticketId, params);
          const assets = await upload(selectedFiles, initFn);
          if (assets.length > 0) {
            attachments = assets;
          }
        }

        await replyToTicket(ticketId, replyContent.trim(), attachments);
        setReplyContent('');
        setSelectedFiles([]);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send reply');
      }
    });
  }
```

- [ ] **Step 4: Add file picker and preview UI before the textarea**

Replace the `{/* Reply input */}` section (lines 199-216):

```tsx
      {/* Reply input */}
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Attachment button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Attach files"
          >
            <Paperclip size={16} />
          </button>
          {(uploadError) && (
            <span className="text-xs text-rose-600">{uploadError}</span>
          )}
        </div>

        {/* Selected files preview */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-2 py-1 bg-white rounded border border-slate-200 text-xs"
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon size={14} className="text-cyan-500" />
                ) : (
                  <FileText size={14} className="text-blue-500" />
                )}
                <span className="max-w-[120px] truncate text-slate-600">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text input + send */}
        <div className="flex items-end gap-3">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Write a reply..."
            rows={3}
            disabled={isSending || isUploading}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
          />
          <button
            onClick={handleReply}
            disabled={isSending || isUploading || (!replyContent.trim() && selectedFiles.length === 0)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm disabled:opacity-50 transition-colors shrink-0"
          >
            <Send size={14} /> {isSending || isUploading ? 'Sending…' : 'Reply'}
          </button>
        </div>
      </div>
```

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter admin run typecheck`
Expected: PASS

- [ ] **Step 6: Manual test**

Navigate to a case → Support tab → open a ticket, verify:
1. Paperclip button appears above the reply textarea
2. Clicking it opens file picker
3. Selected files show in preview
4. Reply sends with attachments

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/tabs/case-support-tab.tsx
git commit -m "feat(admin): add file attachment support to ticket replies"
```

---

## Chunk 5: Admin & Hospital FAQ — Attachment Upload

### Task 9: Create FAQ upload server actions

**Files:**
- Create: `apps/admin/src/actions/faq-upload-actions.ts`
- Create: `apps/hospital/src/actions/faq-upload-actions.ts`

- [ ] **Step 1: Create admin FAQ upload action**

```typescript
// apps/admin/src/actions/faq-upload-actions.ts
'use server';

import { apiFetch } from '@/lib/api-fetch';

export async function uploadFaqAttachment(
  faqId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number } }> {
  const res = await apiFetch(`/api/v2/chatbot/faqs/${faqId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to initialize FAQ attachment upload');
  }

  return res.json();
}
```

- [ ] **Step 2: Create hospital FAQ upload action**

```typescript
// apps/hospital/src/actions/faq-upload-actions.ts
'use server';

import { apiClient } from '@/lib/api-client';

export async function uploadFaqAttachment(
  faqId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number } }> {
  return apiClient(`/api/v2/chatbot/faqs/${faqId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  }) as Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number } }>;
}
```

- [ ] **Step 3: Run typecheck for both**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter admin run typecheck && pnpm --filter hospital run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/actions/faq-upload-actions.ts apps/hospital/src/actions/faq-upload-actions.ts
git commit -m "feat: add FAQ attachment upload server actions for admin and hospital"
```

### Task 10: Add attachments to admin FAQ form

**Files:**
- Modify: `apps/admin/src/components/chatbot-faq-form-modal.tsx:1-6,35-43,155-169,287-315`

- [ ] **Step 1: Add imports**

Update imports at the top:

```typescript
import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { Modal, Button, useMediaUpload } from '@medical-crm/ui';
import { Paperclip, FileText, Image as ImageIcon, X as XIcon } from 'lucide-react';
import { createFaq, updateFaq } from '@/actions/chatbot-faq-actions';
import { uploadFaqAttachment } from '@/actions/faq-upload-actions';
```

- [ ] **Step 2: Add FaqAttachment type and extend FormState**

After the `FormState` interface (around line 43), add:

```typescript
interface FaqAttachment {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}
```

- [ ] **Step 3: Add attachment state in the component**

Inside `ChatbotFaqFormModal`, after the `isPending` state (around line 140):

```typescript
  const [attachments, setAttachments] = useState<FaqAttachment[]>([]);
  const { upload, isUploading, error: uploadError } = useMediaUpload({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxFileSize: 10 * 1024 * 1024,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing attachments on edit
  useEffect(() => {
    if (open && editFaq) {
      const existing = (editFaq as FaqRow & { attachments?: FaqAttachment[] }).attachments;
      setAttachments(existing ?? []);
    } else if (open) {
      setAttachments([]);
    }
    setPendingFiles([]);
  }, [open, editFaq]);

  // For new FAQs: store files locally until FAQ is created (two-phase flow)
  // For edit: upload immediately since faqId exists
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';

    if (isEdit && editFaq) {
      // Edit mode: upload immediately, faqId exists
      const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
        uploadFaqAttachment(editFaq.id, params);
      const assets = await upload(Array.from(files), initFn);
      if (assets.length > 0) {
        setAttachments((prev) => [...prev, ...assets]);
      }
    } else {
      // Create mode: store files locally, upload after FAQ is created
      setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    }
  }

  function removeAttachment(storageKey: string) {
    setAttachments((prev) => prev.filter((a) => a.storageKey !== storageKey));
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }
```

- [ ] **Step 4: Update handleSubmit for two-phase create flow**

Replace the `handleSubmit` function to support two-phase create (create FAQ → upload pending files → patch with attachments):

```typescript
  function handleSubmit() {
    setError(null);
    if (!form.category.trim()) { setError('Category is required.'); return; }
    if (!form.question.trim()) { setError('Question is required.'); return; }
    if (!form.answer.trim()) { setError('Answer is required.'); return; }

    startTransition(async () => {
      try {
        const keywords = form.keywordsRaw.split(',').map((s) => s.trim()).filter(Boolean);
        const basePayload = {
          category: form.category.trim(),
          question: form.question.trim(),
          answer: form.answer.trim(),
          hospitalType: form.hospitalType,
          keywords,
          sortOrder: parseInt(form.sortOrder, 10) || 0,
          isActive: form.isActive,
        };

        if (isEdit && editFaq) {
          // Edit: attachments already uploaded, just include in payload
          await updateFaq(editFaq.id, { ...basePayload, attachments });
        } else {
          // Create: two-phase flow
          // Phase 1: create FAQ without attachments
          const created = await createFaq(basePayload) as { id: string };

          // Phase 2: upload pending files using the real FAQ ID, then patch
          if (pendingFiles.length > 0) {
            const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
              uploadFaqAttachment(created.id, params);
            const uploadedAssets = await upload(pendingFiles, initFn);
            if (uploadedAssets.length > 0) {
              await updateFaq(created.id, { attachments: uploadedAssets });
            }
          }
        }
        onSuccess();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred');
      }
    });
  }
```

Note: The original `buildPayload` function is no longer needed as payload construction is inlined into `handleSubmit`.

- [ ] **Step 5: Add attachments UI section after Keywords (before isActive toggle)**

Insert before the `{/* isActive toggle */}` section (around line 299):

```tsx
        {/* Attachments */}
        <div>
          <label className={labelClass}>Attachments (images, PDF)</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleAttachmentUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors disabled:opacity-50"
          >
            <Paperclip size={12} /> {isUploading ? 'Uploading…' : 'Add Attachment'}
          </button>
          {uploadError && (
            <p className="mt-1 text-xs text-rose-600">{uploadError}</p>
          )}
          {/* Existing uploaded attachments (edit mode) */}
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {attachments.map((att) => (
                <div
                  key={att.storageKey}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                >
                  {att.mimeType.startsWith('image/') ? (
                    <ImageIcon size={14} className="text-cyan-500 shrink-0" />
                  ) : (
                    <FileText size={14} className="text-blue-500 shrink-0" />
                  )}
                  <span className="truncate text-slate-600 flex-1">{att.fileName}</span>
                  <span className="text-slate-400 shrink-0">
                    {att.fileSize < 1024 * 1024
                      ? `${Math.round(att.fileSize / 1024)}KB`
                      : `${(att.fileSize / 1024 / 1024).toFixed(1)}MB`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.storageKey)}
                    className="text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Pending files (create mode — will upload after FAQ is created) */}
          {pendingFiles.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {pendingFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 rounded-lg border border-amber-200 text-xs"
                >
                  {file.type.startsWith('image/') ? (
                    <ImageIcon size={14} className="text-cyan-500 shrink-0" />
                  ) : (
                    <FileText size={14} className="text-blue-500 shrink-0" />
                  )}
                  <span className="truncate text-slate-600 flex-1">{file.name}</span>
                  <span className="text-slate-400 shrink-0 italic">pending</span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(index)}
                    className="text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 6: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter admin run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/chatbot-faq-form-modal.tsx
git commit -m "feat(admin): add attachment upload to FAQ create/edit modal"
```

### Task 11: Add attachments to hospital FAQ modal

**Files:**
- Modify: `apps/hospital/src/components/faq-list.tsx:256-452`
- Modify: `apps/hospital/src/lib/api-types.ts`

- [ ] **Step 1: Add imports**

Update imports at the top of `faq-list.tsx`:

```typescript
import { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, X, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { useMediaUpload } from '@medical-crm/ui';
import { useFaqs } from '@/queries/use-faqs';
import { createFaqItem, updateFaqItem, deleteFaqItem } from '@/actions/faq-actions';
import { uploadFaqAttachment } from '@/actions/faq-upload-actions';
import type { FaqItem } from '@/lib/api-types';
```

Add `attachments` to `FaqItem` in `apps/hospital/src/lib/api-types.ts` so the modal does not rely on ad hoc casting.

- [ ] **Step 2: Add attachment type and state in FaqModal**

Inside `FaqModal` (around line 266), after the existing state declarations:

```typescript
  interface FaqAttachment {
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }

  const [attachments, setAttachments] = useState<FaqAttachment[]>(faq?.attachments ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const { upload, isUploading, error: uploadError } = useMediaUpload({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxFileSize: 10 * 1024 * 1024,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAttachments(faq?.attachments ?? []);
    setPendingFiles([]);
  }, [faq]);

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';

    if (faq) {
      // Edit mode: upload immediately
      const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
        uploadFaqAttachment(faq.id, params);
      const assets = await upload(Array.from(files), initFn);
      if (assets.length > 0) {
        setAttachments((prev) => [...prev, ...assets]);
      }
    } else {
      // Create mode: store locally, upload after FAQ is created
      setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    }
  }

  function removeAttachment(storageKey: string) {
    setAttachments((prev) => prev.filter((a) => a.storageKey !== storageKey));
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }
```

- [ ] **Step 3: Update handleSave for two-phase create**

Replace `handleSave` with two-phase create flow:

```typescript
  const handleSave = async () => {
    if (!question.trim() || !answer.trim()) {
      setError('Question and Answer are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const keywordsArray = keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const basePayload = {
        question,
        answer,
        category,
        hospitalType,
        keywords: keywordsArray,
        isActive,
      };
      if (faq) {
        // Edit: attachments already uploaded
        await updateFaqItem(faq.id, { ...basePayload, attachments });
      } else {
        // Create: two-phase flow
        const created = await createFaqItem(basePayload) as { id: string };
        if (pendingFiles.length > 0) {
          const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
            uploadFaqAttachment(created.id, params);
          const uploadedAssets = await upload(pendingFiles, initFn);
          if (uploadedAssets.length > 0) {
            await updateFaqItem(created.id, { attachments: uploadedAssets });
          }
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save FAQ');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 4: Add attachments UI section after Keywords input**

Insert before the `{/* Footer */}` section (around line 432):

```tsx
          {/* Attachments */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Attachments <span className="font-normal text-slate-400">(images, PDF)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={handleAttachmentUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              <Paperclip size={14} /> {isUploading ? 'Uploading…' : 'Add Attachment'}
            </button>
            {uploadError && (
              <p className="mt-1 text-sm text-rose-600">{uploadError}</p>
            )}
            {/* Existing uploaded attachments (edit mode) */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.storageKey}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  >
                    {att.mimeType.startsWith('image/') ? (
                      <ImageIcon size={16} className="text-cyan-500 shrink-0" />
                    ) : (
                      <FileText size={16} className="text-blue-500 shrink-0" />
                    )}
                    <span className="truncate text-slate-600 flex-1">{att.fileName}</span>
                    <span className="text-slate-400 text-xs shrink-0">
                      {att.fileSize < 1024 * 1024
                        ? `${Math.round(att.fileSize / 1024)}KB`
                        : `${(att.fileSize / 1024 / 1024).toFixed(1)}MB`}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.storageKey)}
                      className="text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Pending files (create mode) */}
            {pendingFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {pendingFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl border border-amber-200 text-sm"
                  >
                    {file.type.startsWith('image/') ? (
                      <ImageIcon size={16} className="text-cyan-500 shrink-0" />
                    ) : (
                      <FileText size={16} className="text-blue-500 shrink-0" />
                    )}
                    <span className="truncate text-slate-600 flex-1">{file.name}</span>
                    <span className="text-slate-400 text-xs italic shrink-0">pending</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(index)}
                      className="text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
```

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter hospital run typecheck`
Expected: PASS

- [ ] **Step 6: Manual test**

Open http://localhost:3003/chatbot-faq (hospital portal), verify:
1. Create FAQ → select files → shows as "pending" in amber
2. Save FAQ → files upload after creation → FAQ patched with attachments
3. Edit FAQ → existing attachments shown, new files upload immediately
4. Can remove both pending files and existing attachments

- [ ] **Step 7: Commit**

```bash
git add apps/hospital/src/components/faq-list.tsx apps/hospital/src/lib/api-types.ts
git commit -m "feat(hospital): add attachment upload to FAQ create/edit modal"
```

### Task 12: Final typecheck and integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck across all packages**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: All packages pass

- [ ] **Step 2: Run shared UI tests**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/ui exec vitest run`
Expected: All tests pass including new useMediaUpload tests

- [ ] **Step 3: Commit any fixes if needed**

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "chore: verify frontend upload integration plan checkpoints"
```
