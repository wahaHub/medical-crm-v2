'use client';

import { useRouter } from 'next/navigation';
import { Calendar, FolderOpen, MessageSquare, TrendingUp } from 'lucide-react';
import { StatCard, Card, CardHeader, CardTitle, StatusBadge } from '@medical-crm/ui';

interface DashboardData {
  caseStats: { total: number; new: number; inProgress: number; completed: number };
  consultationStats: { total: number; scheduled: number; completed: number };
  recentCases: Array<{ id: string; caseNumber: string; patientName: string; status: string; createdAt: string }>;
  scheduledConsultations: Array<{ id: string; patientName: string; scheduledAt: string; status: string }>;
  pendingMessages: Array<{ id: string; patientName: string; lastMessage: string; updatedAt: string }>;
}

export function DashboardWidgets({ data }: { data: DashboardData }) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<FolderOpen size={24} />} value={data.caseStats.total} label="Total Cases" />
        <StatCard icon={<FolderOpen size={24} />} value={data.caseStats.new} label="New Cases" colorClass="text-blue-600 bg-blue-50" />
        <StatCard icon={<Calendar size={24} />} value={data.consultationStats.scheduled} label="Scheduled" colorClass="text-amber-600 bg-amber-50" />
        <StatCard icon={<TrendingUp size={24} />} value={data.consultationStats.completed} label="Completed" colorClass="text-emerald-600 bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Consultations */}
        <Card>
          <CardHeader><CardTitle>Today&apos;s Consultations</CardTitle></CardHeader>
          {data.scheduledConsultations.length === 0 ? (
            <p className="text-sm text-slate-500">No consultations scheduled today</p>
          ) : (
            <div className="space-y-3">
              {data.scheduledConsultations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/consultations/${c.id}/room`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{c.patientName}</div>
                    <div className="text-xs text-slate-500">{new Date(c.scheduledAt).toLocaleTimeString()}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Cases */}
        <Card>
          <CardHeader><CardTitle>Recent Cases</CardTitle></CardHeader>
          {data.recentCases.length === 0 ? (
            <p className="text-sm text-slate-500">No recent cases</p>
          ) : (
            <div className="space-y-3">
              {data.recentCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/cases/${c.id}`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{c.caseNumber}</div>
                    <div className="text-xs text-slate-500">{c.patientName}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pending Messages */}
        <Card>
          <CardHeader><CardTitle>Pending Messages</CardTitle></CardHeader>
          {data.pendingMessages.length === 0 ? (
            <p className="text-sm text-slate-500">No pending messages</p>
          ) : (
            <div className="space-y-3">
              {data.pendingMessages.map((m) => (
                <div
                  key={m.id}
                  onClick={() => router.push(`/messages?conversation=${m.id}`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{m.patientName}</div>
                    <div className="line-clamp-1 text-xs text-slate-500">{m.lastMessage}</div>
                  </div>
                  <MessageSquare size={16} className="text-slate-400" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
