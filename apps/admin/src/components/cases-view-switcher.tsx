'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutList, Kanban } from 'lucide-react';
import { CasesList } from '@/components/cases-list';
import { LifecycleBoard } from '@/components/lifecycle-board';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';

interface CasesViewSwitcherProps {
  initialCases: PaginatedResponse<CaseSummary>;
  initialStats: CaseStats;
}

export function CasesViewSwitcher({ initialCases, initialStats }: CasesViewSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view') === 'board' ? 'board' : 'list';

  const setView = (next: 'list' | 'board') => {
    if (next === view) return;
    router.replace(next === 'board' ? '/cases?view=board' : '/cases');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        <button
          type="button"
          onClick={() => setView('list')}
          aria-pressed={view === 'list'}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            view === 'list'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <LayoutList size={15} />
          List
        </button>
        <button
          type="button"
          onClick={() => setView('board')}
          aria-pressed={view === 'board'}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            view === 'board'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Kanban size={15} />
          Board
        </button>
      </div>

      {view === 'list' ? (
        <CasesList initialCases={initialCases} initialStats={initialStats} />
      ) : (
        <LifecycleBoard />
      )}
    </div>
  );
}
