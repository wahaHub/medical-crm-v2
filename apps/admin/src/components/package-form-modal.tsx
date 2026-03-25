'use client';

import { useState, useTransition, useEffect } from 'react';
import { Modal, Button } from '@medical-crm/ui';
import { createPackage, updatePackage } from '@/actions/package-actions';

// ── Types ─────────────────────────────────────────────────────────────

export interface PackageRow {
  id: string;
  nameEn: string;
  nameZh?: string | null;
  type: string;
  status: string;
  price: string;
  currency: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  coverImageUrl?: string | null;
  config?: unknown;
  sortWeight?: number;
  publishAt?: string | null;
  takedownAt?: string | null;
  createdAt: string;
}

interface PackageFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editPackage?: PackageRow | null;
}

// ── Constants ─────────────────────────────────────────────────────────

const PACKAGE_TYPES = [
  'CONSULTATION',
  'HEALTH_CHECKUP',
  'SECOND_OPINION',
  'VISA_PACKAGE',
  'INSURANCE',
  'ACCOMMODATION',
  'TREATMENT_DEPOSIT',
  'TRANSLATION',
] as const;

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD', 'JPY', 'KRW', 'THB'];

// ── Form State ────────────────────────────────────────────────────────

interface FormState {
  name: string;
  type: string;
  price: string;
  currency: string;
  description: string;
  sortWeight: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'CONSULTATION',
  price: '',
  currency: 'USD',
  description: '',
  sortWeight: '0',
};

function toFormState(pkg: PackageRow): FormState {
  return {
    name: pkg.nameEn || pkg.nameZh || '',
    type: pkg.type,
    price: pkg.price,
    currency: pkg.currency,
    description: pkg.descriptionEn ?? pkg.descriptionZh ?? '',
    sortWeight: String(pkg.sortWeight ?? 0),
  };
}

interface PackageImageItem {
  storageKey: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  previewUrl?: string;
}

interface UploadInitResponse {
  upload?: {
    uploadUrl: string;
    storageKey: string;
  };
  asset?: {
    storageKey: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
  };
  image?: {
    storageKey: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
  };
  message?: string;
}

function parseExistingImages(pkg: PackageRow | null | undefined): PackageImageItem[] {
  if (!pkg) return [];

  const dedupe = new Set<string>();
  const items: PackageImageItem[] = [];

  const pushImage = (image: PackageImageItem | null) => {
    if (!image || !image.storageKey) return;
    if (dedupe.has(image.storageKey)) return;
    dedupe.add(image.storageKey);
    items.push(image);
  };

  if (pkg.coverImageUrl) {
    pushImage({
      storageKey: pkg.coverImageUrl,
      fileName: pkg.coverImageUrl.split('/').pop() || 'cover-image',
      previewUrl: pkg.coverImageUrl.startsWith('http') ? pkg.coverImageUrl : undefined,
    });
  }

  if (pkg.config && typeof pkg.config === 'object') {
    const gallery = (pkg.config as Record<string, unknown>)['imageGallery'];
    if (Array.isArray(gallery)) {
      for (const entry of gallery) {
        if (typeof entry === 'string') {
          pushImage({
            storageKey: entry,
            fileName: entry.split('/').pop() || 'image',
            previewUrl: entry.startsWith('http') ? entry : undefined,
          });
          continue;
        }
        if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          const storageKey =
            (typeof obj['storageKey'] === 'string' && obj['storageKey']) ||
            (typeof obj['url'] === 'string' && obj['url']) ||
            '';
          if (!storageKey) continue;
          pushImage({
            storageKey,
            fileName:
              (typeof obj['fileName'] === 'string' && obj['fileName']) ||
              storageKey.split('/').pop() ||
              'image',
            mimeType: typeof obj['mimeType'] === 'string' ? obj['mimeType'] : undefined,
            fileSize: typeof obj['fileSize'] === 'number' ? obj['fileSize'] : undefined,
            previewUrl: storageKey.startsWith('http') ? storageKey : undefined,
          });
        }
      }
    }
  }

  return items;
}

// ── Component ─────────────────────────────────────────────────────────

