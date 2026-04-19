'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { LoadingSpinner } from './loading-spinner';

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
}

export interface SidebarNavProps {
  items: NavItem[];
  activeKey: string;
  committedKey?: string;
  pendingKey?: string | null;
  pendingLabel?: string;
  onNavigate: (item: NavItem) => void;
  logo?: ReactNode;
  footer?: ReactNode;
}

export function SidebarNav({
  items,
  activeKey,
  committedKey,
  pendingKey = null,
  pendingLabel = 'Loading section',
  onNavigate,
  logo,
  footer,
}: SidebarNavProps) {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[72px] flex-col items-center border-r border-slate-100 bg-white py-6">
      {logo && <div className="mb-8">{logo}</div>}
      <nav className="flex flex-1 flex-col items-center gap-3">
        {items.map((item) => {
          const isActive = activeKey === item.key;
          const isCommitted = (committedKey ?? activeKey) === item.key;
          const isPending = pendingKey === item.key;

          return (
          <div key={item.key} className="relative group flex items-center">
            <span
              aria-hidden="true"
              className={cn(
                'absolute -left-3 h-8 w-1 rounded-full bg-indigo-500 transition-all duration-200 ease-out',
                isActive ? 'scale-y-100 opacity-100' : 'scale-y-50 opacity-0',
              )}
            />
            <button
              type="button"
              aria-label={item.label}
              aria-current={isCommitted ? 'page' : undefined}
              title={item.label}
              onClick={() => onNavigate(item)}
              className={cn(
                'relative p-3 rounded-xl transition-all duration-200 ease-out',
                isActive
                  ? 'translate-x-0.5 bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100/60'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600',
              )}
            >
              {item.icon}
              {isPending && (
                <span
                  role="status"
                  aria-label={pendingLabel}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm"
                >
                  <LoadingSpinner size="sm" className="h-3 w-3 border-slate-200 border-t-indigo-500" />
                </span>
              )}
            </button>
            <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
              {item.label}
            </div>
          </div>
        )})}
      </nav>
      {footer && <div className="mt-auto pb-2">{footer}</div>}
    </aside>
  );
}
