'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
}

export interface SidebarNavProps {
  items: NavItem[];
  activeKey: string;
  onNavigate: (href: string) => void;
  logo?: ReactNode;
  footer?: ReactNode;
}

export function SidebarNav({ items, activeKey, onNavigate, logo, footer }: SidebarNavProps) {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[72px] flex-col items-center border-r border-slate-100 bg-white py-6">
      {logo && <div className="mb-8">{logo}</div>}
      <nav className="flex flex-1 flex-col items-center gap-3">
        {items.map((item) => (
          <div key={item.key} className="relative group flex items-center">
            <button
              onClick={() => onNavigate(item.href)}
              className={cn(
                'p-3 rounded-xl transition-all duration-200',
                activeKey === item.key
                  ? 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100/50'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600',
              )}
            >
              {item.icon}
            </button>
            <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
              {item.label}
            </div>
          </div>
        ))}
      </nav>
      {footer && <div className="mt-auto pb-2">{footer}</div>}
    </aside>
  );
}
