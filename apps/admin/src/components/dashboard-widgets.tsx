'use client';

import { useRouter } from 'next/navigation';
import {
  StatCard,
  DataTable,
  StatusBadge,
  LoadingSpinner,
  EmptyState,
  Button,
  type Column,
} from '@medical-crm/ui';
import { useDashboard } from '@/queries/use-dashboard';

type RecentCase = {
  id: string;
  caseNumber: string;
  assignmentStatus: string;
  createdAt: string;
};

const recentCasesColumns: Column<RecentCase>[] = [
  {
    key: 'caseNumber',
    header: 'Case #',
    render: (row) => <span className="font-medium text-slate-900">{row.caseNumber}</span>,
  },
  {
    key: 'assignmentStatus',
    header: 'Assignment Status',
    render: (row) => <StatusBadge status={row.assignmentStatus} />,
  },
  {
    key: 'createdAt',
    header: 'Created At',
    render: (row) =>
      new Date(row.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
  },
];

export function DashboardWidgets() {
  const router = useRouter();
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        }
        title="Failed to load dashboard"
        description="Could not fetch dashboard data. Please try refreshing the page."
      />
    );
  }

  const { stats, recentCases } = data;

  return (
    <div className="mt-6 space-y-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          }
          value={stats.totalCases}
          label="Total Cases"
          colorClass="text-indigo-600 bg-indigo-50"
        />
        <StatCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          }
          value={stats.unassignedCases}
          label="Unassigned"
          colorClass="text-amber-600 bg-amber-50"
        />
        <StatCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
          value={stats.assignedCases}
          label="Assigned"
          colorClass="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          }
          value={stats.openTickets}
          label="Open Tickets"
          colorClass="text-rose-600 bg-rose-50"
        />
        <StatCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
          value={stats.pendingOrders}
          label="Pending Orders"
          colorClass="text-purple-600 bg-purple-50"
        />
      </div>

      {/* Recent Cases */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent Cases</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/cases')}
            >
              View All Cases
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/hospitals')}
            >
              View Hospitals
            </Button>
          </div>
        </div>
        <DataTable<RecentCase>
          columns={recentCasesColumns}
          data={recentCases}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/cases/${row.id}`)}
          emptyState={
            <EmptyState
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
                </svg>
              }
              title="No recent cases"
              description="No cases have been created yet."
            />
          }
        />
      </div>
    </div>
  );
}
