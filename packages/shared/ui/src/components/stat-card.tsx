import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  colorClass?: string;
  className?: string;
}

export function StatCard({ icon, value, label, colorClass = 'text-indigo-600 bg-indigo-50', className }: StatCardProps) {
  return (
    <div className={cn('flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm', className)}>
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', colorClass)}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}
