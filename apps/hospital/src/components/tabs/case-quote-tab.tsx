'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  Plus,
  Trash2,
  Send,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useCaseQuotes } from '@/queries/use-quotes';
import { createQuote, sendQuote, updateQuote } from '@/actions/quote-actions';
import { Edit2 } from 'lucide-react';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import type { QuoteItem } from '@/lib/api-types';

// ── Status Badge ────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  EXPIRED: 'bg-slate-100 text-slate-500 border-slate-200',
};

function QuoteStatusBadge({ status }: { status: string }) {
  const { t } = useHospitalI18n();
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      {t(`hospital.cases.detail.quote.status.${status.toLowerCase()}`, undefined, status)}
    </span>
  );
}

// ── Line Item Row ───────────────────────────────────────────────────

interface LineItem {
  name: string;
  amount: string;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toEndOfDayIso(dateOnly: string): string | null {
  if (!dateOnly) return null;
  const date = new Date(`${dateOnly}T23:59:59`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function LineItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: LineItem;
  index: number;
  onChange: (index: number, field: keyof LineItem, value: string) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useHospitalI18n();

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        placeholder={t('hospital.cases.detail.quote.fields.itemNamePlaceholder', undefined, 'Item name')}
        value={item.name}
        onChange={(e) => onChange(index, 'name', e.target.value)}
        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      <input
        type="text"
        placeholder="0.00"
        value={item.amount}
        onChange={(e) => onChange(index, 'amount', e.target.value)}
        className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

// ── Create Quote Modal ──────────────────────────────────────────────

function CreateQuoteModal({
  caseId,
  onClose,
  onSuccess,
}: {
  caseId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useHospitalI18n();
  const [lineItems, setLineItems] = useState<LineItem[]>([{ name: '', amount: '' }]);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState(() => toDateInputValue(addDays(new Date(), 14)));
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      const val = parseFloat(item.amount);
      return sum + (Number.isNaN(val) ? 0 : val);
    }, 0);
  }, [lineItems]);

