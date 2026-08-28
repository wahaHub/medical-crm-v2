'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { LoadingSpinner } from '@medical-crm/ui';
import { Search, X } from 'lucide-react';
import { useCases } from '@/queries/use-cases';
import { useHospitalNameMap } from '@/queries/use-hospital-names';
import { updateCaseStage } from '@/actions/case-actions';
import { formatDateTime } from '@/lib/date-format';
import type { CaseSummary } from '@/lib/api-types';

const STAGE_COLUMNS = [
  { key: 'INTAKE', label: 'Intake' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'IN_TREATMENT', label: 'In Treatment' },
  { key: 'POST_TREATMENT', label: 'Post Treatment' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'FOLLOW_UP', label: 'Follow Up' },
] as const;

type StageKey = (typeof STAGE_COLUMNS)[number]['key'];

const STAGE_LABELS = Object.fromEntries(STAGE_COLUMNS.map((s) => [s.key, s.label])) as Record<StageKey, string>;

// Mirrors packages/domain/src/state-machine/treatment-stage-transitions.ts
const STAGE_TRANSITIONS: Record<StageKey, StageKey[]> = {
  INTAKE: ['CONFIRMED'],
  CONFIRMED: ['IN_TREATMENT'],
  IN_TREATMENT: ['POST_TREATMENT'],
  POST_TREATMENT: ['COMPLETED'],
  COMPLETED: ['FOLLOW_UP'],
  FOLLOW_UP: ['IN_TREATMENT'],
};

// BFS through the state machine; returns the intermediate target stages
// (excluding `from`, including `to`), or null when no allowed path exists.
function findStagePath(from: StageKey, to: StageKey): StageKey[] | null {
  if (from === to) return [];
  const visited = new Set<StageKey>([from]);
  const queue: StageKey[][] = [[from]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    for (const next of STAGE_TRANSITIONS[last]) {
      if (visited.has(next)) continue;
      const extended = [...path, next];
      if (next === to) return extended.slice(1);
      visited.add(next);
      queue.push(extended);
    }
  }
  return null;
}

function daysInStage(caseItem: CaseSummary): number | null {
  const reference = caseItem.updatedAt ?? caseItem.createdAt;
  if (!reference) return null;
  const startedAt = new Date(reference).getTime();
  if (Number.isNaN(startedAt)) return null;
  return Math.max(0, Math.floor((Date.now() - startedAt) / (1000 * 60 * 60 * 24)));
}

