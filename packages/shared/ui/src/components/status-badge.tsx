import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center font-medium',
  {
    variants: {
      variant: {
        pill: 'rounded-full px-3 py-1 text-xs',
        dot: 'gap-1.5 text-sm',
      },
      size: {
        sm: 'text-xs',
        md: 'text-sm',
      },
    },
    defaultVariants: {
      variant: 'pill',
      size: 'sm',
    },
  },
);

const DEFAULT_COLORS: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  SCHEDULED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  NO_SHOW: 'bg-rose-50 text-rose-700',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
};

export interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: string;
  colorMap?: Record<string, string>;
  className?: string;
}

export function StatusBadge({ status, variant, size, colorMap, className }: StatusBadgeProps) {
  const colors = { ...DEFAULT_COLORS, ...colorMap };
  const colorClass = colors[status] ?? 'bg-slate-100 text-slate-600';
  const label = status.replace(/_/g, ' ');

  if (variant === 'dot') {
    return (
      <span className={cn(badgeVariants({ variant, size }), className)}>
        <span className={cn('h-2 w-2 rounded-full', colorClass.replace(/bg-(\w+)-50/, 'bg-$1-500'))} />
        {label}
      </span>
    );
  }

  return (
    <span className={cn(badgeVariants({ variant, size }), colorClass, className)}>
      {label}
    </span>
  );
}
