'use client';

import { EmptyState, LoadingSpinner } from '@medical-crm/ui';
import { FileText, AlertCircle, CheckCircle, Stethoscope } from 'lucide-react';
import { useCaseQuestionnaire } from '@/queries/use-cases';

// ── Types ────────────────────────────────────────────────────────────

interface Step1 {
  symptomLocation?: string;
  symptomNature?: string[];
  onsetTime?: string;
  progressTrend?: string;
  diagnosisStage?: string;
  diseaseCategory?: string;
}

interface Step2 {
  detailedDescription?: string;
  aggravatingFactors?: string[];
  relievingFactors?: string[];
  previousTreatment?: string;
}

interface Step3 {
  medicalHistory?: string[];
  chronicConditions?: string;
  familyHistory?: string;
}

interface Step4 {
  currentMedications?: string;
  drugAllergies?: string;
  foodAllergies?: string;
}

interface Step5 {
  examTypes?: string[];
  examDetails?: string;
  labResults?: string;
  treatmentExpectations?: string[];
  budgetRange?: string;
  expectedTimeline?: string;
}

interface MedicalIntake {
  step1?: Step1;
  step2?: Step2;
  step3?: Step3;
  step4?: Step4;
  step5?: Step5;
}

interface QuestionnaireData {
  medicalIntake?: MedicalIntake;
  medicalCondition?: { primaryDiagnosis?: string; medicalHistory?: string };
  aiSummary?: string;
  riskLevel?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function StepBadge({ value }: { value: string }) {
  return (
    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 border border-indigo-200/50 rounded-md text-xs font-semibold">
      {value}
    </span>
  );
}

function StepHeader({ number, title }: { number: number; title: string }) {
  return (
    <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">
        {number}
      </span>
      {title}
    </h3>
  );
}

// ── Step Sections ────────────────────────────────────────────────────

function Step1Section({ data }: { data: Step1 }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
      <StepHeader number={1} title="Symptom Overview" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-1">Location</p>
          <p className="font-medium text-sm">{data.symptomLocation || '—'}</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-1">Nature</p>
          <div className="flex flex-wrap gap-1">
            {(data.symptomNature ?? []).length > 0
              ? data.symptomNature!.map((s) => <StepBadge key={s} value={s} />)
              : <span className="text-sm text-slate-400">—</span>}
          </div>
        </div>
        {data.onsetTime && (
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Onset Time</p>
            <p className="font-medium text-sm">{data.onsetTime}</p>
          </div>
        )}
        {data.progressTrend && (
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Progress Trend</p>
            <p className="font-medium text-sm">{data.progressTrend}</p>
          </div>
        )}
        {data.diagnosisStage && (
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Diagnosis Stage</p>
            <StepBadge value={data.diagnosisStage} />
          </div>
        )}
        {data.diseaseCategory && (
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Disease Category</p>
            <StepBadge value={data.diseaseCategory} />
          </div>
        )}
      </div>
    </div>
  );
}

