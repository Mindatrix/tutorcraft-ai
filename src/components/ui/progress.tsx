'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/src/client/cn';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number | null;
  max?: number;
  indicatorClassName?: string;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indicatorClassName, ...props }, ref) => {
    const safeMax = max > 0 ? max : 100;
    const clamped = Math.min(safeMax, Math.max(0, value ?? 0));
    const pct = (clamped / safeMax) * 100;
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(clamped)}
        data-slot="progress"
        className={cn(
          'relative h-3 w-full overflow-hidden rounded-[var(--radius-lg)] border-2 border-[var(--color-ink)] bg-[var(--color-night)]',
          className,
        )}
        {...props}
      >
        <div
          data-slot="progress-indicator"
          className={cn(
            'h-full bg-[var(--color-sun)] transition-[width] duration-200 ease-out',
            indicatorClassName,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';
