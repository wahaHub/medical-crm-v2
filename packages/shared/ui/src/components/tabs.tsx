'use client';

import { cn } from '../lib/cn';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, activeKey, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 rounded-xl bg-slate-100 p-1', className)}>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            activeKey === item.key
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs">
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
