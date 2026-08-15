'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { BookOpen, FlaskConical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteGuide } from '@/actions/guide-actions';
import { GUIDE_CATEGORIES, formatGuideDate, getGuideCategory, type Guide, type GuideCategory, type GuideStatus } from '@/lib/guides';
import { useGuides } from '@/queries/use-guides';

interface GuideListResponse { data: Guide[]; total: number; }

const PRIMARY_CATEGORIES = GUIDE_CATEGORIES;

export function GuidesList() {
  const [category, setCategory] = useState<GuideCategory | ''>('');
  const [status, setStatus] = useState<GuideStatus | ''>('');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const filters = useMemo(() => {
    const next: Record<string, string> = { page: '1', limit: '100' };
    if (category) next.category = category;
    if (status) next.status = status;
    if (search.trim()) next.search = search.trim();
    return next;
  }, [category, search, status]);
  const { data: raw, isLoading } = useGuides(filters);
  const result = (raw ?? { data: [], total: 0 }) as GuideListResponse;
  const counts = useMemo(() => {
    const next = new Map<string, number>();
    result.data.forEach((guide) => next.set(guide.category, (next.get(guide.category) ?? 0) + 1));
    return next;
  }, [result.data]);

  function removeGuide(id: string) {
    startTransition(async () => {
      try {
        await deleteGuide(id);
        setDeleteId(null);
        await queryClient.invalidateQueries({ queryKey: ['guides'] });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Unable to delete guide');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Create and maintain patient-facing medical tourism guidance.</p>
          <p className="mt-1 text-xs text-slate-400">Clinical Trials &amp; Advanced Treatments is an independent featured category.</p>
        </div>
        <Link href="/guides/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-cyan-800">
          <Plus size={16} /> New guide
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PRIMARY_CATEGORIES.map((item) => {
          const selected = category === item.value;
          return (
            <button key={item.value} type="button" onClick={() => setCategory(selected ? '' : item.value)} className={`min-h-28 rounded-md border p-4 text-left transition-colors ${selected ? 'border-cyan-500 bg-cyan-50' : item.featured ? 'border-violet-200 bg-violet-50 hover:border-violet-300' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <BookOpen className="mt-0.5 h-5 w-5 text-slate-500" />
                <span className="text-xs font-medium text-slate-400">{counts.get(item.value) ?? 0} guides</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
              {item.featured && <span className="mt-3 inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800"><FlaskConical size={12} /> Featured category</span>}
            </button>
          );
        })}
      </div>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guides" className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-cyan-600" />
          </div>
          <div className="flex items-center gap-2">
            <select value={category} onChange={(event) => setCategory(event.target.value as GuideCategory | '')} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
              <option value="">All categories</option>
              {GUIDE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value as GuideStatus | '')} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
              <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option>
            </select>
          </div>
        </div>
        {isLoading ? <div className="p-8 text-center text-sm text-slate-500">Loading guides...</div> : result.data.length === 0 ? (
          <div className="p-10 text-center"><BookOpen className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No guides found</p><p className="mt-1 text-sm text-slate-500">Create the first article for a category above.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Guide</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Reviewed</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{result.data.map((guide) => <tr key={guide.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/guides/${guide.id}`} className="font-medium text-slate-800 hover:text-cyan-700">{guide.title}</Link><p className="mt-1 max-w-xl truncate text-xs text-slate-500">{guide.subtitle || 'No subtitle'}</p></td><td className="px-4 py-3 text-slate-600">{getGuideCategory(guide.category)?.label ?? guide.category}</td><td className="px-4 py-3 text-slate-600">{guide.reviewedBy || 'Unassigned'}<span className="block text-xs text-slate-400">{formatGuideDate(guide.updatedDate)}</span></td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${guide.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{guide.status === 'PUBLISHED' ? 'Published' : 'Draft'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Link href={`/guides/${guide.id}`} title="Edit guide" className="rounded-md p-2 text-slate-400 hover:bg-cyan-50 hover:text-cyan-700"><Pencil size={15} /></Link><button type="button" title="Delete guide" onClick={() => setDeleteId(guide.id)} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15} /></button></div></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {deleteId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-md bg-white p-5 shadow-xl"><h2 className="text-base font-semibold text-slate-900">Delete guide?</h2><p className="mt-2 text-sm text-slate-600">This permanently removes the guide and its article content.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteId(null)} className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700">Cancel</button><button type="button" disabled={isPending} onClick={() => removeGuide(deleteId)} className="h-9 rounded-md bg-rose-600 px-3 text-sm font-medium text-white disabled:opacity-60">{isPending ? 'Deleting...' : 'Delete'}</button></div></div></div>}
    </div>
  );
}