function LifecycleColumn({
  stage,
  filters,
  isDropTarget,
  canDrop,
  movingId,
  onCardDragStart,
  onCardDragEnd,
  onDragOverStage,
  onDragLeaveStage,
  onDropOnStage,
}: {
  stage: { key: StageKey; label: string };
  filters: Record<string, string>;
  isDropTarget: boolean;
  canDrop: boolean;
  movingId: string | null;
  onCardDragStart: (caseId: string, fromStage: StageKey) => void;
  onCardDragEnd: () => void;
  onDragOverStage: (stage: StageKey, e: React.DragEvent) => void;
  onDragLeaveStage: (stage: StageKey) => void;
  onDropOnStage: (stage: StageKey, e: React.DragEvent) => void;
}) {
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<CaseSummary[]>([]);
  const { data, isLoading, error, isFetching } = useCases({
    ...filters,
    treatmentStage: stage.key,
    page: String(page),
  });

  // Filters changed (search / site): start over from page 1
  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [filters]);

  useEffect(() => {
    if (!data?.data) return;
    setAccumulated((prev) => {
      if (page === 1) return data.data;
      const seen = new Set(prev.map((c) => c.id));
      return [...prev, ...data.data.filter((c) => !seen.has(c.id))];
    });
  }, [data, page]);

  const cases = accumulated;
  const total = data?.total ?? cases.length;
  const hasMore = data?.hasMore ?? false;
  // The list DTO only carries assignedHospitalId; resolve display names per column
  const hospitalIds = cases.map((caseItem) => caseItem.assignedHospitalId);
  const { nameMap: hospitalNameMap } = useHospitalNameMap(hospitalIds);

  return (
    <div
      onDragOver={(e) => onDragOverStage(stage.key, e)}
      onDragLeave={(e) => {
        // Ignore leaves into child elements (cards) inside the same column
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        onDragLeaveStage(stage.key);
      }}
      onDrop={(e) => onDropOnStage(stage.key, e)}
      className={`flex min-w-[240px] flex-1 flex-col rounded-2xl border transition ${
        isDropTarget
          ? canDrop
            ? 'border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-200'
            : 'border-slate-200 bg-slate-100/60 opacity-60'
          : 'border-slate-200 bg-slate-50/60'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{stage.label}</h2>
        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600">
          {total}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner size="sm" />
          </div>
        ) : error ? (
          <p className="px-2 py-4 text-center text-xs text-rose-600">
            {error instanceof Error ? error.message : 'Failed to load cases'}
          </p>
        ) : cases.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-slate-400">No cases</p>
        ) : (
          cases.map((caseItem) => (
            <LifecycleCard
              key={caseItem.id}
              caseItem={caseItem}
              stageKey={stage.key}
              isMoving={movingId === caseItem.id}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              hospitalName={
                caseItem.hospitalName
                ?? (caseItem.assignedHospitalId ? hospitalNameMap[caseItem.assignedHospitalId] : undefined)
                ?? null
              }
            />
          ))
        )}
        {!isLoading && !error && hasMore && (
          <button
            type="button"
            disabled={isFetching}
            onClick={() => setPage((p) => p + 1)}
            className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
          >
            {isFetching ? 'Loading…' : `Load more (${cases.length} of ${total})`}
          </button>
        )}
      </div>
    </div>
  );
}

function LifecycleCard({
  caseItem,
  hospitalName,
  stageKey,
  isMoving,
  onDragStart,
  onDragEnd,
}: {
  caseItem: CaseSummary;
  hospitalName: string | null;
  stageKey: StageKey;
  isMoving: boolean;
  onDragStart: (caseId: string, fromStage: StageKey) => void;
  onDragEnd: () => void;
}) {
  const days = daysInStage(caseItem);

  return (
    <Link
      href={`/cases/${caseItem.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', caseItem.id);
        onDragStart(caseItem.id, stageKey);
      }}
      onDragEnd={onDragEnd}
      className={`block cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-200 hover:shadow active:cursor-grabbing ${
        isMoving ? 'pointer-events-none opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-800">{caseItem.patientName}</p>
        {days !== null && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
            {days}d
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{caseItem.caseNumber}</p>
      <div className="mt-2 space-y-1 text-xs text-slate-500">
        <p className="truncate">
          <span className="text-slate-400">Hospital: </span>
          {hospitalName ?? <span className="text-slate-300">—</span>}
        </p>
        <p>
          <span className="text-slate-400">Last activity: </span>
          {caseItem.updatedAt ? formatDateTime(caseItem.updatedAt) : '—'}
        </p>
      </div>
    </Link>
  );
}

export function LifecycleBoard() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [patientSite, setPatientSite] = useState('');
  const queryClient = useQueryClient();
  const dragCaseRef = useRef<{ caseId: string; fromStage: StageKey } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Bumped after every stage move so columns remount and drop stale accumulated pages
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(() => {
    const result: Record<string, string> = { limit: '100' };
    if (search) result.search = search;
    if (patientSite) result.patientSite = patientSite;
    return result;
  }, [search, patientSite]);

  const handleCardDragStart = (caseId: string, fromStage: StageKey) => {
    dragCaseRef.current = { caseId, fromStage };
    setMoveError(null);
  };

  const handleCardDragEnd = () => {
    dragCaseRef.current = null;
    setDragOverStage(null);
  };

  const dropPathFor = (stage: StageKey): StageKey[] | null => {
    const drag = dragCaseRef.current;
    if (!drag || drag.fromStage === stage) return null;
    return findStagePath(drag.fromStage, stage);
  };

  const handleDragOverStage = (stage: StageKey, e: React.DragEvent) => {
    if (!dragCaseRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dropPathFor(stage) ? 'move' : 'none';
    setDragOverStage(stage);
  };

  const handleDragLeaveStage = (stage: StageKey) => {
    setDragOverStage((current) => (current === stage ? null : current));
  };

  const handleDropOnStage = async (stage: StageKey, e: React.DragEvent) => {
    e.preventDefault();
    const drag = dragCaseRef.current;
    dragCaseRef.current = null;
    setDragOverStage(null);
    if (!drag || drag.fromStage === stage) return;

    const path = findStagePath(drag.fromStage, stage);
    if (!path) {
      setMoveError(
        `Cannot move a case from ${STAGE_LABELS[drag.fromStage]} back to ${STAGE_LABELS[stage]}. Stages only move forward.`,
      );
      return;
    }
    if (path.length > 1) {
      const chain = [STAGE_LABELS[drag.fromStage], ...path.map((s) => STAGE_LABELS[s])].join(' → ');
      if (!window.confirm(`This will advance the case through: ${chain}. Continue?`)) return;
    }

    setMovingId(drag.caseId);
    setMoveError(null);
    try {
      // The state machine only accepts single-step transitions, so walk the path.
      for (const step of path) {
        await updateCaseStage(drag.caseId, step);
      }
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Failed to update case stage');
    } finally {
      setMovingId(null);
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
      setRefreshKey((k) => k + 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search patient, case number, diagnosis"
            className="w-72 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <select
          value={patientSite}
          onChange={(e) => setPatientSite(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All sites</option>
          <option value="beauty">Beauty</option>
          <option value="china">China</option>
        </select>
      </div>

      {moveError && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p>{moveError}</p>
          <button
            type="button"
            onClick={() => setMoveError(null)}
            className="shrink-0 text-rose-400 hover:text-rose-600"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2">
        {STAGE_COLUMNS.map((stage) => (
          <LifecycleColumn
            key={`${stage.key}-${refreshKey}`}
            stage={stage}
            filters={filters}
            isDropTarget={dragOverStage === stage.key}
            canDrop={dragOverStage === stage.key ? dropPathFor(stage.key) !== null : false}
            movingId={movingId}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            onDragOverStage={handleDragOverStage}
            onDragLeaveStage={handleDragLeaveStage}
            onDropOnStage={handleDropOnStage}
          />
        ))}
      </div>
    </div>
  );
}
