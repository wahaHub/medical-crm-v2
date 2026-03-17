'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, Button } from '@medical-crm/ui';
import { createCase } from '@/actions/case-actions';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese (中文)' },
  { value: 'ar', label: 'Arabic (العربية)' },
  { value: 'ko', label: 'Korean (한국어)' },
  { value: 'ja', label: 'Japanese (日本語)' },
  { value: 'fr', label: 'French (Français)' },
  { value: 'de', label: 'German (Deutsch)' },
  { value: 'es', label: 'Spanish (Español)' },
  { value: 'pt', label: 'Portuguese (Português)' },
  { value: 'ru', label: 'Russian (Русский)' },
  { value: 'th', label: 'Thai (ไทย)' },
  { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
];

export default function NewCasePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientCountry, setPatientCountry] = useState('');
  const [patientLanguage, setPatientLanguage] = useState('en');
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState('');
  const [symptomsRaw, setSymptomsRaw] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const symptoms = symptomsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      patientId: patientId.trim(),
      patientName: patientName.trim(),
      patientLanguage: patientLanguage || 'en',
    };
    if (patientCountry.trim()) payload.patientCountry = patientCountry.trim();
    if (primaryDiagnosis.trim()) payload.primaryDiagnosis = primaryDiagnosis.trim();
    if (symptoms.length > 0) payload.symptoms = symptoms;
    if (medicalHistory.trim()) payload.medicalHistory = medicalHistory.trim();

    startTransition(async () => {
      try {
        const result = await createCase(payload);
        router.push(`/cases/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create case');
      }
    });
  }

  return (
    <>
      <PageHeader
        title="New Case"
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push('/cases')}>
            Cancel
          </Button>
        }
      />

      <div className="mx-auto max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Patient ID */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="patientId">
              Patient ID <span className="text-red-500">*</span>
            </label>
            <input
              id="patientId"
              type="text"
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="UUID of the patient record"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <p className="text-xs text-slate-500">Must be a valid UUID from the patient database.</p>
          </div>

          {/* Patient Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="patientName">
              Patient Name <span className="text-red-500">*</span>
            </label>
            <input
              id="patientName"
              type="text"
              required
              maxLength={100}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Full name of the patient"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Patient Country */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="patientCountry">
              Patient Country
            </label>
            <input
              id="patientCountry"
              type="text"
              maxLength={100}
              value={patientCountry}
              onChange={(e) => setPatientCountry(e.target.value)}
              placeholder="e.g. United States, China, UAE"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Patient Language */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="patientLanguage">
              Patient Language
            </label>
            <select
              id="patientLanguage"
              value={patientLanguage}
              onChange={(e) => setPatientLanguage(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Primary Diagnosis */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="primaryDiagnosis">
              Primary Diagnosis
            </label>
            <input
              id="primaryDiagnosis"
              type="text"
              value={primaryDiagnosis}
              onChange={(e) => setPrimaryDiagnosis(e.target.value)}
              placeholder="e.g. Rhinoplasty, Cardiac surgery"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Symptoms */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="symptoms">
              Symptoms
            </label>
            <input
              id="symptoms"
              type="text"
              value={symptomsRaw}
              onChange={(e) => setSymptomsRaw(e.target.value)}
              placeholder="Comma-separated: chest pain, shortness of breath"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <p className="text-xs text-slate-500">Separate multiple symptoms with commas.</p>
          </div>

          {/* Medical History */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="medicalHistory">
              Medical History
            </label>
            <textarea
              id="medicalHistory"
              rows={4}
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              placeholder="Relevant past medical history, allergies, current medications..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/cases')}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isPending}
            >
              {isPending ? 'Creating...' : 'Create Case'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
