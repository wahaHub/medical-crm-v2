# Frontend Upload Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing backend `MediaUploadService` (14 policies, 8 endpoints) into 5 frontend integration points using a shared `useMediaUpload` hook.

**Architecture:** Shared `useMediaUpload` hook in `@medical-crm/ui` manages the upload-init → PUT → storageKey flow. Each portal (admin/hospital) has server actions that call the backend upload-init endpoints. Components call the hook with the appropriate server action as `initFn`.

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

## Chunk 3: Hospital Materials — Presigned Upload

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

- [ ] **Step 1: Update ImageUploadWidget props — replace `onFileSelect` with `onUpload`**

Replace the `ImageUploadWidget` function (lines 82-180) with:

```typescript
function ImageUploadWidget({
  value,
  onChange,
  onUpload,
  label = 'Image',
  placeholder = 'https://... or click Upload',
  previewClassName = 'h-40 w-full',
  compact = false,
}: {
  value: string;
  onChange: (url: string) => void;
  onUpload?: (file: File) => Promise<string>;
  label?: string;
  placeholder?: string;
  previewClassName?: string;
  compact?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onUpload) {
      // Show local preview immediately
      const previewUrl = URL.createObjectURL(file);
      onChange(previewUrl);
      // Upload in background, replace with storageKey when done
      setUploading(true);
      try {
        const storageKey = await onUpload(file);
        onChange(storageKey);
      } catch (err) {
        console.error('Upload failed:', err);
        onChange(''); // clear preview on failure
      } finally {
        setUploading(false);
      }
    } else {
      onChange(await readFileAsDataUrl(file));
    }
    e.target.value = '';
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500';

  if (compact) {
    return (
      <div>
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
        <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
        <div className="flex items-start gap-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer overflow-hidden shrink-0"
          >
            {value ? (
              <img src={value} alt={label} className="w-full h-full object-cover" />
            ) : uploading ? (
              <span className="text-[10px] font-medium">Uploading…</span>
            ) : (
              <>
                <Upload size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Upload</span>
              </>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
              placeholder={placeholder}
              disabled={uploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              <Upload size={12} /> {uploading ? 'Uploading…' : 'Choose File'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard mode
  return (
    <div>
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`flex-1 ${inputClass}`}
            placeholder={placeholder}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors shrink-0 disabled:opacity-50"
          >
            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {value && (
          <div className={`rounded-lg overflow-hidden border border-slate-200 ${previewClassName}`}>
            <img src={value} alt={label} className="h-full w-full object-cover" />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck — expect errors from callers still using `onFileSelect`**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter hospital run typecheck`
Expected: Errors at callers using the old `onFileSelect` prop (this is expected; we fix them next)

- [ ] **Step 3: Commit widget changes**

```bash
git add apps/hospital/src/components/materials-tabs.tsx
git commit -m "feat(hospital): update ImageUploadWidget to support presigned upload via onUpload prop"
```

### Task 6: Wire material forms to use presigned upload

**Files:**
- Modify: `apps/hospital/src/components/materials-tabs.tsx` — multiple form sections

This task updates all `ImageUploadWidget` callers and `readFileAsDataUrl` usages in material forms to use `uploadMaterialFile`. The pattern is the same for each: pass an `onUpload` prop that calls `uploadMaterialFile(materialKind, ...)` and returns the `storageKey`.

- [ ] **Step 1: Import uploadMaterialFile and useMediaUpload**

At the top of `materials-tabs.tsx`, add to the import from `@/actions/materials-actions`:

```typescript
import {
  updateHospitalInfo,
  createProcedure,
  updateProcedure,
  deleteProcedure,
  createSurgeon,
  updateSurgeon,
  deleteSurgeon,
  createBeforeAfterCase,
  updateBeforeAfterCase,
  deleteBeforeAfterCase,
  uploadMaterialFile,
} from '@/actions/materials-actions';
```

- [ ] **Step 2: Create a reusable `makeMaterialUploader` helper inside the file**

Add after the `readFileAsDataUrl` function (around line 79):

```typescript
/**
 * Creates an onUpload handler for ImageUploadWidget that calls the materials upload endpoint.
 * Returns a storageKey on success.
 */
function makeMaterialUploader(materialKind: string) {
  return async (file: File): Promise<string> => {
    const result = await uploadMaterialFile(materialKind, {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'image/jpeg',
    });
    // PUT file to presigned URL
    const putRes = await fetch(result.upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    });
    if (!putRes.ok) throw new Error(`Upload failed for "${file.name}"`);
    return result.asset.storageKey;
  };
}
```

- [ ] **Step 3: Update HospitalInfoTab — hero image**

Find the `ImageUploadWidget` usage for hero image (around line 1290):

```tsx
// Before:
<ImageUploadWidget
  value={form.heroImage ?? ''}
  onChange={(url) => setForm({ ...form, heroImage: url })}
  label="Hero Image"
  placeholder="https://... or click Upload"
  previewClassName="h-40 w-full"
/>

// After:
<ImageUploadWidget
  value={form.heroImage ?? ''}
  onChange={(url) => setForm({ ...form, heroImage: url })}
  onUpload={makeMaterialUploader('hero')}
  label="Hero Image"
  placeholder="https://... or click Upload"
  previewClassName="h-40 w-full"
/>
```

