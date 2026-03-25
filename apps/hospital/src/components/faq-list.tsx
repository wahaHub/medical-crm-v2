'use client';

import { useState, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, X, FolderPlus, Folder, Paperclip, Check } from 'lucide-react';
import { useFaqs, useFaqCategories } from '@/queries/use-faqs';
import type { FaqCategoryItem } from '@/queries/use-faqs';
import {
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  createFaqCategory,
  deleteFaqCategory,
} from '@/actions/faq-actions';
import { uploadFaqAttachment } from '@/actions/faq-upload-actions';
import type { FaqItem, FaqAttachmentItem } from '@/lib/api-types';
import { AttachmentPreviewCard, isPreviewableAttachment } from '@/components/attachment-preview-card';

// ── Helpers ──────────────────────────────────────────────────────────

type EditableFaqAttachment = FaqAttachmentItem & {
  localId: string;
  pendingFile?: File;
};

type SaveProgressStatus = 'pending' | 'uploading' | 'saving' | 'done' | 'failed';

type SaveProgressItem = {
  id: string;
  label: string;
  status: SaveProgressStatus;
  error?: string;
};

type SaveProgressState = {
  open: boolean;
  title: string;
  items: SaveProgressItem[];
  canDismiss: boolean;
};

function createLocalAttachmentId() {
  return globalThis.crypto?.randomUUID?.() ?? `faq-att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function UploadProgressModal({
  state,
  onDismiss,
}: {
  state: SaveProgressState;
  onDismiss: () => void;
}) {
  const completedCount = state.items.filter((item) => item.status === 'done').length;
  const progress = state.items.length > 0 ? Math.round((completedCount / state.items.length) * 100) : 0;

  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div className="bg-white rounded-[1.5rem] w-full max-w-xl mx-4 shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">{state.title}</h3>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{state.items.some((item) => item.status === 'failed') ? 'Finished with errors' : 'Uploading and saving'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  state.items.some((item) => item.status === 'failed')
                    ? 'bg-gradient-to-r from-amber-400 to-rose-500'
                    : 'bg-gradient-to-r from-indigo-500 to-cyan-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {state.items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border px-3 py-3 flex items-start gap-3 ${
                  item.status === 'failed'
                    ? 'border-rose-200 bg-rose-50'
                    : item.status === 'done'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {item.status === 'done' && <Check size={16} className="text-emerald-600" />}
                  {item.status === 'failed' && <X size={16} className="text-rose-600" />}
                  {(item.status === 'uploading' || item.status === 'saving') && (
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
                  )}
                  {item.status === 'pending' && <div className="w-4 h-4 rounded-full bg-slate-200" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{item.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {item.status === 'pending' && 'Waiting'}
                    {item.status === 'uploading' && 'Uploading...'}
                    {item.status === 'saving' && 'Saving...'}
                    {item.status === 'done' && 'Done'}
                    {item.status === 'failed' && (item.error || 'Failed')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              disabled={!state.canDismiss}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function FaqList() {
  const queryClient = useQueryClient();
  const { data: categoriesData, isLoading: categoriesLoading } = useFaqCategories();
  const categories: FaqCategoryItem[] = categoriesData ?? [];

  const [activeCategory, setActiveCategory] = useState('all');
  const { data, isLoading } = useFaqs(activeCategory === 'all' ? undefined : activeCategory);
  const faqs: FaqItem[] = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (data as { data?: FaqItem[] }).data ?? [];
  }, [data]);

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<FaqCategoryItem | null>(null);

  const filteredFaqs = useMemo(() => {
    if (!search.trim()) return faqs;
    const q = search.toLowerCase();
    return faqs.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
    );
  }, [faqs, search]);

  // Group FAQs by category
  const groupedFaqs = useMemo(() => {
    if (activeCategory !== 'all') return null; // flat list when a category is selected
    const groups = new Map<string, FaqItem[]>();
    for (const faq of filteredFaqs) {
      const key = faq.category;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(faq);
    }
    return groups;
  }, [filteredFaqs, activeCategory]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFaqItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      queryClient.invalidateQueries({ queryKey: ['faq-categories'] });
      setDeleteConfirmId(null);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => deleteFaqCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faq-categories'] });
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      setDeleteCategoryConfirm(null);
      if (activeCategory !== 'all') setActiveCategory('all');
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
    queryClient.invalidateQueries({ queryKey: ['faq-categories'] });
    handleModalClose();
  };

  return (
    <div className="space-y-6">
      {/* Category tabs + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 flex-wrap">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeCategory === 'all'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            All
          </button>
          {categoriesLoading ? (
            <span className="px-4 py-2 text-sm text-slate-400">Loading...</span>
          ) : (
            categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.name)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeCategory === cat.name
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {cat.name}
                <span className="text-xs opacity-60">({cat.questionCount})</span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCategoryModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-full transition-colors"
          >
            <FolderPlus size={16} /> New Category
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full shadow-md shadow-indigo-200/50 transition-colors"
          >
            <Plus size={16} /> New FAQ
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by question, answer, or keywords..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-12 text-center text-sm text-slate-400">
          Loading FAQs...
        </div>
      ) : filteredFaqs.length === 0 ? (
        <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-12 text-center text-sm text-slate-400">
          {faqs.length === 0
            ? 'No FAQ items yet. Create your first FAQ to get started.'
            : 'No FAQs match your search.'}
        </div>
      ) : groupedFaqs ? (
        // Grouped view (All tab)
        <div className="space-y-6">
          {[...groupedFaqs.entries()].map(([categoryName, categoryFaqs]) => {
            const cat = categories.find((c) => c.name === categoryName);
            return (
              <div key={categoryName} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Folder size={16} className="text-indigo-500" />
                    <h3 className="text-sm font-semibold text-slate-700">{categoryName}</h3>
                    <span className="text-xs text-slate-400">({categoryFaqs.length})</span>
                  </div>
                  {cat && (
                    <button
                      onClick={() => setDeleteCategoryConfirm(cat)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                      title="Delete category"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <FaqTable faqs={categoryFaqs} onEdit={openEdit} onDelete={setDeleteConfirmId} />
              </div>
            );
          })}
        </div>
      ) : (
        // Flat view (specific category selected)
        <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <FaqTable faqs={filteredFaqs} onEdit={openEdit} onDelete={setDeleteConfirmId} />
        </div>
      )}

      {/* Create/Edit FAQ Modal */}
      {modalOpen && (
        <FaqModal
          faq={editingFaq}
          categories={categories}
          defaultCategory={activeCategory !== 'all' ? activeCategory : undefined}
          onClose={handleModalClose}
          onSaved={handleModalSave}
        />
      )}

      {/* Create Category Modal */}
      {categoryModalOpen && (
        <CategoryModal
          onClose={() => setCategoryModalOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['faq-categories'] });
            setCategoryModalOpen(false);
          }}
        />
      )}

      {/* Delete FAQ Confirmation */}
      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete FAQ"
          message="Are you sure you want to delete this FAQ item? This action cannot be undone."
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {/* Delete Category Confirmation */}
      {deleteCategoryConfirm && (
        <ConfirmDialog
          title="Delete Category"
          message={
            deleteCategoryConfirm.questionCount > 0
              ? `This category has ${deleteCategoryConfirm.questionCount} FAQ(s). You must delete or move all FAQs before deleting the category.`
              : 'Are you sure you want to delete this category? This action cannot be undone.'
          }
          isPending={deleteCategoryMutation.isPending}
          disableConfirm={deleteCategoryConfirm.questionCount > 0}
          onConfirm={() => deleteCategoryMutation.mutate(deleteCategoryConfirm.id)}
          onCancel={() => setDeleteCategoryConfirm(null)}
        />
      )}
    </div>
  );
}

// ── FAQ Table ────────────────────────────────────────────────────

function FaqTable({
  faqs,
  onEdit,
  onDelete,
}: {
  faqs: FaqItem[];
  onEdit: (faq: FaqItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/50">
          <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">Question</th>
          <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">Status</th>
          <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">Updated</th>
          <th className="text-right px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">Actions</th>
        </tr>
      </thead>
      <tbody>
        {faqs.map((faq) => (
          <tr key={faq.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td className="px-6 py-3.5 max-w-md">
              <p className="font-medium text-slate-800 truncate">{faq.question}</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{faq.answer}</p>
              {(faq.attachments?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                  <Paperclip size={10} /> {faq.attachments!.length} attachment{faq.attachments!.length > 1 ? 's' : ''}
                </span>
              )}
            </td>
            <td className="px-6 py-3.5">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                faq.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {faq.isActive ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td className="px-6 py-3.5 text-slate-500">{new Date(faq.updatedAt).toLocaleDateString()}</td>
            <td className="px-6 py-3.5">
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => onEdit(faq)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Edit">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => onDelete(faq.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── FAQ Modal ────────────────────────────────────────────────────

function FaqModal({
  faq,
  categories,
  defaultCategory,
  onClose,
  onSaved,
}: {
  faq: FaqItem | null;
  categories: FaqCategoryItem[];
  defaultCategory?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState(faq?.question ?? '');
  const [answer, setAnswer] = useState(faq?.answer ?? '');
  const [category, setCategory] = useState(faq?.category ?? defaultCategory ?? (categories[0]?.name || ''));
  const [keywords, setKeywords] = useState((faq?.keywords ?? []).join(', '));
  const [isActive, setIsActive] = useState(faq?.isActive ?? true);
  const [draftFaqId, setDraftFaqId] = useState<string | null>(faq?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });

  // Attachment state
  const [attachments, setAttachments] = useState<EditableFaqAttachment[]>(
    (faq?.attachments ?? []).map((att) => ({ ...att, localId: createLocalAttachmentId() })),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const nextAttachments = Array.from(files).map<EditableFaqAttachment>((file) => ({
      localId: createLocalAttachmentId(),
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      storageKey: '',
      url: isPreviewableAttachment(file.type) ? URL.createObjectURL(file) : undefined,
      pendingFile: file,
    }));
    setAttachments((prev) => [...prev, ...nextAttachments]);
    e.target.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  const handleSave = async () => {
    if (!question.trim() || !answer.trim()) {
      setError('Question and Answer are required.');
      return;
    }
    if (!category.trim()) {
      setError('Category is required. Create a category first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const keywordsArray = keywords.split(',').map((k) => k.trim()).filter(Boolean);
      const payload = { question, answer, category, hospitalType: 'COSMETIC' as const, keywords: keywordsArray, isActive };
      const persistedAttachments = attachments
        .filter((attachment) => !attachment.pendingFile && attachment.storageKey)
        .map<FaqAttachmentItem>(
          ({ localId: _localId, pendingFile: _pendingFile, url: _url, ...attachment }) => attachment,
        );
      const pendingAttachments = attachments.filter((attachment) => attachment.pendingFile);
      const existingFaqId = faq?.id ?? draftFaqId;

      setSaveProgress({
        open: true,
        title: existingFaqId ? 'Updating FAQ' : 'Creating FAQ',
        canDismiss: false,
        items: [
          {
            id: existingFaqId ? 'save-faq' : 'create-faq',
            label: existingFaqId ? 'Save FAQ details' : 'Create FAQ',
            status: 'pending',
          },
          ...pendingAttachments.map((attachment) => ({
            id: `upload-${attachment.localId}`,
            label: `Upload attachment: ${attachment.fileName}`,
            status: 'pending' as const,
          })),
          ...(pendingAttachments.length > 0
            ? [{
              id: 'finalize-faq',
              label: existingFaqId ? 'Save attachments' : 'Attach uploads to FAQ',
              status: 'pending' as const,
            }]
            : []),
        ],
      });

      let faqId = existingFaqId;

      if (faqId) {
        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            item.id === 'save-faq' ? { ...item, status: 'saving' } : item
          )),
        }));
        await updateFaqItem(faqId, { ...payload, attachments: persistedAttachments });
        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            item.id === 'save-faq' ? { ...item, status: 'done' } : item
          )),
        }));
      } else {
        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            item.id === 'create-faq' ? { ...item, status: 'saving' } : item
          )),
        }));
        const created = await createFaqItem(payload) as { id: string };
        faqId = created.id;
        setDraftFaqId(faqId);
        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            item.id === 'create-faq' ? { ...item, status: 'done' } : item
          )),
        }));
      }

      if (!faqId) throw new Error('FAQ ID missing after save');

      const uploadedAttachments = [...persistedAttachments];
      for (const attachment of pendingAttachments) {
        const taskId = `upload-${attachment.localId}`;
        const file = attachment.pendingFile;
        if (!file) continue;

        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            item.id === taskId ? { ...item, status: 'uploading' } : item
          )),
        }));
        try {
          const init = await uploadFaqAttachment(faqId, {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
          });
          let uploadResponse: Response;
          try {
            uploadResponse = await fetch(init.upload.uploadUrl, {
              method: 'PUT',
              body: file,
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
            });
          } catch (uploadError) {
            throw new Error(
              uploadError instanceof Error
                ? `${uploadError.message}. Upload request did not reach storage. Check browser CORS/network errors.`
                : 'Upload request did not reach storage. Check browser CORS/network errors.',
            );
          }
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed for "${file.name}" (status ${uploadResponse.status})`);
          }
          uploadedAttachments.push({
            fileName: init.asset.fileName,
            mimeType: init.asset.mimeType,
            fileSize: init.asset.fileSize,
            storageKey: init.asset.storageKey,
          });
          setSaveProgress((prev) => ({
            ...prev,
            items: prev.items.map((item) => (
              item.id === taskId ? { ...item, status: 'done' } : item
            )),
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to upload attachment';
          setError(message);
          setSaveProgress((prev) => ({
            ...prev,
            canDismiss: true,
            items: prev.items.map((item) => (
              item.id === taskId ? { ...item, status: 'failed', error: message } : item
            )),
          }));
          return;
        }
      }

      if (pendingAttachments.length > 0) {
        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            item.id === 'finalize-faq' ? { ...item, status: 'saving' } : item
          )),
        }));
        await updateFaqItem(faqId, { attachments: uploadedAttachments });
        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            item.id === 'finalize-faq' ? { ...item, status: 'done' } : item
          )),
        }));
      }
      setAttachments(uploadedAttachments.map((att) => ({ ...att, localId: createLocalAttachmentId() })));
      setSaveProgress((prev) => ({ ...prev, canDismiss: true }));
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save FAQ';
      setError(message);
      setSaveProgress((prev) => ({
        ...prev,
        open: prev.items.length > 0,
        canDismiss: true,
        items: prev.items.map((item) => {
          if (item.id === 'save-faq' || item.id === 'create-faq' || item.id === 'finalize-faq') {
            if (item.status === 'done') return item;
            return { ...item, status: 'failed', error: message };
          }
          return item;
        }),
      }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <UploadProgressModal
        state={saveProgress}
        onDismiss={() => setSaveProgress({ open: false, title: '', items: [], canDismiss: false })}
      />
      <div className="bg-white rounded-[1.5rem] w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{faq ? 'Edit FAQ' : 'Create FAQ'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-6 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-700 text-sm font-medium">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {categories.length === 0 && <option value="">-- Create a category first --</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
              <div className="flex items-center gap-4 mt-1">
                <button type="button" onClick={() => setIsActive(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!isActive ? 'bg-slate-100 text-slate-700 border border-slate-300' : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'}`}>
                  Inactive
                </button>
                <button type="button" onClick={() => setIsActive(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'}`}>
                  Active
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Question</label>
            <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What procedures do you offer?"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Answer</label>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)}
              placeholder="Provide a clear answer..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none h-32 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Keywords <span className="font-normal text-slate-400">(comma-separated)</span>
            </label>
            <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. rhinoplasty, nose, surgery"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none" />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Attachments</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Paperclip size={14} />
              Add Attachment
            </button>

            {/* Uploaded attachments */}
            {attachments.length > 0 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {attachments.map((att, i) => (
                  <AttachmentPreviewCard
                    key={att.localId}
                    fileName={att.fileName}
                    mimeType={att.mimeType}
                    fileSize={att.fileSize}
                    url={att.url}
                    pending={Boolean(att.pendingFile)}
                    onRemove={() => removeAttachment(i)}
                  />
                ))}
              </div>
            )}

            {attachments.some((attachment) => attachment.pendingFile) && (
              <div className="mt-2 text-xs text-amber-600">Pending attachments will upload when you save.</div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-8 py-6 border-t border-slate-100">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : faq ? 'Update FAQ' : 'Create FAQ'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category Modal ──────────────────────────────────────────────

function CategoryModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createFaqCategory({ name: name.trim(), hospitalType: 'COSMETIC' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-[1.5rem] w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">New Category</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-6 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-700 text-sm font-medium">{error}</div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Category Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pre-Surgery, Post-Surgery, Pricing"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none" />
          </div>

        </div>

        <div className="flex justify-end gap-3 px-8 py-6 border-t border-slate-100">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50 transition-colors disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Category'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Dialog ──────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  isPending,
  disableConfirm,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  isPending: boolean;
  disableConfirm?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isPending || disableConfirm}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-full shadow-md transition-colors disabled:opacity-50">
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
