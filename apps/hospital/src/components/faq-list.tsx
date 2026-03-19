'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import { useFaqs } from '@/queries/use-faqs';
import { createFaqItem, updateFaqItem, deleteFaqItem } from '@/actions/faq-actions';
import type { FaqItem } from '@/lib/api-types';

// ── Constants ────────────────────────────────────────────────────────

const FAQ_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'procedures', label: 'Procedures' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'travel', label: 'Travel' },
  { value: 'insurance', label: 'Insurance' },
] as const;

// ── Main Component ──────────────────────────────────────────────────

export function FaqList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useFaqs();
  const faqs: FaqItem[] = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (data as { data?: FaqItem[] }).data ?? [];
  }, [data]);

  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredFaqs = useMemo(() => {
    let result = faqs;
    if (activeCategory !== 'all') {
      result = result.filter((f) => f.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.questionEn.toLowerCase().includes(q) ||
          f.questionZh.toLowerCase().includes(q),
      );
    }
    return result;
  }, [faqs, activeCategory, search]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFaqItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      setDeleteConfirmId(null);
    },
  });

  const openCreate = () => {
    setEditingFaq(null);
    setModalOpen(true);
  };

  const openEdit = (faq: FaqItem) => {
    setEditingFaq(faq);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingFaq(null);
  };

  const handleModalSave = () => {
    queryClient.invalidateQueries({ queryKey: ['faqs'] });
    handleModalClose();
  };

  return (
    <div className="space-y-6">
      {/* Category filter tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 flex-wrap">
          {FAQ_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setActiveCategory(c.value)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeCategory === c.value
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full shadow-md shadow-indigo-200/50 transition-colors"
        >
          <Plus size={16} /> New FAQ
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by question..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading FAQs...</div>
        ) : filteredFaqs.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            {faqs.length === 0
              ? 'No FAQ items yet. Create your first FAQ to get started.'
              : 'No FAQs match your search.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                  Question
                </th>
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                  Category
                </th>
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                  Status
                </th>
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                  Last Updated
                </th>
                <th className="text-right px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredFaqs.map((faq) => (
                <tr
                  key={faq.id}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-6 py-4 max-w-xs">
                    <p className="font-medium text-slate-800 truncate">{faq.questionEn}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{faq.questionZh}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium capitalize">
                      {faq.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        faq.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {faq.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(faq.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(faq)}
                        className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(faq.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <FaqModal faq={editingFaq} onClose={handleModalClose} onSaved={handleModalSave} />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete FAQ</h3>
            <p className="text-sm text-slate-500 mb-6">
              Are you sure you want to delete this FAQ item? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-full shadow-md transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FAQ Modal ──────────────────────────────────────────────────

function FaqModal({
  faq,
  onClose,
  onSaved,
}: {
  faq: FaqItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [questionEn, setQuestionEn] = useState(faq?.questionEn ?? '');
  const [questionZh, setQuestionZh] = useState(faq?.questionZh ?? '');
  const [answerEn, setAnswerEn] = useState(faq?.answerEn ?? '');
  const [answerZh, setAnswerZh] = useState(faq?.answerZh ?? '');
  const [category, setCategory] = useState(faq?.category ?? 'general');
  const [keywords, setKeywords] = useState((faq?.keywords ?? []).join(', '));
  const [isActive, setIsActive] = useState(faq?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!questionEn.trim() || !questionZh.trim()) {
      setError('Question EN and Question ZH are required.');
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
        questionEn,
        questionZh,
        answerEn,
        answerZh,
        category,
        keywords: keywordsArray,
        isActive,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-[1.5rem] w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            {faq ? 'Edit FAQ' : 'Create FAQ'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-700 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Category + Active row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {FAQ_CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
              <div className="flex items-center gap-4 mt-1">
                <button
                  type="button"
                  onClick={() => setIsActive(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !isActive
                      ? 'bg-slate-100 text-slate-700 border border-slate-300'
                      : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Inactive
                </button>
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Active
                </button>
              </div>
            </div>
          </div>

          {/* Question EN */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Question (English)
            </label>
            <input
              type="text"
              value={questionEn}
              onChange={(e) => setQuestionEn(e.target.value)}
              placeholder="e.g. What procedures do you offer?"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
            />
          </div>

          {/* Question ZH */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Question (Chinese)
            </label>
            <input
              type="text"
              value={questionZh}
              onChange={(e) => setQuestionZh(e.target.value)}
              placeholder="e.g. 您提供哪些手术项目？"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
            />
          </div>

          {/* Answer EN */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Answer (English)
            </label>
            <textarea
              value={answerEn}
              onChange={(e) => setAnswerEn(e.target.value)}
              placeholder="Provide a detailed answer in English..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none h-32 resize-none"
            />
          </div>

          {/* Answer ZH */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Answer (Chinese)
            </label>
            <textarea
              value={answerZh}
              onChange={(e) => setAnswerZh(e.target.value)}
              placeholder="提供中文详细回答..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none h-32 resize-none"
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Keywords{' '}
              <span className="font-normal text-slate-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. rhinoplasty, nose, surgery"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-8 py-6 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : faq ? 'Update FAQ' : 'Create FAQ'}
          </button>
        </div>
      </div>
    </div>
  );
}
