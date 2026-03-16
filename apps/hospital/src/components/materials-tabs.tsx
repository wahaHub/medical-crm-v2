'use client';

import { useState } from 'react';
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
  const { data, isLoading } = useMaterialsInfo() as { data: Record<string, unknown> | undefined; isLoading: boolean };
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

  const raw = (data?.data ?? data ?? {}) as Record<string, unknown>;
  const info = {
    name: (raw.name as string) ?? '',
    slug: (raw.slug as string) ?? '',
    heroImageUrl: (raw.heroImageUrl as string) ?? '',
    description: (raw.description as string) ?? '',
    highlights: (raw.highlights as string[]) ?? [],
  };

  const startEdit = () => {
    setForm({
      name: info.name,
      slug: info.slug,
      heroImageUrl: info.heroImageUrl,
      description: info.description,
      highlights: info.highlights.join(', '),
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateHospitalInfo({
        ...form,
        highlights: form.highlights
          ? form.highlights.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
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
          <FormField label="Hospital Name" value={form.name ?? ''} onChange={(v) => setForm({ ...form, name: v })} />
          <FormField label="Slug" value={form.slug ?? ''} onChange={(v) => setForm({ ...form, slug: v })} />
          <FormField label="Hero Image URL" value={form.heroImageUrl ?? ''} onChange={(v) => setForm({ ...form, heroImageUrl: v })} />
          <FormField label="Description" value={form.description ?? ''} onChange={(v) => setForm({ ...form, description: v })} multiline />
          <FormField label="Highlights (comma-separated)" value={form.highlights ?? ''} onChange={(v) => setForm({ ...form, highlights: v })} />
        </div>
      ) : (
        <div className="space-y-4">
          <InfoRow label="Name" value={info.name} />
          <InfoRow label="Slug" value={info.slug} />
          {info.heroImageUrl && (
            <div>
              <span className="text-sm font-medium text-slate-500">Hero Image</span>
              <img
                src={info.heroImageUrl}
                alt="Hero"
                className="mt-1 h-40 w-full rounded-lg object-cover"
              />
            </div>
          )}
          <InfoRow label="Description" value={info.description} />
          {info.highlights.length > 0 && (
            <div>
              <span className="text-sm font-medium text-slate-500">Highlights</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {info.highlights.map((h: string, i: number) => (
                  <span key={i} className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700">
                    {h}
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

interface ProcedureRow {
  id: string;
  name: string;
  priceRangeMin?: number;
  priceRangeMax?: number;
  isPopular?: boolean;
  sortOrder?: number;
}

function ProceduresTab() {
  const { data, isLoading } = useProcedures() as { data: Record<string, unknown> | undefined; isLoading: boolean };
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProcedureRow | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const procedures: ProcedureRow[] = (data?.data ?? data ?? []) as ProcedureRow[];

  const columns: Column<ProcedureRow>[] = [
    { key: 'name', header: 'Procedure Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'price',
      header: 'Price Range',
      render: (row) =>
        row.priceRangeMin != null || row.priceRangeMax != null
          ? `$${row.priceRangeMin ?? '?'} - $${row.priceRangeMax ?? '?'}`
          : '-',
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
      <ProcedureModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); }}
        existing={editingItem}
      />
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
  existing: ProcedureRow | null;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [priceMin, setPriceMin] = useState(String(existing?.priceRangeMin ?? ''));
  const [priceMax, setPriceMax] = useState(String(existing?.priceRangeMax ?? ''));
  const [isPopular, setIsPopular] = useState(existing?.isPopular ?? false);
  const [sortOrder, setSortOrder] = useState(String(existing?.sortOrder ?? ''));
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens with new data
  const resetKey = existing?.id ?? 'new';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        priceRangeMin: priceMin ? Number(priceMin) : undefined,
        priceRangeMax: priceMax ? Number(priceMax) : undefined,
        isPopular,
        sortOrder: sortOrder ? Number(sortOrder) : undefined,
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
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Procedure' : 'Add Procedure'} key={resetKey}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Procedure Name" value={name} onChange={setName} required />
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
          <Button type="submit" disabled={submitting || !name.trim()}>
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

interface SurgeonRow {
  id: string;
  name: string;
  title?: string;
  imageUrl?: string;
  experience?: string;
  specialties?: string[];
}

function SurgeonsTab() {
  const { data, isLoading } = useSurgeons() as { data: Record<string, unknown> | undefined; isLoading: boolean };
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<SurgeonRow | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const surgeons: SurgeonRow[] = (data?.data ?? data ?? []) as SurgeonRow[];

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
                <Avatar src={surgeon.imageUrl} name={surgeon.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900">{surgeon.name}</h4>
                  {surgeon.title && (
                    <p className="text-sm text-slate-500">{surgeon.title}</p>
                  )}
                  {surgeon.experience && (
                    <p className="mt-1 text-sm text-slate-600">{surgeon.experience}</p>
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
              {(surgeon.specialties ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(surgeon.specialties as string[]).map((s, i) => (
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

      <SurgeonModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); }}
        existing={editingItem}
      />
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
  existing: SurgeonRow | null;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? '');
  const [experience, setExperience] = useState(existing?.experience ?? '');
  const [specialties, setSpecialties] = useState((existing?.specialties ?? []).join(', '));
  const [submitting, setSubmitting] = useState(false);

  const resetKey = existing?.id ?? 'new';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        title: title.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        experience: experience.trim() || undefined,
        specialties: specialties
          ? specialties.split(',').map((s) => s.trim()).filter(Boolean)
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
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Surgeon' : 'Add Surgeon'} key={resetKey}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Surgeon Name" value={name} onChange={setName} required />
        <FormField label="Title" value={title} onChange={setTitle} placeholder="e.g. Chief Plastic Surgeon" />
        <FormField label="Image URL" value={imageUrl} onChange={setImageUrl} />
        <FormField label="Experience" value={experience} onChange={setExperience} placeholder="e.g. 15 years" />
        <FormField label="Specialties (comma-separated)" value={specialties} onChange={setSpecialties} />
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

interface BACase {
  id: string;
  procedureName?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  description?: string;
  patientAge?: number;
  patientGender?: string;
}

function BeforeAfterTab() {
  const { data, isLoading } = useBeforeAfterCases() as { data: Record<string, unknown> | undefined; isLoading: boolean };
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BACase | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const cases: BACase[] = (data?.data ?? data ?? []) as BACase[];

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
          {cases.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-indigo-600">{c.procedureName ?? 'Procedure'}</span>
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
                  {c.beforeImageUrl ? (
                    <img
                      src={c.beforeImageUrl}
                      alt="Before"
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <ImageIcon size={32} />
                    </div>
                  )}
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-400 uppercase">After</span>
                  {c.afterImageUrl ? (
                    <img
                      src={c.afterImageUrl}
                      alt="After"
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <ImageIcon size={32} />
                    </div>
                  )}
                </div>
              </div>
              {c.description && (
                <p className="mt-3 text-sm text-slate-600">{c.description}</p>
              )}
              {(c.patientAge || c.patientGender) && (
                <div className="mt-2 flex gap-3 text-xs text-slate-400">
                  {c.patientAge && <span>Age: {c.patientAge}</span>}
                  {c.patientGender && <span>Gender: {c.patientGender}</span>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <BeforeAfterModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); }}
        existing={editingItem}
      />
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
  existing: BACase | null;
}) {
  const [procedureName, setProcedureName] = useState(existing?.procedureName ?? '');
  const [beforeImageUrl, setBeforeImageUrl] = useState(existing?.beforeImageUrl ?? '');
  const [afterImageUrl, setAfterImageUrl] = useState(existing?.afterImageUrl ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [patientAge, setPatientAge] = useState(String(existing?.patientAge ?? ''));
  const [patientGender, setPatientGender] = useState(existing?.patientGender ?? '');
  const [submitting, setSubmitting] = useState(false);

  const resetKey = existing?.id ?? 'new';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        procedureName: procedureName.trim() || undefined,
        beforeImageUrl: beforeImageUrl.trim() || undefined,
        afterImageUrl: afterImageUrl.trim() || undefined,
        description: description.trim() || undefined,
        patientAge: patientAge ? Number(patientAge) : undefined,
        patientGender: patientGender.trim() || undefined,
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
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Case' : 'Add Before & After Case'} key={resetKey}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Procedure Name" value={procedureName} onChange={setProcedureName} />
        <FormField label="Before Image URL" value={beforeImageUrl} onChange={setBeforeImageUrl} />
        <FormField label="After Image URL" value={afterImageUrl} onChange={setAfterImageUrl} />
        <FormField label="Description" value={description} onChange={setDescription} multiline />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Patient Age" value={patientAge} onChange={setPatientAge} type="number" />
          <FormField label="Patient Gender" value={patientGender} onChange={setPatientGender} placeholder="e.g. Female" />
        </div>
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
