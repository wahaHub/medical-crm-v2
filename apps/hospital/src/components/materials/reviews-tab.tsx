'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, LoadingSpinner, Modal } from '@medical-crm/ui';
import {
  ArrowDown,
  ArrowUp,
  ImageIcon,
  MessageSquareQuote,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  ShieldOff,
  Star,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { ApiError } from '@/lib/errors';
import { queryFetch } from '@/lib/query-fetch';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import {
  ImageUploadWidget,
  UploadProgressModal,
  formatUserFacingError,
  getFlashClass,
  isLocalPreviewUrl,
  type SaveProgressState,
  uploadMaterialAsset,
} from '@/components/materials-tabs';

export type ReviewMediaItem = {
  id: string;
  type: 'image' | 'video';
  url: string;
  storageKey?: string | null;
  thumbnailUrl: string;
  thumbnailStorageKey?: string | null;
  caption: string;
  sortOrder: number;
};

export type MaterialsReviewDTO = {
  id: string;
  sortOrder: number;
  isActive: boolean;
  featured: boolean;
  patientName: string;
  patientCountry: string;
  patientAvatarUrl: string;
  patientAvatarStorageKey?: string | null;
  treatmentName: string;
  reviewTitle: string;
  reviewComment: string;
  rating: number;
  reviewDate: string;
  media: ReviewMediaItem[];
};

export type MaterialsReviewMutationPayload = Omit<
  MaterialsReviewDTO,
  'patientCountry' | 'patientAvatarUrl' | 'treatmentName' | 'reviewTitle' | 'reviewDate' | 'media'
> & {
  patientCountry: string | null;
  patientAvatarUrl: string | null;
  treatmentName: string | null;
  reviewTitle: string | null;
  reviewDate: string | null;
  media: Array<Omit<ReviewMediaItem, 'id' | 'thumbnailUrl' | 'caption'> & {
    id?: string;
    thumbnailUrl: string | null;
    caption: string | null;
  }>;
};

type ToastState = {
  kind: 'success' | 'error';
  message: string;
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortReviews(items: MaterialsReviewDTO[]) {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder);
}

function sortMedia(items: ReviewMediaItem[]) {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder);
}

function toNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return value.trim().length > 0 ? value : null;
}

