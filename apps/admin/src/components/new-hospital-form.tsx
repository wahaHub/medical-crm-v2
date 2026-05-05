'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@medical-crm/ui';
import { createHospital, generateRegistrationToken } from '@/actions/hospital-actions';
import { useSpecialties } from '@/queries/use-specialties';

type HospitalType = 'COSMETIC' | 'REGULAR';
type HospitalSite = 'cosmetic' | 'china' | 'global';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100';

export function NewHospitalForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<HospitalType | ''>('');
  const [site, setSite] = useState<HospitalSite | ''>('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);

  const { data: specialtiesData, isLoading: specialtiesLoading } = useSpecialties(type);

  // Reset selected specialties when type changes
  useEffect(() => {
    setSelectedSpecialties([]);
    setSite(type === 'COSMETIC' ? 'cosmetic' : type === 'REGULAR' ? 'china' : '');
  }, [type]);

  function toggleSpecialty(specialty: string) {
    setSelectedSpecialties((prev) =>
      prev.includes(specialty) ? prev.filter((s) => s !== specialty) : [...prev, specialty],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);

    if (!name.trim()) {
      setError('Hospital name is required.');
      return;
    }
    if (!type) {
      setError('Hospital type is required.');
      return;
    }
    if (!site) {
      setError('Hospital site is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (selectedSpecialties.length === 0) {
      setError('Please select at least one specialty.');
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      site,
      contactEmail: email.trim(),
      specialties: selectedSpecialties,
    };
    if (address.trim()) payload.address = address.trim();
    if (city.trim()) payload.city = city.trim();
    if (phone.trim()) payload.contactPhone = phone.trim();
    if (description.trim()) payload.description = description.trim();

    startTransition(async () => {
      try {
        // Step 1: create hospital
        const hospital = await createHospital(payload);

        // Step 2: generate registration token (best effort)
        try {
          await generateRegistrationToken(hospital.id, email.trim());
        } catch {
          setWarning('Hospital created but registration token generation failed. You can regenerate it from the hospital detail page.');
        }

        router.push(`/hospitals/${hospital.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create hospital');
      }
    });
  }

  const specialties = specialtiesData?.specialties ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl bg-white p-8 shadow-sm border border-slate-200"
      >
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {warning && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            {warning}
          </div>
        )}

        {/* Name */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="name">
            Hospital Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Seoul Beauty Clinic"
            className={inputClass}
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="type">
            Hospital Type <span className="text-red-500">*</span>
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as HospitalType | '')}
            className={inputClass}
            required
          >
            <option value="" disabled>
              Select a type...
            </option>
            <option value="COSMETIC">Cosmetic (整容医院)</option>
            <option value="REGULAR">Regular (普通医院)</option>
          </select>
        </div>

        {/* Site */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="site">
            Site <span className="text-red-500">*</span>
          </label>
          <select
            id="site"
            value={site}
            onChange={(e) => setSite(e.target.value as HospitalSite | '')}
            className={inputClass}
            required
          >
            <option value="" disabled>
              Select a site...
            </option>
            {type === 'COSMETIC' && <option value="cosmetic">cosmetic</option>}
            {type === 'REGULAR' && <option value="china">china</option>}
            {type === 'REGULAR' && <option value="global">global</option>}
          </select>
          <p className="text-xs text-slate-500">
            Cosmetic hospitals use cosmetic. Regular hospitals use china unless they belong to the global site.
          </p>
        </div>

        {/* Specialties */}
        {type && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Specialties <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-slate-500">(select at least one)</span>
            </label>
            {specialtiesLoading ? (
              <div className="text-sm text-slate-400 py-2">Loading specialties...</div>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 p-3 bg-slate-50">
                {specialties.length > 0 ? (
                  specialties.map((specialty) => {
                    const selected = selectedSpecialties.includes(specialty);
                    return (
                      <button
                        key={specialty}
                        type="button"
                        onClick={() => toggleSpecialty(specialty)}
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                      >
                        {specialty}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">
                    No specialties returned. Please refresh and try again.
                  </p>
                )}
              </div>
            )}
            {selectedSpecialties.length > 0 && (
              <p className="text-xs text-slate-500">{selectedSpecialties.length} selected</p>
            )}
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Contact Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hospital@example.com"
            className={inputClass}
          />
          <p className="text-xs text-slate-500">
            A registration invitation will be sent to this email.
          </p>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+82 2-1234-5678"
            className={inputClass}
          />
        </div>

        {/* City */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="city">
            City
          </label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Seoul, Beijing, Dubai"
            className={inputClass}
          />
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="address">
            Address
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address"
            className={inputClass}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the hospital..."
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push('/hospitals')}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" variant="default" size="sm" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Hospital'}
          </Button>
        </div>
      </form>
    </div>
  );
}