function Step2Section({ data }: { data: Step2 }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
      <StepHeader number={2} title="Detailed Symptoms" />
      {data.detailedDescription && (
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Description</p>
          <p className="text-sm text-slate-700">{data.detailedDescription}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {(data.aggravatingFactors ?? []).length > 0 && (
          <div className="bg-rose-50 p-4 rounded-lg">
            <p className="text-xs text-rose-600 mb-2 flex items-center gap-1">
              <AlertCircle size={12} /> Aggravating Factors
            </p>
            <div className="flex flex-wrap gap-1">
              {data.aggravatingFactors!.map((f) => (
                <span key={f} className="px-2 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-xs font-medium">{f}</span>
              ))}
            </div>
          </div>
        )}
        {(data.relievingFactors ?? []).length > 0 && (
          <div className="bg-emerald-50 p-4 rounded-lg">
            <p className="text-xs text-emerald-600 mb-2 flex items-center gap-1">
              <CheckCircle size={12} /> Relieving Factors
            </p>
            <div className="flex flex-wrap gap-1">
              {data.relievingFactors!.map((f) => (
                <span key={f} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md text-xs font-medium">{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      {data.previousTreatment && (
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Previous Treatment</p>
          <p className="text-sm text-slate-700">{data.previousTreatment}</p>
        </div>
      )}
    </div>
  );
}

function Step3Section({ data }: { data: Step3 }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
      <StepHeader number={3} title="Medical History" />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
            <Stethoscope size={12} /> Past Medical History
          </p>
          <div className="flex flex-wrap gap-1 mb-2">
            {(data.medicalHistory ?? []).map((h) => <StepBadge key={h} value={h} />)}
          </div>
          {data.chronicConditions && (
            <p className="text-sm text-slate-700">{data.chronicConditions}</p>
          )}
        </div>
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Family History</p>
          <p className="text-sm text-slate-700">{data.familyHistory || '—'}</p>
        </div>
      </div>
    </div>
  );
}

function Step4Section({ data }: { data: Step4 }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
      <StepHeader number={4} title="Medications & Allergies" />
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Current Medications</p>
          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
            {data.currentMedications || '—'}
          </pre>
        </div>
        <div className="bg-rose-50 p-4 rounded-lg border border-rose-100">
          <p className="text-xs text-rose-600 mb-2 flex items-center gap-1">
            <AlertCircle size={12} /> Drug Allergies
          </p>
          <p className="text-sm text-rose-700 font-medium">{data.drugAllergies || '—'}</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Food Allergies</p>
          <p className="text-sm text-slate-700">{data.foodAllergies || '—'}</p>
        </div>
      </div>
    </div>
  );
}

function Step5Section({ data }: { data: Step5 }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
      <StepHeader number={5} title="Tests & Treatment Expectations" />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Exams Done</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {(data.examTypes ?? []).map((e) => <StepBadge key={e} value={e} />)}
          </div>
          {data.examDetails && <p className="text-sm text-slate-700">{data.examDetails}</p>}
        </div>
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Lab Results</p>
          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
            {data.labResults || '—'}
          </pre>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-indigo-50 p-4 rounded-lg">
          <p className="text-xs text-indigo-600 mb-2">Treatment Expectations</p>
          <div className="flex flex-wrap gap-1">
            {(data.treatmentExpectations ?? []).map((e) => (
              <span key={e} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-xs font-medium">{e}</span>
            ))}
          </div>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Budget Range</p>
          <p className="font-medium text-sm text-slate-700">{data.budgetRange || '—'}</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Expected Timeline</p>
          <p className="font-medium text-sm text-slate-700">{data.expectedTimeline || '—'}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────

interface CaseIntakeTabProps {
  caseId: string;
}

export function CaseIntakeTab({ caseId }: CaseIntakeTabProps) {
  const { data: rawData, isLoading } = useCaseQuestionnaire(caseId);
  const questionnaire = rawData as QuestionnaireData | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  const mi = questionnaire?.medicalIntake;
  const mc = questionnaire?.medicalCondition;
  const { aiSummary, riskLevel } = questionnaire ?? {};

  const hasAnyIntake = mi && (mi.step1 || mi.step2 || mi.step3 || mi.step4 || mi.step5);
  const hasSummary = aiSummary || riskLevel || mc?.primaryDiagnosis;

  if (!hasAnyIntake && !hasSummary) {
    return (
      <EmptyState
        icon={<FileText size={40} />}
        title="No medical intake data"
        description="The patient has not completed the medical intake questionnaire yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      {mi?.step1 && <Step1Section data={mi.step1} />}
      {mi?.step2 && <Step2Section data={mi.step2} />}
      {mi?.step3 && <Step3Section data={mi.step3} />}
      {mi?.step4 && <Step4Section data={mi.step4} />}
      {mi?.step5 && <Step5Section data={mi.step5} />}

      {hasSummary && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Summary & Assessment</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {mc?.primaryDiagnosis && (
              <div className="bg-slate-50 p-4 rounded-lg col-span-2">
                <p className="text-xs text-slate-500 mb-1">Primary Diagnosis</p>
                <p className="font-medium">{mc.primaryDiagnosis}</p>
              </div>
            )}
            {riskLevel && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Risk Level</p>
                <p className="font-medium">{riskLevel}</p>
              </div>
            )}
            {mc?.medicalHistory && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Medical History</p>
                <p className="font-medium">{mc.medicalHistory}</p>
              </div>
            )}
            {aiSummary && (
              <div className="bg-indigo-50 p-4 rounded-lg col-span-2">
                <p className="text-xs text-indigo-600 mb-1">AI Summary</p>
                <p className="text-sm text-slate-700">{aiSummary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
