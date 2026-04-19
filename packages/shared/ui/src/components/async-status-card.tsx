'use client';

import { type ReactNode } from 'react';
import { LoadingSpinner } from './loading-spinner';
import { cn } from '../lib/cn';

export interface AsyncStatusCardProps {
  title: string;
  description: string;
  className?: string;
  icon?: ReactNode;
  progressLabel?: string;
}

export function AsyncStatusCard({
  title,
  description,
  className,
  icon,
  progressLabel = 'Live processing in progress',
}: AsyncStatusCardProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-4 px-8 text-center',
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
        {icon ?? <LoadingSpinner size="lg" className="border-slate-200 border-t-cyan-600" />}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 animate-pulse" />
        </div>
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500" />
          </span>
          {progressLabel}
        </div>
      </div>
    </div>
  );
}
