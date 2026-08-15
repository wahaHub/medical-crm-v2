'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, Button } from '@medical-crm/ui';
import { createManualCase } from '@/actions/case-actions';

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

const SOURCE_CHANNEL_OPTIONS = [
  { value: 'MANUAL', label: 'Manual (in-person / other)' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'PHONE_CALL', label: 'Phone Call' },
  { value: 'REFERRAL', label: 'Referral' },
];

const PATIENT_SITE_OPTIONS = [
  { value: 'china', label: 'China (medical)' },
  { value: 'beauty', label: 'Beauty' },
];

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100';

export default function NewCasePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [patientName, setPatientName] = useState('');
  const [sourceChannel, setSourceChannel] = useState('MANUAL');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [patientSite, setPatientSite] = useState('china');
  const [patientCountry, setPatientCountry] = useState('');
  const [patientLanguage, setPatientLanguage] = useState('en');
  const [conditionSummary, setConditionSummary] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() && !phone.trim() && !whatsapp.trim()) {
      setError('Provide at least one contact method: email, phone, or WhatsApp.');
      return;
    }

    const payload: Record<string, unknown> = {
      patientName: patientName.trim(),
      sourceChannel,
      patientSite,
      patientLanguage: patientLanguage || 'en',
    };
    if (email.trim()) payload.email = email.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (whatsapp.trim()) payload.whatsapp = whatsapp.trim();
    if (patientCountry.trim()) payload.patientCountry = patientCountry.trim();
    if (conditionSummary.trim()) payload.conditionSummary = conditionSummary.trim();

    startTransition(async () => {
      try {
        const result = await createManualCase(payload);
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
          <p className="text-sm text-slate-500">
            Register a patient who reached out outside the website. If the email matches an existing
            patient, the case is attached to that profile; otherwise a new patient record is created.
          </p>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

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
              className={inputClassName}
            />
          </div>

          {/* Source Channel */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="sourceChannel">
              Source Channel <span className="text-red-500">*</span>
            </label>
            <select
              id="sourceChannel"
              value={sourceChannel}
              onChange={(e) => setSourceChannel(e.target.value)}
              className={inputClassName}
            >
              {SOURCE_CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500">How the patient first contacted you.</p>
          </div>

          {/* Contact methods — at least one required */}
          <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">
              Contact Methods <span className="text-red-500">*</span>
            </legend>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-500" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@example.com"
                className={inputClassName}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-500" htmlFor="phone">Phone</label>
              <input
                id="phone"
                type="tel"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+86 ..."
                className={inputClassName}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-500" htmlFor="whatsapp">WhatsApp</label>
              <input
                id="whatsapp"
                type="text"
                maxLength={50}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="WhatsApp number, e.g. +62 ..."
                className={inputClassName}
              />
            </div>
            <p className="text-xs text-slate-500">At least one of email, phone, or WhatsApp is required.</p>
          </fieldset>

          {/* Patient Site */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="patientSite">
              Patient Site
            </label>
            <select
              id="patientSite"
              value={patientSite}
              onChange={(e) => setPatientSite(e.target.value)}
              className={inputClassName}
            >
              {PATIENT_SITE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
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
              placeholder="e.g. United States, Indonesia, UAE"
              className={inputClassName}
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
              className={inputClassName}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Condition Summary */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="conditionSummary">
              Initial Condition Summary
            </label>
            <textarea
              id="conditionSummary"
              rows={4}
              maxLength={5000}
              value={conditionSummary}
              onChange={(e) => setConditionSummary(e.target.value)}
              placeholder="Brief description of the patient's condition or request..."
              className={`${inputClassName} resize-none`}
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
