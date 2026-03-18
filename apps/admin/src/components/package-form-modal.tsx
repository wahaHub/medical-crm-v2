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
  nameEn: string;
  nameZh: string;
  type: string;
  price: string;
  currency: string;
  descriptionEn: string;
  descriptionZh: string;
  coverImageUrl: string;
  sortWeight: string;
  publishAt: string;
  takedownAt: string;
}

const EMPTY_FORM: FormState = {
  nameEn: '',
  nameZh: '',
  type: 'CONSULTATION',
  price: '',
  currency: 'USD',
  descriptionEn: '',
  descriptionZh: '',
  coverImageUrl: '',
  sortWeight: '0',
  publishAt: '',
  takedownAt: '',
};

function toFormState(pkg: PackageRow): FormState {
  return {
    nameEn: pkg.nameEn,
    nameZh: pkg.nameZh ?? '',
    type: pkg.type,
    price: pkg.price,
    currency: pkg.currency,
    descriptionEn: pkg.descriptionEn ?? '',
    descriptionZh: pkg.descriptionZh ?? '',
    coverImageUrl: pkg.coverImageUrl ?? '',
    sortWeight: String(pkg.sortWeight ?? 0),
    publishAt: pkg.publishAt ? pkg.publishAt.slice(0, 16) : '',
    takedownAt: pkg.takedownAt ? pkg.takedownAt.slice(0, 16) : '',
  };
}

// ── Component ─────────────────────────────────────────────────────────

export function PackageFormModal({ open, onClose, onSuccess, editPackage }: PackageFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = !!editPackage;

  useEffect(() => {
    if (open) {
      setForm(editPackage ? toFormState(editPackage) : EMPTY_FORM);
      setError(null);
    }
  }, [open, editPackage]);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {
      nameEn: form.nameEn,
      type: form.type,
      price: form.price,
      currency: form.currency,
      sortWeight: parseInt(form.sortWeight, 10) || 0,
    };
    if (form.nameZh) payload['nameZh'] = form.nameZh;
    if (form.descriptionEn) payload['descriptionEn'] = form.descriptionEn;
    if (form.descriptionZh) payload['descriptionZh'] = form.descriptionZh;
    if (form.coverImageUrl) payload['coverImageUrl'] = form.coverImageUrl;
    if (form.publishAt) payload['publishAt'] = new Date(form.publishAt).toISOString();
    if (form.takedownAt) payload['takedownAt'] = new Date(form.takedownAt).toISOString();
    return payload;
  }

  function handleSubmit() {
    setError(null);
    // Basic validation
    if (!form.nameEn.trim()) { setError('Package name (English) is required.'); return; }
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

        {/* Name (EN) */}
        <div>
          <label className={labelClass}>Name (English) *</label>
          <input
            type="text"
            value={form.nameEn}
            onChange={(e) => handleChange('nameEn', e.target.value)}
            placeholder="e.g. Premium Consultation Package"
            className={inputClass}
            maxLength={200}
          />
        </div>

        {/* Name (ZH) */}
        <div>
          <label className={labelClass}>Name (Chinese)</label>
          <input
            type="text"
            value={form.nameZh}
            onChange={(e) => handleChange('nameZh', e.target.value)}
            placeholder="中文名称"
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

        {/* Description (EN) */}
        <div>
          <label className={labelClass}>Description (English)</label>
          <textarea
            value={form.descriptionEn}
            onChange={(e) => handleChange('descriptionEn', e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="Package description in English…"
          />
        </div>

        {/* Description (ZH) */}
        <div>
          <label className={labelClass}>Description (Chinese)</label>
          <textarea
            value={form.descriptionZh}
            onChange={(e) => handleChange('descriptionZh', e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="中文描述…"
          />
        </div>

        {/* Cover Image URL */}
        <div>
          <label className={labelClass}>Cover Image URL</label>
          <input
            type="url"
            value={form.coverImageUrl}
            onChange={(e) => handleChange('coverImageUrl', e.target.value)}
            placeholder="https://…"
            className={inputClass}
            maxLength={500}
          />
        </div>

        {/* Publish At + Takedown At */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Publish At</label>
            <input
              type="datetime-local"
              value={form.publishAt}
              onChange={(e) => handleChange('publishAt', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Takedown At</label>
            <input
              type="datetime-local"
              value={form.takedownAt}
              onChange={(e) => handleChange('takedownAt', e.target.value)}
              className={inputClass}
            />
          </div>
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