  const handleLineItemChange = useCallback(
    (index: number, field: keyof LineItem, value: string) => {
      setLineItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index]!, [field]: value };
        return next;
      });
    },
    [],
  );

  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, { name: '', amount: '' }]);
  }, []);

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async (andSend: boolean) => {
    setError(null);
    const validItems = lineItems.filter((li) => li.name.trim() && li.amount.trim());
    if (validItems.length === 0) {
      setError(t('hospital.cases.detail.quote.validation.lineItemsRequired', undefined, 'Please add at least one line item.'));
      return;
    }
    const validUntilIso = toEndOfDayIso(validUntil);
    if (!validUntilIso) {
      setError(t('hospital.cases.detail.quote.validation.validUntilRequired', undefined, 'Please select a valid date for "Valid Until".'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await createQuote({
        caseId,
        totalAmount: total.toFixed(2),
        currency,
        lineItems: validItems,
        notes: notes.trim() || undefined,
        validUntil: validUntilIso,
      });
      if (andSend && result && typeof result === 'object' && 'id' in result) {
        await sendQuote((result as { id: string }).id);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('hospital.cases.detail.quote.errorCreate', undefined, 'Failed to create quote'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">
            {t('hospital.cases.detail.quote.createTitle', undefined, 'Create Quote')}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm border border-rose-200">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('hospital.cases.detail.quote.fields.currency', undefined, 'Currency')}
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
              <option value="EUR">EUR</option>
              <option value="KRW">KRW</option>
              <option value="THB">THB</option>
            </select>
          </div>

          {/* Line Items */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('hospital.cases.detail.quote.fields.lineItems', undefined, 'Line Items')}
            </label>
            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <LineItemRow
                  key={i}
                  item={item}
                  index={i}
                  onChange={handleLineItemChange}
                  onRemove={removeLineItem}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addLineItem}
              className="mt-2 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <Plus size={14} /> {t('hospital.cases.detail.quote.actions.addItem', undefined, 'Add Item')}
            </button>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-lg">
            <span className="text-sm font-medium text-slate-700">
              {t('hospital.cases.detail.quote.fields.total', undefined, 'Total')}
            </span>
            <span className="text-lg font-bold text-slate-900">
              {currency} {total.toFixed(2)}
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('hospital.cases.detail.quote.fields.notes', undefined, 'Notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={t(
                'hospital.cases.detail.quote.fields.notesPlaceholder',
                undefined,
                'Optional notes for this quote...',
              )}
            />
          </div>

          {/* Valid Until */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('hospital.cases.detail.quote.fields.validUntil', undefined, 'Valid Until')}
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            {t('hospital.common.cancel', undefined, 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : t('hospital.common.save', undefined, 'Save')}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Send size={14} /> {t('hospital.cases.detail.quote.actions.createAndSend', undefined, 'Create & Send')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Existing Quote Card ─────────────────────────────────────────────

function QuoteCard({
  quote,
  onSend,
  onEdit,
}: {
  quote: QuoteItem;
  onSend: (id: string) => void;
  onEdit: (quote: QuoteItem) => void;
}) {
  const { locale, t } = useHospitalI18n();
  const canEdit = quote.status === 'PENDING' || quote.isDraft;
  return (
    <div className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt size={18} className="text-indigo-500" />
          <span className="text-sm font-semibold text-slate-800">
            {quote.currency} {quote.totalAmount}
          </span>
          <QuoteStatusBadge status={quote.status} />
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => onEdit(quote)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Edit2 size={12} /> {t('hospital.common.edit', undefined, 'Edit')}
            </button>
          )}
          {quote.status === 'PENDING' && quote.isDraft && (
            <button
              onClick={() => onSend(quote.id)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <Send size={12} /> {t('hospital.common.send', undefined, 'Send')}
            </button>
          )}
        </div>
      </div>

      {/* Line Items */}
      {quote.lineItems && quote.lineItems.length > 0 && (
        <div className="space-y-1.5">
          {quote.lineItems.map((li, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm px-3 py-2 bg-slate-50 rounded-lg">
              <span className="text-slate-700">{li.name}</span>
              <span className="font-medium text-slate-800">{quote.currency} {li.amount}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {quote.notes && (
        <div className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
          <span className="font-medium text-slate-700">
            {t('hospital.cases.detail.quote.fields.notes', undefined, 'Notes')}:
          </span>{' '}
          {quote.notes}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span>
          {t('hospital.cases.detail.quote.meta.created', undefined, 'Created')}{' '}
          {new Intl.DateTimeFormat(locale).format(new Date(quote.createdAt))}
        </span>
        {quote.validUntil && (
          <span>
            {t('hospital.cases.detail.quote.meta.validUntil', undefined, 'Valid until')}{' '}
            {new Intl.DateTimeFormat(locale).format(new Date(quote.validUntil))}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Tab ────────────────────────────────────────────────────────

export function CaseQuoteTab({ caseId }: { caseId: string }) {
  const { t } = useHospitalI18n();
  const { data: quotes, isLoading, error } = useCaseQuotes(caseId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState<QuoteItem | null>(null);
  const queryClient = useQueryClient();

  const handleSend = async (quoteId: string) => {
    try {
      await sendQuote(quoteId);
      queryClient.invalidateQueries({ queryKey: ['quotes', caseId] });
    } catch {
      // Silently handle — could add toast later
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    queryClient.invalidateQueries({ queryKey: ['quotes', caseId] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-10 rounded-[1.5rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
        <AlertCircle size={28} className="text-rose-400 mb-3" />
        <p className="text-sm text-slate-500">
          {t('hospital.cases.detail.quote.errorLoad', undefined, 'Failed to load quotes.')}
        </p>
      </div>
    );
  }

  const quoteList = Array.isArray(quotes) ? quotes : quotes?.data ?? [];
  const existingQuote = quoteList.length > 0 ? quoteList[0] : null;
  const hasQuote = !!existingQuote;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Receipt size={18} className="text-indigo-500" />
          {t('hospital.cases.detail.quote.title', undefined, 'Quote')}
        </h3>
        {!hasQuote && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} /> {t('hospital.cases.detail.quote.createButton', undefined, 'Create Quote')}
          </button>
        )}
      </div>

      {/* Quote display */}
      {hasQuote ? (
        <QuoteCard quote={existingQuote} onSend={handleSend} onEdit={setEditingQuote} />
      ) : (
        <div className="bg-white p-10 rounded-[1.5rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-4">
            <Receipt size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">
            {t('hospital.cases.detail.quote.emptyTitle', undefined, 'No quote yet')}
          </h3>
          <p className="text-sm text-slate-500 max-w-md">
            {t(
              'hospital.cases.detail.quote.emptyDescription',
              undefined,
              'Create a quote with line items to send to the patient.',
            )}
          </p>
        </div>
      )}

      {/* Create Modal — only when no existing quote */}
      {showCreateModal && !hasQuote && (
        <CreateQuoteModal
          caseId={caseId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Edit Modal */}
      {editingQuote && (
        <EditQuoteModal
          quote={editingQuote}
          onClose={() => setEditingQuote(null)}
          onSuccess={() => {
            setEditingQuote(null);
            queryClient.invalidateQueries({ queryKey: ['quotes', caseId] });
          }}
        />
      )}
    </div>
  );
}

// ── Edit Quote Modal ────────────────────────────────────────────────

function EditQuoteModal({
  quote,
  onClose,
  onSuccess,
}: {
  quote: QuoteItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useHospitalI18n();
  const [lineItems, setLineItems] = useState<LineItem[]>(
    quote.lineItems?.map((li) => ({ name: li.name, amount: li.amount })) ?? [{ name: '', amount: '' }],
  );
  const [notes, setNotes] = useState(quote.notes ?? '');
  const [validUntil, setValidUntil] = useState(() =>
    quote.validUntil ? toDateInputValue(new Date(quote.validUntil)) : toDateInputValue(addDays(new Date(), 14)),
  );
  const [currency, setCurrency] = useState(quote.currency ?? 'USD');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      const val = parseFloat(item.amount);
      return sum + (Number.isNaN(val) ? 0 : val);
    }, 0);
  }, [lineItems]);

  const handleLineItemChange = useCallback(
    (index: number, field: keyof LineItem, value: string) => {
      setLineItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index]!, [field]: value };
        return next;
      });
    },
    [],
  );

  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, { name: '', amount: '' }]);
  }, []);

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    setError(null);
    const validItems = lineItems.filter((li) => li.name.trim() && li.amount.trim());
    if (validItems.length === 0) {
      setError(t('hospital.cases.detail.quote.validation.lineItemsRequired', undefined, 'Please add at least one line item.'));
      return;
    }
    const validUntilIso = toEndOfDayIso(validUntil);
    if (!validUntilIso) {
      setError(t('hospital.cases.detail.quote.validation.validUntilRequired', undefined, 'Please select a valid date for "Valid Until".'));
      return;
    }
    setSubmitting(true);
    try {
      await updateQuote(quote.id, {
        totalAmount: total.toFixed(2),
        currency,
        lineItems: validItems,
        notes: notes.trim() || undefined,
        validUntil: validUntilIso,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('hospital.cases.detail.quote.errorUpdate', undefined, 'Failed to update quote'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">
            {t('hospital.cases.detail.quote.editTitle', undefined, 'Edit Quote')}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm border border-rose-200">
              <AlertCircle size={16} />{error}
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                {t('hospital.cases.detail.quote.fields.lineItems', undefined, 'Line Items')}
              </label>
              <button type="button" onClick={addLineItem} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                <Plus size={12} /> {t('hospital.cases.detail.quote.actions.addItem', undefined, 'Add Item')}
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <LineItemRow key={i} item={item} index={i} onChange={handleLineItemChange} onRemove={removeLineItem} />
              ))}
            </div>
            <div className="mt-3 flex justify-end text-sm font-semibold text-slate-800">
              {t('hospital.cases.detail.quote.fields.total', undefined, 'Total')}: {currency} {total.toFixed(2)}
            </div>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('hospital.cases.detail.quote.fields.currency', undefined, 'Currency')}
            </label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="USD">USD</option><option value="CNY">CNY</option><option value="EUR">EUR</option><option value="KRW">KRW</option><option value="THB">THB</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('hospital.cases.detail.quote.fields.notes', undefined, 'Notes')}
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={t('hospital.cases.detail.quote.fields.notesShortPlaceholder', undefined, 'Optional notes...')} />
          </div>

          {/* Valid Until */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('hospital.cases.detail.quote.fields.validUntil', undefined, 'Valid Until')}
            </label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">{t('hospital.common.cancel', undefined, 'Cancel')}</button>
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : t('hospital.cases.detail.quote.actions.saveChanges', undefined, 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}