- [ ] **Step 4: Update SurgeonModal — surgeon photo (line 3163)**

Find the `ImageUploadWidget` usage for surgeon photo (line 3163, inside `SurgeonModal`):

```tsx
// Before:
<ImageUploadWidget
  value={imageUrl}
  onChange={setImageUrl}
  label="Profile Photo"
  placeholder="https://... or click Upload"
  compact
/>

// After:
<ImageUploadWidget
  value={imageUrl}
  onChange={setImageUrl}
  onUpload={makeMaterialUploader('surgeon')}
  label="Profile Photo"
  placeholder="https://... or click Upload"
  compact
/>
```

- [ ] **Step 4b: Update equipment image widget (line 2116)**

Find the `ImageUploadWidget` for equipment images (line 2116):

```tsx
// Before:
<ImageUploadWidget
  value={equip.imageUrl}
  onChange={(url) => { ... }}
  label="Equipment Image"
  ...
/>

// After — add onUpload:
<ImageUploadWidget
  value={equip.imageUrl}
  onChange={(url) => { ... }}
  onUpload={makeMaterialUploader('gallery')}
  label="Equipment Image"
  ...
/>
```

- [ ] **Step 5: Update HospitalInfoTab — gallery photos**

Find the `handlePhotoSelect` function (line 1176) that uses `readFileAsDataUrl` + `setPendingPhotos`. The current flow stores `{ previewUrl, file }` in `pendingPhotos` state and later processes them on save. Replace with presigned upload that still uses `pendingPhotos` for preview but uploads immediately:

```typescript
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const uploader = makeMaterialUploader('gallery');
    for (const file of Array.from(files)) {
      const previewUrl = URL.createObjectURL(file);
      // Add to pendingPhotos for preview (keep existing UX pattern)
      setPendingPhotos((prev) => [...prev, { previewUrl, file }]);
      try {
        const storageKey = await uploader(file);
        // Replace the preview URL with storageKey in pendingPhotos
        setPendingPhotos((prev) =>
          prev.map((p) => p.previewUrl === previewUrl ? { ...p, previewUrl: storageKey, file } : p),
        );
      } catch (err) {
        console.error('Gallery upload failed:', err);
        // Remove failed upload from pendingPhotos
        setPendingPhotos((prev) => prev.filter((p) => p.previewUrl !== previewUrl));
      }
    }
    e.target.value = '';
  };
```

Note: The save handler that processes `pendingPhotos` will now receive `storageKey` strings instead of data URLs in the `previewUrl` field. The implementer must verify the save flow and adjust how `pendingPhotos` are serialized into the form's gallery data on submit — storageKeys should be stored directly rather than being treated as image URLs.

- [ ] **Step 6: Update BeforeAfterCaseModal — case images**

Find `addImagesFromFiles` (around line 3421) that uses `readFileAsDataUrl`. Replace:

```typescript
  const addImagesFromFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const uploader = makeMaterialUploader('case');
    for (const file of Array.from(files)) {
      try {
        const storageKey = await uploader(file);
        setImageUrls((prev) => [...prev, storageKey]);
      } catch (err) {
        console.error('Case image upload failed:', err);
      }
    }
  };
```

- [ ] **Step 7: Update remaining `readFileAsDataUrl` usages (3 additional call sites)**

There are 3 more `readFileAsDataUrl` calls that must be replaced:

**Line 1434 — Promotional videos (`VideoUploadWidget` onAdd callback):**
Currently uses `readFileAsDataUrl(file)` to create a preview URL for video, stored in `pendingVideos` map. Replace with:
```typescript
onAdd={(file) => {
  const previewUrl = URL.createObjectURL(file);
  setPendingVideos((prev) => new Map(prev).set(previewUrl, file));
  setPromotionalVideos((prev) => [...prev, previewUrl]);
  // Upload in background
  void makeMaterialUploader('hospital_video')(file).then((storageKey) => {
    setPendingVideos((prev) => { const m = new Map(prev); m.delete(previewUrl); m.set(storageKey, file); return m; });
    setPromotionalVideos((prev) => prev.map((v) => v === previewUrl ? storageKey : v));
  }).catch((err) => console.error('Video upload failed:', err));
}}
```

**Line 1463 — Testimonial video upload:**
Currently uses `readFileAsDataUrl(file)` for testimonial video preview. Replace with:
```typescript
onChange={(e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const previewUrl = URL.createObjectURL(file);
  setPendingTestimonial({
    previewUrl,
    file,
    patientName: '',
    patientCountry: '',
    procedureName: '',
  });
  setIsAddingTestimonial(true);
  // Upload in background
  void makeMaterialUploader('testimonial_video')(file).then((storageKey) => {
    setPendingTestimonial((prev) => prev ? { ...prev, previewUrl: storageKey } : prev);
  }).catch((err) => console.error('Testimonial upload failed:', err));
  e.target.value = '';
}}
```

