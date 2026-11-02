'use client';

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/src/client/cn';
import RainbowEdge from '../fx/RainbowEdge';

interface DialogContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('Dialog components must be used within <Dialog>');
  return ctx;
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open: controlledOpen, defaultOpen = false, onOpenChange, children }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const baseId = useId();
  return (
    <DialogContext.Provider
      value={{
        open,
        setOpen,
        titleId: `${baseId}-title`,
        descriptionId: `${baseId}-desc`,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

export const DialogTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ onClick, ...props }, ref) => {
    const { open, setOpen } = useDialogContext();
    return (
      <button
        ref={ref}
        type="button"
        data-slot="dialog-trigger"
        aria-expanded={open}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) setOpen(true);
        }}
        {...props}
      />
    );
  },
);
DialogTrigger.displayName = 'DialogTrigger';

export const DialogClose = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ onClick, ...props }, ref) => {
    const { setOpen } = useDialogContext();
    return (
      <button
        ref={ref}
        type="button"
        data-slot="dialog-close"
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) setOpen(false);
        }}
        {...props}
      />
    );
  },
);
DialogClose.displayName = 'DialogClose';

export function DialogPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => {
    const pick = () => setTarget(document.fullscreenElement ?? document.body);
    pick();
    document.addEventListener('fullscreenchange', pick);
    return () => document.removeEventListener('fullscreenchange', pick);
  }, []);
  if (!target) return null;
  return createPortal(children, target);
}

export const DialogOverlay = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-[var(--color-night)]/75 backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  ),
);
DialogOverlay.displayName = 'DialogOverlay';

export interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  rainbow?: boolean;
  hideClose?: boolean;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, rainbow = false, hideClose = false, ...props }, ref) => {
    const { open, setOpen, titleId, descriptionId } = useDialogContext();
    const boxRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (!open) return;
      const prev = document.activeElement as HTMLElement | null;
      const node = boxRef.current;
      node?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          return;
        }
        if (e.key === 'Tab' && node) {
          const focusables = Array.from(
            node.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        prev?.focus?.();
      };
    }, [open, setOpen]);

    if (!open) return null;

    const panel = (
      <div
        ref={(el) => {
          boxRef.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-slot="dialog-content"
        className={cn(
          'relative z-50 grid w-full max-w-lg gap-4 rounded-[var(--radius-xl)] border-2 border-white/20 bg-[var(--color-night)]/95 p-5 text-white shadow-[6px_6px_0_var(--color-ink)]',
          rainbow && 'border-0 shadow-none',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-[var(--radius-lg)] border border-white/20 bg-[var(--color-ink)] text-white hover:border-[var(--color-sun)] focus-visible:outline-2 focus-visible:outline-[var(--color-sun)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    );

    return (
      <DialogPortal>
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <DialogOverlay onPointerDown={() => setOpen(false)} />
          {rainbow ? (
            <RainbowEdge mode="css" radius={6} className="relative z-50 w-full max-w-lg">
              {panel}
            </RainbowEdge>
          ) : (
            panel
          )}
        </div>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-1.5 pr-10 text-left', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export const DialogTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    const { titleId } = useDialogContext();
    return (
      <h2
        ref={ref}
        id={titleId}
        data-slot="dialog-title"
        className={cn('text-lg font-extrabold leading-tight tracking-tight text-white', className)}
        {...props}
      />
    );
  },
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    const { descriptionId } = useDialogContext();
    return (
      <p
        ref={ref}
        id={descriptionId}
        data-slot="dialog-description"
        className={cn('text-sm text-slate-300', className)}
        {...props}
      />
    );
  },
);
DialogDescription.displayName = 'DialogDescription';
