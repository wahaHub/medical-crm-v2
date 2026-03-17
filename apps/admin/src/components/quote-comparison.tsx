'use client';

import { EmptyState } from '@medical-crm/ui';
import { FileText } from 'lucide-react';

interface QuoteLineItem {
  name: string;
  amount: number;
  currency?: string;
  description?: string;
}

interface HospitalQuote {
  hospitalId: string;
  hospitalName: string;
  items: QuoteLineItem[];
  total: number;
  currency?: string;
  submittedAt?: string;
  notes?: string;
}

interface QuoteComparisonProps {
  quotes: HospitalQuote[];
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function QuoteComparison({ quotes }: QuoteComparisonProps) {
  if (!quotes || quotes.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={36} />}
        title="No quotes yet"
        description="Quotes will appear here once hospitals submit their estimates."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 min-w-[180px]">
              Item
            </th>
            {quotes.map((q) => (
              <th
                key={q.hospitalId}
                className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-r border-slate-200 min-w-[160px] bg-slate-50"
              >
                <div className="truncate max-w-[150px] mx-auto">{q.hospitalName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Collect all unique item names across all quotes */}
          {Array.from(
            new Set(quotes.flatMap((q) => q.items.map((i) => i.name))),
          ).map((itemName, idx) => (
            <tr key={itemName} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
              <td className="sticky left-0 px-4 py-3 text-slate-700 font-medium border-b border-r border-slate-100 bg-inherit">
                {itemName}
              </td>
              {quotes.map((q) => {
                const item = q.items.find((i) => i.name === itemName);
                return (
                  <td
                    key={q.hospitalId}
                    className="px-4 py-3 text-center text-slate-600 border-b border-r border-slate-100"
                  >
                    {item ? formatCurrency(item.amount, item.currency ?? q.currency) : <span className="text-slate-300">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Total row */}
          <tr className="bg-indigo-50/60 font-semibold">
            <td className="sticky left-0 px-4 py-3 text-indigo-800 border-t-2 border-r border-indigo-200 bg-indigo-50/60">
              Total
            </td>
            {quotes.map((q) => (
              <td
                key={q.hospitalId}
                className="px-4 py-3 text-center text-indigo-800 border-t-2 border-r border-indigo-200"
              >
                {formatCurrency(q.total, q.currency)}
              </td>
            ))}
          </tr>

          {/* Submitted at */}
          <tr className="bg-white">
            <td className="sticky left-0 px-4 py-2 text-xs text-slate-400 border-r border-slate-100 bg-white">
              Submitted
            </td>
            {quotes.map((q) => (
              <td
                key={q.hospitalId}
                className="px-4 py-2 text-center text-xs text-slate-400 border-r border-slate-100"
              >
                {q.submittedAt ? new Date(q.submittedAt).toLocaleDateString() : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
