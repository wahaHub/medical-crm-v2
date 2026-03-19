'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  FileText,
  MessageSquare,
  Globe,
  Eye,
  Download,
  Plus,
  Stethoscope,
  Megaphone,
  Send,
  Sparkles,
  PhoneCall,
  CheckCircle,
  FileSignature,
  Video,
  Upload,
  X,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import { StatusBadge } from '@medical-crm/ui';
import { CaseAiSummaryTab } from './tabs/case-ai-summary-tab';
import { CaseQuoteTab } from './tabs/case-quote-tab';
import { useCaseConsultations, useCaseConversations, useConversationMessages } from '@/queries/use-cases';
import { useAuth } from '@/lib/auth-context';
import type {
  HospitalCaseDetail,
  ConsultationSummary,
  PaginatedResponse,
  ConversationSummary,
  MessageItem,
} from '@/lib/api-types';

// ── Shared Helpers ──────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-600',
  'bg-rose-100 text-rose-600',
  'bg-sky-100 text-sky-600',
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Tab Definitions ─────────────────────────────────────────────────

const tabs = [
  { id: 'ai-summary', label: 'AI Summary', icon: Sparkles },
  { id: 'intake', label: 'Intake', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'diagnosis', label: 'Diagnosis', icon: Stethoscope },
  { id: 'quote', label: 'Quote', icon: Receipt },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'invitation', label: 'Invitation Letter', icon: FileSignature },
  { id: 'consultation', label: 'Consultation', icon: Video },
];

// ── Main Component ──────────────────────────────────────────────────

