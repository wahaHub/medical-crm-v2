'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, LoadingSpinner, Modal } from '@medical-crm/ui';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  MessageSquareQuote,
  Plus,
  ShieldAlert,
  Trash2,
  Upload,
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

export type MaterialsPackageGalleryItem = {
  id: string;
  imageUrl: string;
  storageKey?: string | null;
  sortOrder: number;
};

export type MaterialsPackageTag = {
  id: string;
  label: string;
  category: string;
};

export type MaterialsPackageInclude = {
  id: string;
  text: string;
  sortOrder: number;
};

export type MaterialsPackageProcessStep = {
  id: string;
  stepTitle: string;
  description: string;
  sortOrder: number;
};

export type MaterialsPackageCase = {
  id: string;
  patientName: string;
  patientAge: number | null;
  patientCountry: string;
  story: string;
  result: string;
  sortOrder: number;
};

export type MaterialsPackageReview = {
  id: string;
  reviewerName: string;
  reviewerCountry: string;
  rating: number;
  reviewDate: string;
  comment: string;
  sortOrder: number;
  isActive: boolean;
};

export type MaterialsPackageDTO = {
  id: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  title: string;
  subtitle: string;
  coverImageUrl: string;
  coverImageStorageKey?: string | null;
  gallery: MaterialsPackageGalleryItem[];
  price: string;
  currency: string;
  duration: string;
  summary: string;
  tags: MaterialsPackageTag[];
  includes: MaterialsPackageInclude[];
  process: MaterialsPackageProcessStep[];
  cases: MaterialsPackageCase[];
  reviews: MaterialsPackageReview[];
};

export type MaterialsPackageMutationPayload = Omit<
  MaterialsPackageDTO,
  'subtitle' | 'gallery' | 'tags' | 'includes' | 'process' | 'cases' | 'reviews'
> & {
  subtitle: string | null;
  gallery: Array<Omit<MaterialsPackageGalleryItem, 'id'> & { id?: string }>;
  tags: Array<Omit<MaterialsPackageTag, 'id'> & { id?: string }>;
  includes: Array<Omit<MaterialsPackageInclude, 'id'> & { id?: string }>;
  process: Array<Omit<MaterialsPackageProcessStep, 'id'> & { id?: string }>;
  cases: Array<Omit<MaterialsPackageCase, 'id'> & { id?: string }>;
  reviews: Array<Omit<MaterialsPackageReview, 'id'> & { id?: string }>;
};

type PackageSectionKey =
  | 'basic'
  | 'commercial'
  | 'overview'
  | 'includes'
  | 'treatmentProcess'
  | 'patientEvidence';

type PackageSaveError = {
  cause: unknown;
  section: PackageSectionKey;
  taskId?: string;
};

type ToastState = {
  kind: 'success' | 'error';
  message: string;
};

type PackageEditorProps = {
  open: boolean;
  packageId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortByOrder<T extends { sortOrder: number }>(items: T[]) {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder);
}

function hasAnyPackageCaseContent(item: MaterialsPackageCase): boolean {
  return item.patientName.trim().length > 0
    || item.patientCountry.trim().length > 0
    || item.story.trim().length > 0
    || item.result.trim().length > 0
    || item.patientAge !== null;
}

