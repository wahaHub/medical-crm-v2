'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, PageHeader, StatusBadge, Card } from '@medical-crm/ui';
import { useCaseDocuments, useCaseProgress, useCaseConsultations } from '@/queries/use-cases';
// Server actions available for future use:
// import { updateCaseStatus, updateCaseStage } from '@/actions/case-actions';

const tabItems = [
  { key: 'intake', label: 'Intake' },
  { key: 'documents', label: 'Documents' },
  { key: 'messages', label: 'Messages' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'invitation', label: 'Invitation' },
  { key: 'consultation', label: 'Consultation' },
];

export function CaseDetailPanel({ caseDetail }: { caseDetail: any }) {
  const [activeTab, setActiveTab] = useState('intake');
  const router = useRouter();

  const { data: documents } = useCaseDocuments(caseDetail.id);
  const { data: progress } = useCaseProgress(caseDetail.id);
  const { data: consultations } = useCaseConsultations(caseDetail.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Case ${caseDetail.caseNumber ?? ''}`}
          subtitle={caseDetail.patientName ?? 'Unknown Patient'}
        />
        <StatusBadge status={caseDetail.status ?? 'UNKNOWN'} />
      </div>

      <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />

      <div className="mt-6">
        {activeTab === 'intake' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Patient Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Name:</span> <span className="ml-2">{caseDetail.patientName ?? 'N/A'}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className="ml-2">{caseDetail.status ?? 'N/A'}</span></div>
              <div><span className="text-slate-500">Stage:</span> <span className="ml-2">{caseDetail.stage ?? 'N/A'}</span></div>
              <div><span className="text-slate-500">Risk Level:</span> <span className="ml-2">{caseDetail.riskLevel ?? 'N/A'}</span></div>
              <div className="col-span-2"><span className="text-slate-500">Medical Condition:</span> <span className="ml-2">{caseDetail.medicalCondition ?? 'N/A'}</span></div>
              <div className="col-span-2"><span className="text-slate-500">Notes:</span> <span className="ml-2">{caseDetail.notes ?? 'N/A'}</span></div>
            </div>
          </Card>
        )}

        {activeTab === 'documents' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Documents</h3>
            {(documents as any)?.data?.length > 0 ? (
              <div className="space-y-3">
                {((documents as any)?.data ?? []).map((doc: any) => (
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
            <p className="text-sm text-slate-500">Message history will be displayed here</p>
          </Card>
        )}

        {activeTab === 'diagnosis' && (
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Diagnosis</h3>
            {(progress as any)?.diagnoses?.length > 0 ? (
              <div className="space-y-3">
                {((progress as any)?.diagnoses ?? []).map((d: any, i: number) => (
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
            {(consultations as any)?.data?.length > 0 ? (
              <div className="space-y-3">
                {((consultations as any)?.data ?? []).map((c: any) => (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/consultations/${c.id}/room`)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{new Date(c.scheduledAt).toLocaleDateString()}</div>
                      <div className="text-xs text-slate-500">{c.durationMinutes ?? 30} min</div>
                    </div>
                    <StatusBadge status={c.status} />
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
