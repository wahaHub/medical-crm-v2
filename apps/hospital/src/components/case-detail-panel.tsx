'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, PageHeader, StatusBadge, Card } from '@medical-crm/ui';
import { useCaseConsultations } from '@/queries/use-cases';
import type {
  HospitalCaseDetail,
  ConsultationSummary,
} from '@/lib/api-types';

const tabItems = [
  { key: 'intake', label: 'Intake' },
  { key: 'documents', label: 'Documents' },
  { key: 'messages', label: 'Messages' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'invitation', label: 'Invitation' },
  { key: 'consultation', label: 'Consultation' },
];

export function CaseDetailPanel({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const [activeTab, setActiveTab] = useState('intake');
  const router = useRouter();

  const { data: consultations } = useCaseConsultations(caseDetail.id);
  // Backend returns ConsultationDTO[] (plain array, not paginated)
  const consultationsList = (consultations as ConsultationSummary[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Case ${caseDetail.caseNumber}`}
          subtitle={caseDetail.patient.name}
        />
        <StatusBadge status={caseDetail.displayStatus} />
      </div>

      <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />

      <div className="mt-6">
        {activeTab === 'intake' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Patient Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Name:</span> <span className="ml-2">{caseDetail.patient.name}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className="ml-2">{caseDetail.displayStatus}</span></div>
              <div><span className="text-slate-500">Country:</span> <span className="ml-2">{caseDetail.patient.country ?? 'N/A'}</span></div>
              <div><span className="text-slate-500">Risk Level:</span> <span className="ml-2">{caseDetail.riskLevel ?? 'N/A'}</span></div>
              {caseDetail.patient.age != null && (
                <div><span className="text-slate-500">Age:</span> <span className="ml-2">{caseDetail.patient.age}</span></div>
              )}
              {caseDetail.patient.gender && (
                <div><span className="text-slate-500">Gender:</span> <span className="ml-2">{caseDetail.patient.gender}</span></div>
              )}
              <div className="col-span-2"><span className="text-slate-500">Primary Diagnosis:</span> <span className="ml-2">{caseDetail.medicalCondition.primaryDiagnosis ?? 'N/A'}</span></div>
              {caseDetail.medicalCondition.medicalHistory && (
                <div className="col-span-2"><span className="text-slate-500">Medical History:</span> <span className="ml-2">{caseDetail.medicalCondition.medicalHistory}</span></div>
              )}
              {caseDetail.aiSummary && (
                <div className="col-span-2"><span className="text-slate-500">AI Summary:</span> <span className="ml-2">{caseDetail.aiSummary}</span></div>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'documents' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Documents</h3>
            {caseDetail.documents.length > 0 ? (
              <div className="space-y-3">
                {caseDetail.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                    <div>
                      <div className="font-medium text-slate-900">{doc.fileName}</div>
                      <div className="text-xs text-slate-500">{doc.type} — {doc.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No documents uploaded yet</p>
            )}
          </Card>
        )}

        {activeTab === 'messages' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Messages</h3>
            <p className="text-sm text-slate-500">
              {caseDetail.totalMessages > 0
                ? `${caseDetail.totalMessages} message(s) — view in Messages tab`
                : 'No messages yet'}
            </p>
          </Card>
        )}

        {activeTab === 'diagnosis' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Diagnosis</h3>
            {caseDetail.diagnoses.length > 0 ? (
              <div className="space-y-3">
                {caseDetail.diagnoses.map((d, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 p-3">
                    <div className="font-medium text-slate-900">{d.condition}</div>
                    <div className="text-sm text-slate-500">{d.notes}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No diagnoses recorded</p>
            )}
          </Card>
        )}

        {activeTab === 'marketing' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Marketing</h3>
            <p className="text-sm text-slate-500">Marketing materials management coming soon</p>
          </Card>
        )}

        {activeTab === 'invitation' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Invitation Letter</h3>
            <p className="text-sm text-slate-500">Invitation letter management coming soon</p>
          </Card>
        )}

        {activeTab === 'consultation' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Consultations</h3>
            {consultationsList.length > 0 ? (
              <div className="space-y-3">
                {consultationsList.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/consultations/${c.id}/room`)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString() : 'N/A'}</div>
                      <div className="text-xs text-slate-500">{c.durationMinutes ?? 30} min</div>
                    </div>
                    <StatusBadge status={c.status ?? 'UNKNOWN'} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No consultations scheduled</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
