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
      <nav className="flex flex-1 flex-col items-center gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.href)}
            className={cn(
              'group flex h-10 w-10 items-center justify-center rounded-xl transition-all',
              activeKey === item.key
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600',
            )}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </nav>
      {footer && <div className="mt-auto">{footer}</div>}
    </aside>
  );
}
