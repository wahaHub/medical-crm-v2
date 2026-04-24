'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, LoadingSpinner } from '@medical-crm/ui';
import {
  ArrowDown,
  ArrowUp,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { ApiError } from '@/lib/errors';
import { queryFetch } from '@/lib/query-fetch';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import {
  PackageEditor,
  type MaterialsPackageDTO,
  summarizePackageCard,
} from '@/components/materials/package-editor';
import { formatUserFacingError } from '@/components/materials-tabs';

type ToastState = {
  kind: 'success' | 'error';
  message: string;
};

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

function sortPackages(items: MaterialsPackageDTO[]) {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder);
}

function movePackage(items: MaterialsPackageDTO[], index: number, direction: -1 | 1) {
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

export function PackagesTab() {
  const { t } = useHospitalI18n();
  const queryClient = useQueryClient();
  const [editorPackageId, setEditorPackageId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['materials', 'packages'],
    queryFn: () => queryFetch<MaterialsPackageDTO[]>('/api/materials/packages'),
  });

  const packages = useMemo(() => sortPackages(data ?? []), [data]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['materials', 'packages'] });
  };

  const saveSummaryPatch = async (item: MaterialsPackageDTO, patch: Partial<MaterialsPackageDTO>) => {
    try {
      await requestJson(`/api/materials/packages/${item.id}`, {
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
          'hospital.materials.packages.saveFailed',
          'Failed to save package.',
        ),
      });
    }
  };

  const handleDelete = async (item: MaterialsPackageDTO) => {
    if (!confirm(t('hospital.materials.packages.confirmDelete', undefined, 'Delete this package?'))) {
      return;
    }

    try {
      await requestJson(`/api/materials/packages/${item.id}`, { method: 'DELETE' });
      await refresh();
      setToast({
        kind: 'success',
        message: t('hospital.materials.packages.deleteSucceeded', undefined, 'Package deleted.'),
      });
    } catch (deleteError) {
      setToast({
        kind: 'error',
        message: formatUserFacingError(
          deleteError,
          t,
          'hospital.materials.packages.deleteFailed',
          'Failed to delete package.',
        ),
      });
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const reordered = movePackage(packages, index, direction);
    const changedItems = reordered.filter((item, reorderedIndex) => item.sortOrder !== packages[reorderedIndex]?.sortOrder);
    if (changedItems.length === 0) {
      return;
    }

    try {
      await Promise.all(changedItems.map((item) => requestJson(`/api/materials/packages/${item.id}`, {
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
          'hospital.materials.packages.reorderFailed',
          'Failed to reorder packages.',
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
        icon={<Package size={40} />}
        title={t('hospital.materials.packages.loadFailedTitle', undefined, 'Packages failed to load')}
        description={formatUserFacingError(
          error,
          t,
          'hospital.materials.packages.loadFailedDescription',
          'Unable to load packages right now.',
        )}
        action={(
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['materials', 'packages'] })}>
            {t('hospital.materials.packages.retry', undefined, 'Retry')}
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
            {t('hospital.materials.packages.title', undefined, 'Recommended Packages')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('hospital.materials.packages.description', undefined, 'Manage the package cards and detail-page content shown to regular-hospital patients.')}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditorPackageId(null);
            setEditorOpen(true);
          }}
          className="gap-2"
        >
          <Plus size={16} />
          {t('hospital.materials.packages.addPackage', undefined, 'Add Package')}
        </Button>
      </div>

      {packages.length === 0 ? (
        <EmptyState
          icon={<Package size={40} />}
          title={t('hospital.materials.packages.emptyTitle', undefined, 'No packages yet')}
          description={t('hospital.materials.packages.emptyDescription', undefined, 'Create the first package to power the recommended packages section and detail page.')}
          action={(
            <Button
              onClick={() => {
                setEditorPackageId(null);
                setEditorOpen(true);
              }}
              className="gap-2"
            >
              <Plus size={16} />
              {t('hospital.materials.packages.addPackage', undefined, 'Add Package')}
            </Button>
          )}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {packages.map((item, index) => {
            const summary = summarizePackageCard(item);
            return (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 p-5 md:grid-cols-[160px_1fr]">
                  <div className="h-40 overflow-hidden rounded-xl bg-slate-100">
                    {summary.coverImageUrl ? (
                      <img src={summary.coverImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <Package size={28} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold text-slate-900">{summary.title}</h4>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${summary.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {summary.isActive
                              ? t('hospital.materials.packages.activeBadge', undefined, 'Active')
                              : t('hospital.materials.packages.inactiveBadge', undefined, 'Inactive')}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{summary.subtitle}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          {t('hospital.materials.packages.fields.price', undefined, 'Price')}
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{summary.priceLabel}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {summary.tags.map((tag) => (
                        <span key={tag.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {tag.label}
                        </span>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-400">{t('hospital.materials.packages.fields.duration', undefined, 'Duration')}</div>
                        <div className="text-sm font-medium text-slate-800">{summary.duration || '-'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-400">{t('hospital.materials.packages.reviewCount', undefined, 'Package Reviews')}</div>
                        <div className="text-sm font-medium text-slate-800">{summary.reviewCount}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-400">{t('hospital.materials.packages.caseCount', undefined, 'Patient Cases')}</div>
                        <div className="text-sm font-medium text-slate-800">{summary.caseCount}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditorPackageId(item.id);
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
                        onClick={() => saveSummaryPatch(item, { isActive: !item.isActive })}
                        className="gap-2"
                      >
                        {item.isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                        {item.isActive
                          ? t('hospital.materials.packages.deactivate', undefined, 'Deactivate')
                          : t('hospital.materials.packages.activate', undefined, 'Activate')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMove(index, -1)}
                        disabled={index === 0}
                        className="gap-2"
                      >
                        <ArrowUp size={14} />
                        {t('hospital.materials.packages.moveUp', undefined, 'Move up')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMove(index, 1)}
                        disabled={index === packages.length - 1}
                        className="gap-2"
                      >
                        <ArrowDown size={14} />
                        {t('hospital.materials.packages.moveDown', undefined, 'Move down')}
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
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PackageEditor
        open={editorOpen}
        packageId={editorPackageId}
        onClose={() => setEditorOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}
