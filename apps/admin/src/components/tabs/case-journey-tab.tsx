'use client';

import { Card, CardHeader, CardTitle, EmptyState, StatusBadge } from '@medical-crm/ui';
import { Plane, Shield, Building, Car, CheckCircle, Clock, Circle } from 'lucide-react';
import { useCaseJourney, useCaseMilestones } from '@/queries/use-journey';

// ── Types ─────────────────────────────────────────────────────────────

interface JourneyData {
  visa?: {
    status?: string;
    type?: string;
    expiryDate?: string;
    notes?: string;
  };
  insurance?: {
    provider?: string;
    policyNumber?: string;
    coverageType?: string;
    expiryDate?: string;
    notes?: string;
  };
  accommodation?: {
    name?: string;
    address?: string;
    checkIn?: string;
    checkOut?: string;
    notes?: string;
  };
  transport?: {
    type?: string;
    details?: string;
    notes?: string;
  };
}

interface Milestone {
  id: string;
  title: string;
  description?: string;
  status?: string;
  completedAt?: string;
  dueAt?: string;
}

interface CaseJourneyTabProps {
  caseId: string;
}

// ── Helper ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
  iconColor,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  iconColor: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${iconColor}`}>
            <Icon size={16} />
          </div>
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{children}</dl>
    </Card>
  );
}

// ── Milestone Item ────────────────────────────────────────────────────

function MilestoneItem({ milestone }: { milestone: Milestone }) {
  const isCompleted = milestone.status === 'COMPLETED' || !!milestone.completedAt;
  const isInProgress = milestone.status === 'IN_PROGRESS';

  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 shrink-0">
        {isCompleted ? (
          <CheckCircle size={20} className="text-emerald-500" />
        ) : isInProgress ? (
          <Clock size={20} className="text-amber-500" />
        ) : (
          <Circle size={20} className="text-slate-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800">{milestone.title}</p>
          {milestone.status && <StatusBadge status={milestone.status} />}
        </div>
        {milestone.description && (
          <p className="text-xs text-slate-500 mt-0.5">{milestone.description}</p>
        )}
        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
          {milestone.completedAt && (
            <span>Completed: {new Date(milestone.completedAt).toLocaleDateString()}</span>
          )}
          {milestone.dueAt && !milestone.completedAt && (
            <span>Due: {new Date(milestone.dueAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────

export function CaseJourneyTab({ caseId }: CaseJourneyTabProps) {
  const { data: rawJourney, isLoading: journeyLoading } = useCaseJourney(caseId);
  const { data: rawMilestones, isLoading: milestonesLoading } = useCaseMilestones(caseId);

  const journey = rawJourney as JourneyData | undefined;
  const milestones = (rawMilestones as Milestone[] | undefined) ?? [];

  const isLoading = journeyLoading || milestonesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visa */}
      <SectionCard icon={Plane} title="Visa" iconColor="bg-blue-50 text-blue-600">
        <InfoRow label="Status" value={journey?.visa?.status} />
        <InfoRow label="Type" value={journey?.visa?.type} />
        <InfoRow
          label="Expiry Date"
          value={journey?.visa?.expiryDate ? new Date(journey.visa.expiryDate).toLocaleDateString() : undefined}
        />
        <InfoRow label="Notes" value={journey?.visa?.notes} />
      </SectionCard>

      {/* Insurance */}
      <SectionCard icon={Shield} title="Insurance" iconColor="bg-green-50 text-green-600">
        <InfoRow label="Provider" value={journey?.insurance?.provider} />
        <InfoRow label="Policy Number" value={journey?.insurance?.policyNumber} />
        <InfoRow label="Coverage Type" value={journey?.insurance?.coverageType} />
        <InfoRow
          label="Expiry Date"
          value={
            journey?.insurance?.expiryDate
              ? new Date(journey.insurance.expiryDate).toLocaleDateString()
              : undefined
          }
        />
        <InfoRow label="Notes" value={journey?.insurance?.notes} />
      </SectionCard>

      {/* Accommodation */}
      <SectionCard icon={Building} title="Accommodation" iconColor="bg-purple-50 text-purple-600">
        <InfoRow label="Name" value={journey?.accommodation?.name} />
        <InfoRow label="Address" value={journey?.accommodation?.address} />
        <InfoRow
          label="Check In"
          value={
            journey?.accommodation?.checkIn
              ? new Date(journey.accommodation.checkIn).toLocaleDateString()
              : undefined
          }
        />
        <InfoRow
          label="Check Out"
          value={
            journey?.accommodation?.checkOut
              ? new Date(journey.accommodation.checkOut).toLocaleDateString()
              : undefined
          }
        />
        <InfoRow label="Notes" value={journey?.accommodation?.notes} />
      </SectionCard>

      {/* Transport */}
      <SectionCard icon={Car} title="Transport" iconColor="bg-orange-50 text-orange-600">
        <InfoRow label="Type" value={journey?.transport?.type} />
        <InfoRow label="Details" value={journey?.transport?.details} />
        <InfoRow label="Notes" value={journey?.transport?.notes} />
      </SectionCard>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle>Milestones</CardTitle>
        </CardHeader>
        {milestones.length === 0 ? (
          <EmptyState
            icon={<CheckCircle size={36} />}
            title="No milestones yet"
            description="Journey milestones will appear here as they are created."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {milestones.map((m) => (
              <MilestoneItem key={m.id} milestone={m} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
