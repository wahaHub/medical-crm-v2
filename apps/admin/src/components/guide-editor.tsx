'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LoaderCircle, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createGuide, generateGuideTakeaways, updateGuide } from '@/actions/guide-actions';
import { GUIDE_CATEGORIES, emptyGuideContentDocument, guideContentText, type Guide, type GuideCategory, type GuideContentDocument, type GuideFaq, type RelatedTreatment } from '@/lib/guides';
import { queryFetch } from '@/lib/query-fetch';
import { useGuide, useGuides } from '@/queries/use-guides';
import { GuideRichTextEditor } from '@/components/guide-rich-text-editor';

interface HospitalOption { id: string; name: string; }
interface HospitalListResponse { data?: HospitalOption[]; }
interface GuideListResponse { data?: Guide[]; }
interface ProcedureDirectoryResponse { data?: RelatedTreatment[]; page: number; hasMore: boolean; }
interface UploadInitResponse { upload?: { uploadUrl: string; storageKey: string }; asset?: { storageKey: string; fileName: string; mimeType: string; fileSize: number }; error?: string; message?: string; }

interface EditorState {
  title: string; subtitle: string; heroImageStorageKey: string; heroImageUrl: string; category: GuideCategory; reviewedBy: string;
  updatedDate: string; keyTakeaways: string[]; contentDocument: GuideContentDocument; contentImageUrls: Record<string, string>; relatedHospitalIds: string[];
  relatedTreatments: RelatedTreatment[]; relatedGuideIds: string[]; faqs: GuideFaq[]; status: 'DRAFT' | 'PUBLISHED';
}

const emptyState = (): EditorState => ({
  title: '', subtitle: '', heroImageStorageKey: '', heroImageUrl: '', category: 'china_healthcare', reviewedBy: '',
  updatedDate: new Date().toISOString().slice(0, 10), keyTakeaways: [], contentDocument: emptyGuideContentDocument, contentImageUrls: {},
  relatedHospitalIds: [], relatedTreatments: [], relatedGuideIds: [], faqs: [], status: 'DRAFT',
});

function makeId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function fromGuide(guide: Guide): EditorState {
  return {
    title: guide.title, subtitle: guide.subtitle ?? '', heroImageStorageKey: guide.heroImageStorageKey ?? '', heroImageUrl: guide.heroImageUrl ?? '', category: guide.category,
    reviewedBy: guide.reviewedBy ?? '', updatedDate: guide.updatedDate, keyTakeaways: guide.keyTakeaways ?? [], contentDocument: guide.contentDocument ?? emptyGuideContentDocument, contentImageUrls: guide.contentImageUrls ?? {},
    relatedHospitalIds: guide.relatedHospitalIds ?? [], relatedTreatments: guide.relatedTreatments ?? [], relatedGuideIds: guide.relatedGuideIds ?? [], faqs: guide.faqs ?? [], status: guide.status,
  };
}