export function PackageFormModal({ open, onClose, onSuccess, editPackage }: PackageFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [images, setImages] = useState<PackageImageItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = !!editPackage;

  useEffect(() => {
    if (open) {
      setForm(editPackage ? toFormState(editPackage) : EMPTY_FORM);
      setImages(parseExistingImages(editPackage ?? null));
      setError(null);
    }
  }, [open, editPackage]);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {
      nameEn: form.name,
      type: form.type,
      price: form.price,
      currency: form.currency,
      sortWeight: parseInt(form.sortWeight, 10) || 0,
    };
    if (form.description) payload['descriptionEn'] = form.description;

    const imageGallery = images.map((image) => ({
      storageKey: image.storageKey,
      fileName: image.fileName,
      mimeType: image.mimeType,
      fileSize: image.fileSize,
    }));

    const firstImage = imageGallery.at(0);
    if (firstImage) {
      payload['coverImageUrl'] = firstImage.storageKey;
      const baseConfig =
        editPackage?.config && typeof editPackage.config === 'object'
          ? (editPackage.config as Record<string, unknown>)
          : {};
      payload['config'] = {
        ...baseConfig,
        imageGallery,
      };
    } else if (isEdit) {
      payload['coverImageUrl'] = null;
      const baseConfig =
        editPackage?.config && typeof editPackage.config === 'object'
          ? (editPackage.config as Record<string, unknown>)
          : {};
      payload['config'] = {
        ...baseConfig,
        imageGallery: [],
      };
    }
    return payload;
  }

  async function handleImageUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setIsUploadingImages(true);
    try {
      const uploaded: PackageImageItem[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`"${file.name}" is not an image file.`);
        }

        const initRes = await fetch('/api/packages/images/upload-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          }),
        });

        const initBody = await initRes.json().catch(() => ({})) as UploadInitResponse;
        const uploadedAsset = initBody.asset ?? initBody.image;
        if (!initRes.ok || !initBody.upload || !uploadedAsset) {
          throw new Error(initBody.message ?? `Failed to initialize upload for "${file.name}".`);
        }

        const uploadRes = await fetch(initBody.upload.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Failed to upload "${file.name}".`);
        }

        uploaded.push({
          storageKey: uploadedAsset.storageKey,
          fileName: uploadedAsset.fileName,
          mimeType: uploadedAsset.mimeType,
          fileSize: uploadedAsset.fileSize,
          previewUrl: URL.createObjectURL(file),
        });
      }

      setImages((prev) => {
        const merged = [...prev];
        const seen = new Set(prev.map((item) => item.storageKey));
        for (const image of uploaded) {
          if (!seen.has(image.storageKey)) {
            seen.add(image.storageKey);
            merged.push(image);
          }
        }
        return merged;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload image(s)');
    } finally {
      setIsUploadingImages(false);
    }
  }

  function removeImage(storageKey: string) {
    setImages((prev) => prev.filter((image) => image.storageKey !== storageKey));
  }

  function handleSubmit() {
    setError(null);
    // Basic validation
    if (!form.name.trim()) { setError('Package name is required.'); return; }
    if (!form.price.match(/^\d+(\.\d{1,2})?$/)) { setError('Price must be a valid number (e.g. 99.99).'); return; }

    startTransition(async () => {
      try {
        const payload = buildPayload();
        if (isEdit && editPackage) {
          await updatePackage(editPackage.id, payload);
        } else {
          await createPackage(payload);
        }
        onSuccess();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred');
      }
    });
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Package' : 'Create Package'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className={labelClass}>Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g. Premium Consultation Package"
            className={inputClass}
            maxLength={200}
          />
        </div>

        {/* Type + Currency row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Type *</label>
            <select
              value={form.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className={inputClass}
            >
              {PACKAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select
              value={form.currency}
              onChange={(e) => handleChange('currency', e.target.value)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Price + Sort Weight row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Price * (e.g. 99.99)</label>
            <input
              type="text"
              value={form.price}
              onChange={(e) => handleChange('price', e.target.value)}
              placeholder="99.99"
              className={inputClass}
              pattern="^\d+(\.\d{1,2})?$"
            />
          </div>
          <div>
            <label className={labelClass}>Sort Weight</label>
            <input
              type="number"
              value={form.sortWeight}
              onChange={(e) => handleChange('sortWeight', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="Package description…"
          />
        </div>

        {/* Package Images */}
        <div>
          <label className={labelClass}>Package Images</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              void handleImageUpload(e.target.files);
              e.currentTarget.value = '';
            }}
            className={inputClass}
            disabled={isUploadingImages || isPending}
          />
          <p className="mt-1 text-xs text-slate-500">
            Upload one or more images. The first image will be used as cover.
          </p>
          {isUploadingImages && (
            <p className="mt-2 text-xs font-medium text-cyan-700">Uploading images...</p>
          )}
          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((image, index) => (
                <div key={image.storageKey} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="aspect-square overflow-hidden rounded-md bg-slate-100">
                    {image.previewUrl ? (
                      <img
                        src={image.previewUrl}
                        alt={image.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : image.storageKey.startsWith('http') ? (
                      <img
                        src={image.storageKey}
                        alt={image.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-500">
                        Uploaded
                      </div>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-600" title={image.fileName}>
                    {index === 0 ? 'Cover: ' : ''}
                    {image.fileName}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeImage(image.storageKey)}
                    className="mt-1 text-[11px] font-medium text-rose-600 hover:text-rose-700"
                    disabled={isPending}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Package'}
        </Button>
      </div>
    </Modal>
  );
}