function toPersistedId(value: string): string | undefined {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

export function buildReviewMutationPayload(review: MaterialsReviewDTO): MaterialsReviewMutationPayload {
  return {
    ...review,
    patientCountry: toNullableString(review.patientCountry),
    patientAvatarUrl: review.patientAvatarStorageKey ?? toNullableString(review.patientAvatarUrl),
    treatmentName: toNullableString(review.treatmentName),
    reviewTitle: toNullableString(review.reviewTitle),
    reviewDate: toNullableString(review.reviewDate),
    media: sortMedia(review.media)
      .filter((item) => item.url.trim())
      .map((item, index) => ({
        ...item,
        id: toPersistedId(item.id),
        url: item.storageKey ?? item.url,
        thumbnailUrl: item.thumbnailStorageKey ?? toNullableString(item.thumbnailUrl),
        caption: toNullableString(item.caption),
        sortOrder: index,
      })),
  };
}

function normalizeReview(input?: Partial<MaterialsReviewDTO> | null): MaterialsReviewDTO {
  return {
    id: input?.id ?? '',
    sortOrder: input?.sortOrder ?? 0,
    isActive: input?.isActive ?? true,
    featured: input?.featured ?? false,
    patientName: input?.patientName ?? '',
    patientCountry: input?.patientCountry ?? '',
    patientAvatarUrl: input?.patientAvatarUrl ?? '',
    patientAvatarStorageKey: input?.patientAvatarStorageKey ?? null,
    treatmentName: input?.treatmentName ?? '',
    reviewTitle: input?.reviewTitle ?? '',
    reviewComment: input?.reviewComment ?? '',
    rating: input?.rating ?? 5,
    reviewDate: input?.reviewDate ?? '',
    media: sortMedia((input?.media ?? []).map((item, index) => ({
      id: item.id || createId('media'),
      type: item.type ?? 'image',
      url: item.url ?? '',
      storageKey: item.storageKey ?? null,
      thumbnailUrl: item.thumbnailUrl ?? '',
      thumbnailStorageKey: item.thumbnailStorageKey ?? null,
      caption: item.caption ?? '',
      sortOrder: item.sortOrder ?? index,
    }))),
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function moveList<T extends { sortOrder: number }>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [current] = next.splice(index, 1);
  if (!current) {
    return items;
  }
  next.splice(nextIndex, 0, current);
  return next.map((item, mappedIndex) => ({ ...item, sortOrder: mappedIndex }));
}

function ToastBanner({ toast }: { toast: ToastState | null }) {
  if (!toast) {
    return null;
  }

  const tone = toast.kind === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm font-medium ${tone}`}>
      {toast.message}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1 text-amber-400">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={14}
          className={index < rating ? 'fill-current' : 'text-slate-300'}
        />
      ))}
    </div>
  );
}

function ReviewEditor({
  open,
  review,
  onClose,
  onSaved,
}: {
  open: boolean;
  review: MaterialsReviewDTO | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useHospitalI18n();
  const [form, setForm] = useState<MaterialsReviewDTO>(() => normalizeReview());
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingMediaFiles, setPendingMediaFiles] = useState<Map<string, File>>(new Map());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [flashTarget, setFlashTarget] = useState<'basic' | 'content' | 'media' | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const basicRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(normalizeReview(review));
    setPendingAvatarFile(null);
    setPendingMediaFiles(new Map());
  }, [open, review]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const updateField = <K extends keyof MaterialsReviewDTO>(field: K, value: MaterialsReviewDTO[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setSectionError = (target: 'basic' | 'content' | 'media', message: string) => {
    setFlashTarget(target);
    const refs = { basic: basicRef, content: contentRef, media: mediaRef };
    refs[target].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setFlashTarget(null), 2200);
    setToast({ kind: 'error', message });
  };

  const addMediaFromFiles = (files: FileList | null, type: 'image' | 'video') => {
    if (!files) {
      return;
    }

    const accepted = Array.from(files).filter((file) => file.type.startsWith(`${type}/`));
    if (accepted.length === 0) {
      return;
    }

    const nextMedia = [...form.media];
    const nextPending = new Map(pendingMediaFiles);
    for (const file of accepted) {
      const previewUrl = URL.createObjectURL(file);
      nextMedia.push({
        id: createId('media'),
        type,
        url: previewUrl,
        thumbnailUrl: '',
        caption: '',
        sortOrder: nextMedia.length,
      });
      nextPending.set(previewUrl, file);
    }

    updateField('media', nextMedia);
    setPendingMediaFiles(nextPending);
  };

  const handleSave = async () => {
    setIsSaving(true);

    const pendingMediaEntries = form.media
      .map((item, index) => ({ item, index, file: pendingMediaFiles.get(item.url) }))
      .filter((entry): entry is { item: ReviewMediaItem; index: number; file: File } => Boolean(
        entry.file && isLocalPreviewUrl(entry.item.url),
      ));

    setSaveProgress({
      open: true,
      title: review?.id
        ? t('hospital.materials.reviews.savingEditTitle', undefined, 'Saving review')
        : t('hospital.materials.reviews.savingCreateTitle', undefined, 'Creating review'),
      canDismiss: false,
      items: [
        ...(pendingAvatarFile ? [{
          id: 'upload-avatar',
          label: t('hospital.materials.reviews.uploadAvatarTask', undefined, 'Upload avatar'),
          targetKey: 'basic',
          status: 'pending' as const,
        }] : []),
        ...pendingMediaEntries.map((entry, index) => ({
          id: `upload-media-${index}`,
          label: entry.item.type === 'video'
            ? t('hospital.materials.reviews.uploadVideoTask', { index: index + 1 }, 'Upload review video {index}')
            : t('hospital.materials.reviews.uploadImageTask', { index: index + 1 }, 'Upload review image {index}'),
          targetKey: 'media',
          status: 'pending' as const,
        })),
        {
          id: 'save-review',
          label: review?.id
            ? t('hospital.materials.reviews.saveEditAction', undefined, 'Save review')
            : t('hospital.materials.reviews.saveCreateAction', undefined, 'Create review'),
          targetKey: 'content',
          status: 'pending' as const,
        },
      ],
    });

    try {
      const patientAvatarUrl = form.patientAvatarUrl;
      let patientAvatarStorageKey = form.patientAvatarStorageKey ?? null;
      if (pendingAvatarFile && isLocalPreviewUrl(form.patientAvatarUrl)) {
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => item.id === 'upload-avatar' ? { ...item, status: 'uploading' } : item),
        }));
        const asset = await uploadMaterialAsset(pendingAvatarFile, 'review_avatar');
        patientAvatarStorageKey = asset.storageKey;
        setForm((current) => ({
          ...current,
          patientAvatarStorageKey: asset.storageKey,
        }));
        setPendingAvatarFile(null);
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => item.id === 'upload-avatar' ? { ...item, status: 'done' } : item),
        }));
      }

      const media = [...form.media];
      for (const [index, entry] of pendingMediaEntries.entries()) {
        const taskId = `upload-media-${index}`;
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => item.id === taskId ? { ...item, status: 'uploading' } : item),
        }));
        const asset = await uploadMaterialAsset(entry.file, entry.item.type === 'video' ? 'review_video' : 'review_image');
        media[entry.index] = { ...media[entry.index]!, storageKey: asset.storageKey };
        setForm((current) => ({
          ...current,
          media: current.media.map((item) => (
            item.id === entry.item.id ? { ...item, storageKey: asset.storageKey } : item
          )),
        }));
        setPendingMediaFiles((current) => {
          const next = new Map(current);
          next.delete(entry.item.url);
          return next;
        });
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => item.id === taskId ? { ...item, status: 'done' } : item),
        }));
      }

      setSaveProgress((current) => ({
        ...current,
        items: current.items.map((item) => item.id === 'save-review' ? { ...item, status: 'saving' } : item),
      }));

      const payload = buildReviewMutationPayload({
        ...form,
        patientAvatarUrl,
        patientAvatarStorageKey,
        media,
      });

      await requestJson(
        review?.id ? `/api/materials/reviews/${review.id}` : '/api/materials/reviews',
        {
          method: review?.id ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );

      setSaveProgress((current) => ({
        ...current,
        canDismiss: true,
        items: current.items.map((item) => item.id === 'save-review' ? { ...item, status: 'done' } : item),
      }));
      setToast({
        kind: 'success',
        message: t('hospital.materials.reviews.saveSucceeded', undefined, 'Review saved.'),
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      const issuePath = JSON.stringify(saveError);
      const target = /patient(Name|Country|Avatar)|rating|reviewDate|treatmentName/i.test(issuePath)
        ? 'basic'
        : /reviewTitle|reviewComment/i.test(issuePath)
          ? 'content'
          : 'media';
      const message = formatUserFacingError(
        saveError,
        t,
        'hospital.materials.reviews.saveFailed',
        'Failed to save review.',
      );

      setSaveProgress((current) => ({
        ...current,
        canDismiss: true,
        failedTargetKey: target,
        items: current.items.map((item) => item.id === 'save-review' ? { ...item, status: 'failed', error: message } : item),
      }));
      setSectionError(target, message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={review?.id
        ? t('hospital.materials.reviews.editReview', undefined, 'Edit Review')
        : t('hospital.materials.reviews.addReview', undefined, 'Add Review')}
      maxWidth="max-w-4xl"
    >
      <UploadProgressModal
        state={saveProgress}
        onDismiss={() => {
          const target = (saveProgress.failedTargetKey as 'basic' | 'content' | 'media' | undefined) ?? 'media';
          setSaveProgress({ open: false, title: '', items: [], canDismiss: false });
          setFlashTarget(target);
          const refs = { basic: basicRef, content: contentRef, media: mediaRef };
          refs[target].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.setTimeout(() => setFlashTarget(null), 2200);
        }}
      />

      <div className="space-y-5 max-h-[85vh] overflow-y-auto pr-1">
        <ToastBanner toast={toast} />

        <section
          ref={basicRef}
          className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-5 ${getFlashClass(flashTarget === 'basic')}`}
        >
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-slate-900">
              {t('hospital.materials.reviews.sections.basicInfo', undefined, 'Basic Info')}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              {t('hospital.materials.reviews.sections.basicInfoDescription', undefined, 'Patient identity, treatment context, and review metadata.')}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('hospital.materials.reviews.fields.patientName', undefined, 'Patient Name')}
              </label>
              <input
                value={form.patientName}
                onChange={(event) => updateField('patientName', event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder={t('hospital.materials.reviews.placeholders.patientName', undefined, 'Sarah Johnson')}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('hospital.materials.reviews.fields.patientCountry', undefined, 'Country')}
              </label>
              <input
                value={form.patientCountry}
                onChange={(event) => updateField('patientCountry', event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder={t('hospital.materials.reviews.placeholders.patientCountry', undefined, 'USA')}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('hospital.materials.reviews.fields.treatmentName', undefined, 'Treatment Name')}
              </label>
              <input
                value={form.treatmentName}
                onChange={(event) => updateField('treatmentName', event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder={t('hospital.materials.reviews.placeholders.treatmentName', undefined, 'LASIK Surgery')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t('hospital.materials.reviews.fields.rating', undefined, 'Rating')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={form.rating}
                  onChange={(event) => updateField('rating', Math.max(1, Math.min(5, Number(event.target.value) || 1)))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t('hospital.materials.reviews.fields.reviewDate', undefined, 'Review Date')}
                </label>
                <input
                  type="date"
                  value={form.reviewDate}
                  onChange={(event) => updateField('reviewDate', event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_auto_auto]">
            <ImageUploadWidget
              value={form.patientAvatarUrl}
              onChange={(value) => setForm((current) => ({
                ...current,
                patientAvatarUrl: value,
                patientAvatarStorageKey: null,
              }))}
              onFileSelect={(file, previewUrl) => {
                setPendingAvatarFile(file);
                setForm((current) => ({
                  ...current,
                  patientAvatarUrl: previewUrl,
                  patientAvatarStorageKey: null,
                }));
              }}
              allowDirectUrl={false}
              compact
              label={t('hospital.materials.reviews.fields.patientAvatar', undefined, 'Patient Avatar')}
            />
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => updateField('featured', event.target.checked)}
              />
              {t('hospital.materials.reviews.fields.featured', undefined, 'Featured')}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateField('isActive', event.target.checked)}
              />
              {t('hospital.materials.reviews.fields.active', undefined, 'Active')}
            </label>
          </div>
        </section>

        <section
          ref={contentRef}
          className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-5 ${getFlashClass(flashTarget === 'content')}`}
        >
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-slate-900">
              {t('hospital.materials.reviews.sections.content', undefined, 'Content')}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              {t('hospital.materials.reviews.sections.contentDescription', undefined, 'Headline and body copy shown in the patient reviews module.')}
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('hospital.materials.reviews.fields.reviewTitle', undefined, 'Review Title')}
              </label>
              <input
                value={form.reviewTitle}
                onChange={(event) => updateField('reviewTitle', event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder={t('hospital.materials.reviews.placeholders.reviewTitle', undefined, 'Life-changing experience')}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('hospital.materials.reviews.fields.reviewComment', undefined, 'Review Comment')}
              </label>
              <textarea
                value={form.reviewComment}
                onChange={(event) => updateField('reviewComment', event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder={t('hospital.materials.reviews.placeholders.reviewComment', undefined, 'Share the patient story and outcome.')}
              />
            </div>
          </div>
        </section>

        <section
          ref={mediaRef}
          className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-5 ${getFlashClass(flashTarget === 'media')}`}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {t('hospital.materials.reviews.sections.media', undefined, 'Media')}
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                {t('hospital.materials.reviews.sections.mediaDescription', undefined, 'Upload image and video evidence, set captions, and control ordering.')}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  addMediaFromFiles(event.target.files, 'image');
                  event.target.value = '';
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  addMediaFromFiles(event.target.files, 'video');
                  event.target.value = '';
                }}
              />
              <Button type="button" variant="outline" onClick={() => imageInputRef.current?.click()} className="gap-2">
                <Upload size={14} />
                {t('hospital.materials.reviews.addImage', undefined, 'Add Image')}
              </Button>
              <Button type="button" variant="outline" onClick={() => videoInputRef.current?.click()} className="gap-2">
                <Video size={14} />
                {t('hospital.materials.reviews.addVideo', undefined, 'Add Video')}
              </Button>
            </div>
          </div>

          {form.media.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              {t('hospital.materials.reviews.emptyMedia', undefined, 'No media attached yet.')}
            </div>
          ) : (
            <div className="space-y-4">
              {sortMedia(form.media).map((item, index) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-4">
                    <div className="h-24 w-24 overflow-hidden rounded-xl bg-slate-100">
                      {item.type === 'video' ? (
                        item.thumbnailUrl || item.url ? (
                          <div className="relative h-full w-full">
                            {item.thumbnailUrl || !isLocalPreviewUrl(item.url) ? (
                              <img src={item.thumbnailUrl || ''} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <video src={item.url} className="h-full w-full object-cover" />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                              <Play size={18} className="text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-300">
                            <Video size={20} />
                          </div>
                        )
                      ) : item.url ? (
                        <img src={item.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-300">
                          <ImageIcon size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                        <select
                          value={item.type}
                          onChange={(event) => updateField('media', form.media.map((mediaItem) => (
                            mediaItem.id === item.id ? { ...mediaItem, type: event.target.value as 'image' | 'video' } : mediaItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option value="image">image</option>
                          <option value="video">video</option>
                        </select>
                        <input
                          value={item.thumbnailUrl}
                          onChange={(event) => updateField('media', form.media.map((mediaItem) => (
                            mediaItem.id === item.id
                              ? { ...mediaItem, thumbnailUrl: event.target.value, thumbnailStorageKey: null }
                              : mediaItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={t('hospital.materials.reviews.placeholders.thumbnailUrl', undefined, 'Thumbnail URL for videos (optional)')}
                        />
                      </div>
                      <textarea
                        value={item.caption}
                        onChange={(event) => updateField('media', form.media.map((mediaItem) => (
                          mediaItem.id === item.id ? { ...mediaItem, caption: event.target.value } : mediaItem
                        )))}
                        rows={2}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder={t('hospital.materials.reviews.placeholders.caption', undefined, 'Caption')}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateField('media', moveList(sortMedia(form.media), index, -1))}
                          disabled={index === 0}
                          className="gap-2"
                        >
                          <ArrowUp size={14} />
                          {t('hospital.materials.reviews.moveUp', undefined, 'Move up')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateField('media', moveList(sortMedia(form.media), index, 1))}
                          disabled={index === form.media.length - 1}
                          className="gap-2"
                        >
                          <ArrowDown size={14} />
                          {t('hospital.materials.reviews.moveDown', undefined, 'Move down')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateField('media', form.media.filter((mediaItem) => mediaItem.id !== item.id))}
                          className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                          {t('hospital.materials.buttons.delete', undefined, 'Delete')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('hospital.materials.buttons.cancel', undefined, 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? t('hospital.materials.buttons.saving', undefined, 'Saving...')
              : t('hospital.materials.actions.save', undefined, 'Save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ReviewsTab() {
  const { t } = useHospitalI18n();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<MaterialsReviewDTO | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['materials', 'reviews'],
    queryFn: () => queryFetch<MaterialsReviewDTO[]>('/api/materials/reviews'),
  });

  const reviews = useMemo(() => sortReviews(data ?? []), [data]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['materials', 'reviews'] });
  };

  const savePatch = async (item: MaterialsReviewDTO, patch: Partial<MaterialsReviewDTO>) => {
    try {
      await requestJson(`/api/materials/reviews/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      await refresh();
    } catch (saveError) {
      setToast({
        kind: 'error',
        message: formatUserFacingError(
          saveError,
          t,
          'hospital.materials.reviews.saveFailed',
          'Failed to save review.',
        ),
      });
    }
  };

  const handleDelete = async (item: MaterialsReviewDTO) => {
    if (!confirm(t('hospital.materials.reviews.confirmDelete', undefined, 'Delete this review?'))) {
      return;
    }

    try {
      await requestJson(`/api/materials/reviews/${item.id}`, { method: 'DELETE' });
      await refresh();
      setToast({
        kind: 'success',
        message: t('hospital.materials.reviews.deleteSucceeded', undefined, 'Review deleted.'),
      });
    } catch (deleteError) {
      setToast({
        kind: 'error',
        message: formatUserFacingError(
          deleteError,
          t,
          'hospital.materials.reviews.deleteFailed',
          'Failed to delete review.',
        ),
      });
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const reordered = moveList(reviews, index, direction);
    const changedItems = reordered.filter((item, reorderedIndex) => item.sortOrder !== reviews[reorderedIndex]?.sortOrder);
    if (changedItems.length === 0) {
      return;
    }

    try {
      await Promise.all(changedItems.map((item) => requestJson(`/api/materials/reviews/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ sortOrder: item.sortOrder }),
      })));
      await refresh();
    } catch (reorderError) {
      setToast({
        kind: 'error',
        message: formatUserFacingError(
          reorderError,
          t,
          'hospital.materials.reviews.reorderFailed',
          'Failed to reorder reviews.',
        ),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<MessageSquareQuote size={40} />}
        title={t('hospital.materials.reviews.loadFailedTitle', undefined, 'Reviews failed to load')}
        description={formatUserFacingError(
          error,
          t,
          'hospital.materials.reviews.loadFailedDescription',
          'Unable to load reviews right now.',
        )}
        action={(
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['materials', 'reviews'] })}>
            {t('hospital.materials.reviews.retry', undefined, 'Retry')}
          </Button>
        )}
      />
    );
  }

  return (
    <div className="space-y-5">
      <ToastBanner toast={toast} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('hospital.materials.reviews.title', undefined, 'Patient Reviews')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('hospital.materials.reviews.description', undefined, 'Manage the review cards that feed the patient reviews section on the consumer site.')}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingReview(null);
            setEditorOpen(true);
          }}
          className="gap-2"
        >
          <Plus size={16} />
          {t('hospital.materials.reviews.addReview', undefined, 'Add Review')}
        </Button>
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote size={40} />}
          title={t('hospital.materials.reviews.emptyTitle', undefined, 'No reviews yet')}
          description={t('hospital.materials.reviews.emptyDescription', undefined, 'Create the first patient review to build trust on the consumer-facing profile.')}
          action={(
            <Button
              onClick={() => {
                setEditingReview(null);
                setEditorOpen(true);
              }}
              className="gap-2"
            >
              <Plus size={16} />
              {t('hospital.materials.reviews.addReview', undefined, 'Add Review')}
            </Button>
          )}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {reviews.map((item, index) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-100">
                    {item.patientAvatarUrl ? (
                      <img src={item.patientAvatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <ImageIcon size={18} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-slate-900">{item.patientName}</h4>
                      {item.featured && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          {t('hospital.materials.reviews.featuredBadge', undefined, 'Featured')}
                        </span>
                      )}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {item.isActive
                          ? t('hospital.materials.reviews.activeBadge', undefined, 'Active')
                          : t('hospital.materials.reviews.inactiveBadge', undefined, 'Inactive')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{item.patientCountry || '-'}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Stars rating={item.rating} />
                      <span className="text-xs text-slate-400">{item.reviewDate || '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {t('hospital.materials.reviews.fields.treatmentName', undefined, 'Treatment Name')}
                  </div>
                  <div className="text-sm font-medium text-slate-800">{item.treatmentName || '-'}</div>
                </div>
              </div>

              <div className="mt-4">
                <h5 className="text-sm font-semibold text-slate-900">{item.reviewTitle || '-'}</h5>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.reviewComment}</p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {t('hospital.materials.reviews.mediaCount', { count: item.media.length }, '{count} media items')}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingReview(item);
                      setEditorOpen(true);
                    }}
                    className="gap-2"
                  >
                    <Pencil size={14} />
                    {t('hospital.materials.buttons.edit', undefined, 'Edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => savePatch(item, { isActive: !item.isActive })}
                    className="gap-2"
                  >
                    {item.isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                    {item.isActive
                      ? t('hospital.materials.reviews.deactivate', undefined, 'Deactivate')
                      : t('hospital.materials.reviews.activate', undefined, 'Activate')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    className="gap-2"
                  >
                    <ArrowUp size={14} />
                    {t('hospital.materials.reviews.moveUp', undefined, 'Move up')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMove(index, 1)}
                    disabled={index === reviews.length - 1}
                    className="gap-2"
                  >
                    <ArrowDown size={14} />
                    {t('hospital.materials.reviews.moveDown', undefined, 'Move down')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(item)}
                    className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={14} />
                    {t('hospital.materials.buttons.delete', undefined, 'Delete')}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ReviewEditor
        open={editorOpen}
        review={editingReview}
        onClose={() => setEditorOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}