export function CaseDetailPanel({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const [activeTab, setActiveTab] = useState('ai-summary');
  const router = useRouter();

  const { data: consultations } = useCaseConsultations(caseDetail.id);
  const consultationsList = (consultations as ConsultationSummary[] | undefined) ?? [];

  const patient = caseDetail.patient;

  return (
    <div className="flex flex-col -m-8 min-h-screen bg-[#F8F9FB]">
      {/* Patient Header */}
      <div className="bg-white border-b border-slate-200/60 px-10 py-6 shrink-0">
        <button
          onClick={() => router.push('/cases')}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-600 mb-5 transition-colors"
        >
          <ChevronLeft size={16} /> Back to Cases
        </button>

        <div className="flex items-center gap-6">
          <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold border-4 border-white shadow-sm ${avatarColor(patient.name)}`}>
            {getInitials(patient.name)}
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-semibold text-slate-900">{patient.name}</h2>
              {patient.code && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                  #{patient.code}
                </span>
              )}
              <StatusBadge status={caseDetail.displayStatus} />
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              {patient.age != null && <span>{patient.age} y/o</span>}
              {patient.gender && <span>• {patient.gender === 'MALE' ? 'M' : patient.gender === 'FEMALE' ? 'F' : patient.gender}</span>}
              {patient.country && (
                <>
                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                  <span className="flex items-center gap-1.5"><Globe size={14} /> {patient.country}</span>
                </>
              )}
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="flex items-center gap-1.5"><FileText size={14} /> {caseDetail.documents.length} Docs</span>
              {caseDetail.totalMessages > 0 && (
                <>
                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                  <span className="flex items-center gap-1.5"><MessageSquare size={14} /> {caseDetail.totalMessages} Messages</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-10 pt-4 bg-white border-b border-slate-200/60 shrink-0 shadow-sm">
        <div className="flex gap-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-10">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'ai-summary' && <CaseAiSummaryTab aiSummary={caseDetail.aiSummary} />}
          {activeTab === 'intake' && <IntakeTab caseDetail={caseDetail} />}
          {activeTab === 'documents' && <DocumentsTab caseDetail={caseDetail} />}
          {activeTab === 'messages' && <MessagesTab caseDetail={caseDetail} />}
          {activeTab === 'diagnosis' && <DiagnosisTab caseDetail={caseDetail} />}
          {activeTab === 'quote' && <CaseQuoteTab caseId={caseDetail.id} />}
          {activeTab === 'marketing' && <MarketingTab />}
          {activeTab === 'invitation' && <InvitationLetterTab />}
          {activeTab === 'consultation' && <ConsultationTab consultations={consultationsList} router={router} />}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Intake ─────────────────────────────────────────────────────

function StepBadge({ value }: { value: string }) {
  return (
    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 border border-indigo-200/50 rounded-md text-xs font-semibold">
      {value}
    </span>
  );
}

function IntakeTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const mi = caseDetail.medicalIntake;
  const mc = caseDetail.medicalCondition;
  const { aiSummary, riskLevel } = caseDetail;

  const hasAnyIntake = mi && (mi.step1 || mi.step2 || mi.step3 || mi.step4 || mi.step5);

  return (
    <div className="space-y-6">
      {/* Step 1: Symptom Location */}
      {mi?.step1 && (
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">1</span>
            Symptom Overview
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Location</p>
              <p className="font-medium text-sm">{mi.step1.symptomLocation || '-'}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Nature</p>
              <div className="flex flex-wrap gap-1">
                {(mi.step1.symptomNature ?? []).length > 0
                  ? mi.step1.symptomNature!.map((s) => <StepBadge key={s} value={s} />)
                  : <span className="text-sm text-slate-400">-</span>
                }
              </div>
            </div>
            {mi.step1.onsetTime && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Onset Time</p>
                <p className="font-medium text-sm">{mi.step1.onsetTime}</p>
              </div>
            )}
            {mi.step1.progressTrend && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Progress Trend</p>
                <p className="font-medium text-sm">{mi.step1.progressTrend}</p>
              </div>
            )}
            {mi.step1.diagnosisStage && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Diagnosis Stage</p>
                <StepBadge value={mi.step1.diagnosisStage} />
              </div>
            )}
            {mi.step1.diseaseCategory && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Disease Category</p>
                <StepBadge value={mi.step1.diseaseCategory} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Detailed Symptoms */}
      {mi?.step2 && (
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">2</span>
            Detailed Symptoms
          </h3>
          {mi.step2.detailedDescription && (
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Description</p>
              <p className="text-sm text-slate-700">{mi.step2.detailedDescription}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {(mi.step2.aggravatingFactors ?? []).length > 0 && (
              <div className="bg-rose-50 p-4 rounded-lg">
                <p className="text-xs text-rose-600 mb-2 flex items-center gap-1">
                  <AlertCircle size={12} /> Aggravating Factors
                </p>
                <div className="flex flex-wrap gap-1">
                  {mi.step2.aggravatingFactors!.map((f) => (
                    <span key={f} className="px-2 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-xs font-medium">{f}</span>
                  ))}
                </div>
              </div>
            )}
            {(mi.step2.relievingFactors ?? []).length > 0 && (
              <div className="bg-emerald-50 p-4 rounded-lg">
                <p className="text-xs text-emerald-600 mb-2 flex items-center gap-1">
                  <CheckCircle size={12} /> Relieving Factors
                </p>
                <div className="flex flex-wrap gap-1">
                  {mi.step2.relievingFactors!.map((f) => (
                    <span key={f} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md text-xs font-medium">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {mi.step2.previousTreatment && (
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Previous Treatment</p>
              <p className="text-sm text-slate-700">{mi.step2.previousTreatment}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Medical History */}
      {mi?.step3 && (
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">3</span>
            Medical History
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><Stethoscope size={12} /> Past Medical History</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {(mi.step3.medicalHistory ?? []).map((h) => <StepBadge key={h} value={h} />)}
              </div>
              {mi.step3.chronicConditions && <p className="text-sm text-slate-700">{mi.step3.chronicConditions}</p>}
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Family History</p>
              <p className="text-sm text-slate-700">{mi.step3.familyHistory || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Medications & Allergies */}
      {mi?.step4 && (
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">4</span>
            Medications & Allergies
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Current Medications</p>
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{mi.step4.currentMedications || '-'}</pre>
            </div>
            <div className="bg-rose-50 p-4 rounded-lg border border-rose-100">
              <p className="text-xs text-rose-600 mb-2 flex items-center gap-1"><AlertCircle size={12} /> Drug Allergies</p>
              <p className="text-sm text-rose-700 font-medium">{mi.step4.drugAllergies || '-'}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Food Allergies</p>
              <p className="text-sm text-slate-700">{mi.step4.foodAllergies || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Tests & Expectations */}
      {mi?.step5 && (
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">5</span>
            Tests & Treatment Expectations
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Exams Done</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {(mi.step5.examTypes ?? []).map((e) => <StepBadge key={e} value={e} />)}
              </div>
              {mi.step5.examDetails && <p className="text-sm text-slate-700">{mi.step5.examDetails}</p>}
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Lab Results</p>
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{mi.step5.labResults || '-'}</pre>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-indigo-50 p-4 rounded-lg">
              <p className="text-xs text-indigo-600 mb-2">Treatment Expectations</p>
              <div className="flex flex-wrap gap-1">
                {(mi.step5.treatmentExpectations ?? []).map((e) => (
                  <span key={e} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-xs font-medium">{e}</span>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Budget Range</p>
              <p className="font-medium text-sm text-slate-700">{mi.step5.budgetRange || '-'}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">Expected Timeline</p>
              <p className="font-medium text-sm text-slate-700">{mi.step5.expectedTimeline || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Summary & Risk Level */}
      {(aiSummary || riskLevel || mc.primaryDiagnosis) && (
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Summary & Assessment</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {mc.primaryDiagnosis && (
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
            {mc.medicalHistory && (
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

      {/* Fallback when no intake data */}
      {!hasAnyIntake && !aiSummary && !mc.primaryDiagnosis && (
        <div className="bg-white p-8 rounded-[1.5rem] border border-slate-100 shadow-sm text-center">
          <FileText size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">No medical intake data available yet.</p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Documents ──────────────────────────────────────────────────

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const docs = caseDetail.documents;
  const groups: Record<string, typeof docs> = {};
  for (const doc of docs) {
    const type = doc.documentType ?? doc.type ?? 'OTHER';
    if (!groups[type]) groups[type] = [];
    groups[type].push(doc);
  }
  const groupLabels: Record<string, string> = {
    MEDICAL_INTAKE: 'Medical Intake', DIAGNOSIS: 'Diagnosis', INVITATION_LETTER: 'Invitation Letter',
    INVITATION: 'Invitation Letter', MESSAGE_ATTACHMENT: 'Message Attachments', OTHER: 'Other Documents',
  };
  if (docs.length === 0) return (
    <div className="text-center py-12 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm">
      <FileText size={40} className="mx-auto mb-3 text-slate-300" />
      <p className="text-sm text-slate-400">No documents uploaded yet</p>
    </div>
  );
  return (
    <div className="space-y-8">
      {Object.entries(groups).map(([type, typeDocs]) => (
        <div key={type}>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            {groupLabels[type] ?? type}
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">{typeDocs.length}</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {typeDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText size={20} /></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">{doc.fileName ?? 'Unnamed'}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      {doc.createdAt && <span>{new Date(doc.createdAt).toLocaleDateString()}</span>}
                      {doc.fileSize != null && doc.fileSize > 0 && <><span>-</span><span>{formatFileSize(doc.fileSize)}</span></>}
                      {doc.language && <><span>-</span><span>{doc.language}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {doc.downloadUrl && (
                    <>
                      <a href={doc.downloadUrl} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"><Eye size={16} /></a>
                      <a href={doc.downloadUrl} download={doc.fileName} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"><Download size={16} /></a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Messages ───────────────────────────────────────────────────

function MessagesTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const { user } = useAuth();
  // Step 1: Find conversations for this case
  const { data: convsRaw, isLoading: convsLoading } = useCaseConversations(caseDetail.id);
  const convs = ((convsRaw as PaginatedResponse<ConversationSummary>)?.data ?? []) as ConversationSummary[];
  const selectedConversation = convs.find((conv) => conv.category === 'HOSPITAL_PATIENT') ?? convs[0];
  const conversationId = selectedConversation?.id;

  // Step 2: Fetch messages for the preferred case conversation
  const { data: msgsRaw, isLoading: msgsLoading } = useConversationMessages(conversationId);
  const messages = ((msgsRaw as PaginatedResponse<MessageItem>)?.data ?? []) as MessageItem[];

  const isLoading = convsLoading || msgsLoading;
  const patientName = caseDetail.patient.name;

  return (
    <div className="flex gap-6 h-[600px]">
      {/* Messages List */}
      <div className="flex-1 flex flex-col bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : messages.length > 0 ? (
            <>
              {(() => {
                const reversed = [...messages].reverse();
                return reversed.map((msg, idx) => {
                const senderRole = msg.senderRole
                  ?? (msg.senderId === user.id
                    ? 'HOSPITAL'
                    : selectedConversation?.category === 'ADMIN_HOSPITAL'
                      ? 'ADMIN'
                      : 'PATIENT');
                const isHospital = senderRole === 'HOSPITAL' || senderRole === 'hospital';
                const msgTime = new Date(msg.createdAt);
                const timeStr = msgTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const prevMsg = idx > 0 ? reversed[idx - 1] : null;
                const showDate = !prevMsg || new Date(prevMsg!.createdAt).toDateString() !== msgTime.toDateString();
                const translatedCopy = msg.translatedContent ?? msg.contentTranslated;

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="text-center mb-4">
                        <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                          {msgTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <div className={`flex gap-3 ${isHospital ? 'flex-row-reverse' : ''}`}>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-1 ${isHospital ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {isHospital ? 'H' : patientName.charAt(0)}
                      </div>
                      <div className="max-w-[70%] space-y-1">
                        <div className={`p-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
                          isHospital
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'
                        }`}>
                          <p>{msg.content}</p>
                          {!isHospital && translatedCopy && (
                            <div className="text-xs mt-2 pt-2 border-t border-purple-100 text-purple-600">
                              <Globe size={10} className="inline mr-1" />
                              <span>{translatedCopy}</span>
                            </div>
                          )}
                        </div>
                        <div className={`text-[10px] text-slate-400 ${isHospital ? 'text-right' : 'pl-2'}`}>
                          {timeStr}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
              })()}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <MessageSquare size={40} className="mb-3 text-slate-300" />
              <p className="text-sm">No messages yet. Start a conversation from the Messages page.</p>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle size={14} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">Privacy Notice: Patient contact information is hidden for privacy.</p>
          </div>
          <div className="flex gap-2">
            <textarea
              placeholder="Type a message..."
              className="flex-1 resize-none h-14 p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
            />
            <button className="h-14 w-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center justify-center">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Patient Context Panel */}
      <div className="w-64 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-5 space-y-4 shrink-0">
        <div className="text-center pb-4 border-b border-slate-100">
          <div className={`flex h-14 w-14 mx-auto mb-2 shrink-0 items-center justify-center rounded-full text-lg font-bold ring-4 ring-indigo-50 ${avatarColor(patientName)}`}>
            {getInitials(patientName)}
          </div>
          <h3 className="font-bold text-slate-800">{patientName}</h3>
          <p className="text-xs text-slate-500">Code: {caseDetail.patient.code}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">
              {caseDetail.patient.gender === 'MALE' ? 'M' : caseDetail.patient.gender === 'FEMALE' ? 'F' : caseDetail.patient.gender ?? '-'} / {caseDetail.patient.age ?? '-'}y
            </span>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Case Status</h4>
          <StatusBadge status={caseDetail.displayStatus} />
        </div>
        {caseDetail.medicalCondition.primaryDiagnosis && (
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Diagnosis</h4>
            <p className="text-sm text-slate-700">{caseDetail.medicalCondition.primaryDiagnosis}</p>
          </div>
        )}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Stats</h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Documents</span>
            <span className="font-semibold text-indigo-600">{caseDetail.documents.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-slate-500">Messages</span>
            <span className="font-semibold text-indigo-600">{caseDetail.totalMessages}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Diagnosis ──────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  severe: 'bg-rose-50 text-rose-700 border-rose-200/50',
  moderate: 'bg-amber-50 text-amber-700 border-amber-200/50',
  mild: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
};

function DiagnosisTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const diagnoses = caseDetail.diagnoses;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-full shadow-md shadow-cyan-200/50 transition-colors">
          <Plus size={16} /> Add Diagnosis
        </button>
      </div>
      {diagnoses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm">
          <Stethoscope size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">No diagnoses recorded yet</p>
        </div>
      ) : (
        diagnoses.map((d, i) => {
          const severityKey = (d.severity ?? '').toLowerCase();
          const severityStyle = SEVERITY_STYLES[severityKey] ?? 'bg-amber-50 text-amber-700 border-amber-200/50';
          const title = d.title || d.condition || 'Unknown Condition';
          return (
            <div key={d.id ?? i} className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                {d.severity && (
                  <span className={`px-2.5 py-1 border rounded-md text-xs font-semibold uppercase tracking-wide ${severityStyle}`}>
                    {d.severity}
                  </span>
                )}
                {d.icdCode && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-xs font-medium">
                    ICD: {d.icdCode}
                  </span>
                )}
                {d.recordedAt && (
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(d.recordedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-1">{title}</h3>

              {/* Detail grid for additional fields */}
              {(d.treatmentRecommendation || d.suggestedTests || d.costEstimate || d.treatmentDuration) && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {d.treatmentRecommendation && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">Treatment Recommendation</p>
                      <p className="text-sm text-slate-700">{d.treatmentRecommendation}</p>
                    </div>
                  )}
                  {d.suggestedTests && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">Suggested Tests</p>
                      <p className="text-sm text-slate-700">{d.suggestedTests}</p>
                    </div>
                  )}
                  {d.costEstimate && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">Estimated Cost</p>
                      <p className="text-sm font-medium text-slate-700">{d.costEstimate}</p>
                    </div>
                  )}
                  {d.treatmentDuration && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">Treatment Duration</p>
                      <p className="text-sm font-medium text-slate-700">{d.treatmentDuration}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Backward compat: show old condition/notes fields if present */}
              {d.notes && !d.treatmentRecommendation && <p className="text-sm text-slate-600 mt-2">{d.notes}</p>}
            </div>
          );
        })
      )}
      <AddDiagnosisModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}

function AddDiagnosisModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-10 rounded-t-[2rem]">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Stethoscope size={20} className="text-cyan-600" /> Add Diagnosis</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">Diagnosis Type</label>
            <div className="grid grid-cols-3 gap-3">
              <button className="py-3 px-4 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-700 text-sm font-semibold">Preliminary</button>
              <button className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Confirmed</button>
              <button className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Follow-up</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Diagnosis Name *</label><input type="text" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none" placeholder="e.g. Coronary Artery Disease" /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">ICD-10 Code</label><input type="text" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none" placeholder="e.g. I25.10" /></div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">Severity</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="severity" /> <span className="text-rose-600 font-medium">Severe</span></label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="severity" defaultChecked /> <span className="text-amber-600 font-medium">Moderate</span></label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="severity" /> <span className="text-emerald-600 font-medium">Mild</span></label>
            </div>
          </div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-2">Detailed Description</label><textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none h-24 resize-none" /></div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-2">Treatment Recommendation</label><textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none h-20 resize-none" /></div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Estimated Cost</label><select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option>&lt; $5k</option><option>$5k - $10k</option><option>$10k - $20k</option><option>$20k - $50k</option><option>&gt; $50k</option></select></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Treatment Duration</label><select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option>&lt; 1 Week</option><option>1 - 2 Weeks</option><option>2 Weeks - 1 Month</option><option>1 - 3 Months</option><option>&gt; 3 Months</option></select></div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Attachments (Max 10MB)</label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 cursor-pointer"><FileText size={32} className="mb-2 text-slate-300" /><span className="text-sm font-medium">Click to upload PDF, DOC, or JPG</span></div>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-[2rem]">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-full">Cancel</button>
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-full flex items-center gap-2 shadow-md shadow-cyan-200/50"><Stethoscope size={16} /> Save Diagnosis</button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Marketing ──────────────────────────────────────────────────

function MarketingTab() {
  const [activeSubTab, setActiveSubTab] = useState('Email');
  const [selectedModules, setSelectedModules] = useState(['Logo / Slogan', 'Success Cases', 'Patient Reviews']);
  const optionalModules = ['Hospital Introduction', 'Expert Team', 'Service Features', 'Pricing Plans', 'Travel Services', 'Contact Information'];
  const toggleModule = (mod: string) => {
    if (selectedModules.includes(mod)) setSelectedModules(selectedModules.filter((m) => m !== mod));
    else setSelectedModules([...selectedModules, mod]);
  };
  return (
    <div className="space-y-8">
      <div className="flex justify-center mb-2">
        <div className="bg-slate-200/50 p-1 rounded-xl flex gap-1 border border-slate-200/60">
          <button onClick={() => setActiveSubTab('Email')} className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeSubTab === 'Email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Send size={16} /> Email Outreach</button>
          <button onClick={() => setActiveSubTab('Call')} className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeSubTab === 'Call' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><PhoneCall size={16} /> Phone Outreach</button>
        </div>
      </div>
      {activeSubTab === 'Email' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">Email Content Modules</h3>
            <div className="space-y-6">
              <div>
                <div className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">Core & Recommended (Included)</div>
                <div className="flex flex-wrap gap-3">{['Logo / Slogan', 'Success Cases', 'Patient Reviews'].map((mod) => (<div key={mod} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200/50 rounded-xl text-sm font-medium"><CheckCircle size={16} /> {mod}</div>))}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">Optional Modules</div>
                <div className="flex flex-wrap gap-3">{optionalModules.map((mod) => { const isSelected = selectedModules.includes(mod); return (<button key={mod} onClick={() => toggleModule(mod)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${isSelected ? 'bg-indigo-50 text-indigo-700 border-indigo-200/50' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>{isSelected ? <CheckCircle size={16} /> : <Plus size={16} className="text-slate-400" />} {mod}</button>); })}</div>
              </div>
              <div className="pt-4"><button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-indigo-500 hover:from-pink-600 hover:to-indigo-600 text-white text-sm font-semibold rounded-full shadow-lg shadow-pink-200/50"><Sparkles size={16} /> One-Click Generate Email</button></div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">Compose Email</h3>
            <div className="space-y-5">
              <div className="bg-amber-50 border border-amber-100/50 p-3 rounded-xl text-amber-700 text-sm font-medium flex items-center gap-2"><AlertCircle size={16} /> Privacy Notice: Patient email address is hidden for privacy.</div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">Subject</label><input type="text" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-pink-500/20 text-sm outline-none" defaultValue="Your Personalized Treatment Plan" /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">Email Content</label><textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-pink-500/20 text-sm outline-none h-48 resize-none" placeholder="Generated content will appear here..." /></div>
              <div className="flex justify-end gap-3 pt-4">
                <button className="px-6 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full">Save Draft</button>
                <button className="px-6 py-2.5 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-full flex items-center gap-2 shadow-md shadow-pink-200/50"><Send size={16} /> Send Email</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'Call' && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full shadow-md shadow-blue-200/50"><PhoneCall size={16} /> Make Call</button>
            <div className="flex items-center gap-4 text-sm font-medium text-slate-500 bg-white px-6 py-3 rounded-full border border-slate-100 shadow-sm">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Recording</span><span className="w-1 h-1 bg-slate-300 rounded-full" /><span>Save Records</span><span className="w-1 h-1 bg-slate-300 rounded-full" /><span className="text-indigo-600">AI Summary Active</span>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">Log New Call</h3>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-sm font-semibold text-slate-700 mb-3">Call Type</label><div className="flex gap-3"><label className="flex items-center gap-2 text-sm"><input type="radio" name="callType" defaultChecked /> <span className="font-medium text-slate-700">Outbound</span></label><label className="flex items-center gap-2 text-sm"><input type="radio" name="callType" /> <span className="font-medium text-slate-700">Inbound</span></label><label className="flex items-center gap-2 text-sm"><input type="radio" name="callType" /> <span className="font-medium text-slate-700">Missed</span></label></div></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-3">Call Result</label><select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option>Interested</option><option>Scheduled</option><option>Callback</option><option>Not Interested</option><option>No Answer</option></select></div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">Summary</label><textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none h-24 resize-none" placeholder="Briefly summarize the conversation..." /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">Next Follow-up Date</label><input type="date" className="w-full max-w-xs px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white" /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-full">Cancel</button>
                <button className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full flex items-center gap-2 shadow-md shadow-blue-200/50"><CheckCircle size={16} /> Save Record</button>
              </div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">Call History</h3>
            <p className="text-sm text-slate-400 text-center py-4">No call records yet</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Invitation Letter ──────────────────────────────────────────

function InvitationLetterTab() {
  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2"><FileSignature size={20} className="text-indigo-600" /> Invitation Letter Upload</h3>
      <div className="space-y-6">
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800">Upload the official hospital invitation letter required for the patient&apos;s medical visa application.</div>
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-indigo-300 transition-colors cursor-pointer">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4"><Upload size={32} /></div>
          <span className="text-base font-semibold text-slate-700 mb-1">Click to upload or drag and drop</span>
          <span className="text-sm">PDF format only (Max 5MB)</span>
        </div>
        <div className="flex justify-end pt-4"><button className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50">Submit Letter</button></div>
      </div>
    </div>
  );
}

// ── Tab: Consultation ───────────────────────────────────────────────

function ConsultationTab({ consultations, router }: { consultations: ConsultationSummary[]; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2"><Video size={20} className="text-indigo-600" /> Book Video Consultation</h3>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Consultation Type</label><select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option>Initial Consultation</option><option>Follow-up</option><option>Expert Panel</option></select></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Consulting Doctor</label><select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option>Select a doctor...</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Date</label><input type="date" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white" /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Time</label><input type="time" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white" /></div>
          </div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-2">Meeting Link (Auto-generated)</label><input type="text" disabled className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm outline-none" placeholder="Will be generated after scheduling" /></div>
          <div className="flex justify-end pt-4 border-t border-slate-100"><button className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50">Schedule Consultation</button></div>
        </div>
      </div>
      {consultations.length > 0 && (
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Scheduled Consultations</h3>
          <div className="space-y-4">
            {consultations.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-slate-50 text-sm">
                    <span className="font-bold text-slate-900">{c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</span>
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">{c.scheduledAt ? new Date(c.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'N/A'}</div>
                    <div className="text-xs text-slate-500">{c.durationMinutes ?? 30} min</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={c.status ?? 'UNKNOWN'} />
                  {c.status === 'SCHEDULED' && (
                    <button onClick={() => router.push(`/consultations/${c.id}/room`)} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-sm">Enter</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
