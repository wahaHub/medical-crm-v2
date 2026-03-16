'use client';

import { useState, useEffect } from 'react';
import {
  Tabs,
  Card,
  CardHeader,
  CardTitle,
  DataTable,
  Button,
  Modal,
  EmptyState,
  LoadingSpinner,
  Avatar,
  type Column,
} from '@medical-crm/ui';
import {
  Building2,
  Scissors,
  UserRound,
  ImageIcon,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import {
  useMaterialsInfo,
  useProcedures,
  useSurgeons,
  useBeforeAfterCases,
} from '@/queries/use-materials';
import {
  updateHospitalInfo,
  createProcedure,
  updateProcedure,
  deleteProcedure,
  createSurgeon,
  updateSurgeon,
  deleteSurgeon,
  createBeforeAfterCase,
  updateBeforeAfterCase,
  deleteBeforeAfterCase,
} from '@/actions/materials-actions';
import type {
  MaterialsHospitalInfoDTO,
  MaterialsProcedureDTO,
  MaterialsSurgeonDTO,
  MaterialsBeforeAfterCaseDTO,
} from '@/lib/api-types';

const tabItems = [
  { key: 'info', label: 'Hospital Info' },
  { key: 'procedures', label: 'Procedures' },
  { key: 'surgeons', label: 'Surgeons' },
  { key: 'cases', label: 'Before & After' },
];

export function MaterialsTabs() {
  const [activeTab, setActiveTab] = useState('info');

  return (
    <div className="space-y-6">
      <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />
      {activeTab === 'info' && <HospitalInfoTab />}
      {activeTab === 'procedures' && <ProceduresTab />}
      {activeTab === 'surgeons' && <SurgeonsTab />}
      {activeTab === 'cases' && <BeforeAfterTab />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab 1: Hospital Info                                                       */
/* -------------------------------------------------------------------------- */

function HospitalInfoTab() {
  const { data, isLoading } = useMaterialsInfo();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const raw = (data as MaterialsHospitalInfoDTO | undefined) ?? null;
  const info = {
    name: raw?.name ?? '',
    slug: raw?.slug ?? '',
    heroImage: raw?.heroImage ?? '',
    photos: raw?.photos ?? [],
    highlights: raw?.highlights ?? [],
  };

  const startEdit = () => {
    setForm({
      heroImage: info.heroImage,
      highlights: info.highlights.map((h) => `${h.icon}:${h.text}`).join(', '),
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Parse highlights in "icon:text" format
      const highlights = form.highlights
        ? form.highlights.split(',').map((s) => {
            const trimmed = s.trim();
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx > 0) {
              return { icon: trimmed.slice(0, colonIdx).trim(), text: trimmed.slice(colonIdx + 1).trim() };
            }
            return { icon: '✦', text: trimmed };
          }).filter((h) => h.text)
        : [];

      await updateHospitalInfo({
        heroImage: form.heroImage || null,
        highlights,
      });
      setEditing(false);
    } catch {
      // Error handled upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hospital Information</CardTitle>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={startEdit} className="gap-2">
            <Pencil size={14} /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="gap-2">
              <X size={14} /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </CardHeader>

      {editing ? (
        <div className="space-y-4">
          <InfoRow label="Name (read-only)" value={info.name} />
          <InfoRow label="Slug (read-only)" value={info.slug} />
          <FormField label="Hero Image URL" value={form.heroImage ?? ''} onChange={(v) => setForm({ ...form, heroImage: v })} />
          <FormField label="Highlights (icon:text, comma-separated)" value={form.highlights ?? ''} onChange={(v) => setForm({ ...form, highlights: v })} multiline />
        </div>
      ) : (
        <div className="space-y-4">
          <InfoRow label="Name" value={info.name} />
          <InfoRow label="Slug" value={info.slug} />
          {info.heroImage && (
            <div>
              <span className="text-sm font-medium text-slate-500">Hero Image</span>
              <img
                src={info.heroImage}
                alt="Hero"
                className="mt-1 h-40 w-full rounded-lg object-cover"
              />
            </div>
          )}
          {info.highlights.length > 0 && (
            <div>
              <span className="text-sm font-medium text-slate-500">Highlights</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {info.highlights.map((h, i) => (
                  <span key={i} className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700">
                    {h.icon} {h.text}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!info.name && (
            <EmptyState
              icon={<Building2 size={48} />}
              title="No hospital info"
              description="Click Edit to add your hospital information."
            />
          )}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab 2: Procedures                                                          */
/* -------------------------------------------------------------------------- */

function ProceduresTab() {
  const { data, isLoading } = useProcedures();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsProcedureDTO | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const procedures: MaterialsProcedureDTO[] = ((data as MaterialsProcedureDTO[] | undefined) ?? []);

  const columns: Column<MaterialsProcedureDTO>[] = [
    { key: 'procedureName', header: 'Procedure Name', render: (row) => <span className="font-medium">{row.procedureName}</span> },
    {
      key: 'price',
      header: 'Price Range',
      render: (row) =>
        row.priceMin != null || row.priceMax != null
          ? `$${row.priceMin ?? '?'} - $${row.priceMax ?? '?'}`
          : row.priceRange ?? '-',
    },
    {
      key: 'popular',
      header: 'Popular',
      render: (row) => (
        <span className={row.isPopular ? 'text-emerald-600' : 'text-slate-400'}>
          {row.isPopular ? 'Yes' : 'No'}
        </span>
      ),
    },
    { key: 'sortOrder', header: 'Sort Order', render: (row) => row.sortOrder ?? '-' },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (row) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setEditingItem(row); setShowModal(true); }}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteProcedure(row.id); }}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  const handleDeleteProcedure = async (id: string) => {
    if (!confirm('Delete this procedure?')) return;
    await deleteProcedure(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
          <Plus size={16} /> Add Procedure
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={procedures}
        keyExtractor={(row) => row.id}
        emptyState={
          <EmptyState
            icon={<Scissors size={48} />}
            title="No procedures yet"
            description="Add your first procedure to get started."
            action={
              <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
                <Plus size={16} /> Add Procedure
              </Button>
            }
          />
        }
      />
      {showModal && (
        <ProcedureModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function ProcedureModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsProcedureDTO | null;
}) {
  const [procedureName, setProcedureName] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [isPopular, setIsPopular] = useState(false);
  const [sortOrder, setSortOrder] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form state when existing changes
  useEffect(() => {
    setProcedureName(existing?.procedureName ?? '');
    setPriceMin(existing?.priceMin != null ? String(existing.priceMin) : '');
    setPriceMax(existing?.priceMax != null ? String(existing.priceMax) : '');
    setIsPopular(existing?.isPopular ?? false);
    setSortOrder(existing?.sortOrder != null ? String(existing.sortOrder) : '');
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procedureName.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        procedureName: procedureName.trim(),
        priceMin: priceMin ? Number(priceMin) : null,
        priceMax: priceMax ? Number(priceMax) : null,
        isPopular,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
      };
      if (existing) {
        await updateProcedure(existing.id, payload);
      } else {
        await createProcedure(payload);
      }
      onClose();
    } catch {
      // Error handled upstream
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Procedure' : 'Add Procedure'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Procedure Name" value={procedureName} onChange={setProcedureName} required />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Min Price ($)" value={priceMin} onChange={setPriceMin} type="number" />
          <FormField label="Max Price ($)" value={priceMax} onChange={setPriceMax} type="number" />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isPopular"
            checked={isPopular}
            onChange={(e) => setIsPopular(e.target.checked)}
            className="rounded border-slate-300"
          />
          <label htmlFor="isPopular" className="text-sm text-slate-700">Mark as Popular</label>
        </div>
        <FormField label="Sort Order" value={sortOrder} onChange={setSortOrder} type="number" />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting || !procedureName.trim()}>
            {submitting ? 'Saving...' : existing ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab 3: Surgeons                                                            */
/* -------------------------------------------------------------------------- */

function SurgeonsTab() {
  const { data, isLoading } = useSurgeons();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsSurgeonDTO | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const surgeons: MaterialsSurgeonDTO[] = ((data as MaterialsSurgeonDTO[] | undefined) ?? []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this surgeon?')) return;
    await deleteSurgeon(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
          <Plus size={16} /> Add Surgeon
        </Button>
      </div>

      {surgeons.length === 0 ? (
        <EmptyState
          icon={<UserRound size={48} />}
          title="No surgeons yet"
          description="Add your surgeons to showcase your team."
          action={
            <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
              <Plus size={16} /> Add Surgeon
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {surgeons.map((surgeon) => (
            <Card key={surgeon.id}>
              <div className="flex items-start gap-4">
                <Avatar src={surgeon.imageUrl ?? undefined} name={surgeon.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900">{surgeon.name}</h4>
                  {surgeon.title && (
                    <p className="text-sm text-slate-500">{surgeon.title}</p>
                  )}
                  {surgeon.experienceYears != null && (
                    <p className="mt-1 text-sm text-slate-600">{surgeon.experienceYears} years experience</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditingItem(surgeon); setShowModal(true); }}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(surgeon.id)}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {surgeon.specialties.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {surgeon.specialties.map((s, i) => (
                    <span key={i} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <SurgeonModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function SurgeonModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsSurgeonDTO | null;
}) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [languages, setLanguages] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form state when existing changes
  useEffect(() => {
    setName(existing?.name ?? '');
    setTitle(existing?.title ?? '');
    setImageUrl(existing?.imageUrl ?? '');
    setExperienceYears(existing?.experienceYears != null ? String(existing.experienceYears) : '');
    setSpecialties((existing?.specialties ?? []).join(', '));
    setLanguages((existing?.languages ?? []).join(', '));
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        title: title.trim() || null,
        imageUrl: imageUrl.trim() || null,
        experienceYears: experienceYears ? Number(experienceYears) : null,
        specialties: specialties
          ? specialties.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        languages: languages
          ? languages.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      if (existing) {
        await updateSurgeon(existing.id, payload);
      } else {
        await createSurgeon(payload);
      }
      onClose();
    } catch {
      // Error handled upstream
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Surgeon' : 'Add Surgeon'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Surgeon Name" value={name} onChange={setName} required />
        <FormField label="Title" value={title} onChange={setTitle} placeholder="e.g. Chief Plastic Surgeon" />
        <FormField label="Image URL" value={imageUrl} onChange={setImageUrl} />
        <FormField label="Experience (years)" value={experienceYears} onChange={setExperienceYears} type="number" />
        <FormField label="Specialties (comma-separated)" value={specialties} onChange={setSpecialties} />
        <FormField label="Languages (comma-separated)" value={languages} onChange={setLanguages} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Saving...' : existing ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab 4: Before & After Cases                                                */
/* -------------------------------------------------------------------------- */

function BeforeAfterTab() {
  const { data, isLoading } = useBeforeAfterCases();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsBeforeAfterCaseDTO | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const cases: MaterialsBeforeAfterCaseDTO[] = ((data as MaterialsBeforeAfterCaseDTO[] | undefined) ?? []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this before & after case?')) return;
    await deleteBeforeAfterCase(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
          <Plus size={16} /> Add Case
        </Button>
      </div>

      {cases.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={48} />}
          title="No before & after cases"
          description="Add cases to showcase your results."
          action={
            <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
              <Plus size={16} /> Add Case
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {cases.map((c) => {
            const beforeImg = c.images.find((img) => img.type === 'before');
            const afterImg = c.images.find((img) => img.type === 'after');

            return (
              <Card key={c.id}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-indigo-600">{c.procedureName || 'Procedure'}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingItem(c); setShowModal(true); }}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-400 uppercase">Before</span>
                    {beforeImg ? (
                      <img src={beforeImg.url} alt="Before" className="h-40 w-full rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <ImageIcon size={32} />
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-400 uppercase">After</span>
                    {afterImg ? (
                      <img src={afterImg.url} alt="After" className="h-40 w-full rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <ImageIcon size={32} />
                      </div>
                    )}
                  </div>
                </div>
                {c.surgeonName && (
                  <p className="mt-2 text-sm text-slate-500">Surgeon: {c.surgeonName}</p>
                )}
                {c.description && (
                  <p className="mt-1 text-sm text-slate-600">{c.description}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showModal && (
        <BeforeAfterModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function BeforeAfterModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsBeforeAfterCaseDTO | null;
}) {
  const [procedureName, setProcedureName] = useState('');
  const [surgeonName, setSurgeonName] = useState('');
  const [beforeImageUrl, setBeforeImageUrl] = useState('');
  const [afterImageUrl, setAfterImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form state when existing changes
  useEffect(() => {
    setProcedureName(existing?.procedureName ?? '');
    setSurgeonName(existing?.surgeonName ?? '');
    const beforeImg = existing?.images.find((img) => img.type === 'before');
    const afterImg = existing?.images.find((img) => img.type === 'after');
    setBeforeImageUrl(beforeImg?.url ?? '');
    setAfterImageUrl(afterImg?.url ?? '');
    setDescription(existing?.description ?? '');
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const images: Array<{ url: string; type: 'before' | 'after' | 'combined' }> = [];
      // Preserve combined images from existing case (UI only edits before/after)
      if (existing) {
        for (const img of existing.images) {
          if (img.type === 'combined') images.push(img);
        }
      }
      if (beforeImageUrl.trim()) images.push({ url: beforeImageUrl.trim(), type: 'before' });
      if (afterImageUrl.trim()) images.push({ url: afterImageUrl.trim(), type: 'after' });

      const payload: Record<string, unknown> = {
        procedureName: procedureName.trim() || undefined,
        surgeonName: surgeonName.trim() || null,
        description: description.trim() || null,
        images,
      };
      if (existing) {
        await updateBeforeAfterCase(existing.id, payload);
      } else {
        await createBeforeAfterCase(payload);
      }
      onClose();
    } catch {
      // Error handled upstream
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Case' : 'Add Before & After Case'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Procedure Name" value={procedureName} onChange={setProcedureName} />
        <FormField label="Surgeon Name" value={surgeonName} onChange={setSurgeonName} />
        <FormField label="Before Image URL" value={beforeImageUrl} onChange={setBeforeImageUrl} />
        <FormField label="After Image URL" value={afterImageUrl} onChange={setAfterImageUrl} />
        <FormField label="Description" value={description} onChange={setDescription} multiline />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : existing ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  const className =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100';
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          rows={3}
          className={`${className} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className={className}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <p className="mt-0.5 text-slate-900">{value}</p>
    </div>
  );
}