function hasAnyPackageReviewContent(item: MaterialsPackageReview): boolean {
  return item.reviewerName.trim().length > 0
    || item.reviewerCountry.trim().length > 0
    || item.reviewDate.trim().length > 0
    || item.comment.trim().length > 0;
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

export function buildPackageMutationPayload(materialPackage: MaterialsPackageDTO): MaterialsPackageMutationPayload {
  return {
    ...materialPackage,
    subtitle: toNullableString(materialPackage.subtitle),
    coverImageUrl: materialPackage.coverImageStorageKey ?? materialPackage.coverImageUrl,
    gallery: sortByOrder(materialPackage.gallery).map((item, index) => ({
      ...item,
      id: toPersistedId(item.id),
      imageUrl: item.storageKey ?? item.imageUrl,
      sortOrder: index,
    })),
    tags: materialPackage.tags
      .filter((item) => item.label.trim())
      .map((item) => ({
        ...item,
        id: toPersistedId(item.id),
      })),
    includes: sortByOrder(materialPackage.includes)
      .filter((item) => item.text.trim())
      .map((item, index) => ({
        ...item,
        id: toPersistedId(item.id),
        sortOrder: index,
      })),
    process: sortByOrder(materialPackage.process)
      .filter((item) => item.stepTitle.trim() || item.description.trim())
      .map((item, index) => ({
        ...item,
        id: toPersistedId(item.id),
        sortOrder: index,
      })),
    cases: sortByOrder(materialPackage.cases)
      .filter(hasAnyPackageCaseContent)
      .map((item, index) => ({
        ...item,
        id: toPersistedId(item.id),
        sortOrder: index,
      })),
    reviews: sortByOrder(materialPackage.reviews)
      .filter(hasAnyPackageReviewContent)
      .map((item, index) => ({
        ...item,
        id: toPersistedId(item.id),
        sortOrder: index,
      })),
  };
}

function normalizePackage(input?: Partial<MaterialsPackageDTO> | null): MaterialsPackageDTO {
  return {
    id: input?.id ?? '',
    slug: input?.slug ?? '',
    sortOrder: input?.sortOrder ?? 0,
    isActive: input?.isActive ?? true,
    title: input?.title ?? '',
    subtitle: input?.subtitle ?? '',
    coverImageUrl: input?.coverImageUrl ?? '',
    coverImageStorageKey: input?.coverImageStorageKey ?? null,
    gallery: sortByOrder((input?.gallery ?? []).map((item, index) => ({
      id: item.id || createId('gallery'),
      imageUrl: item.imageUrl ?? '',
      storageKey: item.storageKey ?? null,
      sortOrder: item.sortOrder ?? index,
    }))),
    price: input?.price ?? '',
    currency: input?.currency ?? 'USD',
    duration: input?.duration ?? '',
    summary: input?.summary ?? '',
    tags: (input?.tags ?? []).map((item) => ({
      id: item.id || createId('tag'),
      label: item.label ?? '',
      category: item.category ?? 'service',
    })),
    includes: sortByOrder((input?.includes ?? []).map((item, index) => ({
      id: item.id || createId('include'),
      text: item.text ?? '',
      sortOrder: item.sortOrder ?? index,
    }))),
    process: sortByOrder((input?.process ?? []).map((item, index) => ({
      id: item.id || createId('process'),
      stepTitle: item.stepTitle ?? '',
      description: item.description ?? '',
      sortOrder: item.sortOrder ?? index,
    }))),
    cases: sortByOrder((input?.cases ?? []).map((item, index) => ({
      id: item.id || createId('case'),
      patientName: item.patientName ?? '',
      patientAge: typeof item.patientAge === 'number' ? item.patientAge : null,
      patientCountry: item.patientCountry ?? '',
      story: item.story ?? '',
      result: item.result ?? '',
      sortOrder: item.sortOrder ?? index,
    }))),
    reviews: sortByOrder((input?.reviews ?? []).map((item, index) => ({
      id: item.id || createId('review'),
      reviewerName: item.reviewerName ?? '',
      reviewerCountry: item.reviewerCountry ?? '',
      rating: item.rating ?? 5,
      reviewDate: item.reviewDate ?? '',
      comment: item.comment ?? '',
      sortOrder: item.sortOrder ?? index,
      isActive: item.isActive ?? true,
    }))),
  };
}

function getIssuePath(error: unknown): string[] {
  if (!(error instanceof ApiError)) {
    return [];
  }

  const issues = (error.body as {
    error?: {
      issues?: Array<{ path?: Array<string | number> }>;
    };
  })?.error?.issues;

  return issues?.[0]?.path?.map((segment) => String(segment)) ?? [];
}

function detectSlugCollision(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    return true;
  }

  const serialized = JSON.stringify(error);
  return /slug/i.test(serialized) && /(duplicate|exists|conflict|taken|unique)/i.test(serialized);
}

function createPackageSaveError(
  section: PackageSectionKey,
  cause: unknown,
  taskId?: string,
): PackageSaveError {
  return { cause, section, taskId };
}

function isPackageSaveError(error: unknown): error is PackageSaveError {
  return typeof error === 'object'
    && error !== null
    && 'section' in error
    && typeof (error as { section?: unknown }).section === 'string'
    && 'cause' in error;
}

function getPackageSection(path: string[]): PackageSectionKey {
  const first = path[0] ?? '';

  if (['title', 'subtitle', 'slug', 'coverImageUrl', 'gallery', 'sortOrder', 'isActive'].includes(first)) {
    return 'basic';
  }
  if (['price', 'currency', 'duration', 'tags'].includes(first)) {
    return 'commercial';
  }
  if (first === 'summary') {
    return 'overview';
  }
  if (first === 'includes') {
    return 'includes';
  }
  if (first === 'process') {
    return 'treatmentProcess';
  }

  return 'patientEvidence';
}

