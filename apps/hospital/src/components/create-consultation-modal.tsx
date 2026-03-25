'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import { Modal, Button } from '@medical-crm/ui';
import { createConsultation } from '@/actions/consultation-actions';
import type { CaseSummary } from '@/lib/api-types';

interface CreateConsultationModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  submitLabel?: string;
  /** When set, case is pre-selected and the dropdown is locked */
  fixedCaseId?: string;
  /** Used to populate the case select; when fixedCaseId is set, pass the current case here */
  cases?: CaseSummary[];
}

export function CreateConsultationModal({
  open,
  onClose,
  title = 'Create Consultation',
  submitLabel = 'Create Consultation',
  fixedCaseId,
  cases = [],
}: CreateConsultationModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [caseId, setCaseId] = useState(fixedCaseId ?? '');
  const [doctorName, setDoctorName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [aiTranslation, setAiTranslation] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveCaseId = fixedCaseId ?? caseId;
  const availableCases = fixedCaseId
    ? cases.filter((c) => c.id === fixedCaseId)
    : cases;

  const resetForm = () => {
    setCaseId(fixedCaseId ?? '');
    setDoctorName('');
    setScheduledAt('');
    setDurationMinutes('30');
    setAiTranslation(true);
    setNotes('');
  };

  useEffect(() => {
    if (open) resetForm();
  }, [open, fixedCaseId]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCaseId || !scheduledAt) return;
    setIsSubmitting(true);
    try {
      const combinedNotes = doctorName
        ? `医生: ${doctorName}${notes ? '\n' + notes : ''}`
        : notes || undefined;
      await createConsultation({
        caseId: effectiveCaseId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        aiTranslation,
        notes: combinedNotes,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
        queryClient.invalidateQueries({ queryKey: ['cases'] }),
        queryClient.invalidateQueries({ queryKey: ['cases', effectiveCaseId] }),
        queryClient.invalidateQueries({ queryKey: ['cases', effectiveCaseId, 'consultations'] }),
      ]);
      router.refresh();
      handleClose();
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Select Case</label>
          <select
            value={effectiveCaseId}
            onChange={(e) => setCaseId(e.target.value)}
            required
            disabled={!!fixedCaseId}
            className={`${inputClass} bg-white disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
          >
            {!fixedCaseId && <option value="">Choose a case...</option>}
            {availableCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber ? `${c.caseNumber} - ` : ''}{c.patientName ?? 'Unknown'}{c.patientCode ? ` (${c.patientCode})` : ''}
              </option>
            ))}
            {fixedCaseId && availableCases.length === 0 && (
              <option value={fixedCaseId}>Current Case</option>
            )}
          </select>
        </div>

        {/* Doctor Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Doctor Name</label>
          <input
            type="text"
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            className={inputClass}
            placeholder="Enter doctor name (optional)"
          />
        </div>

        {/* Scheduled Date & Time */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Scheduled Date & Time</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            min={new Date().toISOString().slice(0, 16)}
            className={inputClass}
          />
        </div>

        {/* Duration */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Duration</label>
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </div>

        {/* AI Translation */}
        <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <input
            type="checkbox"
            id="aiTranslationModal"
            checked={aiTranslation}
            onChange={(e) => setAiTranslation(e.target.checked)}
            className="h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
          />
          <label htmlFor="aiTranslationModal" className="text-sm text-purple-700 flex-1">
            Enable AI Translation
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="Optional notes..."
          />
        </div>

        {/* CRM Notification info */}
        <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl">
          <CheckCircle size={16} className="text-teal-600 shrink-0" />
          <p className="text-xs text-teal-700">
            A CRM notification will be sent to the patient when the consultation is scheduled.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting || !effectiveCaseId || !scheduledAt}>
            {isSubmitting ? 'Creating...' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