export function GuideEditor({ guideId }: { guideId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(emptyState);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [procedurePage, setProcedurePage] = useState(1);
  const [procedureSearch, setProcedureSearch] = useState('');
  const [procedures, setProcedures] = useState<RelatedTreatment[]>([]);
  const { data: loadedGuide, isLoading } = useGuide(guideId ?? null);
  const { data: hospitalsRaw } = useQuery({ queryKey: ['guide-hospitals'], queryFn: () => queryFetch('/api/hospitals?page=1&limit=100') });
  const { data: allGuidesRaw } = useGuides({ page: '1', limit: '100' });
  const { data: proceduresRaw, isFetching: isLoadingProcedures } = useQuery({
    queryKey: ['guide-procedures', procedurePage, procedureSearch],
    queryFn: () => queryFetch(`/api/guides/procedures?page=${procedurePage}&search=${encodeURIComponent(procedureSearch)}`),
  });
  const hospitals = ((hospitalsRaw as HospitalListResponse | undefined)?.data ?? []);
  const allGuides = ((allGuidesRaw as GuideListResponse | undefined)?.data ?? []).filter((guide) => guide.id !== guideId);
  const procedurePageData = proceduresRaw as ProcedureDirectoryResponse | undefined;

  useEffect(() => { if (loadedGuide) setState(fromGuide(loadedGuide as Guide)); }, [loadedGuide]);
  useEffect(() => {
    if (!procedurePageData) return;
    setProcedures((current) => {
      const incoming = procedurePageData.data ?? [];
      if (procedurePage === 1) return incoming;
      const known = new Set(current.map((item) => `${item.hospitalId}:${item.procedureId}`));
      return [...current, ...incoming.filter((item) => !known.has(`${item.hospitalId}:${item.procedureId}`))];
    });
  }, [procedurePage, procedurePageData]);

  const selectedHospitalIds = useMemo(() => new Set(state.relatedHospitalIds), [state.relatedHospitalIds]);
  const selectedProcedureIds = useMemo(() => new Set(state.relatedTreatments.map((item) => `${item.hospitalId}:${item.procedureId}`)), [state.relatedTreatments]);

  function setField<K extends keyof EditorState>(field: K, value: EditorState[K]) { setState((current) => ({ ...current, [field]: value })); setNotice(null); }
  function updateFaq(id: string, key: keyof GuideFaq, value: string) { setField('faqs', state.faqs.map((faq) => faq.id === id ? { ...faq, [key]: value } : faq)); }
  function toggleHospital(id: string) { setField('relatedHospitalIds', selectedHospitalIds.has(id) ? state.relatedHospitalIds.filter((item) => item !== id) : [...state.relatedHospitalIds, id]); }
  function toggleGuide(id: string) { setField('relatedGuideIds', state.relatedGuideIds.includes(id) ? state.relatedGuideIds.filter((item) => item !== id) : [...state.relatedGuideIds, id]); }
  function toggleProcedure(procedure: RelatedTreatment) {
    const key = `${procedure.hospitalId}:${procedure.procedureId}`;
    setField('relatedTreatments', selectedProcedureIds.has(key) ? state.relatedTreatments.filter((item) => `${item.hospitalId}:${item.procedureId}` !== key) : [...state.relatedTreatments, procedure]);
  }

  async function uploadHeroImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Upload a JPG, PNG, or WebP image.'); return; }
    setIsUploadingImage(true);
    try {
      const initResponse = await fetch('/api/guides/images/upload-init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }) });
      const init = await initResponse.json().catch(() => ({})) as UploadInitResponse;
      if (!initResponse.ok || !init.upload || !init.asset) throw new Error(init.error ?? init.message ?? 'Unable to initialize image upload');
      const uploadResponse = await fetch(init.upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadResponse.ok) throw new Error('Unable to upload image');
      setField('heroImageStorageKey', init.asset.storageKey);
      setField('heroImageUrl', URL.createObjectURL(file));
      setNotice('Hero image uploaded. Save the guide to keep it attached.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to upload image'); }
    finally { setIsUploadingImage(false); }
  }

  function generateTakeaways() {
    setError(null);
    if (!guideContentText(state.contentDocument)) { setError('Add article content before generating takeaways.'); return; }
    startGenerating(async () => {
      try { const result = await generateGuideTakeaways({ title: state.title, contentDocument: state.contentDocument }); setField('keyTakeaways', result.takeaways); setNotice('Key takeaways were generated from the article content.'); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to generate takeaways'); }
    });
  }

  function save() {
    setError(null); setNotice(null);
    if (state.title.trim().length < 3) { setError('A guide title of at least 3 characters is required.'); return; }
    const faqs = state.faqs.filter((faq) => faq.question.trim() || faq.answer.trim());
    if (faqs.some((faq) => !faq.question.trim() || !faq.answer.trim())) { setError('Each FAQ needs both a question and answer.'); return; }
    const payload = { ...state, title: state.title.trim(), subtitle: state.subtitle.trim(), heroImageStorageKey: state.heroImageStorageKey || null, reviewedBy: state.reviewedBy.trim(), faqs, keyTakeaways: state.keyTakeaways.map((item) => item.trim()).filter(Boolean) };
    startSaving(async () => { try { const saved = guideId ? await updateGuide(guideId, payload) : await createGuide(payload); setNotice('Guide saved.'); if (!guideId) router.replace(`/guides/${saved.id}`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save guide'); } });
  }

  if (guideId && isLoading) return <div className="py-12 text-center text-sm text-slate-500">Loading guide...</div>;

  return <div className="mx-auto max-w-6xl space-y-6 pb-12">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><Link href="/guides" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-cyan-700"><ArrowLeft size={15} /> Back to guides</Link><h2 className="mt-3 text-xl font-semibold text-slate-800">{guideId ? 'Edit guide' : 'New guide'}</h2><p className="mt-1 text-sm text-slate-500">Build a reviewable, patient-facing article with structured related content.</p></div><div className="flex items-center gap-2"><select value={state.status} onChange={(event) => setField('status', event.target.value as EditorState['status'])} aria-label="Publication status" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select><button type="button" onClick={save} disabled={isSaving} className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-medium text-white hover:bg-cyan-800 disabled:opacity-60">{isSaving ? 'Saving...' : 'Save guide'}</button></div></div>
    {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}{notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

    <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-semibold text-slate-800">Hero</h3><p className="mt-1 text-sm text-slate-500">The article identity shown to readers.</p></div><div className="grid gap-4 p-5 lg:grid-cols-2"><Field label="Title" required><input value={state.title} onChange={(event) => setField('title', event.target.value)} className="field" placeholder="Guide title" /></Field><Field label="Category" required><select value={state.category} onChange={(event) => setField('category', event.target.value as GuideCategory)} className="field">{GUIDE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.featured ? `${item.label} (featured)` : item.label}</option>)}</select></Field><Field label="Subtitle"><input value={state.subtitle} onChange={(event) => setField('subtitle', event.target.value)} className="field" placeholder="One-sentence context for this guide" /></Field><Field label="Reviewed by"><input value={state.reviewedBy} onChange={(event) => setField('reviewedBy', event.target.value)} className="field" placeholder="Reviewer name or clinical team" /></Field><Field label="Updated date"><input type="date" value={state.updatedDate} onChange={(event) => setField('updatedDate', event.target.value)} className="field" /></Field><div className="text-sm font-medium text-slate-700"><span className="mb-1.5 block">Hero image</span><label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"><Upload size={15} />{isUploadingImage ? 'Uploading...' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingImage} onChange={(event) => void uploadHeroImage(event.target.files?.[0])} className="sr-only" /></label></div>{state.heroImageUrl && <div className="lg:col-span-2"><div className="relative flex aspect-[16/6] items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50"><img src={state.heroImageUrl} alt="Guide hero preview" className="h-full w-full object-cover" /><button type="button" title="Remove hero image" onClick={() => { setField('heroImageStorageKey', ''); setField('heroImageUrl', ''); }} className="absolute right-3 top-3 rounded-md bg-white/95 p-2 text-slate-600 shadow-sm hover:text-rose-700"><X size={15} /></button></div></div>}</div></section>

    <section className="border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h3 className="font-semibold text-slate-800">Key Takeaways</h3><p className="mt-1 text-sm text-slate-500">Generated from the article content, then editable.</p></div><button type="button" onClick={generateTakeaways} disabled={isGenerating} className="inline-flex h-9 items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"><Sparkles size={15} />{isGenerating ? 'Generating...' : 'Generate with AI'}</button></div><div className="p-5"><textarea value={state.keyTakeaways.join('\n')} onChange={(event) => setField('keyTakeaways', event.target.value.split('\n'))} rows={Math.max(4, state.keyTakeaways.length + 1)} className="field min-h-28" placeholder="One takeaway per line" /></div></section>

    <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-semibold text-slate-800">Content</h3><p className="mt-1 text-sm text-slate-500">One flexible article body with formatting, links, lists, quotes, and uploaded images.</p></div><div className="p-5"><GuideRichTextEditor document={state.contentDocument} imageUrls={state.contentImageUrls} onChange={(contentDocument) => setField('contentDocument', contentDocument)} /></div></section>

    <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-semibold text-slate-800">Related Hospitals</h3><p className="mt-1 text-sm text-slate-500">Select hospitals relevant to this guide.</p></div><div className="grid max-h-64 gap-2 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">{hospitals.length ? hospitals.map((hospital) => <label key={hospital.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={selectedHospitalIds.has(hospital.id)} onChange={() => toggleHospital(hospital.id)} className="h-4 w-4 accent-cyan-700" />{hospital.name}</label>) : <EmptyText text="No hospitals are available to select." />}</div></section>

    <section className="border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h3 className="font-semibold text-slate-800">Related Treatments</h3><p className="mt-1 text-sm text-slate-500">Link this guide to real procedures from hospital materials.</p></div><input value={procedureSearch} onChange={(event) => { setProcedureSearch(event.target.value); setProcedurePage(1); }} placeholder="Search loaded procedures" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-cyan-600 sm:w-64" /></div><div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">{procedures.map((procedure) => <label key={`${procedure.hospitalId}:${procedure.procedureId}`} className="flex cursor-pointer items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedProcedureIds.has(`${procedure.hospitalId}:${procedure.procedureId}`)} onChange={() => toggleProcedure(procedure)} className="h-4 w-4 accent-cyan-700" /><span className="min-w-0"><span className="block font-medium text-slate-800">{procedure.procedureName}</span><span className="block truncate text-xs text-slate-500">{procedure.hospitalName}</span></span></label>)}{!procedures.length && !isLoadingProcedures && <EmptyText text="No procedures found in the loaded hospital records." />}</div><div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><span className="text-xs text-slate-500">{state.relatedTreatments.length} procedure link{state.relatedTreatments.length === 1 ? '' : 's'} selected</span>{procedurePageData?.hasMore && <button type="button" onClick={() => setProcedurePage((page) => page + 1)} disabled={isLoadingProcedures} className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">{isLoadingProcedures && <LoaderCircle size={14} className="animate-spin" />} Load more procedures</button>}</div></section>

    <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-semibold text-slate-800">Related Guides</h3><p className="mt-1 text-sm text-slate-500">Link readers to other relevant guides.</p></div><div className="grid max-h-64 gap-2 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">{allGuides.length ? allGuides.map((guide) => <label key={guide.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={state.relatedGuideIds.includes(guide.id)} onChange={() => toggleGuide(guide.id)} className="h-4 w-4 accent-cyan-700" />{guide.title}</label>) : <EmptyText text="Create another guide to connect it here." />}</div></section>

    <section className="border border-slate-200 bg-white"><SectionHeader title="FAQ" description="Add questions patients are likely to ask after reading this guide." onAdd={() => setField('faqs', [...state.faqs, { id: makeId('faq'), question: '', answer: '' }])} addLabel="Add FAQ" /><div className="divide-y divide-slate-100">{state.faqs.length === 0 ? <EmptyText text="No guide-specific FAQs yet." /> : state.faqs.map((faq, index) => <div key={faq.id} className="p-5"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium text-slate-700">FAQ {index + 1}</p><button type="button" title="Remove FAQ" onClick={() => setField('faqs', state.faqs.filter((item) => item.id !== faq.id))} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15} /></button></div><input value={faq.question} onChange={(event) => updateFaq(faq.id, 'question', event.target.value)} className="field mb-3" placeholder="Question" /><textarea value={faq.answer} onChange={(event) => updateFaq(faq.id, 'answer', event.target.value)} rows={4} className="field min-h-24" placeholder="Answer" /></div>)}</div></section>
  </div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">{label}{required && <span className="text-rose-600"> *</span>}</span>{children}</label>; }
function EmptyText({ text }: { text: string }) { return <p className="p-5 text-sm text-slate-500">{text}</p>; }
function SectionHeader({ title, description, onAdd, addLabel }: { title: string; description: string; onAdd: () => void; addLabel: string }) { return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h3 className="font-semibold text-slate-800">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Plus size={15} /> {addLabel}</button></div>; }
