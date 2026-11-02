'use client';

import { forwardRef, useCallback, useRef, useState, type HTMLAttributes } from 'react';
import { cn } from '@/src/client/cn';

export interface SliderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number[]) => void;
  'aria-label'?: string;
}

export const Slider = forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue = [0],
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      onValueChange,
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) => {
    const [uncontrolledValue, setUncontrolledValue] = useState<number[]>(defaultValue);
    const values = controlledValue !== undefined ? controlledValue : uncontrolledValue;
    const current = Math.min(max, Math.max(min, values[0] ?? min));
    const trackRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef(false);

    const commit = useCallback(
      (raw: number) => {
        if (disabled) return;
        const stepped = Math.round((raw - min) / step) * step + min;
        const next = Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
        if (controlledValue === undefined) setUncontrolledValue([next]);
        onValueChange?.([next]);
      },
      [controlledValue, disabled, max, min, onValueChange, step],
    );

    const updateFromClientX = (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      commit(min + ratio * (max - min));
    };

    const pct = max > min ? ((current - min) / (max - min)) * 100 : 0;

    return (
      <div
        ref={(el) => {
          trackRef.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        data-slot="slider"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromClientX(e.clientX);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            commit(current + step);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            commit(current - step);
          } else if (e.key === 'Home') {
            e.preventDefault();
            commit(min);
          } else if (e.key === 'End') {
            e.preventDefault();
            commit(max);
          }
        }}
        className={cn(
          'relative flex min-h-11 w-full touch-none select-none items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sun)] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
          className,
        )}
        data-disabled={disabled}
        {...props}
      >
        <div className="relative h-2.5 w-full grow overflow-hidden rounded-[var(--radius-lg)] border border-white/25 bg-[var(--color-ink)]">
          <div
            data-slot="slider-range"
            className="h-full bg-[var(--color-sun)] transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          data-slot="slider-thumb"
          style={{ left: `calc(${pct}% - 10px)` }}
          className="absolute block h-5 w-5 rounded-[var(--radius-lg)] border-2 border-[var(--color-ink)] bg-white shadow-[2px_2px_0_var(--color-ink)] transition-colors hover:bg-[var(--color-sun)]"
        />
      </div>
    );
  },
);
Slider.displayName = 'Slider';