**Line 1898 — Department image upload:**
Currently uses `readFileAsDataUrl(file)` for department images. Replace with:
```typescript
onChange={(e) => {
  const file = e.target.files?.[0];
  if (file) {
    const previewUrl = URL.createObjectURL(file);
    setPendingDeptImages((prev) => {
      const m = new Map(prev);
      m.set(deptValue, { previewUrl, file });
      return m;
    });
    setDeptImages((prev) => ({ ...prev, [deptValue]: previewUrl }));
    // Upload in background
    void makeMaterialUploader('gallery')(file).then((storageKey) => {
      setPendingDeptImages((prev) => {
        const m = new Map(prev);
        m.set(deptValue, { previewUrl: storageKey, file });
        return m;
      });
      setDeptImages((prev) => ({ ...prev, [deptValue]: storageKey }));
    }).catch((err) => console.error('Dept image upload failed:', err));
  }
  e.target.value = '';
}}
```

Note: All replacements use `URL.createObjectURL` for immediate preview and `makeMaterialUploader` for background upload. The `materialKind` values must match what the backend `resolveMaterialsPolicyId` expects.

- [ ] **Step 8: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter hospital run typecheck`
Expected: PASS

- [ ] **Step 9: Manual test**

Open http://localhost:3003/materials, verify:
1. Hospital info tab: hero image upload works (shows preview, then saves storageKey)
2. Surgeons tab: surgeon photo upload works
3. Before/After tab: case image upload works
4. Gallery images upload works

- [ ] **Step 10: Commit**

```bash
git add apps/hospital/src/components/materials-tabs.tsx
git commit -m "feat(hospital): wire materials forms to use presigned upload via MediaUploadService"
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
  }, [open, editFaq]);

  // Generate a stable draft ID for new FAQ uploads
  const [draftId] = useState(() => `draft_${crypto.randomUUID()}`);
  const faqId = editFaq?.id ?? draftId;

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';

    const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
      uploadFaqAttachment(faqId, params);
    const assets = await upload(Array.from(files), initFn);
    if (assets.length > 0) {
      setAttachments((prev) => [...prev, ...assets]);
    }
  }

  function removeAttachment(storageKey: string) {
    setAttachments((prev) => prev.filter((a) => a.storageKey !== storageKey));
  }
```

- [ ] **Step 4: Update buildPayload to include attachments**

In the `buildPayload` function, add `attachments` to the returned object:

```typescript
  function buildPayload() {
    const keywords = form.keywordsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      category: form.category.trim(),
      question: form.question.trim(),
      answer: form.answer.trim(),
      hospitalType: form.hospitalType,
      keywords,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      isActive: form.isActive,
      attachments,
    };
  }
```

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

- [ ] **Step 1: Add imports**

Update imports at the top of `faq-list.tsx`:

```typescript
import { useState, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, X, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { useMediaUpload } from '@medical-crm/ui';
import { useFaqs } from '@/queries/use-faqs';
import { createFaqItem, updateFaqItem, deleteFaqItem } from '@/actions/faq-actions';
import { uploadFaqAttachment } from '@/actions/faq-upload-actions';
import type { FaqItem } from '@/lib/api-types';
```

- [ ] **Step 2: Add attachment type and state in FaqModal**

Inside `FaqModal` (around line 266), after the existing state declarations:

```typescript
  interface FaqAttachment {
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }

  const [attachments, setAttachments] = useState<FaqAttachment[]>(
    (faq as FaqItem & { attachments?: FaqAttachment[] })?.attachments ?? [],
  );
  const { upload, isUploading, error: uploadError } = useMediaUpload({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxFileSize: 10 * 1024 * 1024,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftId] = useState(() => `draft_${crypto.randomUUID()}`);
  const faqId = faq?.id ?? draftId;

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';

    const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
      uploadFaqAttachment(faqId, params);
    const assets = await upload(Array.from(files), initFn);
    if (assets.length > 0) {
      setAttachments((prev) => [...prev, ...assets]);
    }
  }

  function removeAttachment(storageKey: string) {
    setAttachments((prev) => prev.filter((a) => a.storageKey !== storageKey));
  }
```

- [ ] **Step 3: Update handleSave to include attachments**

Update the `handleSave` function to include attachments in the payload:

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
      const payload = {
        question,
        answer,
        category,
        hospitalType,
        keywords: keywordsArray,
        isActive,
        attachments,
      };
      if (faq) {
        await updateFaqItem(faq.id, payload);
      } else {
        await createFaqItem(payload);
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
          </div>
```

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter hospital run typecheck`
Expected: PASS

- [ ] **Step 6: Manual test**

Open http://localhost:3003/chatbot-faq (hospital portal), verify:
1. Create FAQ → attachments section visible
2. Upload image/PDF → shows in attachment list
3. Save FAQ → attachments included in payload
4. Edit FAQ → existing attachments shown, can add/remove

- [ ] **Step 7: Commit**

```bash
git add apps/hospital/src/components/faq-list.tsx
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
git commit --allow-empty -m "chore: frontend upload integration complete — all 5 integration points wired"
```