function sectionLabel(
  section: PackageSectionKey,
  t: (key: string, values?: Record<string, string | number>, fallback?: string) => string,
) {
  switch (section) {
    case 'basic':
      return t('hospital.materials.packages.sections.basic', undefined, 'Basic');
    case 'commercial':
      return t('hospital.materials.packages.sections.commercial', undefined, 'Commercial');
    case 'overview':
      return t('hospital.materials.packages.sections.overview', undefined, 'Overview');
    case 'includes':
      return t('hospital.materials.packages.sections.includes', undefined, 'Includes');
    case 'treatmentProcess':
      return t('hospital.materials.packages.sections.treatmentProcess', undefined, 'Treatment Process');
    case 'patientEvidence':
      return t('hospital.materials.packages.sections.patientEvidence', undefined, 'Patient Evidence');
  }
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

function formatPrice(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
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

function SectionCard({
  title,
  description,
  children,
  flash,
  refProp,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  flash?: boolean;
  refProp?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      ref={refProp}
      className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-5 ${getFlashClass(Boolean(flash))}`}
    >
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function moveListItem<T extends { sortOrder: number }>(items: T[], index: number, direction: -1 | 1) {
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

export function PackageEditor({
  open,
  packageId,
  onClose,
  onSaved,
}: PackageEditorProps) {
  const { t } = useHospitalI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MaterialsPackageDTO>(() => normalizePackage());
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [flashSection, setFlashSection] = useState<PackageSectionKey | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [pendingGalleryFiles, setPendingGalleryFiles] = useState<Map<string, File>>(new Map());
  const [saveProgress, setSaveProgress] = useState<SaveProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });

  const basicRef = useRef<HTMLDivElement | null>(null);
  const commercialRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const includesRef = useRef<HTMLDivElement | null>(null);
  const treatmentProcessRef = useRef<HTMLDivElement | null>(null);
  const patientEvidenceRef = useRef<HTMLDivElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const sectionRefs = useMemo<Record<PackageSectionKey, React.RefObject<HTMLDivElement | null>>>(() => ({
    basic: basicRef,
    commercial: commercialRef,
    overview: overviewRef,
    includes: includesRef,
    treatmentProcess: treatmentProcessRef,
    patientEvidence: patientEvidenceRef,
  }), []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!packageId) {
      setForm(normalizePackage());
      setLoadError(null);
      setPendingCoverFile(null);
      setPendingGalleryFiles(new Map());
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);

    queryFetch<MaterialsPackageDTO>(`/api/materials/packages/${packageId}`)
      .then((data) => {
        if (isCancelled) {
          return;
        }
        setForm(normalizePackage(data));
        setPendingCoverFile(null);
        setPendingGalleryFiles(new Map());
      })
      .catch((error) => {
        if (!isCancelled) {
          setLoadError(error);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, packageId]);

  const setSectionError = (section: PackageSectionKey, message: string) => {
    setFlashSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setFlashSection(null), 2200);
    setToast({ kind: 'error', message });
  };

  const updateField = <K extends keyof MaterialsPackageDTO>(field: K, value: MaterialsPackageDTO[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleGalleryFiles = (files: FileList | null) => {
    if (!files) {
      return;
    }

    const items = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (items.length === 0) {
      return;
    }

    const nextGallery = [...form.gallery];
    const nextPending = new Map(pendingGalleryFiles);
    for (const file of items) {
      const previewUrl = URL.createObjectURL(file);
      nextGallery.push({
        id: createId('gallery'),
        imageUrl: previewUrl,
        sortOrder: nextGallery.length,
      });
      nextPending.set(previewUrl, file);
    }

    updateField('gallery', nextGallery);
    setPendingGalleryFiles(nextPending);
  };

  const handleSave = async () => {
    setIsSaving(true);

    const pendingGalleryEntries = form.gallery
      .map((item, index) => ({ item, index, file: pendingGalleryFiles.get(item.imageUrl) }))
      .filter((entry): entry is { item: MaterialsPackageGalleryItem; index: number; file: File } => Boolean(
        entry.file && isLocalPreviewUrl(entry.item.imageUrl),
      ));

    setSaveProgress({
      open: true,
      title: packageId
        ? t('hospital.materials.packages.savingEditTitle', undefined, 'Saving package')
        : t('hospital.materials.packages.savingCreateTitle', undefined, 'Creating package'),
      canDismiss: false,
      items: [
        ...(pendingCoverFile ? [{
          id: 'upload-cover',
          label: t('hospital.materials.packages.uploadCoverTask', undefined, 'Upload cover image'),
          targetKey: 'basic',
          status: 'pending' as const,
        }] : []),
        ...pendingGalleryEntries.map((_entry, index) => ({
          id: `upload-gallery-${index}`,
          label: t('hospital.materials.packages.uploadGalleryTask', { index: index + 1 }, 'Upload gallery image {index}'),
          targetKey: 'basic',
          status: 'pending' as const,
        })),
        {
          id: 'save-package',
          label: packageId
            ? t('hospital.materials.packages.saveEditAction', undefined, 'Save package')
            : t('hospital.materials.packages.saveCreateAction', undefined, 'Create package'),
          targetKey: 'overview',
          status: 'pending' as const,
        },
      ],
    });

    try {
      const coverImageUrl = form.coverImageUrl;
      let coverImageStorageKey = form.coverImageStorageKey ?? null;

      if (pendingCoverFile && isLocalPreviewUrl(form.coverImageUrl)) {
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => (
            item.id === 'upload-cover' ? { ...item, status: 'uploading' } : item
          )),
        }));
        const asset = await uploadMaterialAsset(pendingCoverFile, 'package_cover').catch((error) => {
          throw createPackageSaveError('basic', error, 'upload-cover');
        });
        coverImageStorageKey = asset.storageKey;
        setForm((current) => ({
          ...current,
          coverImageStorageKey: asset.storageKey,
        }));
        setPendingCoverFile(null);
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => (
            item.id === 'upload-cover' ? { ...item, status: 'done' } : item
          )),
        }));
      }

      const gallery = [...form.gallery];
      for (const [index, entry] of pendingGalleryEntries.entries()) {
        const taskId = `upload-gallery-${index}`;
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => (
            item.id === taskId ? { ...item, status: 'uploading' } : item
          )),
        }));
        const asset = await uploadMaterialAsset(entry.file, 'package_gallery').catch((error) => {
          throw createPackageSaveError('basic', error, taskId);
        });
        gallery[entry.index] = {
          ...gallery[entry.index]!,
          storageKey: asset.storageKey,
        };
        setForm((current) => ({
          ...current,
          gallery: current.gallery.map((item) => (
            item.id === entry.item.id ? { ...item, storageKey: asset.storageKey } : item
          )),
        }));
        setPendingGalleryFiles((current) => {
          const next = new Map(current);
          next.delete(entry.item.imageUrl);
          return next;
        });
        setSaveProgress((current) => ({
          ...current,
          items: current.items.map((item) => (
            item.id === taskId ? { ...item, status: 'done' } : item
          )),
        }));
      }

      setSaveProgress((current) => ({
        ...current,
        items: current.items.map((item) => (
          item.id === 'save-package' ? { ...item, status: 'saving' } : item
        )),
      }));

      const payload = buildPackageMutationPayload({
        ...form,
        coverImageUrl,
        coverImageStorageKey,
        gallery,
      });

      await requestJson(
        packageId ? `/api/materials/packages/${packageId}` : '/api/materials/packages',
        {
          method: packageId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );

      await queryClient.invalidateQueries({ queryKey: ['materials', 'packages'] });
      if (packageId) {
        await queryClient.invalidateQueries({ queryKey: ['materials', 'packages', packageId] });
      }

      setSaveProgress((current) => ({
        ...current,
        canDismiss: true,
        items: current.items.map((item) => (
          item.id === 'save-package' ? { ...item, status: 'done' } : item
        )),
      }));
      setPendingCoverFile(null);
      setPendingGalleryFiles(new Map());
      setToast({
        kind: 'success',
        message: t('hospital.materials.packages.saveSucceeded', undefined, 'Package saved.'),
      });
      await onSaved();
      onClose();
    } catch (error) {
      const scopedError = isPackageSaveError(error) ? error : null;
      const rootCause = scopedError?.cause ?? error;
      const issuePath = getIssuePath(rootCause);
      const section = scopedError?.section ?? getPackageSection(issuePath);
      const sectionName = sectionLabel(section, t);
      const genericMessage = formatUserFacingError(
        rootCause,
        t,
        'hospital.materials.packages.saveFailed',
        'Failed to save package.',
      );
      const message = detectSlugCollision(rootCause)
        ? t('hospital.materials.packages.slugCollision', undefined, 'This slug is already in use for another package.')
        : t(
          `hospital.materials.packages.sectionErrors.${section}`,
          { section: sectionName },
          'Failed to save the {section} section.',
        );

      setSaveProgress((current) => ({
        ...current,
        canDismiss: true,
        failedTargetKey: section,
        items: current.items.map((item) => (
          item.id === scopedError?.taskId || (!scopedError?.taskId && item.id === 'save-package')
            ? { ...item, status: 'failed', error: genericMessage }
            : item
        )),
      }));

      setSectionError(section, detectSlugCollision(rootCause) ? message : `${message} ${genericMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderRetryState = (
    <EmptyState
      icon={<ShieldAlert size={40} />}
      title={t('hospital.materials.packages.editorLoadFailedTitle', undefined, 'Package editor failed to load')}
      description={formatUserFacingError(
        loadError,
        t,
        'hospital.materials.packages.editorLoadFailedDescription',
        'Unable to load the selected package right now.',
      )}
      action={(
        <Button
          onClick={() => {
            setLoadError(null);
            setIsLoading(true);
            queryFetch<MaterialsPackageDTO>(`/api/materials/packages/${packageId}`)
              .then((data) => setForm(normalizePackage(data)))
              .catch((error) => setLoadError(error))
              .finally(() => setIsLoading(false));
          }}
        >
          {t('hospital.materials.packages.retry', undefined, 'Retry')}
        </Button>
      )}
    />
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={packageId
        ? t('hospital.materials.packages.editPackage', undefined, 'Edit Package')
        : t('hospital.materials.packages.addPackage', undefined, 'Add Package')}
      maxWidth="max-w-5xl"
    >
      <UploadProgressModal
        state={saveProgress}
        onDismiss={() => {
          const failedSection = (saveProgress.failedTargetKey as PackageSectionKey | undefined) ?? 'basic';
          setSaveProgress({ open: false, title: '', items: [], canDismiss: false });
          sectionRefs[failedSection].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setFlashSection(failedSection);
          window.setTimeout(() => setFlashSection(null), 2200);
        }}
      />

      <div className="space-y-5 max-h-[85vh] overflow-y-auto pr-1">
        <ToastBanner toast={toast} />

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : loadError ? (
          renderRetryState
        ) : (
          <>
            <SectionCard
              title={t('hospital.materials.packages.sections.basic', undefined, 'Basic')}
              description={t('hospital.materials.packages.sections.basicDescription', undefined, 'Set the core identity, cover media, and ordering for this package.')}
              flash={flashSection === 'basic'}
              refProp={basicRef}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t('hospital.materials.packages.fields.title', undefined, 'Title')}
                  </label>
                  <input
                    value={form.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder={t('hospital.materials.packages.placeholders.title', undefined, 'Premium LASIK Vision Correction Package')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t('hospital.materials.packages.fields.subtitle', undefined, 'Subtitle')}
                  </label>
                  <input
                    value={form.subtitle}
                    onChange={(event) => updateField('subtitle', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder={t('hospital.materials.packages.placeholders.subtitle', undefined, 'SMILE + bilingual care + follow-up')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t('hospital.materials.packages.fields.slug', undefined, 'Slug')}
                  </label>
                  <input
                    value={form.slug}
                    onChange={(event) => updateField('slug', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder={t('hospital.materials.packages.placeholders.slug', undefined, 'premium-lasik')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t('hospital.materials.packages.fields.sortOrder', undefined, 'Sort Order')}
                  </label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => updateField('sortOrder', Number(event.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <ImageUploadWidget
                  value={form.coverImageUrl}
                  onChange={(value) => setForm((current) => ({
                    ...current,
                    coverImageUrl: value,
                    coverImageStorageKey: null,
                  }))}
                  onFileSelect={(file, previewUrl) => {
                    setPendingCoverFile(file);
                    setForm((current) => ({
                      ...current,
                      coverImageUrl: previewUrl,
                      coverImageStorageKey: null,
                    }));
                  }}
                  allowDirectUrl={false}
                  label={t('hospital.materials.packages.fields.coverImage', undefined, 'Cover Image')}
                />

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h5 className="text-sm font-semibold text-slate-900">
                        {t('hospital.materials.packages.fields.gallery', undefined, 'Gallery')}
                      </h5>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('hospital.materials.packages.galleryHint', undefined, 'Upload supporting images for the package detail page.')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="gap-2"
                    >
                      <Upload size={14} />
                      {t('hospital.materials.packages.addGalleryImage', undefined, 'Add Image')}
                    </Button>
                  </div>

                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      handleGalleryFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />

                  {form.gallery.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                      {t('hospital.materials.packages.emptyGallery', undefined, 'No gallery images yet.')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortByOrder(form.gallery).map((item, index) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                          <div className="h-16 w-16 overflow-hidden rounded-lg bg-slate-100">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-slate-300">
                                <ImageIcon size={20} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">
                              {t('hospital.materials.packages.galleryImageLabel', { index: index + 1 }, 'Gallery image {index}')}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {pendingGalleryFiles.has(item.imageUrl)
                                ? t('hospital.materials.packages.pendingUpload', undefined, 'Ready to upload on save')
                                : t('hospital.materials.packages.savedImage', undefined, 'Saved image')}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 p-2 text-slate-500"
                              onClick={() => updateField('gallery', moveListItem(sortByOrder(form.gallery), index, -1))}
                              aria-label={t('hospital.materials.packages.moveUp', undefined, 'Move up')}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 p-2 text-slate-500"
                              onClick={() => updateField('gallery', moveListItem(sortByOrder(form.gallery), index, 1))}
                              aria-label={t('hospital.materials.packages.moveDown', undefined, 'Move down')}
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 p-2 text-rose-600"
                              onClick={() => updateField('gallery', form.gallery.filter((galleryItem) => galleryItem.id !== item.id))}
                              aria-label={t('hospital.materials.packages.removeGalleryImage', undefined, 'Remove image')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => updateField('isActive', event.target.checked)}
                  />
                  {t('hospital.materials.packages.fields.active', undefined, 'Active')}
                </label>
              </div>
            </SectionCard>

            <SectionCard
              title={t('hospital.materials.packages.sections.commercial', undefined, 'Commercial')}
              description={t('hospital.materials.packages.sections.commercialDescription', undefined, 'Capture the price, duration, and merchandising tags visible in the list card.')}
              flash={flashSection === 'commercial'}
              refProp={commercialRef}
            >
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t('hospital.materials.packages.fields.price', undefined, 'Price')}
                  </label>
                  <input
                    value={form.price}
                    onChange={(event) => updateField('price', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="3800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t('hospital.materials.packages.fields.currency', undefined, 'Currency')}
                  </label>
                  <input
                    value={form.currency}
                    onChange={(event) => updateField('currency', event.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="USD"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t('hospital.materials.packages.fields.duration', undefined, 'Duration')}
                  </label>
                  <input
                    value={form.duration}
                    onChange={(event) => updateField('duration', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder={t('hospital.materials.packages.placeholders.duration', undefined, '5-7 days in China')}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-semibold text-slate-900">
                      {t('hospital.materials.packages.fields.tags', undefined, 'Tags')}
                    </h5>
                    <p className="mt-1 text-xs text-slate-500">
                      {t('hospital.materials.packages.tagsHint', undefined, 'Each tag powers the list card pills on the consumer site.')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => updateField('tags', [
                      ...form.tags,
                      { id: createId('tag'), label: '', category: 'service' },
                    ])}
                    className="gap-2"
                  >
                    <Plus size={14} />
                    {t('hospital.materials.packages.addTag', undefined, 'Add Tag')}
                  </Button>
                </div>

                <div className="space-y-3">
                  {form.tags.map((tag) => (
                    <div key={tag.id} className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto]">
                      <input
                        value={tag.label}
                        onChange={(event) => updateField('tags', form.tags.map((item) => (
                          item.id === tag.id ? { ...item, label: event.target.value } : item
                        )))}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder={t('hospital.materials.packages.placeholders.tagLabel', undefined, 'Vision Correction')}
                      />
                      <select
                        value={tag.category}
                        onChange={(event) => updateField('tags', form.tags.map((item) => (
                          item.id === tag.id ? { ...item, category: event.target.value } : item
                        )))}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="treatment">treatment</option>
                        <option value="service">service</option>
                        <option value="audience">audience</option>
                        <option value="city">city</option>
                        <option value="price">price</option>
                        <option value="style">style</option>
                      </select>
                      <button
                        type="button"
                        className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600"
                        onClick={() => updateField('tags', form.tags.filter((item) => item.id !== tag.id))}
                      >
                        {t('hospital.materials.buttons.delete', undefined, 'Delete')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={t('hospital.materials.packages.sections.overview', undefined, 'Overview')}
              description={t('hospital.materials.packages.sections.overviewDescription', undefined, 'Write the overview shown near the top of the package detail page and PDF export.')}
              flash={flashSection === 'overview'}
              refProp={overviewRef}
            >
              <textarea
                value={form.summary}
                onChange={(event) => updateField('summary', event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder={t('hospital.materials.packages.placeholders.summary', undefined, 'Describe the value and patient journey for this package.')}
              />
            </SectionCard>

            <SectionCard
              title={t('hospital.materials.packages.sections.includes', undefined, 'Includes')}
              description={t('hospital.materials.packages.sections.includesDescription', undefined, 'List each included line item exactly as patients should read it.')}
              flash={flashSection === 'includes'}
              refProp={includesRef}
            >
              <div className="space-y-3">
                {sortByOrder(form.includes).map((item, index) => (
                  <div key={item.id} className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                    <input
                      value={item.text}
                      onChange={(event) => updateField('includes', form.includes.map((includeItem) => (
                        includeItem.id === item.id ? { ...includeItem, text: event.target.value } : includeItem
                      )))}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder={t('hospital.materials.packages.placeholders.include', undefined, 'Airport pickup')}
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      onClick={() => updateField('includes', moveListItem(sortByOrder(form.includes), index, -1))}
                    >
                      {t('hospital.materials.packages.moveUp', undefined, 'Move up')}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      onClick={() => updateField('includes', moveListItem(sortByOrder(form.includes), index, 1))}
                    >
                      {t('hospital.materials.packages.moveDown', undefined, 'Move down')}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600"
                      onClick={() => updateField('includes', form.includes.filter((includeItem) => includeItem.id !== item.id))}
                    >
                      {t('hospital.materials.buttons.delete', undefined, 'Delete')}
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateField('includes', [
                    ...form.includes,
                    { id: createId('include'), text: '', sortOrder: form.includes.length },
                  ])}
                  className="gap-2"
                >
                  <Plus size={14} />
                  {t('hospital.materials.packages.addInclude', undefined, 'Add include')}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              title={t('hospital.materials.packages.sections.treatmentProcess', undefined, 'Treatment Process')}
              description={t('hospital.materials.packages.sections.treatmentProcessDescription', undefined, 'Outline the patient journey in a sequence that works on-page and in PDF export.')}
              flash={flashSection === 'treatmentProcess'}
              refProp={treatmentProcessRef}
            >
              <div className="space-y-3">
                {sortByOrder(form.process).map((item, index) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                      <input
                        value={item.stepTitle}
                        onChange={(event) => updateField('process', form.process.map((processItem) => (
                          processItem.id === item.id ? { ...processItem, stepTitle: event.target.value } : processItem
                        )))}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder={t('hospital.materials.packages.placeholders.stepTitle', undefined, 'Day 1')}
                      />
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        onClick={() => updateField('process', moveListItem(sortByOrder(form.process), index, -1))}
                      >
                        {t('hospital.materials.packages.moveUp', undefined, 'Move up')}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        onClick={() => updateField('process', moveListItem(sortByOrder(form.process), index, 1))}
                      >
                        {t('hospital.materials.packages.moveDown', undefined, 'Move down')}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600"
                        onClick={() => updateField('process', form.process.filter((processItem) => processItem.id !== item.id))}
                      >
                        {t('hospital.materials.buttons.delete', undefined, 'Delete')}
                      </button>
                    </div>
                    <textarea
                      value={item.description}
                      onChange={(event) => updateField('process', form.process.map((processItem) => (
                        processItem.id === item.id ? { ...processItem, description: event.target.value } : processItem
                      )))}
                      rows={3}
                      className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder={t('hospital.materials.packages.placeholders.stepDescription', undefined, 'Arrival and full eye assessment')}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateField('process', [
                    ...form.process,
                    { id: createId('process'), stepTitle: '', description: '', sortOrder: form.process.length },
                  ])}
                  className="gap-2"
                >
                  <Plus size={14} />
                  {t('hospital.materials.packages.addProcessStep', undefined, 'Add process step')}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              title={t('hospital.materials.packages.sections.patientEvidence', undefined, 'Patient Evidence')}
              description={t('hospital.materials.packages.sections.patientEvidenceDescription', undefined, 'Manage supporting patient cases and package-specific reviews.')}
              flash={flashSection === 'patientEvidence'}
              refProp={patientEvidenceRef}
            >
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-slate-500" />
                    <h5 className="text-sm font-semibold text-slate-900">
                      {t('hospital.materials.packages.fields.cases', undefined, 'Patient Cases')}
                    </h5>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateField('cases', [
                      ...form.cases,
                      {
                        id: createId('case'),
                        patientName: '',
                        patientAge: null,
                        patientCountry: '',
                        story: '',
                        result: '',
                        sortOrder: form.cases.length,
                      },
                    ])}
                    className="gap-2"
                  >
                    <Plus size={14} />
                    {t('hospital.materials.packages.addCase', undefined, 'Add case')}
                  </Button>
                </div>
                <div className="space-y-4">
                  {sortByOrder(form.cases).map((item, index) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <input
                          value={item.patientName}
                          onChange={(event) => updateField('cases', form.cases.map((caseItem) => (
                            caseItem.id === item.id ? { ...caseItem, patientName: event.target.value } : caseItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={t('hospital.materials.packages.placeholders.patientName', undefined, 'Mr. Ahmad')}
                        />
                        <input
                          type="number"
                          value={item.patientAge ?? ''}
                          onChange={(event) => updateField('cases', form.cases.map((caseItem) => (
                            caseItem.id === item.id ? { ...caseItem, patientAge: Number(event.target.value) || null } : caseItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={t('hospital.materials.packages.placeholders.patientAge', undefined, '32')}
                        />
                        <input
                          value={item.patientCountry}
                          onChange={(event) => updateField('cases', form.cases.map((caseItem) => (
                            caseItem.id === item.id ? { ...caseItem, patientCountry: event.target.value } : caseItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={t('hospital.materials.packages.placeholders.patientCountry', undefined, 'Malaysia')}
                        />
                      </div>
                      <textarea
                        value={item.story}
                        onChange={(event) => updateField('cases', form.cases.map((caseItem) => (
                          caseItem.id === item.id ? { ...caseItem, story: event.target.value } : caseItem
                        )))}
                        rows={2}
                        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder={t('hospital.materials.packages.placeholders.caseStory', undefined, 'Wanted to dive without glasses.')}
                      />
                      <textarea
                        value={item.result}
                        onChange={(event) => updateField('cases', form.cases.map((caseItem) => (
                          caseItem.id === item.id ? { ...caseItem, result: event.target.value } : caseItem
                        )))}
                        rows={2}
                        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder={t('hospital.materials.packages.placeholders.caseResult', undefined, 'Back to diving in two weeks.')}
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          onClick={() => updateField('cases', moveListItem(sortByOrder(form.cases), index, -1))}
                        >
                          {t('hospital.materials.packages.moveUp', undefined, 'Move up')}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          onClick={() => updateField('cases', moveListItem(sortByOrder(form.cases), index, 1))}
                        >
                          {t('hospital.materials.packages.moveDown', undefined, 'Move down')}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600"
                          onClick={() => updateField('cases', form.cases.filter((caseItem) => caseItem.id !== item.id))}
                        >
                          {t('hospital.materials.buttons.delete', undefined, 'Delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquareQuote size={16} className="text-slate-500" />
                    <h5 className="text-sm font-semibold text-slate-900">
                      {t('hospital.materials.packages.fields.reviews', undefined, 'Package Reviews')}
                    </h5>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateField('reviews', [
                      ...form.reviews,
                      {
                        id: createId('review'),
                        reviewerName: '',
                        reviewerCountry: '',
                        rating: 5,
                        reviewDate: '',
                        comment: '',
                        sortOrder: form.reviews.length,
                        isActive: true,
                      },
                    ])}
                    className="gap-2"
                  >
                    <Plus size={14} />
                    {t('hospital.materials.packages.addReview', undefined, 'Add review')}
                  </Button>
                </div>
                <div className="space-y-4">
                  {sortByOrder(form.reviews).map((item, index) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <input
                          value={item.reviewerName}
                          onChange={(event) => updateField('reviews', form.reviews.map((reviewItem) => (
                            reviewItem.id === item.id ? { ...reviewItem, reviewerName: event.target.value } : reviewItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={t('hospital.materials.packages.placeholders.reviewerName', undefined, 'Sarah K.')}
                        />
                        <input
                          value={item.reviewerCountry}
                          onChange={(event) => updateField('reviews', form.reviews.map((reviewItem) => (
                            reviewItem.id === item.id ? { ...reviewItem, reviewerCountry: event.target.value } : reviewItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={t('hospital.materials.packages.placeholders.reviewerCountry', undefined, 'Singapore')}
                        />
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={item.rating}
                          onChange={(event) => updateField('reviews', form.reviews.map((reviewItem) => (
                            reviewItem.id === item.id ? { ...reviewItem, rating: Math.max(1, Math.min(5, Number(event.target.value) || 1)) } : reviewItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                        <input
                          type="date"
                          value={item.reviewDate}
                          onChange={(event) => updateField('reviews', form.reviews.map((reviewItem) => (
                            reviewItem.id === item.id ? { ...reviewItem, reviewDate: event.target.value } : reviewItem
                          )))}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <textarea
                        value={item.comment}
                        onChange={(event) => updateField('reviews', form.reviews.map((reviewItem) => (
                          reviewItem.id === item.id ? { ...reviewItem, comment: event.target.value } : reviewItem
                        )))}
                        rows={3}
                        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder={t('hospital.materials.packages.placeholders.reviewComment', undefined, 'Excellent experience.')}
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.isActive}
                            onChange={(event) => updateField('reviews', form.reviews.map((reviewItem) => (
                              reviewItem.id === item.id ? { ...reviewItem, isActive: event.target.checked } : reviewItem
                            )))}
                          />
                          {t('hospital.materials.packages.fields.active', undefined, 'Active')}
                        </label>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          onClick={() => updateField('reviews', moveListItem(sortByOrder(form.reviews), index, -1))}
                        >
                          {t('hospital.materials.packages.moveUp', undefined, 'Move up')}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          onClick={() => updateField('reviews', moveListItem(sortByOrder(form.reviews), index, 1))}
                        >
                          {t('hospital.materials.packages.moveDown', undefined, 'Move down')}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600"
                          onClick={() => updateField('reviews', form.reviews.filter((reviewItem) => reviewItem.id !== item.id))}
                        >
                          {t('hospital.materials.buttons.delete', undefined, 'Delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          </>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('hospital.materials.buttons.cancel', undefined, 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving
              ? t('hospital.materials.buttons.saving', undefined, 'Saving...')
              : t('hospital.materials.actions.save', undefined, 'Save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function summarizePackageCard(item: MaterialsPackageDTO) {
  return {
    coverImageUrl: item.coverImageUrl,
    title: item.title,
    subtitle: item.subtitle,
    priceLabel: `${item.currency} ${formatPrice(item.price)}`,
    duration: item.duration,
    tags: item.tags,
    isActive: item.isActive,
    reviewCount: item.reviews.filter((review) => review.isActive).length,
    caseCount: item.cases.length,
  };
}
