'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import { useEmailTemplates } from '@/queries/use-email-templates';
import {
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from '@/actions/email-template-actions';
import type { EmailTemplateItem } from '@/lib/api-types';

// ── Constants ────────────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'intro', label: 'Intro' },
  { value: 'quote', label: 'Quote' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'post-ops', label: 'Post-Ops' },
  { value: 'custom', label: 'Custom' },
] as const;

const TEMPLATE_VARIABLES = [
  '{{patient_name}}',
  '{{case_number}}',
  '{{hospital_name}}',
  '{{quote_total}}',
  '{{doctor_name}}',
  '{{procedure_name}}',
] as const;

// ── Main Component ──────────────────────────────────────────────────

export function EmailTemplatesList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useEmailTemplates();
  const templates: EmailTemplateItem[] = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (data as { data?: EmailTemplateItem[] }).data ?? [];
  }, [data]);

  const [activeType, setActiveType] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    let result = templates;
    if (activeType !== 'all') {
      result = result.filter((t) => t.type === activeType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }
    return result;
  }, [templates, activeType, search]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmailTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setDeleteConfirmId(null);
    },
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setModalOpen(true);
  };

  const openEdit = (template: EmailTemplateItem) => {
    setEditingTemplate(template);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingTemplate(null);
  };

  const handleModalSave = () => {
    queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    handleModalClose();
  };

  return (
    <div className="space-y-6">
      {/* Type filter tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
          {TEMPLATE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveType(t.value)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeType === t.value
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full shadow-md shadow-indigo-200/50 transition-colors"
        >
          <Plus size={16} /> New Template
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading templates...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            {templates.length === 0
              ? 'No email templates yet. Create your first template to get started.'
              : 'No templates match your search.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Type</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Subject</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Last Updated</th>
                <th className="text-right px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((tpl) => (
                <tr key={tpl.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-800">{tpl.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium capitalize">
                      {tpl.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 max-w-xs truncate">{tpl.subject}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        tpl.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {tpl.status === 'active' ? 'Active' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(tpl.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(tpl)}
                        className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(tpl.id)}
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
        <TemplateModal
          template={editingTemplate}
          onClose={handleModalClose}
          onSaved={handleModalSave}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Template</h3>
            <p className="text-sm text-slate-500 mb-6">
              Are you sure you want to delete this template? This action cannot be undone.
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

// ── Template Modal ──────────────────────────────────────────────────

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: EmailTemplateItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [type, setType] = useState(template?.type ?? 'intro');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [status, setStatus] = useState(template?.status ?? 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = useCallback(
    (variable: string, target: 'subject' | 'body') => {
      const el = target === 'subject' ? subjectRef.current : bodyRef.current;
      if (!el) return;

      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const currentValue = target === 'subject' ? subject : body;
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end);

      if (target === 'subject') {
        setSubject(newValue);
      } else {
        setBody(newValue);
      }

      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        el.focus();
        const newPos = start + variable.length;
        el.setSelectionRange(newPos, newPos);
      });
    },
    [subject, body],
  );

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) {
      setError('Name and Subject are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { name, type, subject, body, status, variables: TEMPLATE_VARIABLES.filter((v) => subject.includes(v) || body.includes(v)) };
      if (template) {
        await updateEmailTemplate(template.id, payload);
      } else {
        await createEmailTemplate(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
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
            {template ? 'Edit Template' : 'Create Template'}
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

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Welcome Patient"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
            />
          </div>

          {/* Type + Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {TEMPLATE_TYPES.filter((t) => t.value !== 'all').map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
              <div className="flex items-center gap-4 mt-1">
                <button
                  onClick={() => setStatus('draft')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    status === 'draft'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() => setStatus('active')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Active
                </button>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Subject</label>
            <VariableChips onInsert={(v) => insertVariable(v, 'subject')} />
            <input
              ref={subjectRef}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Body</label>
            <VariableChips onInsert={(v) => insertVariable(v, 'body')} />
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body content..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none h-48 resize-none"
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
            {saving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Variable Chips ──────────────────────────────────────────────────

function VariableChips({ onInsert }: { onInsert: (variable: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {TEMPLATE_VARIABLES.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors border border-indigo-100"
        >
          {v}
        </button>
      ))}
    </div>
  );
}
