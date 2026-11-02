'use client';

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
} from 'react';
import { cn } from '@/src/client/cn';

export type ButtonVariant = 'default' | 'sun' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'border-2 border-[var(--color-ink)] bg-[var(--color-night)] text-white shadow-[3px_3px_0_var(--color-ink)] hover:bg-[#19154a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_var(--color-ink)]',
  sun:
    'border-2 border-[var(--color-ink)] bg-[var(--color-sun)] text-[var(--color-ink)] shadow-[3px_3px_0_var(--color-ink)] hover:bg-[#fde047] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_var(--color-ink)]',
  destructive:
    'border-2 border-[var(--color-ink)] bg-[var(--color-rose)] text-white shadow-[3px_3px_0_var(--color-ink)] hover:bg-[#f43f5e] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_var(--color-ink)]',
  outline:
    'border-2 border-white/30 bg-[var(--color-night)]/85 text-white hover:border-[var(--color-sun)] hover:bg-[var(--color-ink)]',
  secondary:
    'border-2 border-[var(--color-ink)] bg-[var(--color-paper)] text-[var(--color-ink)] shadow-[2px_2px_0_var(--color-ink)] hover:bg-amber-100',
  ghost:
    'border border-transparent bg-transparent text-slate-100 hover:border-white/20 hover:bg-white/10',
  link: 'text-[var(--color-sun)] underline-offset-4 hover:underline',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'min-h-11 px-4 py-2 text-base',
  sm: 'min-h-9 px-3 py-1.5 text-sm',
  lg: 'min-h-12 px-6 py-2.5 text-lg',
  icon: 'h-11 w-11 shrink-0 p-0',
};

export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-lg)] font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sun)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, type = 'button', children, ...props }, ref) => {
    const classes = buttonVariants({ variant, size, className });
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<{ className?: string }>;
      return cloneElement(child, {
        ...props,
        className: cn(classes, child.props.className),
      });
    }
    return (
      <button ref={ref} type={type} data-slot="button" className={classes} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
